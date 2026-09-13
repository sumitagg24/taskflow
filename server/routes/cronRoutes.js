/**
 * POST /api/cron/:job — authenticated entrypoint for scheduled jobs.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (CRON_SECRET env, min 16 chars
 * in production). No session cookies accepted here — this is machine-to-machine.
 * In non-production without CRON_SECRET set, requests are rejected with a
 * hint instead of silently running (fail closed either way).
 *
 * Jobs: recurring | trash-purge | focus-reset | notifications
 * (see server/jobs/index.js for idempotency guarantees).
 *
 * Scheduler: .github/workflows/cron.yml (the single external scheduler —
 * it hits the persistent API; the same endpoints serve a root-directory
 * Vercel-functions deploy). A VM systemd timer may replace it, but never run
 * two schedulers at once unless duplication is intentional (jobs are
 * idempotent; see server/jobs/index.js).
 */
const express = require('express');
const crypto = require('crypto');

const router = express.Router();
const { JOB_NAMES, runJob } = require('../jobs/index');

/**
 * Constant-time secret comparison. Both sides are hashed to sha256 first so
 * (a) lengths are always equal (timingSafeEqual throws on mismatch) and
 * (b) the raw secret never sits in a compared buffer longer than needed.
 * The secret itself is never logged.
 */
function secretsEqual(presented, expected) {
  const a = crypto.createHash('sha256').update(String(presented || ''), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(expected || ''), 'utf8').digest();
  return crypto.timingSafeEqual(a, b) && String(presented || '').length > 0;
}

function cronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({
      message: 'Scheduler not configured (CRON_SECRET is not set)',
    });
  }
  const header = req.headers.authorization || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secretsEqual(presented, secret)) {
    return res.status(401).json({ message: 'Invalid cron credentials' });
  }
  return next();
}

async function handleRun(req, res, next) {
  try {
    const { job } = req.params;
    if (!JOB_NAMES.includes(job)) {
      return res.status(404).json({ message: `Unknown job: ${job}`, jobs: JOB_NAMES });
    }
    const result = await runJob(job);
    return res.status(result.ok ? 200 : 500).json(result);
  } catch (err) {
    return next(err);
  }
}

// POST for external schedulers (GitHub Actions, systemd). GET for Vercel
// Cron, which issues GET requests (with `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set on the Vercel project).
router.post('/:job', cronAuth, handleRun);
router.get('/:job', cronAuth, handleRun);

router.get('/', (req, res) => {
  res.json({ jobs: JOB_NAMES });
});

module.exports = router;
module.exports.cronAuth = cronAuth;
module.exports.secretsEqual = secretsEqual;
