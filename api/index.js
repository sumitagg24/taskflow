/**
 * Vercel serverless entrypoint — stateless request handler, NO listen().
 *
 * Deploys ONLY in a root-directory Vercel project (root vercel.json rewrites
 * /api/* here). The recommended deploy (Root Directory `client`) never runs
 * this file — the API stays on its persistent host (Oracle VM) with
 * Socket.IO, local volumes and intervals.
 *
 * Serverless limitations (by design, not bugs):
 * - NO Socket.IO realtime (no sticky connections on lambda). Emits are
 *   skipped (notificationService degrades to persisted-only). Use the
 *   persistent API origin as VITE_SOCKET_URL for live updates.
 * - STORAGE_MODE must be `s3` (ephemeral disk). Local-mode uploads are
 *   refused with 503 here; the rest of the API is unaffected.
 * - In-memory stores (token denylist, MemoryStore limiter) are per-instance:
 *   set REDIS_URL for distributed rate limiting; expect logout denylist to
 *   be best-effort across instances.
 * - Jobs run via the GitHub Actions scheduler hitting /api/cron/:job
 *   (Bearer CRON_SECRET), NOT setInterval (server.js intervals never start
 *   here and runtime.js keeps them off on serverless).
 * - Migrations never run here (RUN_MIGRATIONS_ON_BOOT is ignored).
 *
 * Connection reuse: ensureConnection() caches one Mongoose connection per
 * warm instance; the rate-limit store resolves once before traffic.
 */
const { createApp } = require('../server/app');
const { ensureConnection } = require('../server/config/db');

const app = createApp({ enableSpaFallback: false });

let readyPromise = null;
async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (require('../server/config/storage').isS3Mode()) {
        const { isS3Configured } = require('../server/config/storage');
        if (!isS3Configured()) {
          throw new Error(
            'STORAGE_MODE=s3 but S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are not all set'
          );
        }
      }
      await ensureConnection();
      const { initRateLimitStore } = require('../server/middleware/rateLimiter');
      await initRateLimitStore();
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

module.exports = async function handler(req, res) {
  try {
    await ensureReady();
  } catch (err) {
    // Fail closed with a generic 503 (no secret/URI details to the client).
    return res.status(503).json({ message: 'Service unavailable' });
  }
  return app(req, res);
};
