// CORS allowlist behavior — exercised against the REAL request pipeline
// (server/app.js createApp), not the test-harness copy in ./setup, so the
// production CORS configuration is what actually gets asserted.
//
// Conventions under test (server/config/cors.js + app.js):
// - production: only ALLOWED_ORIGINS (fail-closed when unset)
// - development/test: localhost + loopback LAN dev ports, nothing else
// - credentials:true always, so the ACAO header must echo — never `*`
require('./setup'); // mongo hooks only; the app below is the real one
const request = require('supertest');
const http = require('http');
const { io: Client } = require('socket.io-client');

const { createApp } = require('../app');
const { isOriginAllowed } = require('../config/cors');
const { createTestUserWithTokens } = require('./helpers');
const { initializeSocket, getIO } = require('../services/socketService');

const PROD_SPA = 'https://taskflow-ebon-tau.vercel.app';
const EVIL = 'https://evil.example';
const DEV_SPA = 'http://localhost:3000';

const app = createApp({ enableSpaFallback: false });

const savedEnv = {};
function setEnv(nodeEnv, allowedOrigins) {
  savedEnv.NODE_ENV = process.env.NODE_ENV;
  savedEnv.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = nodeEnv;
  if (allowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = allowedOrigins;
  }
}
afterEach(() => {
  process.env.NODE_ENV = savedEnv.NODE_ENV;
  if (savedEnv.ALLOWED_ORIGINS === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = savedEnv.ALLOWED_ORIGINS;
  }
});

describe('HTTP CORS allowlist (real pipeline)', () => {
  it('allows the production SPA origin with echoed ACAO + credentials', async () => {
    setEnv('production', PROD_SPA);
    const res = await request(app)
      .get('/api/health')
      .set('Origin', PROD_SPA);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(PROD_SPA);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('answers a production preflight from the SPA origin', async () => {
    setEnv('production', PROD_SPA);
    const res = await request(app)
      .options('/api/tasks')
      .set('Origin', PROD_SPA)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe(PROD_SPA);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects an arbitrary origin in production with no ACAO header', async () => {
    setEnv('production', PROD_SPA);
    const res = await request(app)
      .get('/api/health')
      .set('Origin', EVIL);
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('rejects a preflight from an arbitrary origin in production', async () => {
    setEnv('production', PROD_SPA);
    const res = await request(app)
      .options('/api/tasks')
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('is fail-closed in production when ALLOWED_ORIGINS is unset', async () => {
    setEnv('production', undefined);
    const res = await request(app)
      .get('/api/health')
      .set('Origin', PROD_SPA);
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the localhost dev origin with credentials', async () => {
    setEnv('test', undefined);
    const res = await request(app)
      .get('/api/health')
      .set('Origin', DEV_SPA);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(DEV_SPA);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('still rejects an arbitrary origin in development', async () => {
    setEnv('test', undefined);
    const res = await request(app)
      .get('/api/health')
      .set('Origin', EVIL);
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never emits a wildcard ACAO for any origin', async () => {
    setEnv('production', `${PROD_SPA},http://localhost:3000`);
    for (const origin of [PROD_SPA, DEV_SPA, EVIL]) {
      const res = await request(app).get('/api/health').set('Origin', origin);
      expect(res.headers['access-control-allow-origin'] || '').not.toBe('*');
    }
  });
});

describe('origin allowlist unit contract (shared by HTTP + Socket.IO)', () => {
  it('accepts the production SPA only when allowlisted in production', () => {
    setEnv('production', PROD_SPA);
    expect(isOriginAllowed(PROD_SPA)).toBe(true);
    expect(isOriginAllowed(EVIL)).toBe(false);
    expect(isOriginAllowed('https://taskflow-ebon-tau.vercel.app.evil.example')).toBe(false);
  });

  it('accepts localhost in development and rejects arbitrary hosts', () => {
    setEnv('test', undefined);
    expect(isOriginAllowed(DEV_SPA)).toBe(true);
    expect(isOriginAllowed(EVIL)).toBe(false);
  });
});

describe('Socket.IO origin consistency (real handshake)', () => {
  let httpServer;
  let port;

  beforeAll((done) => {
    httpServer = http.createServer(app);
    initializeSocket(httpServer);
    httpServer.listen(() => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    try { getIO().close(); } catch { /* already closed */ }
    httpServer.close(() => done());
  });

  const connect = (origin, token) =>
    new Promise((resolve) => {
      const socket = Client(`http://localhost:${port}`, {
        transports: ['polling'],
        reconnection: false,
        extraHeaders: { ...(origin ? { Origin: origin } : {}), ...(token ? { Cookie: `accessToken=${token}` } : {}) },
      });
      const timer = setTimeout(() => {
        socket.close();
        resolve({ error: new Error('connect timeout') });
      }, 4000);
      socket.on('connect', () => {
        clearTimeout(timer);
        socket.close();
        resolve({ connected: true });
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        socket.close();
        resolve({ error: err });
      });
    });

  it('connects from an allowed origin with a valid token', async () => {
    setEnv('test', undefined);
    const { accessToken } = await createTestUserWithTokens({ email: 'sock-allowed@example.com' });
    const res = await connect(DEV_SPA, accessToken);
    expect(res.error).toBeUndefined();
    expect(res.connected).toBe(true);
  });

  it('refuses the handshake from an arbitrary origin even with a valid token', async () => {
    setEnv('test', undefined);
    const { accessToken } = await createTestUserWithTokens({ email: 'sock-evil@example.com' });
    const res = await connect(EVIL, accessToken);
    expect(res.connected).toBeUndefined();
    expect(res.error).toBeTruthy();
  });
});
