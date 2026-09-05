const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUserWithTokens } = require('./helpers');

const app = createApp();
const TaskTemplate = require('../models/TaskTemplate');

async function createTemplate(userId, overrides = {}) {
  return TaskTemplate.create({
    title: 'Shared Recipe',
    description: 'Template body',
    userId,
    isShared: false,
    sharedWith: [],
    ...overrides,
  });
}

describe('Security fixes', () => {
  let owner, ownerToken, other, otherToken;

  beforeEach(async () => {
    const ownerSetup = await createTestUserWithTokens({ email: 'owner@sec.com', username: 'ownersec' });
    owner = ownerSetup.user;
    ownerToken = ownerSetup.accessToken;
    const otherSetup = await createTestUserWithTokens({ email: 'other@sec.com', username: 'othersec' });
    other = otherSetup.user;
    otherToken = otherSetup.accessToken;
  });

  describe('template access control', () => {
    it('forbids applying a private template owned by another user', async () => {
      const template = await createTemplate(owner._id);

      const res = await request(app)
        .post(`/api/templates/${template._id}/apply`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      const after = await TaskTemplate.findById(template._id);
      expect(after.usageCount).toBe(0);
    });

    it('forbids copying a private template owned by another user', async () => {
      const template = await createTemplate(owner._id);

      const res = await request(app)
        .post(`/api/templates/${template._id}/copy`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('allows applying a shared template owned by another user', async () => {
      const template = await createTemplate(owner._id, { isShared: true });

      const res = await request(app)
        .post(`/api/templates/${template._id}/apply`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
    });

    it('forbids a non-owner from editing a shared template', async () => {
      const template = await createTemplate(owner._id, { isShared: true });

      const res = await request(app)
        .put(`/api/templates/${template._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Hijacked' });

      expect(res.status).toBe(403);
      const after = await TaskTemplate.findById(template._id);
      expect(after.title).toBe('Shared Recipe');
    });

    it('rejects NoSQL operator injection in template category filter', async () => {
      const res = await request(app)
        .get('/api/templates?category[$ne]=x')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.templates).toEqual([]);
    });
  });

  describe('time tracking', () => {
    it('serves /export instead of treating it as a taskId', async () => {
      const res = await request(app)
        .get('/api/time-tracking/export')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('serves /report instead of treating it as a taskId', async () => {
      const res = await request(app)
        .get('/api/time-tracking/report')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.report).toBeDefined();
      expect(res.body.endDate).toBeNull();
    });

    it('escapes formula-injection cells in the CSV export', async () => {
      const task = require('../models/Task').create({
        title: '=HYPERLINK("http://evil","x")',
        status: 'pending',
        userId: owner._id,
      });
      const session = require('../models/TimeSession').create({
        userId: owner._id,
        taskId: (await task)._id,
        start: new Date(),
        duration: 10,
      });
      await session;

      const res = await request(app)
        .get('/api/time-tracking/export')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('"=HYPERLINK');
    });
  });

  describe('task bulk/order validation', () => {
    it('rejects NoSQL injection via order entry _id', async () => {
      const res = await request(app)
        .put('/api/tasks/order')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ orders: [{ _id: { $ne: null }, order: 1, status: 'pending' }] });

      expect(res.status).toBe(400);
    });

    it('rejects non-string task ids in batch update', async () => {
      const res = await request(app)
        .put('/api/tasks/batch')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ taskIds: [{ $ne: null }], updates: { status: 'completed' } });

      expect(res.status).toBe(400);
    });

    it('rejects malformed updates in batch update', async () => {
      const res = await request(app)
        .put('/api/tasks/batch')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ taskIds: ['abc'], updates: 'nope' });

      expect(res.status).toBe(400);
    });
  });

  describe('AI settings', () => {
    it('stores the string "false" as boolean false for streaming', async () => {
      const res = await request(app)
        .put('/api/auth/ai-settings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ aiSettings: { streaming: 'false' } });

      expect(res.status).toBe(200);
      expect(res.body.aiSettings.streaming).toBe(false);
    });

    it('rejects loopback base URLs with non-standard ports (SSRF)', async () => {
      const res = await request(app)
        .put('/api/auth/ai-settings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ aiBaseUrl: 'http://localhost:6379' });

      expect(res.status).toBe(400);
    });

    it('accepts loopback base URLs on common self-hosted ports', async () => {
      const res = await request(app)
        .put('/api/auth/ai-settings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ aiBaseUrl: 'http://localhost:11434' });

      expect(res.status).toBe(200);
    });
  });

  describe('cookie CSRF origin check', () => {
    it('forbids cookie-authed mutation from a disallowed origin', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Cookie', `accessToken=${ownerToken}`)
        .set('Origin', 'https://evil.example')
        .send({ title: 'My Task', description: 'Task description', priority: 'high' });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Cross-origin request forbidden');
    });

    it('allows cookie-authed mutation with no Origin (non-browser client)', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Cookie', `accessToken=${ownerToken}`)
        .send({ title: 'My Task', description: 'Task description', priority: 'high' });

      expect(res.status).toBe(201);
    });

    it('allows cookie-authed mutation from an allowed origin', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Cookie', `accessToken=${ownerToken}`)
        .set('Origin', 'http://localhost:3000')
        .send({ title: 'My Task', description: 'Task description', priority: 'high' });

      expect(res.status).toBe(201);
    });
  });
});