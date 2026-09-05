// Config + per-account exponential-backoff coverage (no real 15m waits).
//
// Pure helper asserts pin the delay math deterministically; the single
// integration test drives the real /login path through two consecutive blocks
// by expiring the first block via a direct DB write (no sleeps), proving
// abuse is blocked, the second block is longer, and legit logins recover.
const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, TEST_PASSWORD } = require('./helpers');
const User = require('../models/User');
const { backoffDelayMs, resolveRateLimitConfig, DEFAULTS } = require('../config/rateLimit');

const app = createApp();

describe('rateLimit config', () => {
  it('defaults preserve the previous hardcoded values', () => {
    const cfg = resolveRateLimitConfig({});
    expect(cfg.auth).toEqual({ windowMs: 60000, max: 10 });
    expect(cfg.reset).toEqual({ windowMs: 60000, max: 3 });
    expect(cfg.ai).toEqual({ windowMs: 60000, max: 20 });
    expect(cfg.api).toEqual({ windowMs: 60000, max: 100 });
    expect(cfg.testMax).toBe(1000);
    expect(cfg.loginAccount).toEqual({ after: 5, baseMs: 60000, capMs: 900000 });
    expect(cfg.loginIp).toEqual({ after: 30, windowMs: 900000, baseMs: 60000, capMs: 900000 });
  });

  it('reads env overrides', () => {
    const cfg = resolveRateLimitConfig({
      RATE_AUTH_MAX: '2',
      RATE_API_MAX: '7',
      LOGIN_BACKOFF_AFTER: '2',
      LOGIN_BACKOFF_BASE_MS: '1000',
      LOGIN_BACKOFF_CAP_MS: '5000',
      LOGIN_IP_AFTER: '4',
    });
    expect(cfg.auth.max).toBe(2);
    expect(cfg.api.max).toBe(7);
    expect(cfg.loginAccount.after).toBe(2);
    expect(cfg.loginAccount.baseMs).toBe(1000);
    expect(cfg.loginAccount.capMs).toBe(5000);
    expect(cfg.loginIp.after).toBe(4);
  });

  it('backoffDelayMs doubles per level and caps', () => {
    expect(backoffDelayMs(1)).toBe(DEFAULTS.LOGIN_BACKOFF_BASE_MS);
    expect(backoffDelayMs(2)).toBe(DEFAULTS.LOGIN_BACKOFF_BASE_MS * 2);
    expect(backoffDelayMs(3)).toBe(DEFAULTS.LOGIN_BACKOFF_BASE_MS * 4);
    expect(backoffDelayMs(4, 60000, 900000)).toBe(480000);
    expect(backoffDelayMs(5, 60000, 900000)).toBe(900000);
    expect(backoffDelayMs(20, 60000, 900000)).toBe(900000);
  });
});

describe('POST /api/auth/login exponential backoff', () => {
  it('blocks abuse with 429+retryAfter, grows the next block, lets legit logins through', async () => {
    await createTestUser({ email: 'backoff@example.com' });
    const wrong = { identifier: 'backoff@example.com', password: 'WrongP@ss1' };

    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/api/auth/login').send(wrong);
      expect(res.status).toBe(401);
    }
    const first = await request(app).post('/api/auth/login').send(wrong);
    expect(first.status).toBe(429);
    expect(first.body.code).toBe('ACCOUNT_LOCKED');
    expect(first.body.message).toMatch(/temporarily locked/i);
    expect(typeof first.body.retryAfter).toBe('number');
    expect(first.body.retryAfter).toBeGreaterThan(0);

    // Still locked even with the right password.
    const whileLocked = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'backoff@example.com', password: TEST_PASSWORD });
    expect(whileLocked.status).toBe(429);
    expect(whileLocked.body.code).toBe('ACCOUNT_LOCKED');

    let user = await User.findOne({ email: 'backoff@example.com' });
    expect(user.lockoutLevel).toBe(1);
    const firstDurationMs = user.lockUntil.getTime() - Date.now();
    expect(firstDurationMs).toBeGreaterThan(0);

    // Expire the block without a successful login (keeps level at 1), then
    // re-offend: the next block must be longer (level 2).
    await User.updateOne(
      { email: 'backoff@example.com' },
      { $set: { lockUntil: new Date(Date.now() - 1000) } }
    );
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/api/auth/login').send(wrong);
      expect(res.status).toBe(401);
    }
    const second = await request(app).post('/api/auth/login').send(wrong);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('ACCOUNT_LOCKED');
    expect(typeof second.body.retryAfter).toBe('number');
    expect(second.body.retryAfter).toBeGreaterThan(first.body.retryAfter);

    user = await User.findOne({ email: 'backoff@example.com' });
    expect(user.lockoutLevel).toBe(2);

    // Expire again: a legit login succeeds and resets the backoff level.
    await User.updateOne(
      { email: 'backoff@example.com' },
      { $set: { lockUntil: new Date(Date.now() - 1000) } }
    );
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'backoff@example.com', password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty('accessToken');
    user = await User.findOne({ email: 'backoff@example.com' });
    expect(user.lockoutLevel).toBe(0);
    expect(user.loginAttempts).toBe(0);
    expect(user.lockUntil).toBeNull();
  }, 30000);
});
