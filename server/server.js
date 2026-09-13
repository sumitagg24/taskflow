/**
 * Persistent runtime entrypoint: HTTP + Socket.IO + background intervals.
 *
 * Request handling lives in app.js (createApp, shared with the serverless
 * handler). This file owns ONLY process concerns: env validation, DB
 * connect, rate-limit store init, realtime attach, listen(), intervals, and
 * graceful shutdown.
 *
 * Vercel/serverless MUST NOT use this file (no server.listen() there — see
 * api/index.js). Socket.IO, local /uploads serving and setInterval ticks
 * require a long-lived process and stay here (or on the Oracle VM).
 *
 * - Migrations NEVER run implicitly: set RUN_MIGRATIONS_ON_BOOT=true to run
 *   the legacy boot migration, or (preferred) run `npm run migrate --prefix
 *   server` as an explicit deploy step.
 * - Intervals are skipped when DISABLE_INTERVAL_JOBS=true (external
 *   scheduler POSTs /api/cron/:job instead — see server/jobs + cronRoutes).
 */
require('dotenv').config();
const http = require('http');
const connectDB = require('./config/db');
const { createApp } = require('./app');
const { setupGracefulShutdown } = require('./utils/shutdown');
const { initializeSocket } = require('./services/socketService');
const User = require('./models/User');
const logger = require('./utils/logger');

async function migrateUsernames() {
  const usersWithoutUsername = await User.find({ username: { $exists: false } }).lean();
  if (usersWithoutUsername.length === 0) return;

  logger.info(`Migrating ${usersWithoutUsername.length} users without username...`);
  for (const user of usersWithoutUsername) {
    let base = (user.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (!base || base.length < 3) {
      base = `user_${user._id.toString().slice(-6)}`;
    }

    let uniqueUsername = base.slice(0, 27);
    let counter = 1;
    while (await User.findOne({ username: uniqueUsername })) {
      const suffix = `_${counter}`;
      uniqueUsername = base.slice(0, 30 - suffix.length) + suffix;
      counter++;
    }

    await User.findByIdAndUpdate(user._id, { username: uniqueUsername });
  }
  logger.info('Username migration complete.');
}

// Validate critical environment variables on startup
const REQUIRED_ENV_VARS = ['MONGO_URI'];
for (const varName of REQUIRED_ENV_VARS) {
  if (!process.env[varName]) {
    throw new Error(`${varName} environment variable is required but not set`);
  }
}

if (process.env.NODE_ENV === 'production') {
  const PROD_REQUIRED = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
  for (const varName of PROD_REQUIRED) {
    if (!process.env[varName]) {
      throw new Error(`${varName} environment variable is required in production`);
    }
  }
  for (const varName of PROD_REQUIRED) {
    if (process.env[varName].length < 32) {
      throw new Error(`${varName} must be at least 32 characters long in production`);
    }
  }
  if (!process.env.CLIENT_URL) {
    throw new Error('CLIENT_URL environment variable is required in production');
  }
  if (!process.env.ALLOWED_ORIGINS || !process.env.ALLOWED_ORIGINS.trim()) {
    logger.warn('WARNING: ALLOWED_ORIGINS is not set in production — all browser origins will be rejected (fail-closed). Set ALLOWED_ORIGINS to a comma-separated list of production browser origins.');
  }
} else {
  for (const varName of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if (process.env[varName] && process.env[varName].length < 32) {
      logger.warn(`WARNING: ${varName} is shorter than 32 characters. Use a secret of at least 32 characters in production.`);
    }
  }
}

const app = createApp({ enableSpaFallback: true });
const server = http.createServer(app);

// Validate PORT — default to 5000, but enforce a valid port range if overridden.
const PORT = process.env.PORT || 5000;
const parsedPort = Number(PORT);
if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(
    `Invalid PORT environment variable: "${PORT}". Must be an integer between 1 and 65535.`
  );
}

// Initialize Socket.io (persistent process only — serverless uses api/index.js
// which never attaches realtime).
const io = initializeSocket(server);
app.set('io', io);

// In-process intervals are the single-process fallback (see
// config/runtime.js — off when DISABLE_INTERVAL_JOBS=true or serverless,
// so an external scheduler can never double-run production jobs).
const { intervalsEnabled, shouldRunBootMigrations } = require('./config/runtime');

function startIntervals() {
  if (!intervalsEnabled()) {
    logger.info('Background intervals disabled (DISABLE_INTERVAL_JOBS=true or serverless runtime) — jobs run via POST /api/cron/:job');
    return;
  }

  // Recurring tasks check (runs every hour). The `running` flag skips a tick
  // while the previous one is still in flight — with >1 replica each instance
  // still runs its own sweep, but a slow sweep never stacks up locally.
  const { processRecurringTasks, purgeExpiredTrash } = require('./controllers/taskController');
  let recurringRunning = false;
  setInterval(() => {
    if (recurringRunning) return;
    recurringRunning = true;
    processRecurringTasks()
      .catch(err => logger.error('Recurring task processing failed:', err))
      .finally(() => { recurringRunning = false; });
  }, 60 * 60 * 1000);

  // Trash retention sweep (runs every 6 hours). Soft-deleted tasks are restorable
  // for 30 days; this is what makes that promise finite.
  let purgeRunning = false;
  setInterval(() => {
    if (purgeRunning) return;
    purgeRunning = true;
    purgeExpiredTrash()
      .catch(err => logger.error('Trash purge failed:', err))
      .finally(() => { purgeRunning = false; });
  }, 6 * 60 * 60 * 1000);

  // Daily reset of focus time
  let focusResetRunning = false;
  setInterval(async () => {
    if (focusResetRunning) return;
    focusResetRunning = true;
    try {
      const UserModel = require('./models/User');
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      await UserModel.updateMany(
        { lastActiveDate: { $lt: new Date(yesterday) } },
        { focusTimeToday: 0 }
      );
    } catch (err) {
      logger.error('Daily focus time reset failed:', err);
    } finally {
      focusResetRunning = false;
    }
  }, 60 * 60 * 1000);

  // Due-soon / overdue notification reminders (every 15 minutes)
  const { processDueDateNotifications } = require('./services/notificationScheduler');
  processDueDateNotifications().catch((err) =>
    logger.error('Initial notification reminder run failed:', err)
  );
  let notifyRunning = false;
  setInterval(() => {
    if (notifyRunning) return;
    notifyRunning = true;
    processDueDateNotifications()
      .catch((err) => logger.error('Notification reminder run failed:', err))
      .finally(() => { notifyRunning = false; });
  }, 15 * 60 * 1000);
}

// ===== Connect to DB and Start Server =====
connectDB().then(async () => {
  // Initialize the rate limit store BEFORE the server accepts traffic.
  // In production with REDIS_URL, a failed Redis connection throws and the
  // process exits (fail closed) rather than silently degrading to MemoryStore.
  const { initRateLimitStore } = require('./middleware/rateLimiter');
  await initRateLimitStore();

  // One-time migrations are an explicit deploy step (`npm run migrate
  // --prefix server`), NOT a boot side effect. The legacy inline migration
  // runs only when explicitly opted in (default safe: off).
  if (shouldRunBootMigrations()) {
    try {
      await migrateUsernames();
    } catch (err) {
      logger.error('Username migration failed:', err);
    }
  } else {
    logger.info('Boot migrations skipped (set RUN_MIGRATIONS_ON_BOOT=true or run `npm run migrate --prefix server`)');
  }

  server.listen(parsedPort, () => {
    logger.info(`Server running at http://localhost:${parsedPort}`);
    logger.info(`WebSocket server initialized`);
    logger.info(`API Docs available at http://localhost:${parsedPort}/api/docs`);
  });

  startIntervals();

  setupGracefulShutdown(server, io);
});
