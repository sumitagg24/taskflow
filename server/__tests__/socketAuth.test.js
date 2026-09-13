// socketAuth.test.js — Socket.IO handshake authentication and user-room
// isolation. Boots a real HTTP server + socket.io on an ephemeral port and
// connects real socket.io-client sockets, so the tests exercise the same
// handshake path a browser uses (Cookie header → getAuthCookie →
// verifyAccessToken → User lookup → passwordChangedAt/emailVerified gates).
const request = require('supertest');
const http = require('http');
const { io: Client } = require('socket.io-client');

const { createApp } = require('./setup');
const { createTestUser, createTestUserWithTokens, createTestTask } = require('./helpers');
const { generateAccessToken } = require('../middleware/auth');
const { initializeSocket, getIO } = require('../services/socketService');

let app;
let httpServer;
let serverPort;

const connect = (extra = {}) =>
  new Promise((resolve, reject) => {
    const url = `http://localhost:${serverPort}`;
    const socket = Client(url, {
      transports: ['websocket'],
      reconnection: false,
      ...extra,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('connect timeout (expected an auth error)'));
    }, 3000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      socket.close();
      resolve({ error: err });
    });
  });

const close = (socket) =>
  new Promise((r) => {
    if (socket && socket.connected) socket.close();
    r();
  });

beforeAll((done) => {
  app = createApp();
  httpServer = http.createServer(app);
  initializeSocket(httpServer);
  httpServer.listen(() => {
    serverPort = httpServer.address().port;
    done();
  });
});

afterAll((done) => {
  try { getIO().close(); } catch { /* not initialized in this file */ }
  httpServer.close(() => done());
});

afterEach(async () => {
  const mongoose = require('mongoose');
  const collections = mongoose.connection.collections;
  for (const key in collections) await collections[key].deleteMany({});
});

describe('Socket.IO handshake authentication', () => {
  it('rejects connections with no token at all', async () => {
    const res = await connect({});
    expect(res.error).toBeTruthy();
    expect(res.error.message).toMatch(/authentication required/i);
  });

  it('rejects a garbage bearer token', async () => {
    const res = await connect({ auth: { token: 'not-a-jwt' } });
    expect(res.error).toBeTruthy();
    expect(res.error.message).toMatch(/invalid token/i);
  });

  it('rejects a refresh token used as the access token', async () => {
    const { user } = await createTestUser({ email: 'sockrt@example.com' });
    const { generateRefreshToken } = require('../middleware/auth');
    const refreshToken = generateRefreshToken(user._id);
    const res = await connect({ auth: { token: refreshToken } });
    expect(res.error).toBeTruthy();
    // Wrong-secret or wrong-type refresh tokens must both be refused; the
    // exact message differs by which check trips first.
    expect(res.error.message).toMatch(/invalid/i);
  });

  it('rejects a signed token for a user that no longer exists', async () => {
    const mongoose = require('mongoose');
    const ghostId = new mongoose.Types.ObjectId();
    const token = generateAccessToken(ghostId);
    const res = await connect({ auth: { token } });
    expect(res.error).toBeTruthy();
    expect(res.error.message).toMatch(/user not found/i);
  });

  it('rejects a token issued before a password change (session revocation)', async () => {
    const { user, accessToken } = await createTestUser({ email: 'sockpw@example.com' });
    // Password changed AFTER the token was minted.
    user.passwordChangedAt = new Date(Date.now() + 60_000);
    await user.save();
    const res = await connect({ auth: { token: accessToken } });
    expect(res.error).toBeTruthy();
    expect(res.error.message).toMatch(/session expired/i);
  });

  it('rejects unverified email users', async () => {
    const { user, accessToken } = await createTestUser({ email: 'sockunv@example.com', emailVerified: false });
    expect(user.emailVerified).toBe(false);
    const res = await connect({ auth: { token: accessToken } });
    expect(res.error).toBeTruthy();
    expect(res.error.message).toMatch(/verify your email/i);
  });

  it('accepts a valid bearer token (native-client path)', async () => {
    const { user, accessToken } = await createTestUser({ email: 'sockok@example.com' });
    const socket = await connect({ auth: { token: accessToken } });
    expect(socket.connected).toBe(true);
    // `socket.userId` exists only server-side; the client proves acceptance
    // via `connected`. Room delivery is asserted in the isolation block.
    await close(socket);
  });

  it('accepts a valid access token sent as a Cookie header (browser path)', async () => {
    const { accessToken } = await createTestUser({ email: 'sockck@example.com' });
    const socket = await connect({
      extraHeaders: { Cookie: `accessToken=${accessToken}` },
    });
    expect(socket.connected).toBe(true);
    await close(socket);
  });

  it('accepts the __Host- prefixed cookie name (production shape)', async () => {
    const { accessToken } = await createTestUser({ email: 'sockhost@example.com' });
    const socket = await connect({
      extraHeaders: { Cookie: `__Host-accessToken=${accessToken}` },
    });
    expect(socket.connected).toBe(true);
    await close(socket);
  });
});

describe('Socket.IO room isolation', () => {
  it('does not deliver task events across different users', async () => {
    const userA = await createTestUser({ email: 'isoA@example.com', username: 'isoa' });
    const userB = await createTestUser({ email: 'isoB@example.com', username: 'isob' });

    const socketA = await connect({ auth: { token: userA.accessToken } });
    const socketB = await connect({ auth: { token: userB.accessToken } });
    expect(socketA.connected && socketB.connected).toBe(true);

    const seenByB = [];
    socketB.on('task:updated', (payload) => seenByB.push(payload));

    // A moves a task; the event must reach only A's other sessions — never B.
    socketA.emit('task:update', { _id: '507f1f77bcf86cd799439011', status: 'done' });
    await new Promise((r) => setTimeout(r, 250));
    expect(seenByB).toHaveLength(0);

    // B emits too; A also must not receive it (separate rooms, no broadcast).
    const seenByA = [];
    socketA.on('task:updated', (p) => seenByA.push(p));
    socketB.emit('task:update', { _id: '507f1f77bcf86cd799439012', status: 'done' });
    await new Promise((r) => setTimeout(r, 250));
    expect(seenByA).toHaveLength(0);

    await close(socketA);
    await close(socketB);
  });

  it('echoes sanitized task events to the SAME user’s other sessions only', async () => {
    const userA = await createTestUser({ email: 'sameA@example.com' });

    const socketA1 = await connect({ auth: { token: userA.accessToken } });
    const socketA2 = await connect({ auth: { token: userA.accessToken } });

    const seenByA2 = [];
    socketA2.on('task:updated', (p) => seenByA2.push(p));

    // A malicious client tries to smuggle extra fields — the server must strip
    // everything except the whitelisted primitives.
    socketA1.emit('task:update', {
      _id: '507f1f77bcf86cd799439013',
      status: 'done',
      priority: 'high',
      __proto__: { injected: true },
      userId: 'someone-else',
      evil: { nested: true },
    });
    await new Promise((r) => setTimeout(r, 250));

    expect(seenByA2).toHaveLength(1);
    // Exact-shape equality: only whitelisted fields survive (socket.io drops
    // undefined-valued keys), and nothing smuggled via __proto__/extra fields.
    expect(seenByA2[0]).toEqual({
      _id: '507f1f77bcf86cd799439013',
      status: 'done',
      priority: 'high',
    });

    await close(socketA1);
    await close(socketA2);
  });

  it('rejects non-object payloads and never crashes the socket', async () => {
    const { accessToken } = await createTestUser({ email: 'sockfuzz@example.com' });
    const socket = await connect({ auth: { token: accessToken } });
    expect(socket.connected).toBe(true);

    const seen = [];
    socket.on('task:updated', (p) => seen.push(p));
    socket.emit('task:update', 'string-payload');
    socket.emit('task:update', 42);
    socket.emit('task:update', ['array']);
    socket.emit('task:update', null);
    await new Promise((r) => setTimeout(r, 200));
    expect(socket.connected).toBe(true);
    expect(seen).toHaveLength(0);
    await close(socket);
  });
});
