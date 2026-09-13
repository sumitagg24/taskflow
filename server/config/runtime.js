/**
 * Process-vs-serverless runtime switches. Pure functions of env (no imports
 * with side effects) so unit tests can drive every branch and server.js /
 * api/index.js can never disagree about the defaults.
 *
 * - shouldRunBootMigrations(): one-time migrations are an explicit deploy
 *   step (`npm run migrate --prefix server`). Booting with them is legacy
 *   opt-in ONLY — default is always safe (off), on every runtime including
 *   serverless where boot === every cold start.
 * - intervalsEnabled(): in-process setInterval ticks are the single-process
 *   default. Off when DISABLE_INTERVAL_JOBS=true (external scheduler owns
 *   the jobs via POST /api/cron/:job) and always off on serverless runtimes
 *   (frozen/duplicated timers) — so GitHub Actions + intervals can never
 *   double-run production jobs.
 */
function shouldRunBootMigrations(env = process.env) {
  return (env || {}).RUN_MIGRATIONS_ON_BOOT === 'true';
}

function isServerlessEnv(env = process.env) {
  const e = env || {};
  return Boolean(e.VERCEL || e.AWS_LAMBDA_FUNCTION_NAME);
}

function intervalsEnabled(env = process.env) {
  const e = env || {};
  if (e.DISABLE_INTERVAL_JOBS === 'true') return false;
  if (isServerlessEnv(e)) return false;
  return true;
}

module.exports = { shouldRunBootMigrations, isServerlessEnv, intervalsEnabled };
