// In-memory sliding-window 5xx spike monitor (no new deps).
// recordError() counts status >= 500 events in a rolling window
// (ERROR_SPIKE_WINDOW_MS, default 300000) and emits a single logger.warn
// per window once the count reaches ERROR_SPIKE_THRESHOLD (default 20).
// Further breaches inside the same window are suppressed until it rolls,
// so a sustained outage can't spam the logs.
const logger = require('./logger');

const DEFAULT_WINDOW_MS = 300000;
const DEFAULT_THRESHOLD = 20;

let errorTimestamps = [];
let lastWarnAt = null;

function getWindowMs(override) {
  if (override != null) return override;
  const parsed = Number(process.env.ERROR_SPIKE_WINDOW_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_MS;
}

function getThreshold(override) {
  if (override != null) return override;
  const parsed = Number(process.env.ERROR_SPIKE_THRESHOLD);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD;
}

function recordError(route, status, options = {}) {
  const windowMs = getWindowMs(options.windowMs);
  const threshold = getThreshold(options.threshold);
  const now = options.now != null ? options.now : Date.now();

  const statusCode = typeof status === 'number' ? status : Number(status);
  if (!Number.isFinite(statusCode) || statusCode < 500) {
    return { breached: false, warned: false, count: errorTimestamps.length };
  }

  errorTimestamps.push(now);
  const cutoff = now - windowMs;
  errorTimestamps = errorTimestamps.filter((t) => t > cutoff);
  const count = errorTimestamps.length;

  if (count >= threshold && (lastWarnAt === null || now - lastWarnAt >= windowMs)) {
    lastWarnAt = now;
    logger.warn(`Error spike detected: ${count} server errors in ${windowMs}ms (threshold ${threshold})`, { route });
    return { breached: true, warned: true, count };
  }

  return { breached: count >= threshold, warned: false, count };
}

function reset() {
  errorTimestamps = [];
  lastWarnAt = null;
}

module.exports = { recordError, reset };
