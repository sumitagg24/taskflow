// IP-based brute-force backoff for the login endpoint.
//
// Complements the per-account lockout (5 fails / 15m in authController.js),
// which alone lets an attacker deliberately lock out any targeted account
// (account-DoS) while spraying passwords across many accounts stays cheap.
// A per-IP counter (30 fails / 15m) throttles distributed guessing from a
// single source without revealing anything new: a blocked IP gets the exact
// same 429 shape as an account lockout, so no user-enumeration oracle is
// added.
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
// per-account lockout persist independently).

const MAX_IP_FAILED_ATTEMPTS = 30;
const IP_BLOCK_WINDOW_MS = 15 * 60 * 1000;

// Map<ip, { count: number, firstTs: number }> — fixed window anchored at the
// first failure inside the window.
const attempts = new Map();

const isTestEnv = () => process.env.NODE_ENV === 'test';

// Both functions accept overrides as an options object or positionally:
//   recordFail(ip[, windowMs | { windowMs }])
//   isBlocked(ip[, threshold[, windowMs] | { threshold, windowMs }])
// so tests can pass small values without timers/mocks.
function resolveRecordOptions(arg) {
  if (typeof arg === 'number') return { windowMs: arg };
  const { windowMs = IP_BLOCK_WINDOW_MS } = arg || {};
  return { windowMs };
}

function resolveCheckOptions(a, b) {
  if (typeof a === 'number') {
    return { threshold: a, windowMs: typeof b === 'number' ? b : IP_BLOCK_WINDOW_MS };
  }
  const { threshold = MAX_IP_FAILED_ATTEMPTS, windowMs = IP_BLOCK_WINDOW_MS } = a || {};
  return { threshold, windowMs };
}

const isExpired = (entry, now, windowMs) => now - entry.firstTs > windowMs;

function recordFail(ip, options) {
  // No-op in tests — see module header.
  if (isTestEnv()) return;
  if (!ip) return;
  const { windowMs } = resolveRecordOptions(options);
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || isExpired(entry, now, windowMs)) {
    attempts.set(ip, { count: 1, firstTs: now });
    return;
  }
  entry.count += 1;
}

function isBlocked(ip, a, b) {
  // Never block in tests — see module header.
  if (isTestEnv()) return false;
  if (!ip) return false;
  const { threshold, windowMs } = resolveCheckOptions(a, b);
  const entry = attempts.get(ip);
  if (!entry) return false;
  // Lazy eviction: drop expired windows on read.
  if (isExpired(entry, Date.now(), windowMs)) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= threshold;
}

function _reset() {
  attempts.clear();
}

module.exports = {
  recordFail,
  isBlocked,
  _reset,
  MAX_IP_FAILED_ATTEMPTS,
  IP_BLOCK_WINDOW_MS,
};
