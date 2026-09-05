// IP-based brute-force backoff for the login endpoint.
//
// Complements the per-account exponential backoff (see config/rateLimit.js),
// which alone lets an attacker deliberately lock out any targeted account
// (account-DoS) while spraying passwords across many accounts stays cheap.
// A per-IP progressive block throttles distributed guessing from a single
// source without revealing anything new: a blocked IP gets the exact same
// 429 shape as an account lockout, so no user-enumeration oracle is added.
//
// Block duration grows exponentially per consecutive block:
//   delay(L) = min(BASE * 2^(L-1), CAP)  (L = 1-based consecutive-block count)
// with env LOGIN_IP_AFTER (default 30), LOGIN_IP_WINDOW_MS (default 15m),
// LOGIN_IP_BASE_MS (default 60s), LOGIN_IP_CAP_MS (default 15m).
//
// Trusts `req.ip` as-is. Express `trust proxy` stays default-off here, so
// `req.ip` is the direct peer address — do NOT read X-Forwarded-For manually
// (clients can spoof it).
//
// Skipped entirely when NODE_ENV === 'test' (same precedent as the
// `isTest` bypass in middleware/rateLimiter.js): supertest suites issue
// dozens of failing logins from one IP (127.0.0.1), which would trip the
// tracker and make unrelated auth tests flaky. The check is done per call
// (not at require time) so unit tests can temporarily leave the test env.
// Dependency-free, in-memory: counters reset on process restart, which is
// acceptable for a backoff (not a security boundary — authLimiter and the
// per-account backoff persist independently).

const { resolveRateLimitConfig, backoffDelayMs } = require('../config/rateLimit');

function ipDefaults() {
  try {
    return resolveRateLimitConfig(process.env).loginIp;
  } catch {
    return { after: 30, windowMs: 15 * 60 * 1000, baseMs: 60 * 1000, capMs: 15 * 60 * 1000 };
  }
}

// Map<ip, { count: number, windowStart: number, level: number, blockedUntil: number }>
// count = failures inside the current window; level = consecutive-block count
// (drives the exponential duration); blockedUntil = ms epoch expiry (0 = none).
const attempts = new Map();

const isTestEnv = () => process.env.NODE_ENV === 'test';

// Both functions accept overrides as an options object or positionally:
//   recordFail(ip[, windowMs | { windowMs, threshold, baseMs, capMs }])
//   isBlocked(ip[, threshold[, windowMs] | { threshold, windowMs, baseMs, capMs }])
//   getRetryAfterSec/Ms(ip[, { windowMs }])
// so tests can pass small values without timers/mocks. Explicit overrides win
// over the LOGIN_IP_* env defaults.
function resolveRecordOptions(arg) {
  const defs = ipDefaults();
  if (typeof arg === 'number') {
    return { windowMs: arg, threshold: defs.after, baseMs: defs.baseMs, capMs: defs.capMs };
  }
  const {
    windowMs = defs.windowMs,
    threshold = defs.after,
    after = defs.after,
    baseMs = defs.baseMs,
    capMs = defs.capMs,
  } = arg || {};
  return {
    windowMs,
    threshold: typeof threshold === 'number' ? threshold : after,
    baseMs,
    capMs,
  };
}

function resolveCheckOptions(a, b) {
  const defs = ipDefaults();
  if (typeof a === 'number') {
    return {
      threshold: a,
      windowMs: typeof b === 'number' ? b : defs.windowMs,
      baseMs: defs.baseMs,
      capMs: defs.capMs,
    };
  }
  const {
    threshold = defs.after,
    after = defs.after,
    windowMs = defs.windowMs,
    baseMs = defs.baseMs,
    capMs = defs.capMs,
  } = a || {};
  return {
    threshold: typeof threshold === 'number' ? threshold : after,
    windowMs,
    baseMs,
    capMs,
  };
}

function triggerBlock(entry, now, baseMs, capMs) {
  entry.level += 1;
  entry.blockedUntil = now + backoffDelayMs(entry.level, baseMs, capMs);
}

function recordFail(ip, options) {
  // No-op in tests — see module header.
  if (isTestEnv()) return;
  if (!ip) return;
  const { windowMs, threshold, baseMs, capMs } = resolveRecordOptions(options);
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry) {
    entry = { count: 1, windowStart: now, level: 0, blockedUntil: 0 };
    attempts.set(ip, entry);
    if (entry.count >= threshold) triggerBlock(entry, now, baseMs, capMs);
    return;
  }
  // Still inside an active block: count the failure but don't extend the
  // block — the longer next level applies once this block expires and the
  // client re-offends (prevents a single burst from skipping levels).
  if (entry.blockedUntil && now < entry.blockedUntil) {
    entry.count += 1;
    return;
  }
  // A block just expired: start a fresh counting window but keep the level so
  // the NEXT block is longer (consecutive-block progression).
  if (entry.blockedUntil && now >= entry.blockedUntil) {
    entry.count = 1;
    entry.windowStart = now;
    entry.blockedUntil = 0;
    if (entry.count >= threshold) triggerBlock(entry, now, baseMs, capMs);
    return;
  }
  // Clean window expired without a block: reset count (level is already 0).
  if (now - entry.windowStart > windowMs) {
    entry.count = 1;
    entry.windowStart = now;
    entry.level = 0;
    entry.blockedUntil = 0;
    if (entry.count >= threshold) triggerBlock(entry, now, baseMs, capMs);
    return;
  }
  entry.count += 1;
  if (entry.count >= threshold && !entry.blockedUntil) {
    triggerBlock(entry, now, baseMs, capMs);
  }
}

function isBlocked(ip, a, b) {
  // Never block in tests — see module header.
  if (isTestEnv()) return false;
  if (!ip) return false;
  const { threshold, windowMs, baseMs, capMs } = resolveCheckOptions(a, b);
  const entry = attempts.get(ip);
  if (!entry) return false;
  const now = Date.now();
  // Active exponential block.
  if (entry.blockedUntil) {
    if (now < entry.blockedUntil) return true;
    // Block expired: keep the level for progression, reset the counting
    // window so the next failure starts a fresh streak toward the next
    // (longer) block.
    entry.count = 0;
    entry.windowStart = now;
    entry.blockedUntil = 0;
    return false;
  }
  // Lazy eviction: drop expired clean windows on read.
  if (now - entry.windowStart > windowMs) {
    attempts.delete(ip);
    return false;
  }
  // Threshold reached via recordFail calls that used different options
  // (e.g. default threshold at record time, small threshold at check time):
  // materialize the block lazily so the check stays authoritative.
  if (entry.count >= threshold) {
    triggerBlock(entry, now, baseMs, capMs);
    return true;
  }
  return false;
}

// Seconds (ceil) remaining on the current IP block, or 0 when not blocked.
// Used by the login controller to populate `retryAfter` on the 429.
function getRetryAfterSec(ip) {
  if (isTestEnv()) return 0;
  if (!ip) return 0;
  const entry = attempts.get(ip);
  if (!entry || !entry.blockedUntil) return 0;
  const remainingMs = entry.blockedUntil - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

// Millisecond precision twin (useful for deterministic tests with tiny
// baseMs overrides where ceil-to-seconds would collapse L=1 vs L=2).
function getRetryAfterMs(ip) {
  if (isTestEnv()) return 0;
  if (!ip) return 0;
  const entry = attempts.get(ip);
  if (!entry || !entry.blockedUntil) return 0;
  return Math.max(0, entry.blockedUntil - Date.now());
}

function _reset() {
  attempts.clear();
}

// Back-compat aliases for the pre-backoff fixed-window constants.
function currentThreshold() {
  return ipDefaults().after;
}

function currentWindowMs() {
  return ipDefaults().windowMs;
}

module.exports = {
  recordFail,
  isBlocked,
  getRetryAfterSec,
  getRetryAfterMs,
  _reset,
  backoffDelayMs,
  get MAX_IP_FAILED_ATTEMPTS() {
    return currentThreshold();
  },
  get IP_BLOCK_WINDOW_MS() {
    return currentWindowMs();
  },
};
