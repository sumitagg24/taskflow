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

  it('unblocks after the window expires (lazy eviction)', async () => {
    const ip = '10.0.0.4';
    tracker.recordFail(ip, { windowMs: 50 });
    tracker.recordFail(ip, { windowMs: 50 });
    tracker.recordFail(ip, { windowMs: 50 });
    expect(tracker.isBlocked(ip, { threshold: 3, windowMs: 50 })).toBe(true);
    await sleep(80);
    expect(tracker.isBlocked(ip, { threshold: 3, windowMs: 50 })).toBe(false);
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
});
