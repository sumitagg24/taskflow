const request = require('supertest');
const { createApp } = require('./setup');

const app = createApp();

describe('System Endpoints', () => {
  describe('GET /api/health', () => {
    it('returns health status', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('requestId');
    });
  });

  describe('GET /api/docs.json', () => {
    it('returns swagger specification', async () => {
      const res = await request(app).get('/api/docs.json');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('openapi', '3.0.0');
      expect(res.body).toHaveProperty('info');
      expect(res.body.info.title).toBe('TaskFlow API');
      expect(res.body.info.version).toBe('1.0.0');
      expect(res.body).toHaveProperty('paths');
      expect(Object.keys(res.body.paths).length).toBeGreaterThan(0);
    });

    it('documents auth endpoints', async () => {
      const res = await request(app).get('/api/docs.json');
      const paths = Object.keys(res.body.paths);
      expect(paths).toContain('/api/auth/login');
      expect(paths).toContain('/api/auth/register');
    });

    it('documents tasks endpoints', async () => {
      const res = await request(app).get('/api/docs.json');
      const paths = Object.keys(res.body.paths);
      expect(paths).toContain('/api/tasks');
    });
  });

  describe('GET /api/docs/', () => {
    it('serves swagger UI', async () => {
      const res = await request(app).get('/api/docs/');

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/swagger/i);
    });
  });
});
