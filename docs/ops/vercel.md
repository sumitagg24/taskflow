# Vercel deployment (SPA in front of the Railway API)

TaskFlow's primary deploy is **one Railway service** that serves both the API
and the built SPA from the same origin ([railway.md](railway.md)). That model
is the simplest and is what the cookie auth flow assumes by default.

This guide is for the alternate **split deploy**: the React SPA is served as a
static site by Vercel, while the Express + Socket.IO API keeps running on
Railway (or any Node host). Cross-origin cookie auth **does** work — the
server already issues `SameSite=None; Secure` cookies in production and
performs origin checks against `ALLOWED_ORIGINS` — but every moving part must
be configured, and there are real browser caveats to accept.

```
Browser
  │  https://taskflow.vercel.app (SPA)
  │    └─ axios               baseURL /api ──────────►  https://taskflow.up.railway.app (API)
  │    └─ socket.io-client    SOCKET_URL   ──────────►  same origin, WebSocket upgrade
  │    └─ document.cookie     <- can NOT see the API origin's cookies
```

---

## 1. Config summary

| Where | Variable | Value |
|---|---|---|
| **Vercel** (project env) | `VITE_API_URL` | `https://<api>.up.railway.app/api` |
| **Vercel** | `VITE_SOCKET_URL` | `https://<api>.up.railway.app` |
| **Vercel** | `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` | your Auth0 tenant + SPA client ID |
| **Vercel** | `VITE_GOOGLE_CLIENT_ID` | (optional, legacy Google button) |
| **Railway** | `CLIENT_URL` | `https://<spa>.vercel.app` |
| **Railway** | `ALLOWED_ORIGINS` | `https://<spa>.vercel.app` (+ any custom domains, comma-separated) |
| **Railway** | `TRUST_PROXY` | `true` |
| **Railway** | `GITHUB_CALLBACK_URL` | `https://<api>.up.railway.app/api/auth/github/callback` |

Everything else (`MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`AI_KEY_SECRET`, ...) stays exactly as the single-service Railway setup.

---

## 2. Vercel project setup

1. **Import the repo** in [vercel.com](https://vercel.com) → Import → pick the
   TaskFlow repo → **Root Directory: `client`** (the SPA lives there; this
   also makes Vercel pick up `client/vercel.json`).
2. **Framework Preset:** Vite. **Build Command:** `npm run build`.
   **Output Directory:** `dist`.
3. **Environment variables** (all `VITE_*` are *build-time* — changing them
   requires a new deploy):
   - `VITE_API_URL=https://<api>.up.railway.app/api`
   - `VITE_SOCKET_URL=https://<api>.up.railway.app`
   - `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` (to show the Google/Auth0
     button; must match the server's `AUTH0_*`)
4. Deploy. `client/vercel.json` rewrites every route to `/index.html` so the
   React Router paths and `/auth/callback` deep links work on refresh.

> `VITE_API_URL` ends with `/api` on purpose — `client/src/api/tasks.ts`
> derives the base URL from it and `NotificationContext` derives the Socket.IO
> origin from it (or uses `VITE_SOCKET_URL` directly).
---

## 3. Railway side (the API)

1. Set **`CLIENT_URL=https://<spa>.vercel.app`** — this is the redirect target
   for OAuth callbacks and the origin used for password-reset / verification
   links in email.
2. Set **`ALLOWED_ORIGINS=https://<spa>.vercel.app`**. This is a *fail-closed*
   allowlist: production CORS **and** the CSRF origin check both reject any
   browser origin not listed. Add custom domains as a comma-separated list.
3. Keep `TRUST_PROXY=true` (Railway TLS termination).
4. Redeploy Railway. Verify:
   ```bash
   curl -s https://<api>.up.railway.app/api/health
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
  to the **API** origin: `https://<api>.up.railway.app/api/auth/github/callback`,
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
  on `fetch`/XHR/WebSocket between the Vercel SPA and the Railway API
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
  that's unacceptable, use the single-service Railway deploy (same-origin,
  unaffected).
- **Socket.IO** needs the same third-party cookie permissions for its upgrade
  handshake.
- Keep `JWT_SECRET`/`JWT_REFRESH_SECRET` stable across Railway re/deploys —
  rotating them signs everyone out.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| SPA loads but API calls fail with CORS/403 | `ALLOWED_ORIGINS` missing the exact Vercel origin (scheme+host, no trailing slash) |
| 403 `Cross-origin request forbidden` on mutations | Same — the CSRF origin check uses the same allowlist |
| Login loop right after sign-in | Browser blocking third-party cookies (caveats above); or `NODE_ENV` not `production` on Railway (cookies must be `SameSite=None; Secure`) |
| Auth0 popup rejects the redirect | Add the Vercel origin to Auth0's Allowed Callback/Web/Logout URLs |
| GitHub sign-in bounces with `STATE_MISMATCH` | `GITHUB_CALLBACK_URL` not registered on GitHub, or mismatched with the API origin |
| Socket.IO keeps retrying | `VITE_SOCKET_URL` wrong or missing; `ALLOWED_ORIGINS` missing; cookies blocked |
| Old env on the SPA | `VITE_*` are baked in at build time — change them in Vercel and redeploy |

---

## 7. When to prefer the single-service deploy

Use the Railway-only model unless you specifically want Vercel's global edge
for the static shell. Same-origin means: no third-party-cookie dependence, no
`VITE_API_URL` crossing, simplest Auth0/Google origins, and one URL to share.
The split model exists so the SPA can live on Vercel; everything in this guide
exists to make that safe.