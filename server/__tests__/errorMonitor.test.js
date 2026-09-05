// Pure unit tests for the sliding-window error-spike monitor.
// No HTTP, no timers, no mocks — window/threshold/now are injected
// via recordError's options param.
const { recordError, reset } = require('../utils/errorMonitor');

describe('errorMonitor', () => {
  beforeEach(() => {
    reset();
  });

  it('ignores non-5xx statuses', () => {
    const opts = { windowMs: 60000, threshold: 2, now: 1000000 };
    expect(recordError('/api/tasks', 400, opts)).toMatchObject({ breached: false, warned: false, count: 0 });
    expect(recordError('/api/tasks', 404, opts)).toMatchObject({ breached: false, warned: false, count: 0 });
  });

  it('warns once when the threshold is breached within a window', () => {
    const base = { windowMs: 60000, threshold: 3 };
    expect(recordError('/api/tasks', 500, { ...base, now: 1000 })).toMatchObject({ breached: false, count: 1 });
    expect(recordError('/api/tasks', 500, { ...base, now: 2000 })).toMatchObject({ breached: false, count: 2 });
    expect(recordError('/api/tasks', 500, { ...base, now: 3000 })).toMatchObject({ breached: true, warned: true, count: 3 });
  });

  it('suppresses further warns until the window rolls', () => {
    const base = { windowMs: 60000, threshold: 2 };
    expect(recordError('/api/tasks', 500, { ...base, now: 1000 }).warned).toBe(false);
    expect(recordError('/api/tasks', 500, { ...base, now: 2000 }).warned).toBe(true);
    // Still breached, but no additional warn inside the same window.
    expect(recordError('/api/tasks', 500, { ...base, now: 3000 })).toMatchObject({ breached: true, warned: false });
    expect(recordError('/api/tasks', 500, { ...base, now: 4000 })).toMatchObject({ breached: true, warned: false });
  });

  it('rolls the window: old events expire and a new breach can warn again', () => {
    const base = { windowMs: 1000, threshold: 2 };
    expect(recordError('/api/tasks', 500, { ...base, now: 0 }).warned).toBe(false);
    expect(recordError('/api/tasks', 500, { ...base, now: 100 }).warned).toBe(true);
    // Both events aged out (>1000ms later): count restarts.
    expect(recordError('/api/tasks', 500, { ...base, now: 2000 })).toMatchObject({ breached: false, warned: false, count: 1 });
    expect(recordError('/api/tasks', 500, { ...base, now: 2100 })).toMatchObject({ breached: true, warned: true, count: 2 });
  });

  it('reset() clears counts and the warn suppression', () => {
    const base = { windowMs: 60000, threshold: 1, now: 5000 };
    expect(recordError('/api/tasks', 500, base).warned).toBe(true);
    reset();
    expect(recordError('/api/tasks', 500, base)).toMatchObject({ breached: true, warned: true, count: 1 });
  });
});
