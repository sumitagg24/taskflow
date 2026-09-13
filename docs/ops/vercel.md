# Vercel deployment (SPA in front of a remote API)

> Architecture audit: [vercel-audit.md](vercel-audit.md). Short version: the
> SPA is Vercel-native; the Express + Socket.IO API is NOT and stays on a
> persistent host. This page describes the supported split. A root-directory
> project MAY also run the API as stateless functions (`api/index.js`, no
> realtime) — see §8.

TaskFlow's primary deploy is **one Oracle Cloud Always-Free VM** serving the API
with the SPA on Vercel — see [oracle-free-tier.md](oracle-free-tier.md). The
Railway single-service model this page was written for is retired; below,
`<api-host>` is the API's public hostname (previously a `*.up.railway.app`
domain).

This guide is for the **split deploy**: the React SPA is served as a
static site by Vercel, while the Express + Socket.IO API keeps running on its
own host. Cross-origin cookie auth **does** work — the
server already issues `SameSite=None; Secure` cookies in production and
performs origin checks against `ALLOWED_ORIGINS` — but every moving part must
be configured, and there are real browser caveats to accept.

```
Browser
  │  https://taskflow.vercel.app (SPA)
  │    └─ axios               baseURL /api ──────────►  https://<api-host> (API)
  │    └─ socket.io-client    SOCKET_URL   ──────────►  same origin, WebSocket upgrade
  │    └─ document.cookie     <- can NOT see the API origin's cookies
```

---

## 1. Config summary

| Where | Variable | Value |
|---|---|---|
| **Vercel** (project env) | `VITE_API_URL` | `https://<api-host>/api` |
| **Vercel** | `VITE_SOCKET_URL` | `https://<api-host>` |
| **Vercel** | `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` | your Auth0 tenant + SPA client ID |
| **Vercel** | `VITE_GOOGLE_CLIENT_ID` | (optional, legacy Google button) |
| **Oracle VM** | `CLIENT_URL` | `https://<spa>.vercel.app` |
| **Oracle VM** | `ALLOWED_ORIGINS` | `https://<spa>.vercel.app` (+ any custom domains, comma-separated) |
| **Oracle VM** | `TRUST_PROXY` | `true` (Caddy terminates TLS on the VM) |
| **Oracle VM** | `GITHUB_CALLBACK_URL` | `https://<api-host>/api/auth/github/callback` |

Everything else (`MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`AI_KEY_SECRET`, ...) stays exactly as the single-service setup.

---

## 2. Vercel project setup

1. **Import the repo** in [vercel.com](https://vercel.com) → Import → pick the
   TaskFlow repo → **Root Directory: `client`** (the SPA lives there; this
   also makes Vercel pick up `client/vercel.json`). Use the root-directory
   model ONLY for the serverless-API variant (§8).
2. **Framework Preset:** Vite. **Build Command:** `npm run build`.
   **Output Directory:** `dist`.
3. **Environment variables** (all `VITE_*` are *build-time* — changing them
   requires a new deploy):
   - `VITE_API_URL=https://<api-host>/api`
   - `VITE_SOCKET_URL=https://<api-host>`
   - `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` (to show the Google/Auth0
     button; must match the server's `AUTH0_*`)
4. Deploy. `client/vercel.json` rewrites every route to `/index.html` so the
   React Router paths and `/auth/callback` deep links work on refresh.

> `VITE_API_URL` ends with `/api` on purpose — `client/src/lib/apiConfig.ts`
> is the single source of truth: `client/src/api/tasks.ts` (axios) and
> `client/src/context/NotificationContext.tsx` (Socket.IO) both derive from
> it, and `client/src/main.tsx` calls `assertApiConfigUsable()` so a
> cross-origin deploy built **without** `VITE_API_URL` throws at startup
> instead of silently calling `/api` on the SPA's own origin.

## 2b. Deploy-time verification (run this after every SPA deploy)

A static bundle can look healthy while every API call 404s against the
SPA's own origin — that exact failure shipped once. Two automated checks
make it impossible to miss:

```bash
# Fails when the live bundle lacks the apiConfig production guard, when any
# baked-in absolute host is unreachable (e.g. a retired Railway URL), or when
# the SPA origin answers /api/health as if it were the API.
npm run smoke:spa-config -- --url https://<spa>.vercel.app --api-url https://<api-host>
```

In CI, add a step after the Vercel deploy:

```yaml
- name: Verify deployed SPA wiring
  env:
    SPA_BASE_URL: https://<spa>.vercel.app
    API_BASE_URL: https://<api-host>
  run: node scripts/spa-config-check.cjs
```

The API-side health poll stays `scripts/deploy-smoke.cjs` (used by
`.github/workflows/deploy.yml` after the Oracle deploy).
---

## 3. Oracle side (the API)

1. Set **`CLIENT_URL=https://<spa>.vercel.app`** — this is the redirect target
   for OAuth callbacks and the origin used for password-reset / verification
   links in email.
2. Set **`ALLOWED_ORIGINS=https://<spa>.vercel.app`**. This is a *fail-closed*
   allowlist: production CORS **and** the CSRF origin check both reject any
   browser origin not listed. Add custom domains as a comma-separated list.
3. Keep `TRUST_PROXY=true` (Caddy terminates TLS on the VM).
4. Redeploy the VM. Verify:
   ```bash
   curl -s https://<api-host>/api/health
   # {"status":"ok","db":"connected",...}
   ```

---

## 4. OAuth provider origins

- **Auth0** (the Google button runs through Auth0): in the SPA application
  settings, add the Vercel origin to **Allowed Callback URLs**, **Allowed Web
  Origins**, and **Allowed Logout URLs** — i.e. `https://<spa>.vercel.app`
  (replacing/alongside `http://localhost:3000`). The server only verifies ID
  tokens, so no server change is needed.
- **GitHub**: the flow starts on the API (`/api/auth/github`), so the browser
  is redirected to GitHub with `redirect_uri` = `GITHUB_CALLBACK_URL`. Set it
  to the **API** origin: `https://<api-host>/api/auth/github/callback`,
  and register that exact URL in the GitHub OAuth app. After the exchange the
  API redirects to `CLIENT_URL/auth/callback`, which is the Vercel SPA.
- **Google (direct)**: the UI no longer uses the server's `/api/auth/google`
  endpoint — skip unless you keep a native client that does.

---

## 5. Authorization — how cross-origin cookies actually work here

- The API answers `POST /api/auth/login|register` and
  `POST /api/auth/refresh-token` with two **httpOnly** cookies (`accessToken`,
  15 min; `refreshToken`, 7 days) plus the readable `tf_session` flag. In
  production these are issued with `Secure` and `SameSite=None`, so they ride
  on `fetch`/XHR/WebSocket between the Vercel SPA and the remote API
  (`withCredentials: true` is already set in `client/src/api/tasks.ts`).
- **CSRF**: every cookie-authenticated mutation from a browser is checked
  against `ALLOWED_ORIGINS` (`server/middleware/csrf.js`) — the Vercel origin
  must be listed (step 3).
- **Session detection**: `tf_session` is invisible to the SPA — cookies are
  scoped to the API origin. `client/src/lib/session.ts` detects the
  cross-origin deploy (via `VITE_API_URL`) and always performs the boot
  `GET /auth/profile`; the server decides from the httpOnly cookies. This is
  why a fresh anonymous visitor on the SPA sees one harmless 401 in the
  network tab.
- **Refresh**: on a `TOKEN_EXPIRED` 401 the axios interceptor calls
  `/auth/refresh-token` and retries the queue; Socket.IO reconnects with
  refreshed cookies after a `connect_error`.
- **Logout**: the API denylists the access token, invalidates the stored
  refresh token, and clears the cookies **with matching `Secure`/`SameSite`
  attributes** so cross-site browsers actually delete them.

### Browser caveats (read before going live)

- **Third-party cookies must be allowed.** Safari (ITP) blocks
  `SameSite=None` cookies on cross-site requests by default and Chrome is
  phasing the same in. Visitors using such browsers will see a login loop. If
  that's unacceptable, use the single-service deploy (API serves the SPA from
  the same origin — unaffected by third-party cookie policy).
- **Socket.IO** needs the same third-party cookie permissions for its upgrade
  handshake.
- Keep `JWT_SECRET`/`JWT_REFRESH_SECRET` stable across re/deploys —
  rotating them signs everyone out.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| SPA loads but API calls fail with CORS/403 | `ALLOWED_ORIGINS` missing the exact Vercel origin (scheme+host, no trailing slash) |
| 403 `Cross-origin request forbidden` on mutations | Same — the CSRF origin check uses the same allowlist |
| Login loop right after sign-in | Browser blocking third-party cookies (caveats above); or `NODE_ENV` not `production` on the API host (cookies must be `SameSite=None; Secure`) |
| Auth0 popup rejects the redirect | Add the Vercel origin to Auth0's Allowed Callback/Web/Logout URLs |
| GitHub sign-in bounces with `STATE_MISMATCH` | `GITHUB_CALLBACK_URL` not registered on GitHub, or mismatched with the API origin |
| Socket.IO keeps retrying | `VITE_SOCKET_URL` wrong or missing; `ALLOWED_ORIGINS` missing; cookies blocked |
| Old env on the SPA | `VITE_*` are baked in at build time — change them in Vercel and redeploy |

---

## 7. When to prefer the single-service deploy

Use the same-origin single-service model (the Oracle VM can serve the SPA from
`/app/client/dist` itself) unless you specifically want Vercel's global edge
for the static shell. Same-origin means: no third-party-cookie dependence, no
`VITE_API_URL` crossing, simplest Auth0/Google origins, and one URL to share.
The split model exists so the SPA can live on Vercel; everything in this guide
exists to make that safe.

---

## 8. Uploads, jobs, migrations (both deploy models)

- **Uploads.** Ephemeral runtimes must use durable object storage:
  `STORAGE_MODE=s3` + `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` /
  `S3_SECRET_ACCESS_KEY` (optional `S3_PUBLIC_BASE_URL` CDN,
  `S3_ENDPOINT` for R2/MinIO). Validation (extension + MIME consistency +
  magic-number sniffing, 10 MB cap) and the uploader-ownership record are
  identical in both modes; `s3` responses carry a durable `url`/`key`, never
  a filesystem path. Full lifecycle (`server/routes/uploadRoutes.js`):
  `POST /api/upload` (upload+record), `GET /api/upload/<key>` (owner-only;
  local streams bytes, s3 redirects to a 5-min presigned URL so private
  buckets work), `DELETE /api/upload/<key>` (owner-only; bytes + record +
  task-descriptor pull). Local mode is refused with 503 on ephemeral
  runtimes — never a silent `/tmp` write. `local` remains valid ONLY with a
  persistent volume (Oracle compose mounts one). See `server/config/storage.js`.
- **Jobs.** The four recurring tasks (recurring sweep, trash purge,
  focus-time reset, due-date notifications) are idempotent callables
  (`server/jobs/index.js`) behind `POST|GET /api/cron/:job` authed by Bearer
  `CRON_SECRET` (`server/routes/cronRoutes.js`). The scheduler is
  `.github/workflows/cron.yml` (every 15 min; hourly/daily steps time-gated)
  — set repo `vars.CRON_BASE_URL` (API origin, no `/api`) and
  `secrets.CRON_SECRET` (== API `CRON_SECRET`). Single-process deploys keep
  legacy in-process intervals by default; set `DISABLE_INTERVAL_JOBS=true`
  when the external scheduler owns them.
- **Migrations.** One-time migrations never run on boot. Run explicitly:
  `npm run migrate --prefix server` (Oracle VM: `docker compose -f
  deploy/oracle/docker-compose.yml run --rm app npm run migrate`). Legacy
  boot behaviour only with `RUN_MIGRATIONS_ON_BOOT=true`.

## 9. Root-directory variant (serverless API, no realtime)

Import with **Root Directory: repository root** to get the static SPA
(`client/dist`) PLUS the API as stateless functions (`api/index.js` →
`server/app.js` with `enableSpaFallback:false`). `/api/*` rewrites to the
function; everything else serves the SPA. Additional Vercel env (all
server-only secrets, never `VITE_*`): `MONGO_URI`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `CLIENT_URL`, `ALLOWED_ORIGINS`, `STORAGE_MODE=s3` +
`S3_*`, `CRON_SECRET`, `REDIS_URL` (recommended). Hard limitations:
**no Socket.IO** (point `VITE_SOCKET_URL` at a persistent host for live
updates; notifications persist without the push), per-instance logout
denylist (bounded by the 15 min access TTL), and cold starts (connection is
reused across warm invocations). The same `.github/workflows/cron.yml`
drives `/api/cron/:job` — no Vercel Cron plan needed.

## 10. Preview deployments

Each Vercel preview gets a unique origin. Point its `VITE_API_URL` /
`VITE_SOCKET_URL` at the staging API and add the exact preview origin to
the API's `ALLOWED_ORIGINS` (comma-separated, no wildcards — fail-closed by
design). `VITE_*` are build-time: changing them requires a redeploy.
Verify with `npm run smoke:spa-config -- --url <preview> --api-url <api>`
and `npm run check:vercel` in CI (already wired).