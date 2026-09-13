# Vercel deployment architecture audit

Scope: can `sumitagg24/taskflow` (Vite SPA in `client/`, Express + Socket.IO
API in `server/`) deploy reliably on Vercel? Audited against Vercel's
execution model: short-lived stateless functions, no `listen()`, no sticky
connections, ephemeral read-only filesystem, per-invocation cold starts.

## Verdict

- **Frontend: Vercel-ready as a static-only project** (Root Directory
  `client`). No server code runs on Vercel in this model.
- **Backend: NOT Vercel-native and must not be forced there.** The API +
  realtime service stays on a persistent host (Oracle VM today). A
  root-directory project MAY additionally run the API as stateless functions
  (`api/index.js`, no realtime) — see limitations below.
- **Do not claim full-stack Vercel-ready.** Anything that promises
  Socket.IO, durable local uploads, or `setInterval` jobs "simply by putting
  the Express server inside a serverless function" is incorrect for this repo.

## Findings

| # | Incompatibility | Severity | Status / mitigation |
|---|---|---|---|
| 1 | `server.listen()` + long-lived HTTP in `server/server.js` — functions never listen | Critical | **Isolated.** `server/app.js` (stateless pipeline) vs `server/server.js` (persistent only). `api/index.js` exports a handler, never listens |
| 2 | Socket.IO needs sticky, long-lived connections; serverless has neither | Critical | **By design, stays out.** Realtime lives ONLY on the persistent host. `api/index.js` never attaches Socket.IO; `notificationService` degrades to persisted-only when IO is absent. Client `VITE_SOCKET_URL` points at the persistent origin |
| 3 | `server/uploads` on local disk — ephemeral/lost across lambdas and deploys; no read/delete path existed (upload-only) | Critical | **Fixed.** `server/config/storage.js`: `STORAGE_MODE=s3` (durable URLs/keys, same validation) for ephemeral runtimes; full lifecycle `POST`/`GET`/DELETE /api/upload/:key (owner-scoped; s3 presigned 302, local streamed; delete removes bytes+record+task refs). Serverless+local refused 503 — never silent `/tmp`. `local` only with a persistent volume (Oracle compose) |
| 4 | Four `setInterval` jobs (recurring hourly, trash 6h, focus-reset hourly, notifications 15m) — frozen/duplicated/missed on serverless | Critical | **Fixed.** Idempotent jobs in `server/jobs/index.js` + authed `POST\|GET /api/cron/:job` (`server/routes/cronRoutes.js`, Bearer `CRON_SECRET`). Scheduler: `.github/workflows/cron.yml` (works for both deploy models). In-process intervals gated by `DISABLE_INTERVAL_JOBS` via `server/config/runtime.js` (also auto-off on serverless; constant-time cron compare, secret never logged) |
| 5 | Username migration ran on EVERY boot/invocation (slow, racy on concurrent cold starts) | High | **Fixed.** Boot migration gated by `RUN_MIGRATIONS_ON_BOOT` (default off); explicit `npm run migrate --prefix server` deploy step |
| 6 | New Mongoose connection per invocation exhausts the Atlas pool | High | **Fixed.** `ensureConnection()` in `server/config/db.js` caches one connection per warm instance; `api/index.js` awaits it (plus rate-limit store) before traffic |
| 7 | In-memory token denylist + MemoryStore limiter are per-instance (logout/rate-limit bypass across lambdas) | High | **Documented, partial fix.** `REDIS_URL` gives distributed rate limiting (fail-closed at boot in prod). Denylist stays best-effort serverless; short 15m access TTL bounds the window. Noted in limitations |
| 8 | Vite dev proxy (`/api → http://localhost:5000`) must never serve production | Medium | **Already safe, verified.** Proxy lives under `server:` (dev-only); prod resolves via `VITE_API_URL` or same-origin (`client/src/lib/apiConfig.ts` + boot assertion in `main.tsx`) |
| 9 | `client/vercel.json` rewrote EVERYTHING (incl. `/api/*`) to `index.html` — misconfigured API calls returned HTML 200s (silent outage) | Medium | **Fixed.** SPA rewrite excludes `/api/*` (`/((?!api\/).*)`) in both `client/vercel.json` and root `vercel.json`; unknown API paths are JSON 404 (covered by `server/__tests__/vercelDeploy.test.js` + `scripts/spa-config-check.cjs`) |
| 10 | CORS/cookies/CSRF across origins (`SameSite=None; Secure`, `__Host-` prefix, allowlist, Fetch-Metadata) | Medium | **Already correct, preserved.** `ALLOWED_ORIGINS` fail-closed; preview URLs must be allowlisted explicitly (no wildcards). No controls weakened |
| 11 | `railway.json` / Dockerfiles / Oracle compose alongside Vercel config | Medium | **Isolated, not deleted.** Vercel `client` project ignores them. Root `vercel.json` adds an opt-in stateless `/api` function (no realtime) + static SPA. Railway docs marked retired; real cluster hostname redacted from examples |
| 16 | Cron bearer compared with `!==` (timing side-channel) | Medium | **Fixed.** `secretsEqual()` hashes both sides then `timingSafeEqual`; secret never logged. Covered in `server/__tests__/vercelSafety.test.js` |
| 17 | In-memory `loginAttemptTracker` (IP backoff) + denylist sweep `setInterval` | Low | **Verified safe.** Tracker is a documented backoff (not a boundary; authLimiter + per-account backoff persist); denylist sweep is `unref`'d and only trims expired entries. Serverless bounds documented (15m access TTL, `REDIS_URL` for shared limiting) |
| 12 | Node version drift (Docker `node:20`, CI `22.x`, engines `>=20`) | Low | **Fixed.** Pinned `22.x` in `.nvmrc`, root/client/server `engines`, all Dockerfiles, CI |
| 13 | Nondeterministic builds (unlocked S3 SDK, `file:` self-links) | Low | **Fixed.** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (presigned downloads only) in `server/package.json` + lockfile (`--package-lock-only`, `npm audit` clean). `file:` self-links are install-time only and inert in the client bundle |
| 14 | Swagger `localhost:5000` server URLs | Low | **Cosmetic, kept.** Docs-only default; production serves `/api/docs.json` from its own origin. Not a runtime dependency |
| 15 | No Vercel Cron in `vercel.json` (Hobby plan rejects sub-daily schedules at deploy) | Low | **By design.** `.github/workflows/cron.yml` is the scheduler (free, ≥15m, both models). Vercel Cron remains an option on paid plans |

## What was deliberately NOT done

- No Express-in-a-function with Socket.IO still attached (would fail at the
  WebSocket upgrade and suggest realtime works — it cannot).
- No `GET /api/* → /index.html` fallback on any Vercel project (masks API
  misconfiguration as a working page).
- No automatic S3 migration of existing local uploads (needs an operator-run
  backfill; new uploads in `s3` mode are durable from this change forward).
- No wildcard `ALLOWED_ORIGINS` for Vercel preview URLs (fail-closed kept).
- No background orphan-upload GC: unreferenced bytes are removed only via
  explicit `DELETE /api/upload/:key` (reference-counted deletes on purge
  were rejected — one file may be attached to several tasks, so auto-delete
  on task purge could destroy shared bytes).
