const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const rateLimitConfig = require('../config/rateLimit');

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// ── Redis-backed rate limiting ─────────────────────────────────────────────
// Architecture:
//   initRateLimitStore() MUST be called on startup BEFORE the server accepts
//   traffic. It connects to Redis synchronously (awaited) when REDIS_URL is
//   configured, so the first request already hits the distributed limiter.
//
//   If REDIS_URL is NOT configured, the store stays in-memory. In production
//   this is an explicit degraded state — GET /api/ready reports it — because
//   per-replica MemoryStore limits don't protect across horizontal scaling.
//
//   If REDIS_URL IS configured but Redis is unreachable at startup:
//     - production: startup FAILS (fail closed — never silently degrade)
//     - non-production: warn and fall back to MemoryStore (documented)
//
//   Limiter instances are built eagerly at module load and rebuilt once the
//   Redis store resolves (see buildLimiters below).

const state = {
  store: null,           // express-rate-limit store instance (null = MemoryStore default)
  redisConnected: false,
  redisInitAttempted: false,
  redisError: null,      // last init error message (safe to expose — no credentials)
};

/**
 * Connect to Redis when REDIS_URL is configured. Awaited on startup so the
 * store is resolved BEFORE the first request reaches any limiter.
 *
 * - REDIS_URL set + Redis unreachable + production → throws (fail startup)
 * - REDIS_URL set + Redis unreachable + dev       → warn, MemoryStore fallback
 * - REDIS_URL unset                                → no-op (in-memory by design)
 */
async function initRateLimitStore() {
  if (state.redisInitAttempted) return; // idempotent
  state.redisInitAttempted = true;

  if (!process.env.REDIS_URL) {
    if (isProduction) {
      logger.warn('REDIS_URL is not set — rate limiting uses in-memory storage. ' +
        'This does NOT protect across multiple replicas. ' +
        'Set REDIS_URL for production deployments with more than one instance.');
    }
    return;
  }

  try {
    const RedisStore = (require('rate-limit-redis')).default || require('rate-limit-redis');
    const { createClient } = require('redis');
    const redisClient = createClient({ url: process.env.REDIS_URL });

    // Connection timeout: don't hang startup if Redis is unreachable.
    const connectTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timed out after 10s')), 10000)
    );
    await Promise.race([redisClient.connect(), connectTimeout]);

    state.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
    state.redisConnected = true;
    // Rebuild limiter instances so they bind the distributed store now that
    // it is resolved (limiters were first built with the MemoryStore default).
    buildLimiters();
    logger.info('Redis-backed rate limiting enabled');
  } catch (err) {
    state.redisError = err.message;
    state.redisConnected = false;
    if (isProduction) {
      throw new Error(
        `REDIS_URL is configured but Redis is unreachable (${err.message}). ` +
        'Failing startup — rate limiting must not silently degrade in production.'
      );
    }
    logger.warn('Redis connection failed, falling back to in-memory rate limiting (development):', err.message);
  }
}

/**
 * Current store state for /api/ready. Never exposes credentials.
 */
function getRateLimitState() {
  return {
    backend: state.redisConnected ? 'redis' : 'memory',
    redisConfigured: !!process.env.REDIS_URL,
    redisConnected: state.redisConnected,
    degraded: isProduction && !!process.env.REDIS_URL && !state.redisConnected,
    error: state.redisError,
  };
}

// Limiter instances are built eagerly (both at module load with the
// MemoryStore default, and again after initRateLimitStore() resolves the
// Redis store). Building them at startup — not on the first request — avoids
// express-rate-limit's ERR_ERL_CREATED_IN_REQUEST_HANDLER warning and keeps
// instances stable for the process lifetime.
const LIMITER_SPECS = {
  apiLimiter: [rateLimitConfig.api.windowMs, rateLimitConfig.api.max, 'Too many requests, please try again later.'],
  aiTestLimiter: [60 * 1000, 10, 'Too many AI test attempts, please slow down.'],
  authLimiter: [rateLimitConfig.auth.windowMs, rateLimitConfig.auth.max, 'Too many authentication attempts, please try again later.'],
  emailLimiter: [rateLimitConfig.reset.windowMs, rateLimitConfig.reset.max, 'Too many email requests. Please wait before trying again.'],
  passwordResetLimiter: [rateLimitConfig.reset.windowMs, rateLimitConfig.reset.max, 'Too many password reset attempts. Please try again later.'],
  aiLimiter: [rateLimitConfig.ai.windowMs, rateLimitConfig.ai.max, 'Too many AI requests, please slow down.'],
  uploadLimiter: [60 * 1000, 5, 'Too many uploads, please try again later.'],
  verificationLimiter: [15 * 60 * 1000, 5, 'Too many verification attempts. Please try again later.'],
  oauthLimiter: [60 * 1000, 5, 'Too many OAuth attempts. Please try again later.'],
  changePasswordLimiter: [60 * 1000, 3, 'Too many password change attempts. Please try again later.'],
  refreshLimiter: [60 * 1000, 10, 'Too many refresh attempts. Please try again later.'],
  logoutLimiter: [60 * 1000, 10, 'Too many logout attempts. Please try again later.'],
};

const limiters = {};

function buildLimiters() {
  for (const [name, [windowMs, max, message]] of Object.entries(LIMITER_SPECS)) {
    limiters[name] = rateLimit({
      windowMs,
      max: isTest ? rateLimitConfig.testMax : max,
      standardHeaders: true,
      legacyHeaders: false,
      store: state.store || undefined,
      message: { success: false, message, retryAfter: `${windowMs / 1000} seconds`, timestamp: new Date().toISOString() },
    });
  }
}
buildLimiters();

const makeLimiter = (name) => (req, res, next) => limiters[name](req, res, next);

// Windows/maxima come from config/rateLimit.js (env-overridable, defaults
// preserve the previous hardcoded values). Exported limiter names and call
// signatures are unchanged.
exports.apiLimiter = makeLimiter('apiLimiter');
exports.aiTestLimiter = makeLimiter('aiTestLimiter');
exports.authLimiter = makeLimiter('authLimiter');
exports.emailLimiter = makeLimiter('emailLimiter');
exports.passwordResetLimiter = makeLimiter('passwordResetLimiter');
exports.aiLimiter = makeLimiter('aiLimiter');
exports.uploadLimiter = makeLimiter('uploadLimiter');
exports.verificationLimiter = makeLimiter('verificationLimiter');
exports.oauthLimiter = makeLimiter('oauthLimiter');
exports.changePasswordLimiter = makeLimiter('changePasswordLimiter');
exports.refreshLimiter = makeLimiter('refreshLimiter');
exports.logoutLimiter = makeLimiter('logoutLimiter');

exports.initRateLimitStore = initRateLimitStore;
exports.getRateLimitState = getRateLimitState;
