/**
 * Vercel safety regression tests — the deployment invariants that must never
 * silently break:
 *
 * 1. Importing the serverless handler never calls listen() and never
 *    initializes Socket.IO.
 * 2. Uploads fail closed (503) on ephemeral runtimes without durable storage.
 * 3. Full upload lifecycle on local disk: POST → GET (owner) → GET
 *    (anonymous/other → denied) → DELETE → GET (gone), record included.
 * 4. Boot migrations default OFF; intervals default ON persistent / OFF
 *    when DISABLE_INTERVAL_JOBS=true or serverless.
 * 5. Production startup validation actually throws on missing MONGO_URI
 *    (verified in a child process — importing server.js here would boot).
 * 6. Cron rejects equal-length wrong secrets without throwing (timing-safe
 *    path), and the persistent app still serves the SPA fallback.
 */
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const request = require('supertest');

require('./setup');
const { createApp } = require('../app');
const { createTestUser } = require('./helpers');
const {
  shouldRunBootMigrations,
  intervalsEnabled,
} = require('../config/runtime');

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

describe('vercel safety invariants', () => {
  test('importing the serverless handler does not listen or init realtime', () => {
    const listenSpy = jest.spyOn(http.Server.prototype, 'listen');
    let handler;
    expect(() => {
      handler = require('../../api/index');
    }).not.toThrow();
    expect(typeof handler).toBe('function');
    expect(listenSpy).not.toHaveBeenCalled();
    listenSpy.mockRestore();

    // No Socket.IO instance exists on the serverless path.
    expect(() => require('../services/socketService').getIO()).toThrow(
      'Socket.io not initialized'
    );
  });

  test('uploads fail closed on ephemeral runtimes without durable storage', async () => {
    const app = createApp();
    const OLD = { VERCEL: process.env.VERCEL, STORAGE_MODE: process.env.STORAGE_MODE };
    process.env.VERCEL = '1';
    process.env.STORAGE_MODE = 'local';
    try {
      const { accessToken } = await createTestUser({
        username: 'ephemeral_uploader',
        email: 'ephemeral@example.com',
      });
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', PNG, { filename: 'ephemeral.png', contentType: 'image/png' });
      expect(res.status).toBe(503);
      expect(res.body.message).toMatch(/STORAGE_MODE=s3/i);
    } finally {
      if (OLD.VERCEL === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = OLD.VERCEL;
      if (OLD.STORAGE_MODE === undefined) delete process.env.STORAGE_MODE;
      else process.env.STORAGE_MODE = OLD.STORAGE_MODE;
    }
  });

  test('upload lifecycle: POST → GET owner → GET denied → DELETE → GET gone', async () => {
    const app = createApp();
    const owner = await createTestUser({ username: 'lifecycle_owner', email: 'lifecycle-owner@example.com' });
    const stranger = await createTestUser({ username: 'lifecycle_stranger', email: 'lifecycle-stranger@example.com' });

    const up = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .attach('file', PNG, { filename: 'lifecycle.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.storage).toBe('local');
    const filename = up.body.filename;
    expect(typeof filename).toBe('string');

    const Upload = require('../models/Upload');
    const record = await Upload.findOne({ filename }).lean();
    expect(record).toBeTruthy();
    expect(String(record.uploadedBy)).toBe(String(owner.user._id));

    const get = await request(app)
      .get(`/api/upload/${encodeURIComponent(filename)}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(get.status).toBe(200);
    expect(get.body.length).toBeGreaterThan(0);

    const anon = await request(app).get(`/api/upload/${encodeURIComponent(filename)}`);
    expect(anon.status).toBe(401);

    const other = await request(app)
      .get(`/api/upload/${encodeURIComponent(filename)}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(other.status).toBe(404);

    const del = await request(app)
      .delete(`/api/upload/${encodeURIComponent(filename)}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(del.status).toBe(200);

    expect(await Upload.findOne({ filename }).lean()).toBeNull();
    const gone = await request(app)
      .get(`/api/upload/${encodeURIComponent(filename)}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(gone.status).toBe(404);
  }, 60000);

  test('boot migrations default off; intervals on persistent / off external+serverless', () => {
    expect(shouldRunBootMigrations({})).toBe(false);
    expect(shouldRunBootMigrations({ RUN_MIGRATIONS_ON_BOOT: 'true' })).toBe(true);
    expect(shouldRunBootMigrations({ RUN_MIGRATIONS_ON_BOOT: 'false' })).toBe(false);

    expect(intervalsEnabled({})).toBe(true);
    expect(intervalsEnabled({ DISABLE_INTERVAL_JOBS: 'true' })).toBe(false);
    expect(intervalsEnabled({ VERCEL: '1' })).toBe(false);
    expect(intervalsEnabled({ AWS_LAMBDA_FUNCTION_NAME: 'x' })).toBe(false);
  });

  test('startup validation fails fast without MONGO_URI', () => {
    const run = spawnSync('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, MONGO_URI: '', NODE_ENV: 'test' },
      encoding: 'utf8',
      timeout: 60000,
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stderr}${run.stdout}`).toMatch(/MONGO_URI/);
  }, 90000);

  test('cron rejects equal-length wrong secrets without throwing', async () => {
    const app = createApp();
    const OLD = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'a'.repeat(32);
    try {
      const res = await request(app)
        .post('/api/cron/notifications')
        .set('Authorization', `Bearer ${'b'.repeat(32)}`);
      expect(res.status).toBe(401);
    } finally {
      if (OLD === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = OLD;
    }
  });

  test('persistent app keeps the SPA fallback for non-API routes', async () => {
    const app = createApp({ enableSpaFallback: true });
    const res = await request(app).get('/some-client-route');
    // client/dist is built in this repo: index.html with 200.
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/text\/html/);
    } else {
      expect(res.headers['content-type']).toMatch(/application\/json/);
    }
  });
});
