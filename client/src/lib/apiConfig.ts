/**
 * Single source of truth for API + Socket.IO endpoints.
 *
 * Resolution order (mirrors what the server actually serves):
 *
 *  1. `VITE_API_URL`  — explicit. Production MUST set it (e.g.
 *     `https://api.example.com/api`). Development may also set it to point at
 *     a non-default local API.
 *  2. `import.meta.env.DEV` — Vite dev server: same-origin `/api` rides the
 *     dev proxy (vite.config.js → http://localhost:5000).
 *  3. `window.location.origin + '/api'` — same-origin production deploy where
 *     the Express server serves the built SPA itself.
 *
 * Production guard: when `import.meta.env.PROD` is true and the deployed app
 * is NOT same-origin (i.e. the SPA is served from a static host like Vercel
 * while the API lives elsewhere), `VITE_API_URL` must exist and be an
 * absolute http(s) URL — otherwise this module throws during app
 * initialisation (and `npm run build` fails via the build-time assertion
 * below). A production bundle must never silently fall back to `localhost`.
 *
 * `import.meta.env.PROD`/`DEV` are statically replaced at build time: the
 * localhost dev default (and the whole DEV branch) is compiled out of
 * production bundles, so no localhost fallback can survive a deploy.
 */

export interface ApiConfig {
  /** Axios baseURL — always ends with `/api`. */
  apiBaseUrl: string;
  /** Socket.IO origin — never ends with a slash, never includes `/api`. */
  socketUrl: string;
  /** True when the API lives on a different origin than the SPA. */
  crossOrigin: boolean;
  /** The raw env values, for diagnostics. */
  raw: { apiUrl?: string; socketUrl?: string };
}

function stripTrailingSlash(v: string): string {
  return v.replace(/\/+$/, '');
}

/** Normalise any configured value into `{ apiBaseUrl, socketUrl }` or null. */
function fromExplicit(value: string | undefined): { apiBaseUrl: string; socketUrl: string } | null {
  if (!value || !value.trim()) return null;
  const trimmed = stripTrailingSlash(value.trim());
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/')) {
    // Relative single-segment values like "api" are ambiguous — reject.
    return null;
  }
  // Either `https://host/api` or a bare origin `https://host` (treated as
  // `https://host/api` because that is where the Express API mounts).
  const apiBaseUrl = /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
  let socketUrl: string;
  try {
    socketUrl = new URL(apiBaseUrl, window.location.origin).origin;
  } catch {
    socketUrl = apiBaseUrl.replace(/\/api$/i, '');
  }
  return { apiBaseUrl, socketUrl };
}

// Dev/test only: jsdom (vitest's default environment) serves pages from
// `http://localhost:3000` while the dev API socket is `:5000` — both are
// loopback, so treat any two loopback hosts as effectively same-origin for
// cookie/session purposes. In production (https origins) loopback hosts
// never legitimately collide, so this stays a harness-only relaxation.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

function computeCrossOrigin(socketUrl: string): boolean {
  try {
    const u = new URL(socketUrl, window.location.origin);
    const bothLoopback =
      LOOPBACK_HOSTS.has(u.hostname) && LOOPBACK_HOSTS.has(window.location.hostname);
    // Loopback-only relaxation for dev/test harnesses (jsdom serves the page
    // from :3000 while the API socket is :5000). Production keeps strict
    // origin comparison — real deploys are https, never loopback.
    if (bothLoopback && import.meta.env.DEV) return false;
    return u.origin !== window.location.origin;
  } catch {
    return true;
  }
}

function resolve(): ApiConfig {
  // Read env lazily (not at module scope) so vitest's per-test
  // `vi.stubEnv` is honoured by `resolveForTest()`.
  const rawApiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const rawSocketUrl = import.meta.env.VITE_SOCKET_URL as string | undefined;
  const explicit = fromExplicit(rawApiUrl);

  if (explicit) {
    // Optional explicit socket origin override (documented escape hatch).
    const socketOverride = rawSocketUrl?.trim()
      ? stripTrailingSlash(rawSocketUrl.trim())
      : null;
    const socketUrl = socketOverride || explicit.socketUrl;
    return { apiBaseUrl: explicit.apiBaseUrl, socketUrl, crossOrigin: computeCrossOrigin(socketUrl), raw: { apiUrl: rawApiUrl, socketUrl: rawSocketUrl } };
  }

  // Dev default: same-origin /api through the Vite dev proxy.
  if (import.meta.env.DEV) {
    return {
      apiBaseUrl: '/api',
      socketUrl: 'http://localhost:5000',
      crossOrigin: computeCrossOrigin('http://localhost:5000'),
      raw: { apiUrl: rawApiUrl, socketUrl: rawSocketUrl },
    };
  }

  // Same-origin production deploy (Express serves the built SPA): /api and
  // WebSockets live on this origin.
  const sameOrigin = window.location.origin;
  return {
    apiBaseUrl: '/api',
    socketUrl: sameOrigin,
    crossOrigin: computeCrossOrigin(sameOrigin),
    raw: { apiUrl: rawApiUrl, socketUrl: rawSocketUrl },
  };
}

export const apiConfig: ApiConfig = resolve();

/** Re-run resolution against the current env (test hook — vitest stubs env
 * vars per-test, but module init happens once per worker). */
export function resolveForTest(): ApiConfig {
  return resolve();
}

/**
 * Called from the app entry point. In a production bundle, throws when the
 * resolved config is obviously broken — an absolute-URL API is required
 * whenever the SPA is NOT served by the API itself (static hosting like
 * Vercel). Same-origin deploys legitimately have no VITE_API_URL.
 */
export function assertApiConfigUsable(): void {
  if (!import.meta.env.PROD) return;
  if (!/^https?:\/\//i.test(window.location.protocol)) return; // SSR/test harness — nothing to check
  if (apiConfig.raw.apiUrl && !/^https?:\/\//i.test(apiConfig.raw.apiUrl) && !apiConfig.raw.apiUrl.startsWith('/')) {
    // An explicit-but-garbage value (e.g. "api" with no scheme) fell through
    // normalisation and resolved to a same-origin default — fail loudly
    // instead of silently calling the SPA's own origin.
    throw new Error(
      `[apiConfig] VITE_API_URL is set but malformed: "${apiConfig.raw.apiUrl}". ` +
      'Use an absolute URL like https://api.example.com/api.'
    );
  }
  if (!apiConfig.crossOrigin) return; // same-origin deploy — fine by definition
  if (!/^https?:\/\//i.test(apiConfig.apiBaseUrl) || /\/\/localhost|\/\/127\.0\.0\.1/i.test(apiConfig.apiBaseUrl)) {
    throw new Error(
      '[apiConfig] Cross-origin production build is pointing at a localhost API. ' +
      'Set VITE_API_URL (e.g. https://api.example.com/api) at build time and redeploy.'
    );
  }
}

/** Socket.IO transport options derived from the resolved config. */
export function socketOptions(): { url: string; withCredentials: true } {
  return { url: apiConfig.socketUrl, withCredentials: true };
}

/** Test-only export: run the normaliser against an arbitrary value. */
export function fromExplicitForTest(
  value: string | undefined
): { apiBaseUrl: string; socketUrl: string } | null {
  return fromExplicit(value);
}
