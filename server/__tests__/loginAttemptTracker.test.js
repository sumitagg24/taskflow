// Pure unit test for the in-memory IP backoff tracker (no DB/app).
// The tracker no-ops when NODE_ENV === 'test' (supertest suites issue dozens
// of failing logins from one IP), so tests temporarily leave the test env.
const ORIGINAL_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

// eslint-disable-next-line import/order
const tracker = require('../utils/loginAttemptTracker');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('loginAttemptTracker', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    tracker._reset();
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('does not block before the threshold', () => {
    const ip = '10.0.0.1';
    tracker.recordFail(ip, { windowMs: 60000 });
    tracker.recordFail(ip, { windowMs: 60000 });
    expect(tracker.isBlocked(ip, { threshold: 30, windowMs: 60000 })).toBe(false);
  });

  it('blocks after 30 failed attempts from one IP', () => {
    const ip = '10.0.0.2';
    for (let i = 0; i < 30; i += 1) {
      tracker.recordFail(ip, { windowMs: 60000 });
    }
    expect(tracker.isBlocked(ip, { threshold: 30, windowMs: 60000 })).toBe(true);
  });

  it('supports small thresholds via params', () => {
    const ip = '10.0.0.3';
    tracker.recordFail(ip, { windowMs: 60000 });
    tracker.recordFail(ip, { windowMs: 60000 });
    tracker.recordFail(ip, { windowMs: 60000 });
    expect(tracker.isBlocked(ip, { threshold: 3, windowMs: 60000 })).toBe(true);
    expect(tracker.isBlocked('10.0.0.99', { threshold: 3, windowMs: 60000 })).toBe(false);
  });

  it('unblocks after the block expires (lazy eviction)', async () => {
    // With exponential backoff the unblock point is the block expiry
    // (BASE * 2^(L-1)), not the counting window — so pass a tiny baseMs
    // override to keep this deterministic without real 15m waits.
    const ip = '10.0.0.4';
    const opts = { windowMs: 60000, threshold: 3, baseMs: 50, capMs: 1000 };
    tracker.recordFail(ip, opts);
    tracker.recordFail(ip, opts);
    tracker.recordFail(ip, opts);
    expect(tracker.isBlocked(ip, opts)).toBe(true);
    await sleep(80);
    expect(tracker.isBlocked(ip, opts)).toBe(false);
  });

  it('_reset clears all counters', () => {
    const ip = '10.0.0.5';
    tracker.recordFail(ip, { windowMs: 60000 });
    tracker.recordFail(ip, { windowMs: 60000 });
    tracker.recordFail(ip, { windowMs: 60000 });
    expect(tracker.isBlocked(ip, { threshold: 3, windowMs: 60000 })).toBe(true);
    tracker._reset();
    expect(tracker.isBlocked(ip, { threshold: 3, windowMs: 60000 })).toBe(false);
  });

  it('is skipped entirely when NODE_ENV === test', () => {
    process.env.NODE_ENV = 'test';
    const ip = '10.0.0.6';
    for (let i = 0; i < 50; i += 1) {
      tracker.recordFail(ip, { windowMs: 60000 });
    }
    expect(tracker.isBlocked(ip, { threshold: 30, windowMs: 60000 })).toBe(false);
  });

  it('backoffDelayMs grows exponentially and caps', () => {
    expect(tracker.backoffDelayMs(1, 60000, 900000)).toBe(60000);
    expect(tracker.backoffDelayMs(2, 60000, 900000)).toBe(120000);
    expect(tracker.backoffDelayMs(3, 60000, 900000)).toBe(240000);
    expect(tracker.backoffDelayMs(10, 60000, 900000)).toBe(900000);
  });

  it('second consecutive block lasts longer than the first (ms precision)', async () => {
    const ip = '10.0.0.7';
    const opts = { windowMs: 60000, threshold: 3, baseMs: 60, capMs: 10000 };
    for (let i = 0; i < 3; i += 1) tracker.recordFail(ip, opts);
    expect(tracker.isBlocked(ip, opts)).toBe(true);
    const firstMs = tracker.getRetryAfterMs(ip);
    expect(firstMs).toBeGreaterThan(0);
    expect(firstMs).toBeLessThanOrEqual(60);
    await sleep(90);
    expect(tracker.isBlocked(ip, opts)).toBe(false);
    for (let i = 0; i < 3; i += 1) tracker.recordFail(ip, opts);
    expect(tracker.isBlocked(ip, opts)).toBe(true);
    const secondMs = tracker.getRetryAfterMs(ip);
    expect(secondMs).toBeGreaterThan(firstMs);
  });

  it('exposes retryAfter seconds while blocked and 0 when clear', () => {
    const ip = '10.0.0.8';
    expect(tracker.getRetryAfterSec(ip)).toBe(0);
    const opts = { windowMs: 60000, threshold: 2, baseMs: 60000, capMs: 900000 };
    tracker.recordFail(ip, opts);
    tracker.recordFail(ip, opts);
    expect(tracker.isBlocked(ip, opts)).toBe(true);
    const retryAfter = tracker.getRetryAfterSec(ip);
    expect(typeof retryAfter).toBe('number');
    expect(retryAfter).toBeGreaterThan(0);
  });
});
