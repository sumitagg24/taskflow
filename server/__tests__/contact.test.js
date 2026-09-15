// POST /api/contact — public support intake. The email service is mocked so
// no test ever touches SMTP/Resend/Ethereal; delivery gating is asserted
// through canDeliver, and the SUPPORT_EMAIL-missing path is asserted against
// the real module (it throws before any transport is built).
process.env.NODE_ENV = 'test';

const request = require('supertest');

jest.mock('../services/emailService', () => ({
  canDeliver: jest.fn(),
  sendContactMessage: jest.fn(),
}));

const { createApp } = require('../app');
const emailService = require('../services/emailService');

const app = createApp({ enableSpaFallback: false });

const validBody = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  subject: 'Export seems stuck',
  message: 'My calendar export has been spinning for ten minutes. Please help!',
};

beforeEach(() => {
  jest.clearAllMocks();
  emailService.canDeliver.mockReturnValue(true);
  emailService.sendContactMessage.mockResolvedValue({ id: 'mock-id' });
});

describe('POST /api/contact', () => {
  it('accepts a valid message with a generic response (no address leaked)', async () => {
    const res = await request(app).post('/api/contact').send(validBody);
    expect(res.status).toBe(202);
    expect(res.body.message).toMatch(/on its way/i);
    expect(JSON.stringify(res.body)).not.toMatch(/@/);
    expect(emailService.sendContactMessage).toHaveBeenCalledWith(validBody);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/contact').send({ ...validBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(emailService.sendContactMessage).not.toHaveBeenCalled();
  });

  it('rejects a too-short message and missing fields', async () => {
    const short = await request(app).post('/api/contact').send({ ...validBody, message: 'hi' });
    expect(short.status).toBe(400);
    const missing = await request(app).post('/api/contact').send({ name: 'Ada' });
    expect(missing.status).toBe(400);
    expect(emailService.sendContactMessage).not.toHaveBeenCalled();
  });

  it('rejects oversized fields', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ ...validBody, subject: 'x'.repeat(121), message: 'y'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(emailService.sendContactMessage).not.toHaveBeenCalled();
  });

  it('returns 503 without leaking config when delivery is unavailable', async () => {
    emailService.canDeliver.mockReturnValue(false);
    const res = await request(app).post('/api/contact').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/unavailable/i);
    expect(JSON.stringify(res.body)).not.toMatch(/@/);
    expect(emailService.sendContactMessage).not.toHaveBeenCalled();
  });
});
