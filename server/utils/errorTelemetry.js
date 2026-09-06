// Error-telemetry adapter: one funnel for unhandled server errors.
//
// - Redacts sensitive fields (password, tokens, apiKey, secret,
//   authorization, cookie — recursive, case-insensitive key match) before
//   anything leaves the process.
// - Always forwards to `logger.error` (stdout JSON in production).
// - Forwards to Sentry ONLY when `SENTRY_DSN` is set AND `@sentry/node`
//   resolves via dynamic `require` in try/catch. Sentry is opt-in and NOT a
//   dependency — no package.json change. Absent/malformed DSN never crashes.
//
// Pure CommonJS, no new deps.
const logger = require('./logger');

const REDACTED = '[REDACTED]';

// Normalised (lowercase, separators stripped) fragments that mark a key as
// sensitive. `token` covers accessToken/refreshToken/csrfToken; `apikey`
// covers apiKey/api_key; `cookie` covers cookie/set-cookie/cookies.
const SENSITIVE_FRAGMENTS = [
  'password',
  'token',
  'apikey',
  'secret',
  'authorization',
  'cookie',
];

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[_-]/g, '');
}

function isSensitiveKey(key) {
  const normalized = normalizeKey(key);
  return SENSITIVE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function redactValue(value, seen) {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return REDACTED;
    seen.add(value);
    const out = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(value)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactValue(value[key], seen);
    }
    return out;
  }
  return value;
}

/** Deep-clone `value` with sensitive keys replaced by `[REDACTED]`. Never mutates. */
function redact(value) {
  return redactValue(value, new WeakSet());
}

/**
 * Report an error: redacted context to the logger, plus Sentry when opted in.
 * Never throws — telemetry must not break the request it observes.
 *
 * @param {Error|unknown} err
 * @param {Record<string, unknown>} [context] extra fields (requestId, route, …)
 * @returns {{ reported: boolean, reason: string }}
 */
function reportError(err, context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const redactedContext = redact(ctx);
  const message = err && typeof err.message === 'string' ? err.message : String(err);
  const stack = err && typeof err.stack === 'string' ? err.stack : undefined;

  logger.error(`Error reported: ${message}`, {
    context: redactedContext,
    stack: process.env.NODE_ENV !== 'production' ? stack : undefined,
  });

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return { reported: false, reason: 'no-dsn' };

  let sentry;
  try {
    // Dynamic require: Sentry stays opt-in, never a hard dependency.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    sentry = require('@sentry/node');
  } catch {
    return { reported: false, reason: 'sentry-not-installed' };
  }

  try {
    if (sentry && typeof sentry.captureException === 'function') {
      sentry.captureException(err, { extra: redactedContext });
      return { reported: true, reason: 'sent' };
    }
    return { reported: false, reason: 'sentry-no-capture' };
  } catch {
    return { reported: false, reason: 'sentry-error' };
  }
}

module.exports = { reportError, redact, SENSITIVE_FRAGMENTS, REDACTED };
