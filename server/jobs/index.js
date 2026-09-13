/**
 * Callable, idempotent background jobs.
 *
 * Previously these ran ONLY as `setInterval()` ticks inside the long-lived
 * server process — which silently stops working on serverless (frozen timers,
 * duplicated sweeps across concurrent invocations, missed ticks on cold
 * starts). Each job below is now an explicit async function that is safe to
 * invoke from ANY scheduler (Vercel Cron, GitHub Actions schedule, systemd
 * timer) via POST /api/cron/:job, as well as from the legacy in-process
 * intervals (kept for single-process deploys unless DISABLE_INTERVAL_JOBS).
 *
 * Idempotency contract (duplicate execution must not corrupt data):
 * - recurring : atomic findOneAndUpdate claim on `recurringNextDate` before
 *   creating the child — a concurrent/duplicate sweep finds a different date
 *   and skips, so each recurrence yields exactly one child.
 * - trash     : deleteMany with an absolute cutoff timestamp — re-running
 *   deletes zero additional rows.
 * - focusReset: updateMany setting focusTimeToday=0 for stale users — a
 *   second run matches zero rows.
 * - notify    : per task/user/day dedupe via Notification.exists on
 *   metadata.reminderDate — already-sent reminders are skipped.
 *
 * Every runner returns { ok, job, ranAt, detail } and never throws to the
 * HTTP layer; failures are reported as { ok:false, error } with a 500.
 */
const logger = require('../utils/logger');

async function runRecurringTasksJob() {
  const { processRecurringTasks } = require('../controllers/taskController');
  await processRecurringTasks();
  return { swept: true };
}

async function runTrashPurgeJob() {
  const { purgeExpiredTrash } = require('../controllers/taskController');
  const deletedCount = await purgeExpiredTrash();
  return { deletedCount };
}

async function runFocusResetJob() {
  const User = require('../models/User');
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const result = await User.updateMany(
    { lastActiveDate: { $lt: new Date(yesterday) } },
    { $set: { focusTimeToday: 0 } }
  );
  return { matched: result.matchedCount ?? result.n, modified: result.modifiedCount ?? result.nModified };
}

async function runDueDateNotificationsJob() {
  const { processDueDateNotifications } = require('../services/notificationScheduler');
  await processDueDateNotifications();
  return { swept: true };
}

const JOBS = {
  recurring: runRecurringTasksJob,
  'trash-purge': runTrashPurgeJob,
  'focus-reset': runFocusResetJob,
  notifications: runDueDateNotificationsJob,
};

const JOB_NAMES = Object.keys(JOBS);

async function runJob(name) {
  const fn = JOBS[name];
  if (!fn) {
    const err = new Error(`Unknown job: ${name}`);
    err.statusCode = 404;
    throw err;
  }
  const ranAt = new Date().toISOString();
  try {
    const detail = await fn();
    logger.info(`Cron job ok: ${name}`, { ranAt, ...detail });
    return { ok: true, job: name, ranAt, detail };
  } catch (err) {
    logger.error(`Cron job failed: ${name}`, { error: err.message });
    return { ok: false, job: name, ranAt, error: err.message };
  }
}

module.exports = { JOBS, JOB_NAMES, runJob };
