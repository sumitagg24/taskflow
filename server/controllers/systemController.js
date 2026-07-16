const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { isConfigured: isEmailConfigured } = require('../services/emailService');

function ok(status, latency, configuration) {
  return { status, error: null, latency, configuration };
}

function err(status, error, latency, configuration) {
  return { status, error: String(error), latency: latency ?? null, configuration };
}

async function withTimeout(promise, ms) {
  let timeout;
  const race = Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
  race.catch(() => clearTimeout(timeout));
  return race;
}

async function checkDatabase() {
  const start = Date.now();
  const configuration = {
    uri: process.env.MONGO_URI ? 'set' : 'missing',
    host: 'unknown',
    readyState: mongoose.connection.readyState,
  };

  if (mongoose.connection.readyState !== 1) {
    return err('offline', 'MongoDB not connected', Date.now() - start, configuration);
  }

  try {
    await withTimeout(mongoose.connection.db.admin().ping(), 5000);
    const latency = Date.now() - start;
    configuration.host = mongoose.connection.host;
    return ok('healthy', latency, configuration);
  } catch (error) {
    return err('offline', error.message, Date.now() - start, configuration);
  }
}

async function checkRedis() {
  const start = Date.now();
  const configuration = { configured: false };
  return ok('not_configured', Date.now() - start, configuration);
}

async function checkSmtp() {
  const start = Date.now();
  const configuration = {
    provider: 'ethereal',
    configured: isEmailConfigured(),
  };

  if (!isEmailConfigured()) {
    return err('not_configured', 'Email service is not configured', Date.now() - start, configuration);
  }

  return ok('healthy', Date.now() - start, configuration);
}

async function checkGoogleOAuth() {
  const start = Date.now();
  const configuration = {
    clientId: process.env.GOOGLE_CLIENT_ID ? 'present' : 'missing',
  };

  if (!process.env.GOOGLE_CLIENT_ID) {
    return err('not_configured', 'GOOGLE_CLIENT_ID is missing', Date.now() - start, configuration);
  }

  try {
    new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    return ok('healthy', Date.now() - start, configuration);
  } catch (error) {
    return err('unhealthy', error.message, Date.now() - start, configuration);
  }
}

async function checkJwt() {
  const start = Date.now();
  const configuration = {
    secret: process.env.JWT_SECRET ? 'static' : 'ephemeral',
    accessExpiry: '15m',
    refreshExpiry: '7d',
    algorithm: 'HS256',
  };

  try {
    const secret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    const testPayload = { sub: 'health-check', type: 'access', jti: crypto.randomUUID() };
    const token = jwt.sign(testPayload, secret, {
      expiresIn: '1m',
      algorithm: 'HS256',
    });
    jwt.verify(token, secret, {
      algorithms: ['HS256'],
    });
    return ok('healthy', Date.now() - start, configuration);
  } catch (error) {
    return err('unhealthy', error.message, Date.now() - start, configuration);
  }
}

async function checkEmailVerification() {
  const start = Date.now();
  const configuration = {
    emailService: isEmailConfigured() ? 'ethereal' : 'not_configured',
    route: '/api/auth/verify-email',
    validator: 'verifyEmailValidator',
  };

  if (!isEmailConfigured()) {
    return err('not_configured', 'Email service is not configured', Date.now() - start, configuration);
  }

  return ok('configured', Date.now() - start, configuration);
}

async function checkPasswordReset() {
  const start = Date.now();
  const configuration = {
    emailService: isEmailConfigured() ? 'ethereal' : 'not_configured',
    route: '/api/auth/forgot-password',
    routeReset: '/api/auth/reset-password',
    validator: 'forgotPasswordValidator',
  };

  if (!isEmailConfigured()) {
    return err('not_configured', 'Email service is not configured', Date.now() - start, configuration);
  }

  return ok('configured', Date.now() - start, configuration);
}

async function checkRefreshTokens() {
  const start = Date.now();
  const configuration = {
    route: '/api/auth/refresh-token',
    refreshExpiry: '7d',
    tokenReuseDetection: true,
  };

  return ok('configured', Date.now() - start, configuration);
}

async function checkEnvironmentVariables() {
  const start = Date.now();
  const critical = ['MONGO_URI'];
  const optional = ['JWT_SECRET', 'GOOGLE_CLIENT_ID', 'CLIENT_URL'];
  const missing = [...critical, ...optional].filter((key) => !process.env[key] && process.env.NODE_ENV === 'production' ? critical.includes(key) : false);

  const configuration = {
    critical: critical.reduce((acc, key) => {
      acc[key] = process.env[key] ? 'present' : 'missing';
      return acc;
    }, {}),
    optional: optional.reduce((acc, key) => {
      acc[key] = process.env[key] ? 'present' : 'missing';
      return acc;
    }, {}),
    missingCritical: missing,
  };

  if (missing.length > 0) {
    return err('unhealthy', `Missing critical variables: ${missing.join(', ')}`, Date.now() - start, configuration);
  }

  return ok('healthy', Date.now() - start, configuration);
}

exports.getSystemHealth = async (req, res) => {
  const results = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkSmtp(),
    checkGoogleOAuth(),
    checkJwt(),
    checkEmailVerification(),
    checkPasswordReset(),
    checkRefreshTokens(),
    checkEnvironmentVariables(),
  ]);

  const keys = [
    'database',
    'redis',
    'smtp',
    'googleOAuth',
    'jwt',
    'emailVerification',
    'passwordReset',
    'refreshTokens',
    'environmentVariables',
  ];

  const payload = {};
  results.forEach((result, index) => {
    payload[keys[index]] = result.status === 'fulfilled' ? result.value : err('error', result.reason?.message || 'Unknown error', null, {});
  });

  res.json(payload);
};
