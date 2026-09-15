/**
 * Comprehensive tests for the resend-verification email flow.
 *
 * Covers: valid resend, invalid input, unknown accounts, already-verified,
 * provider failures, token generation, token expiry, successful verification,
 * invalid tokens, reused tokens, login block, and logging safety.
 *
 * The email service is mocked so no test touches real SMTP/Resend/Ethereal.
 */

// Mock emailService BEFORE importing anything that uses it
jest.mock('../services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ id: 'mock-id', previewUrl: null }),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  isConfigured: jest.fn().mockReturnValue(true),
  canDeliver: jest.fn().mockReturnValue(true),
  getEmailStatus: jest.fn().mockReturnValue({ provider: 'mock', configured: true, clientUrl: 'http://localhost:3000', environment: 'test' }),
  sendEmail: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  sendContactMessage: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  sendInviteEmail: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  sendNotificationEmail: jest.fn().mockResolvedValue({ id: 'mock-id' }),
}));

const request = require('supertest');
const crypto = require('crypto');
const { createApp } = require('./setup');
const { TEST_PASSWORD } = require('./helpers');
const User = require('../models/User');
const emailService = require('../services/emailService');

const app = createApp();

const createUser = async (overrides = {}) => {
  return User.create({
    name: 'Test User',
    username: `user_${crypto.randomBytes(4).toString('hex')}`,
    email: `test_${crypto.randomBytes(4).toString('hex')}@example.com`,
    password: TEST_PASSWORD,
    authProvider: 'local',
    emailVerified: false,
    ...overrides,
  });
};

// Helper: clear the email mock and get the last raw token from resend
function clearEmailMock() {
  emailService.sendVerificationEmail.mockClear();
}

function getLastRawToken() {
  const calls = emailService.sendVerificationEmail.mock.calls;
  if (calls.length === 0) return null;
  return calls[calls.length - 1][1]; // second arg is the raw token
}

// ─── 1. VALID RESEND ────────────────────────────────────────────────────────
describe('Resend Verification — valid scenarios', () => {
  beforeEach(clearEmailMock);

  it('returns generic success for unverified user', async () => {
    const user = await createUser({ emailVerified: false });
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent/i);
    expect(emailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
      user.email,
      expect.any(String)
    );
  });

  it('generates a new verification token on the user document', async () => {
    const user = await createUser({ emailVerified: false });
    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    const updated = await User.findById(user._id);
    expect(updated.emailVerificationToken).toBeDefined();
    expect(updated.emailVerificationExpires).toBeDefined();
    expect(updated.emailVerificationExpires.getTime()).toBeGreaterThan(Date.now());
  });

  it('replaces any previous verification token', async () => {
    const user = await createUser({ emailVerified: false });
    user.emailVerificationToken = 'old-hash';
    user.emailVerificationExpires = Date.now() + 3600000;
    await user.save();

    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    const updated = await User.findById(user._id);
    expect(updated.emailVerificationToken).not.toBe('old-hash');
    expect(updated.emailVerificationToken).toBeDefined();
  });
});

// ─── 2. INVALID INPUT ───────────────────────────────────────────────────────
describe('Resend Verification — invalid input', () => {
  beforeEach(clearEmailMock);

  it('rejects missing email', async () => {
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

// ─── 3. UNKNOWN ACCOUNT (NO ENUMERATION) ────────────────────────────────────
describe('Resend Verification — unknown account', () => {
  beforeEach(clearEmailMock);

  it('returns generic success message (no account enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent/i);
    expect(res.body.message).not.toMatch(/not found/i);
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

// ─── 4. ALREADY VERIFIED ────────────────────────────────────────────────────
describe('Resend Verification — already verified', () => {
  beforeEach(clearEmailMock);

  it('returns generic success (no enumeration of verification status)', async () => {
    const user = await createUser({ emailVerified: true });
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent/i);
    expect(res.body.message).not.toMatch(/already verified/i);
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

// ─── 5. PROVIDER FAILURE ────────────────────────────────────────────────────
describe('Resend Verification — provider failure', () => {
  beforeEach(clearEmailMock);

  it('returns 500 and cleans up token when email send fails', async () => {
    emailService.sendVerificationEmail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    const user = await createUser({ emailVerified: false });
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed/i);

    const updated = await User.findById(user._id);
    expect(updated.emailVerificationToken).toBeUndefined();
    expect(updated.emailVerificationExpires).toBeUndefined();
  });

  it('returns safe error message (no provider details leaked)', async () => {
    emailService.sendVerificationEmail.mockRejectedValueOnce(new Error('Resend API error 403: domain not verified'));

    const user = await createUser({ emailVerified: false });
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/Resend/i);
    expect(JSON.stringify(res.body)).not.toMatch(/SMTP/i);
    expect(JSON.stringify(res.body)).not.toMatch(/403/i);
  });
});

// ─── 6. TOKEN CREATION ──────────────────────────────────────────────────────
describe('Resend Verification — token creation', () => {
  beforeEach(clearEmailMock);

  it('creates a cryptographically random token (SHA-256 hex)', async () => {
    const user = await createUser({ emailVerified: false });
    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    const updated = await User.findById(user._id);
    expect(updated.emailVerificationToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('token expires in ~24 hours', async () => {
    const user = await createUser({ emailVerified: false });
    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    const updated = await User.findById(user._id);
    const expiryMs = updated.emailVerificationExpires.getTime() - Date.now();
    expect(expiryMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(expiryMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('raw token is passed to email service (not the hash)', async () => {
    const user = await createUser({ emailVerified: false });
    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    const rawToken = getLastRawToken();
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);

    // The hash stored in DB should be SHA256(rawToken)
    const updated = await User.findById(user._id);
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    expect(updated.emailVerificationToken).toBe(expectedHash);
  });
});

// ─── 7. TOKEN EXPIRY ────────────────────────────────────────────────────────
describe('Resend Verification — token expiry', () => {
  beforeEach(clearEmailMock);

  it('expired token is rejected by verify-email', async () => {
    const user = await createUser({ emailVerified: false });
    const rawToken = user.createEmailVerificationToken();
    user.emailVerificationExpires = Date.now() - 1000;
    await user.save();

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: rawToken });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });
});

// ─── 8. SUCCESSFUL VERIFICATION ────────────────────────────────────────────
describe('Resend Verification — successful verification flow', () => {
  beforeEach(clearEmailMock);

  it('full flow: resend → verify → emailVerified becomes true', async () => {
    const user = await createUser({ emailVerified: false });

    const resendRes = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });
    expect(resendRes.status).toBe(200);

    const rawToken = getLastRawToken();
    expect(rawToken).toBeTruthy();

    const verifyRes = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: rawToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.message).toMatch(/verified/i);

    const updated = await User.findById(user._id);
    expect(updated.emailVerified).toBe(true);
    expect(updated.emailVerificationToken).toBeUndefined();
    expect(updated.emailVerificationExpires).toBeUndefined();
  });
});

// ─── 9. INVALID TOKEN ──────────────────────────────────────────────────────
describe('Resend Verification — invalid token', () => {
  beforeEach(clearEmailMock);

  it('rejects completely fake token', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'fake-token-12345' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('rejects empty token', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: '' });
    expect(res.status).toBe(400);
  });

  it('rejects missing token', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({});
    expect(res.status).toBe(400);
  });
});

// ─── 10. REUSED TOKEN ───────────────────────────────────────────────────────
describe('Resend Verification — reused token', () => {
  beforeEach(clearEmailMock);

  it('cannot reuse a token after successful verification', async () => {
    const user = await createUser({ emailVerified: false });

    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });
    const rawToken = getLastRawToken();

    const res1 = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: rawToken });
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: rawToken });
    expect(res2.status).toBe(400);
    expect(res2.body.message).toMatch(/invalid/i);
  });

  it('old token is invalidated when resend creates a new one', async () => {
    const user = await createUser({ emailVerified: false });

    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });
    const oldToken = getLastRawToken();

    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });
    const newToken = getLastRawToken();

    expect(newToken).not.toBe(oldToken);

    const res1 = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: oldToken });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: newToken });
    expect(res2.status).toBe(200);
  });
});

// ─── 11. LOGIN BLOCKED FOR UNVERIFIED ──────────────────────────────────────
describe('Resend Verification — login blocked for unverified', () => {
  beforeEach(clearEmailMock);

  it('returns 403 EMAIL_NOT_VERIFIED for unverified accounts', async () => {
    const user = await createUser({ emailVerified: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

// ─── 12. LOGGING SAFETY ─────────────────────────────────────────────────────
describe('Resend Verification — logging safety', () => {
  beforeEach(clearEmailMock);

  it('does not log verification tokens', async () => {
    const logger = require('../utils/logger');
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});

    const user = await createUser({ emailVerified: false });
    await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    const rawToken = getLastRawToken();

    const allLogs = [...warnSpy.mock.calls, ...infoSpy.mock.calls]
      .map(c => JSON.stringify(c))
      .join('');

    expect(allLogs).not.toContain(rawToken);

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
