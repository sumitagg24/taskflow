# Railway deployment (single service)

> **DEPRECATED (2026-09-08):** TaskFlow moved off Railway — the Railway
> service/domain is retired. The API now runs on the Oracle Cloud Always-Free
> VM; see [oracle-free-tier.md](oracle-free-tier.md). This document stays as an
> archived reference; `railway.json` / `scripts/railway-setup.cjs` are inert
> without a linked Railway project.

TaskFlow deploys to Railway as **one service**: Nixpacks builds the client, and
the Express server serves both the API and the built SPA from the same origin
and port. This matches the single-process design in the README — Socket.IO,
the interval background jobs, and the cookie auth flow all work unchanged.

`railway.json` at the repo root pins this behavior:

| Setting | Value | Why |
|---|---|---|
| builder | `NIXPACKS` | Zero-config Node 20 build |
| buildCommand | `npm ci` (server+client) + `npm run build --prefix client` | Produces `client/dist` the server serves |
| startCommand | `npm start --prefix server` | Runs `node server.js` |
| healthcheckPath | `/api/health` | Reports `db: connected` readiness |
| restartPolicy | `ON_FAILURE` ×10 | Crash-loop protection |
| numReplicas | 1 | Required: background jobs + in-memory session state assume one process |

---

## 1. First deploy

1. **Create the project** — [railway.com](https://railway.com) → New Project →
   *Deploy from GitHub repo* → pick this repo. Railway detects `railway.json`.
   Set the **service name** to `taskflow` (or set the `RAILWAY_SERVICE`
   repository variable to match whatever you name it — the deploy workflow
   defaults to `taskflow`).
2. **Add the variables** below (Settings → Variables). The service will fail
   the healthcheck until `MONGO_URI` and the secrets exist — that's the
   fail-closed startup validation doing its job.
3. **Generate a domain** — Settings → Networking → Generate Domain. Railway
   injects `PORT`; the server already binds to it.
4. Open the domain — the health check turns green and the SPA loads from the
   same URL.

## 2. Required variables

| Variable | Value |
|---|---|
| `MONGO_URI` | Atlas SRV string (step 3) |
| `JWT_SECRET` | 32+ random hex chars |
| `JWT_REFRESH_SECRET` | 32+ random hex chars, different value |
| `AI_KEY_SECRET` | 32+ chars — required once any user saves an AI provider key |
| `CLIENT_URL` | `https://<your-app>.up.railway.app` (or your custom domain) |
| `ALLOWED_ORIGINS` | Same value as `CLIENT_URL`. **Required** — production CORS is fail-closed when unset. Comma-separated if you have extra origins. |
| `TRUST_PROXY` | `true` — Railway terminates TLS on its edge proxy |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Optional: `REDIS_URL` (step 5 — `${{Redis.REDIS_URL}}` reference),
`RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `AUTH0_DOMAIN`/`AUTH0_CLIENT_ID`,
`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, any `RATE_*` tuning.

CLI alternative — one-shot, idempotent. `scripts/railway-setup.cjs` generates
the JWT/AI secrets, derives `CLIENT_URL`/`ALLOWED_ORIGINS` from your domain,
and skips variables that already exist, so re-runs never clobber manual edits:

```bash
# Preview the plan without changing anything
npm run railway:setup -- --service taskflow --dry-run

# Interactive (prompts for domain + Atlas URI), asks before applying
npm run railway:setup

# Fully scripted (still skips existing variables)
npm run railway:setup -- --service taskflow --domain <your-app>.up.railway.app \
  --mongo-uri "mongodb+srv://user:pass@taskflow.zsyufjw.mongodb.net/taskflow" \
  --redis-url "${{Redis.REDIS_URL}}" --yes
```

Requires the Railway CLI (`npm i -g @railway/cli`) authenticated via
`railway login` or `RAILWAY_TOKEN`. Without a `--domain`, `CLIENT_URL` and
`ALLOWED_ORIGINS` are deliberately left unset — the server refuses to boot in
production without `CLIENT_URL`.

Manual alternative:

```bash
railway variables --set "MONGO_URI=..." "CLIENT_URL=..." \
  "ALLOWED_ORIGINS=..." "TRUST_PROXY=true" --service taskflow
```

## 3. MongoDB Atlas (M0)

1. Create a free **M0** cluster at [mongodb.com/atlas](https://mongodb.com/atlas).
2. **Database Access** → add a database user (password auth).
3. **Network Access** → Railway services egress from changing IPs, so add
   `0.0.0.0/0` and rely on the strong DB password (M0 has no static egress).
4. Get the **SRV connection string** and set it as `MONGO_URI`, appending the
   database name:
   `mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/taskflow?retryWrites=true&w=majority`

The health endpoint then reports `"db": "connected"`.

## 4. OAuth / Auth0 callback updates

Once you have the Railway domain, add the **https** origin to the provider
dashboards:

- **Auth0** — Application Settings → Allowed Callback URLs, Allowed Web
  Origins, Allowed Logout URLs: add `https://<your-app>.up.railway.app`.
- **Google OAuth** — Authorized JavaScript origins + redirect URIs.
- **GitHub OAuth app** — callback URL
  `https://<your-app>.up.railway.app/api/auth/github/callback`.

The client reads `VITE_*` vars at **build time** — add them as Railway
variables before the build that should include them (e.g. `VITE_AUTH0_DOMAIN`,
`VITE_AUTH0_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`). No `VITE_API_URL` is needed:
SPA and API share the origin.

## 5. Redis rate limiting (optional but wired)

`server/middleware/rateLimiter.js` upgrades to Redis-backed limiting whenever
`NODE_ENV=production` **and** `REDIS_URL` are set. Both packages (`redis`,
`rate-limit-redis`) are real dependencies — before this integration they were
lazily required but missing from `package.json`, so Redis silently never
engaged.

Two options:

- **Railway Redis** — add a Redis service in the same project, then set
  `REDIS_URL=${{Redis.REDIS_URL}}` (Railway reference variable — adjust the
  service name if yours differs) on the taskflow service. Private-network
  traffic, no public exposure.
- **Managed Redis/Valkey** (Upstash, Redis Cloud) — paste the TLS URL.
  Note Railway Redis URLs are non-TLS; Upstash's are TLS — both work via
  `createClient({ url })`.

On connection failure the limiter logs a warning and keeps serving with the
in-memory store — Redis is an enhancement, never a hard dependency.

## 6. Continuous deployment

Two mutually exclusive paths — **pick one**:

- **Railway GitHub app (default):** Railway auto-deploys on every push to
  main. If you want CI to be the gate, disable Railway's auto-deploy
  (Settings → Deployments → trigger) and use the workflow.
- **GitHub Actions:** `.github/workflows/deploy.yml` triggers after the **CI**
  workflow completes successfully on main, checks out the exact commit CI
  validated, runs `railway up --service <name> --detach`, then polls
  `/api/health` via `scripts/deploy-smoke.cjs` until the new release reports
  `{ status: ok, db: connected }` (up to 10 minutes). Needs the
  `RAILWAY_TOKEN` repository secret (Railway → Settings → Tokens); set the
  `RAILWAY_PUBLIC_DOMAIN` repository variable (e.g.
  `taskflow-production.up.railway.app`, no scheme) to enable the smoke check —
  without it that step self-skips with a notice.

Manual deploys: `railway up --service taskflow` from the repo root, or
Actions → Deploy → Run workflow.

## 7. Verify, monitor, roll back

```bash
curl -s https://<your-app>.up.railway.app/api/health
# {"status":"ok","db":"connected",...}

# Same check with retry/poll — used by CI after every deploy:
npm run smoke:deploy -- --url https://<your-app>.up.railway.app
```

- **Logs / metrics** — Railway service → Observations; the server logs
  request IDs (correlate with `X-Request-Id`).
- **Rollback** — Railway → Deployments → any prior successful deployment →
  Redeploy. Code-level rollback procedure: `docs/ops/rollback.md`.
- **Backups** — MongoDB Atlas M0 has no serverless backups; follow
  `docs/ops/backup-restore.md` (per-user export + scheduled dumps).
- **Uploads caveat** — `server/uploads` is on the ephemeral deploy filesystem;
  attachments vanish on redeploy. Use Atlas for data and accept the limitation
  (or move to object storage) until file storage is externalized.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Healthcheck fails at deploy | `MONGO_URI` missing/wrong, or Atlas Network Access doesn't allow Railway egress (`0.0.0.0/0`) |
| Boot error `CLIENT_URL ... required in production` | Set `CLIENT_URL` to the exact https origin |
| Browser gets CORS errors | `ALLOWED_ORIGINS` unset (production is fail-closed) or missing the SPA origin |
| Login works but refresh loops | `JWT_SECRET`/`JWT_REFRESH_SECRET` changed between deploys, or cookie origin mismatch — keep secrets stable, `CLIENT_URL` exact |
| 429s appear random | In-memory limiter on restart; set `REDIS_URL` |
| SPA shows old UI | `VITE_*` vars are build-time — add them, then redeploy |
