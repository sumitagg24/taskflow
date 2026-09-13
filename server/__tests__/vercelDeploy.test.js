/**
 * Deployment-architecture smoke tests: the Vercel-safe surface.
 *
 * - createApp() boots without listen()/intervals/migrations and preserves
 *   every /api/* route (health, 404 JSON for unknown API paths).
 * - Serverless mode (enableSpaFallback:false) never answers HTML for
 *   unknown routes (the silent-outage class spa-config-check guards live).
 * - /api/cron/:job is fail-closed without CRON_SECRET and enforces bearer
 *   auth; known jobs run idempotently against an empty DB.
 * - Upload signature checks accept real magic numbers and reject mismatches
 *   without touching disk (S3 path) or with a temp file (local path).
 */
const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
// Shared harness: in-memory Mongo + per-test collection cleanup.
require('./setup');
const { createApp } = require('../app');
const storage = require('../config/storage');

describe('vercel deployment surface', () => {
  test('GET /api/health is ok and reports db state', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.db).toBe('string');
  });

  test('unknown /api/* route is JSON 404 (never HTML)', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.message).toMatch(/not found/i);
  });

  test('serverless mode never serves SPA HTML for unknown routes', async () => {
    const app = createApp({ enableSpaFallback: false });
    const res = await request(app).get('/some-client-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('cron job listing is public but runs are fail-closed without CRON_SECRET', async () => {
    const app = createApp();
    const OLD = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const list = await request(app).get('/api/cron');
      expect(list.status).toBe(200);
      expect(list.body.jobs).toEqual(
        expect.arrayContaining(['recurring', 'trash-purge', 'focus-reset', 'notifications'])
      );

      const run = await request(app).post('/api/cron/notifications');
      expect(run.status).toBe(503);
    } finally {
      if (OLD === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = OLD;
    }
  });

  test('cron bearer auth rejects wrong secrets and runs known jobs', async () => {
    const app = createApp();
    const OLD = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret-0123456789';
    try {
      const bad = await request(app)
        .post('/api/cron/notifications')
        .set('Authorization', 'Bearer wrong');
      expect(bad.status).toBe(401);

      const unknown = await request(app)
        .post('/api/cron/nope')
        .set('Authorization', 'Bearer test-cron-secret-0123456789');
      expect(unknown.status).toBe(404);

      // Empty DB: every job is a no-op but must succeed (idempotent).
      for (const job of ['recurring', 'trash-purge', 'focus-reset', 'notifications']) {
        const res = await request(app)
          .post(`/api/cron/${job}`)
          .set('Authorization', 'Bearer test-cron-secret-0123456789');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.job).toBe(job);
      }
    } finally {
      if (OLD === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = OLD;
    }
  }, 60000);

  test('buffer signature checks accept real magic numbers, reject mismatches', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(storage.validateBufferSignature(png, '.png')).toBe(true);
    expect(storage.validateBufferSignature(png, '.jpg')).toBe(false);
    expect(storage.validateBufferSignature(Buffer.from('%PDF-1.7'), '.pdf')).toBe(true);
    expect(storage.validateBufferSignature(Buffer.from('hello'), '.pdf')).toBe(false);
    // Plain-text types skip sniffing (no reliable magic numbers).
    expect(storage.validateBufferSignature(Buffer.from('hello'), '.txt')).toBe(true);
    expect(storage.validateBufferSignature(Buffer.alloc(0), '.png')).toBe(false);
  });

  test('file signature check fails closed for missing files', () => {
    expect(storage.validateFileSignature(path.join(os.tmpdir(), 'taskflow-no-such-file.bin'), '.png')).toBe(false);
  });

  test('file signature check verifies real bytes on disk', () => {
    const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-sig-')), 'a.png');
    fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    try {
      expect(storage.validateFileSignature(p, '.png')).toBe(true);
      expect(storage.validateFileSignature(p, '.pdf')).toBe(false);
    } finally {
      fs.rmSync(path.dirname(p), { recursive: true, force: true });
    }
  });
});
