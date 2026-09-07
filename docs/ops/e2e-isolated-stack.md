# Isolated E2E Stack

Hermetic Playwright runs that never touch real user data or the developer's
default ports. Owned by the final test/docs batch; app and server sources are
read-only here — everything below lives in `client/e2e/*` + npm scripts.

## Why

- `:3000` / `:5000` are occupied on this machine by other projects.
- The default `vite.config.js` proxy points at `:5000`, so a second stack
  needs its own client config, not just env vars.
- The server enforces email verification on every protected route: the
  `setup` fixture flips `emailVerified` in the database the API *actually*
  uses (`E2E_MONGO_URI` when isolated, `server/.env` otherwise).

## Layout

| Process | Port | Source |
|---|---|---|
| MongoDB (in-memory, ephemeral) | random host-only | `mongodb-memory-server`, binary `7.0.24` from the local cache (`E2E_MONGO_VERSION` overrides) |
| Express API | `:5058` (`E2E_API_PORT`) | `node server.js`, `NODE_ENV=test`, OAuth providers forced off |
| Vite client | `:5174` (`E2E_CLIENT_PORT`) | `client/e2e/vite.e2e.config.js` (same plugins/chunks as `vite.config.js`, `/api` → `:5058`) |

## Automated (the final gate — required)

From `client/` (or `npm run test:e2e:isolated` from the repo root):

```bash
node e2e/run-isolated.cjs                      # full suite, both projects
node e2e/run-isolated.cjs routes visual        # file-name filters
node e2e/run-isolated.cjs --project=mobile     # one project
node e2e/run-isolated.cjs visual --update-snapshots  # REGENERATE baselines (deliberate only)
npx playwright test --list                     # dry-run: config + spec discovery
```

The runner boots mongo → waits for `/api/health` → boots Vite → waits for
`/` → runs `playwright test` with `E2E_BASE_URL` / `E2E_API_URL` /
`E2E_API_BASE` / `E2E_MONGO_URI` / `E2E_NO_WEBSERVER=1`, then kills everything
and exits with Playwright's code. `Ctrl+C` tears the stack down too.

Snapshot regeneration has its own script:

```bash
npm run test:e2e:isolated:snapshots --prefix client
# = node e2e/run-isolated.cjs visual --update-snapshots
```

Baselines live in `client/e2e/__snapshots__/` (`<name>-chromium.png`,
`<name>-mobile.png`). Commit them; never commit `client/e2e/.auth/`
(ephemeral fixture tokens).

## Manual (debugging only)

```bash
node e2e/run-isolated.cjs --boot-only   # stack up, parks until Ctrl+C
```

Then in another shell (PowerShell):

```powershell
$env:E2E_BASE_URL='http://localhost:5174'
$env:E2E_API_URL='http://localhost:5058/api'
$env:E2E_MONGO_URI='<memory URI from the boot log — same DB the API uses>'
$env:E2E_NO_WEBSERVER='1'
npx playwright test --project=chromium routes
```

Or boot the pieces by hand: `PORT=5058 MONGO_URI=<uri> NODE_ENV=test node
server.js` (from `server/`) plus `npm run dev:e2e` (from `client/`).

## Env knobs (all optional, defaults in parentheses)

- `E2E_BASE_URL` (`http://localhost:3000`) — Playwright `baseURL`; pre-existing
  specs resolve to defaults unmodified when unset.
- `E2E_API_URL` (`http://localhost:5000/api`) — helpers + seeding;
  `E2E_API_BASE` is accepted as a legacy alias.
- `E2E_MONGO_URI` — database the API uses; doubles as the verify-flip target
  (`auth.setup.ts`, `helpers.createUserViaApi`).
- `E2E_NO_WEBSERVER=1` — Playwright boots no dev server (the runner owns them).
- `E2E_WEB_PORT` / `E2E_WEBSERVER_COMMAND` — override Playwright's own
  `webServer` when it is enabled (port otherwise derives from `E2E_BASE_URL`).
- `E2E_API_PORT` / `E2E_CLIENT_PORT` / `E2E_API_TARGET` — runner + e2e Vite config.
- `E2E_MONGO_VERSION` (`7.0.24`) — pinned memory-server binary.

## Design notes that bite

- **Single stored refresh token per user** (`authController` overwrites
  `user.refreshToken` on every login) plus a **server-side access-token
  denylist on logout**: any extra password login or UI logout invalidates the
  shared fixture session. Therefore (a) `setup` persists its token pair to
  `.auth/tokens.json` and specs seed through it instead of logging in, and
  (b) `smoke-auth` re-persists storageState + tokens after its UI re-login
  (self-healing fixture).
- **Deterministic fixture identity** (`e2e_fixture@test.taskflow.app`) on
  isolated runs: the sidebar renders the email, and run-unique addresses bust
  every visual baseline. Classic local runs keep random identities (shared DB).
- **Frozen clock + fixed seed** in `visual.spec.ts` (`2026-09-05T12:00:00`,
  five fixed tasks, wipe-then-seed `beforeEach`); the team page's
  `?ref=<random code>` invite link is `mask`ed with a comment.
- ** axe `button-name` / `color-contrast` findings** are app defects in unowned
  files, documented as `.fixme` in `a11y.spec.ts` (max 2): unnamed
  `CalendarWidget` month buttons (`CalendarWidget.tsx:49,52`) and the muted
  `#8e8b82` tab/caption text (auth tabs).
