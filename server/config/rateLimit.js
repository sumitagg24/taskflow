// Centralized rate-limit + login-backoff configuration.
//
// All values are read from the environment with the previous hardcoded
// values as defaults, so existing deployments keep identical behavior
// unless the new RATE_*/LOGIN_* variables are set.
//
// Express-rate-limit groups:
//   auth  – login / register            (RATE_AUTH_*)
//   reset – password-reset / email      (RATE_RESET_*)
//   ai    – AI endpoints                (RATE_AI_*)
//   api   – general API                 (RATE_API_*)
//   testMax – NODE_ENV=test override    (RATE_TEST_MAX)
//
// Login backoff (exponential, see backoffDelayMs):
//   loginAccount – per-account progressive lockout
//   loginIp      – per-IP progressive block (see utils/loginAttemptTracker)

function toPositiveInt(raw, fallback) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const DEFAULTS = {
  RATE_AUTH_WINDOW_MS: 60 * SECOND,
  RATE_AUTH_MAX: 10,
  RATE_RESET_WINDOW_MS: 60 * SECOND,
  RATE_RESET_MAX: 3,
  RATE_AI_WINDOW_MS: 60 * SECOND,
  RATE_AI_MAX: 20,
  RATE_API_WINDOW_MS: 60 * SECOND,
  RATE_API_MAX: 100,
  RATE_TEST_MAX: 1000,
  LOGIN_BACKOFF_AFTER: 5,
  LOGIN_BACKOFF_BASE_MS: 60 * SECOND,
  LOGIN_BACKOFF_CAP_MS: 15 * MINUTE,
  LOGIN_IP_AFTER: 30,
  LOGIN_IP_WINDOW_MS: 15 * MINUTE,
  LOGIN_IP_BASE_MS: 60 * SECOND,
  LOGIN_IP_CAP_MS: 15 * MINUTE,
};

// Pure exponential backoff: level L (1-based consecutive-block count) maps to
//   min(BASE * 2^(L-1), CAP)
// so L=1 → BASE, L=2 → 2*BASE, L=3 → 4*BASE, … capped at CAP.
// Pure (no env reads) so unit tests can assert progression deterministically
// by passing explicit base/cap; defaults match the per-account backoff which
// currently equals the per-IP backoff.
function backoffDelayMs(level, baseMs = DEFAULTS.LOGIN_BACKOFF_BASE_MS, capMs = DEFAULTS.LOGIN_BACKOFF_CAP_MS) {
  const l = Number.isFinite(Number(level)) ? Math.floor(Number(level)) : 1;
  const clampedLevel = Math.max(1, l);
  const base = Number.isFinite(Number(baseMs)) && Number(baseMs) > 0
    ? Number(baseMs)
    : DEFAULTS.LOGIN_BACKOFF_BASE_MS;
  const cap = Number.isFinite(Number(capMs)) && Number(capMs) > 0
    ? Number(capMs)
    : DEFAULTS.LOGIN_BACKOFF_CAP_MS;
  const delay = base * 2 ** (clampedLevel - 1);
  return Math.min(delay, cap);
}

// Resolve from an explicit env-like object (default process.env) so tests can
// pass small overrides without require-cache / env-timing hacks.
function resolveRateLimitConfig(env = process.env) {
  const source = env || {};
  return {
    auth: {
      windowMs: toPositiveInt(source.RATE_AUTH_WINDOW_MS, DEFAULTS.RATE_AUTH_WINDOW_MS),
      max: toPositiveInt(source.RATE_AUTH_MAX, DEFAULTS.RATE_AUTH_MAX),
    },
    reset: {
      windowMs: toPositiveInt(source.RATE_RESET_WINDOW_MS, DEFAULTS.RATE_RESET_WINDOW_MS),
      max: toPositiveInt(source.RATE_RESET_MAX, DEFAULTS.RATE_RESET_MAX),
    },
    ai: {
      windowMs: toPositiveInt(source.RATE_AI_WINDOW_MS, DEFAULTS.RATE_AI_WINDOW_MS),
      max: toPositiveInt(source.RATE_AI_MAX, DEFAULTS.RATE_AI_MAX),
    },
    api: {
      windowMs: toPositiveInt(source.RATE_API_WINDOW_MS, DEFAULTS.RATE_API_WINDOW_MS),
      max: toPositiveInt(source.RATE_API_MAX, DEFAULTS.RATE_API_MAX),
    },
    testMax: toPositiveInt(source.RATE_TEST_MAX, DEFAULTS.RATE_TEST_MAX),
    loginAccount: {
      after: toPositiveInt(source.LOGIN_BACKOFF_AFTER, DEFAULTS.LOGIN_BACKOFF_AFTER),
      baseMs: toPositiveInt(source.LOGIN_BACKOFF_BASE_MS, DEFAULTS.LOGIN_BACKOFF_BASE_MS),
      capMs: toPositiveInt(source.LOGIN_BACKOFF_CAP_MS, DEFAULTS.LOGIN_BACKOFF_CAP_MS),
    },
    loginIp: {
      after: toPositiveInt(source.LOGIN_IP_AFTER, DEFAULTS.LOGIN_IP_AFTER),
      windowMs: toPositiveInt(source.LOGIN_IP_WINDOW_MS, DEFAULTS.LOGIN_IP_WINDOW_MS),
      baseMs: toPositiveInt(source.LOGIN_IP_BASE_MS, DEFAULTS.LOGIN_IP_BASE_MS),
      capMs: toPositiveInt(source.LOGIN_IP_CAP_MS, DEFAULTS.LOGIN_IP_CAP_MS),
    },
  };
}

// Resolved once at require-time (env reads); use resolveRateLimitConfig(env)
// directly when per-test overrides are needed.
const resolved = resolveRateLimitConfig(process.env);

module.exports = {
  ...resolved,
  resolveRateLimitConfig,
  backoffDelayMs,
  DEFAULTS,
};
