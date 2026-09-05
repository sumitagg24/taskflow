const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser } = require('./helpers');
const User = require('../models/User');
const { getPlan } = require('../config/plans');
const keyCrypto = require('../utils/keyCrypto');
const { checkAndIncrementAiUsage } = require('../controllers/growthController');

const app = createApp();

describe('AI security (keys, quotas, attachments)', () => {
  const OLD_SECRET = process.env.AI_KEY_SECRET;

  afterEach(() => {
    if (OLD_SECRET === undefined) delete process.env.AI_KEY_SECRET;
    else process.env.AI_KEY_SECRET = OLD_SECRET;
  });

  describe('AI key encryption at rest', () => {
    it('round-trips encrypt -> decrypt', () => {
      process.env.AI_KEY_SECRET = 'a'.repeat(64);
      const enc = keyCrypto.encrypt('sk-test-key-12345678');
      expect(enc.startsWith('enc:v1:')).toBe(true);
      expect(enc).not.toContain('sk-test-key-12345678');
      expect(keyCrypto.decrypt(enc)).toBe('sk-test-key-12345678');
    });

    it('fails to decrypt with the wrong key', () => {
      process.env.AI_KEY_SECRET = 'a'.repeat(64);
      const enc = keyCrypto.encrypt('sk-test-key-12345678');
      process.env.AI_KEY_SECRET = 'b'.repeat(64);
      expect(() => keyCrypto.decrypt(enc)).toThrow();
    });

    it('passes legacy plaintext through untouched', () => {
      process.env.AI_KEY_SECRET = 'a'.repeat(64);
      expect(keyCrypto.decrypt('sk-legacy-plaintext-key')).toBe('sk-legacy-plaintext-key');
      expect(keyCrypto.decrypt('')).toBe('');
    });

    it('stores AI keys encrypted and serves them masked', async () => {
      const { user, accessToken } = await createTestUser({
        email: 'aikey@example.com',
        username: 'aikeyuser',
      });

      const put = await request(app)
        .put('/api/auth/ai-settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ aiProvider: 'openai', aiApiKey: 'sk-test-key-12345678' });
      expect(put.status).toBe(200);
      expect(put.body.hasApiKey).toBe(true);
      expect(put.body.aiApiKey).not.toContain('sk-test-key-12345678');

      const raw = await User.findById(user._id).select('+aiApiKey').lean();
      expect(raw.aiApiKey.startsWith('enc:v1:')).toBe(true);
      expect(raw.aiApiKey).not.toContain('sk-test-key-12345678');

      const get = await request(app)
        .get('/api/auth/ai-settings')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(get.status).toBe(200);
      expect(get.body.hasApiKey).toBe(true);
      expect(get.body.aiApiKey).not.toContain('sk-test-key-12345678');
    });
  });

  describe('AI daily quota', () => {
    it('returns 402 once the free daily quota is exhausted', async () => {
      const { user, accessToken } = await createTestUser({
        email: 'aiquota@example.com',
        username: 'aiquotauser',
      });
      const limit = getPlan('free').limits.aiRequestsPerDay;
      expect(limit).toBeGreaterThan(0);

      for (let i = 0; i < limit; i += 1) {
        const r = await checkAndIncrementAiUsage(user._id);
        expect(r.allowed).toBe(true);
      }
      const exhausted = await checkAndIncrementAiUsage(user._id);
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.remaining).toBe(0);

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'hello' });
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
      expect(res.body.resource).toBe('ai-requests');
      expect(res.body.limit).toBe(limit);
    });

    it('allows AI requests while quota remains', async () => {
      const { accessToken } = await createTestUser({
        email: 'aiok@example.com',
        username: 'aiokuser',
      });

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'hello' });
      expect(res.status).toBe(200);
    });
  });

  describe('attachments quota', () => {
    const makeAttachments = (n, seed = 'f') =>
      Array.from({ length: n }, (_, i) => ({
        filename: `${seed}${i}.txt`,
        originalName: `${seed}${i}.txt`,
        path: `/uploads/${seed}${i}.txt`,
        mimeType: 'text/plain',
        size: 10,
      }));

    it('rejects attachments beyond the plan limit', async () => {
      const { accessToken } = await createTestUser({
        email: 'attach@example.com',
        username: 'attachuser',
      });
      const limit = getPlan('free').limits.attachmentsPerTask;
      expect(limit).toBeGreaterThan(0);

      const created = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'With files' });
      expect(created.status).toBe(201);

      const over = await request(app)
        .put(`/api/tasks/${created.body._id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ attachments: makeAttachments(limit + 1) });
      expect(over.status).toBe(400);
      expect(over.body.message).toContain(String(limit));

      // The boundary itself still works.
      const ok = await request(app)
        .put(`/api/tasks/${created.body._id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ attachments: makeAttachments(limit) });
      expect(ok.status).toBe(200);
      expect(ok.body.attachments).toHaveLength(limit);
    });

    it('rejects creating a task with too many attachments', async () => {
      const { accessToken } = await createTestUser({
        email: 'attach2@example.com',
        username: 'attach2user',
      });
      const limit = getPlan('free').limits.attachmentsPerTask;

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Too many files', attachments: makeAttachments(limit + 1, 'g') });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain(String(limit));
    });
  });
});
