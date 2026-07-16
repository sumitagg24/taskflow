// Structured logger for production use.
// In production, logs are JSON; in dev/test they are human-readable.
// Set LOG_LEVEL to control verbosity: error, warn, info, debug (default: info).

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

const isProduction = process.env.NODE_ENV === 'production';

function serialize(args) {
  return args.map((a) => {
    if (a instanceof Error) return { message: a.message, stack: isProduction ? undefined : a.stack };
    if (typeof a === 'object' && a !== null) return a;
    return String(a);
  });
}

function emit(level, ...args) {
  if (LOG_LEVELS[level] > CURRENT_LEVEL) return;
  const entry = { timestamp: new Date().toISOString(), level, ...serialize(args) };
  // In production use JSON, otherwise use the default console method for readability
  if (isProduction) {
    // eslint-disable-next-line no-console
    console[level](JSON.stringify(entry));
  } else {
    // eslint-disable-next-line no-console
    console[level](`[${entry.timestamp}] [${level.toUpperCase()}]`, ...args);
  }
}

module.exports = {
  error: (...args) => emit('error', ...args),
  warn: (...args) => emit('warn', ...args),
  info: (...args) => emit('info', ...args),
  debug: (...args) => emit('debug', ...args),
};
