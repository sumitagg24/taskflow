/**
 * Production readiness checker for GET /api/ready.
 *
 * Returns a structured result of every dependency the server needs to serve
 * real traffic. Never exposes credentials — only boolean/enum states.
 *
 * Checks:
 *   1. MongoDB     — mongoose connection state + a lightweight ping
 *   2. Auth config — JWT secrets present in production (fail-closed)
 *   3. Rate limiter — Redis state when REDIS_URL is configured
 *   4. Object storage — S3 configuration when uploads are enabled in production
 *   5. Runtime config — any required env vars missing at boot time
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ── Individual checks ──────────────────────────────────────────────────────

async function checkMongoDB() {
  const state = mongoose.connection.readyState; // 0=disconnected 1=connected 2=connecting 3=disconnecting
  const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const connected = state === 1;

  if (!connected) {
    return { ready: false, detail: stateNames[state] || `unknown(${state})` };
  }

  // A ping confirms the connection is not just TCP-open but actually serving.
  try {
    await mongoose.connection.db.admin().ping();
    return { ready: true, detail: 'connected+ping' };
  } catch (err) {
    return { ready: false, detail: `ping failed: ${err.message}` };
  }
}

function checkAuthConfig() {
  // In production, the server.js startup validation already throws if these
  // are missing, so reaching here means they were set at boot. This check
  // guards against runtime env stripping (e.g. misconfigured secrets rotation).
  const missing = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
  if (missing.length > 0) {
    return { ready: false, detail: `missing: ${missing.join(', ')}` };
  }
  return { ready: true, detail: 'configured' };
}

function checkRateLimiter() {
  // Lazy require to avoid a circular dependency (rateLimiter doesn't import
  // readiness, but keeping this lazy is safer for test isolation).
  const { getRateLimitState } = require('../middleware/rateLimiter');
  const rl = getRateLimitState();

  if (rl.degraded) {
    return {
      ready: false,
      detail: `REDIS_URL is configured but Redis is unreachable: ${rl.error || 'unknown error'}`,
    };
  }
  return { ready: true, detail: `backend=${rl.backend}` };
}

function checkStorage() {
  // Object storage (Phase 3) is not yet wired — attachments still use the
  // local filesystem. In production the filesystem is ephemeral, so the
  // upload FEATURE is degraded but the API can still serve non-upload routes.
  // This check will flip to a hard requirement when S3 storage is integrated.
  const storageMode = process.env.STORAGE_MODE || 'local';
  if (IS_PRODUCTION && storageMode === 's3') {
    const missing = [];
    if (!process.env.S3_BUCKET) missing.push('S3_BUCKET');
    if (!process.env.S3_REGION) missing.push('S3_REGION');
    if (!process.env.S3_ACCESS_KEY_ID) missing.push('S3_ACCESS_KEY_ID');
    if (!process.env.S3_SECRET_ACCESS_KEY) missing.push('S3_SECRET_ACCESS_KEY');
    if (missing.length > 0) {
      return { ready: false, detail: `S3 mode enabled but missing: ${missing.join(', ')}` };
    }
    return { ready: true, detail: 's3' };
  }
  return { ready: true, detail: `local (mode=${storageMode})` };
}

function checkRuntimeConfig() {
  // Environment variables that MUST be present for the server to operate.
  // server.js validates MONGO_URI / JWT_SECRET / JWT_REFRESH_SECRET at boot;
  // this check guards against later mutation.
  const required = ['MONGO_URI'];
  if (IS_PRODUCTION) {
    required.push('JWT_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_URL');
  }
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return { ready: false, detail: `missing: ${missing.join(', ')}` };
  }
  return { ready: true, detail: 'ok' };
}

// ── Aggregate readiness ────────────────────────────────────────────────────

async function checkReadiness() {
  const checks = {};

  try {
    checks.mongodb = await checkMongoDB();
  } catch (err) {
    checks.mongodb = { ready: false, detail: `check error: ${err.message}` };
  }
  checks.authConfig = checkAuthConfig();
  checks.rateLimiter = checkRateLimiter();
  checks.storage = checkStorage();
  checks.runtimeConfig = checkRuntimeConfig();

  const ready = Object.values(checks).every((c) => c.ready);
  return { ready, checks };
}

module.exports = { checkReadiness };