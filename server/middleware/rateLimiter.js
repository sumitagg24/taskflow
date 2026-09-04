const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// In production, optionally use Redis-backed rate limiting.
// Set REDIS_URL to enable Redis store; otherwise falls back to in-memory.
// The store is initialized lazily on first request so that Redis can connect
// asynchronously before any rate-limit check runs. If Redis isn't ready yet,
// the in-memory MemoryStore is used as a fallback.
let store = null;
let redisReady = false;
let redisInitAttempted = false;

async function ensureRedisStore() {
  if (!isProduction || !process.env.REDIS_URL || redisInitAttempted) return;

  redisInitAttempted = true;
  try {
    const RedisStore = (require('rate-limit-redis')).default || require('rate-limit-redis');
    const { createClient } = require('redis');
    const redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
    store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
    redisReady = true;
    logger.info('Redis-backed rate limiting enabled');
  } catch (err) {
    logger.warn('Redis connection failed, falling back to in-memory rate limiting:', err.message);
  }
}

const createLimiter = (windowMs, max, message) => {
  const limiter = rateLimit({
    windowMs,
    max: isTest ? 1000 : max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    message: { success: false, message, retryAfter: `${windowMs / 1000} seconds`, timestamp: new Date().toISOString() },
  });

  // On first invocation, kick off async Redis init (non-blocking — store
  // will be upgraded to Redis once it connects).
  if (isProduction && process.env.REDIS_URL && !redisInitAttempted) {
    ensureRedisStore().catch((err) => logger.warn('Redis init error:', err.message));
  }

  return limiter;
};

exports.apiLimiter = createLimiter(60 * 1000, 100, 'Too many requests, please try again later.');

// Tighter cap on AI connection tests since they make outbound HTTPS calls.
exports.aiTestLimiter = createLimiter(60 * 1000, 10, 'Too many AI test attempts, please slow down.');

exports.authLimiter = createLimiter(60 * 1000, 10, 'Too many authentication attempts, please try again later.');

exports.emailLimiter = createLimiter(60 * 1000, 3, 'Too many email requests. Please wait before trying again.');

exports.passwordResetLimiter = createLimiter(60 * 1000, 3, 'Too many password reset attempts. Please try again later.');

exports.aiLimiter = createLimiter(60 * 1000, 20, 'Too many AI requests, please slow down.');

exports.uploadLimiter = createLimiter(60 * 1000, 5, 'Too many uploads, please try again later.');

exports.verificationLimiter = createLimiter(15 * 60 * 1000, 5, 'Too many verification attempts. Please try again later.');

exports.oauthLimiter = createLimiter(60 * 1000, 5, 'Too many OAuth attempts. Please try again later.');

exports.changePasswordLimiter = createLimiter(60 * 1000, 3, 'Too many password change attempts. Please try again later.');

exports.refreshLimiter = createLimiter(60 * 1000, 10, 'Too many refresh attempts. Please try again later.');

exports.logoutLimiter = createLimiter(60 * 1000, 10, 'Too many logout attempts. Please try again later.');
