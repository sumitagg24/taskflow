#!/usr/bin/env node
/**
 * Deployed-SPA configuration check: verifies that a hosted frontend build is
 * actually wired to a real API before (or after) a release.
 *
 * Why this exists: the shipped Vercel bundle pointed every API call at
 * `/api` on the SPA's own origin (no API lives there) and Socket.IO at a
 * RETIRED Railway host. The site looked fine and every auth request
 * silently got index.html back. This script makes that failure mode a
 * hard, automated error instead of a silent outage.
 *
 * What it checks (all against the LIVE deployed bundle):
 *   1. GET /                returns the SPA index (200, text/html)
 *   2. extract the entry <script src="/assets/index-*.js">
 *   3. fetch that bundle and scan it for:
 *        - a hardcoded absolute API/socket host (dead-host detection: any
 *          host baked in must answer an HTTP request)
 *        - the apiConfig production guard string (proves the bundle was
 *          built from a tree that refuses localhost/misconfigured targets)
 *   4. GET /api/health on BOTH the SPA origin and (when provided) the API
 *      origin — the SPA origin must NOT answer /api/health with JSON, unless
 *      it is deliberately a single-origin deploy.
 *
 * Usage:
 *   node scripts/spa-config-check.cjs --url https://taskflow.vercel.app
 *   node scripts/spa-config-check.cjs --url https://spa --api-url https://api
 *
 * Env fallbacks: SPA_BASE_URL / API_BASE_URL.
 * Exit codes: 0 pass · 1 fail · 2 bad arguments
 */

const REQUEST_TIMEOUT_MS = 20_000;

function parseArgs(argv) {
  const args = {
    spa: process.env.SPA_BASE_URL || '',
    api: process.env.API_BASE_URL || '',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.spa = argv[++i] || '';
    else if (a.startsWith('--url=')) args.spa = a.slice('--url='.length);
    else if (a === '--api-url') args.api = argv[++i] || '';
    else if (a.startsWith('--api-url=')) args.api = a.slice('--api-url='.length);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function normalizeBase(raw, label) {
  const url = (raw || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported protocol for ${label}: ${parsed.protocol}`);
  }
  return parsed.origin;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html,application/javascript,*/*' },
      redirect: 'follow',
    });
    const text = await res.text();
    return { status: res.status, text, contentType: res.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

function extractEntryScript(html) {
  const matches = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)];
  if (matches.length === 0) return null;
  return matches[0][1];
}

/**
 * Every JS chunk the page can execute: the module entry plus all
 * modulepreload chunks. Rollup/Vite may hoist shared code (e.g. the
 * apiConfig module) out of the entry chunk, so scanning the entry alone
 * yields false negatives — the guard must be searched across all of these.
 */
function extractJsAssets(html) {
  const out = [];
  const seen = new Set();
  const push = (src) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push(src);
  };
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) push(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) push(m[1]);
  return out.filter((s) => s.endsWith('.js'));
}

/** Absolute http(s) hosts mentioned in a bundle (deduped, own origin excluded is caller's job). */
function extractAbsoluteHosts(bundleText) {
  const hosts = new Set();
  const re = /https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*(?::\d{1,5})?(?:\/[^\s"'`\\]*)?/g;
  for (const m of bundleText.matchAll(re)) {
    let url;
    try {
      url = new URL(m[0]);
    } catch { continue; /* skip */ }
    // Library documentation links are not API endpoints: socket.io-client
    // embeds https://socket.io/docs/… in comments/errors, and any /docs
    // link can never be the configured API origin. Checking them would fail
    // every healthy deploy (false positive), so they are skipped — the check
    // targets baked-in API origins (VITE_API_URL / VITE_SOCKET_URL values).
    const host = url.hostname.toLowerCase();
    if (host === 'socket.io' || host === 'www.socket.io') continue;
    if (url.pathname.startsWith('/docs')) continue;
    hosts.add(url.origin);
  }
  return [...hosts];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/spa-config-check.cjs --url <spa-origin> [--api-url <api-origin>]');
    process.exit(0);
  }

  const failures = [];
  let spaOrigin;
  let apiOrigin;
  try {
    spaOrigin = normalizeBase(args.spa, 'SPA origin');
  } catch (err) {
    console.error(`spa-config-check: invalid --url: ${err.message}`);
    process.exit(2);
  }
  try {
    apiOrigin = normalizeBase(args.api, 'API origin');
  } catch (err) {
    console.error(`spa-config-check: invalid --api-url: ${err.message}`);
    process.exit(2);
  }

  console.log(`spa-config-check: checking SPA at ${spaOrigin}${apiOrigin ? ` (API origin: ${apiOrigin})` : ''}`);

  // ── 1. SPA index loads ────────────────────────────────────────────────────
  let index;
  try {
    index = await fetchText(`${spaOrigin}/`);
  } catch (err) {
    console.error(`spa-config-check: FAIL — cannot reach SPA origin: ${err.message}`);
    process.exit(1);
  }
  if (index.status !== 200 || !/text\/html/i.test(index.contentType)) {
    failures.push(`GET ${spaOrigin}/ → HTTP ${index.status} (${index.contentType || 'no content-type'}) — expected 200 text/html`);
  }

  // ── 2. JS chunks exist and are reachable ────────────────────────────────
  const entrySrc = index.text ? extractEntryScript(index.text) : null;
  if (!entrySrc) {
    failures.push('index.html contains no <script type="module" src=…> entry — SPA build looks wrong');
  }
  // Scan the entry AND every preloaded chunk: shared modules (like the
  // apiConfig guard) may be hoisted out of the entry chunk by the bundler.
  const assetSrcs = index.text ? extractJsAssets(index.text) : [];
  const bundleParts = [];
  for (const src of assetSrcs) {
    const assetUrl = src.startsWith('http') ? src : `${spaOrigin}${src}`;
    try {
      const res = await fetchText(assetUrl);
      if (res.status !== 200) {
        failures.push(`bundle asset ${assetUrl} → HTTP ${res.status}`);
      } else {
        bundleParts.push(res.text);
      }
    } catch (err) {
      failures.push(`bundle asset ${assetUrl} unreachable: ${err.message}`);
    }
  }
  const bundle = bundleParts.length > 0 ? bundleParts.join('\n') : null;
  if (!bundle && entrySrc) {
    failures.push('no JS bundles could be fetched — SPA build looks wrong');
  }

  // ── 3. bundle wiring checks ───────────────────────────────────────────────
  if (bundle) {
    const hasProdGuard = bundle.includes('Cross-origin production build is pointing at a localhost API');
    if (!hasProdGuard) {
      failures.push(
        'bundle does not contain the apiConfig production guard — it was built from a tree ' +
        'without client/src/lib/apiConfig.ts and may silently ship a same-origin /api default'
      );
    }

    const spaHost = new URL(spaOrigin).hostname;
    const hosts = extractAbsoluteHosts(bundle);
    for (const host of hosts) {
      const h = new URL(host).hostname;
      if (h === spaHost || /(^|\.)localhost$/.test(h) || h === '127.0.0.1' || h.endsWith('.example.com')) {
        continue; // own origin / loopback (guard text) / doc examples
      }
      // Any real host baked into the bundle must be alive — this catches the
      // retired-Railway-host class of outage.
      try {
        await fetchText(`${host}/api/health`);
      } catch {
        // A host that serves the SPA or is merely referenced for fonts etc.
        // may legitimately 404 /api/health, but an unreachable host (DNS
        // failure, connection refused) is always a problem.
        failures.push(
          `bundle references unreachable host ${host} — a dead API endpoint is baked into the deploy`
        );
      }
    }

    // Stricter check for genuine API candidates: absolute bundle URLs that are
    // a bare origin (`VITE_SOCKET_URL` bakes in exactly that form) or whose
    // path targets /api (`VITE_API_URL` form) are configured API origins, not
    // documentation links — library/app doc links always carry a real path
    // (/docs/…, /en/…, /login/…). Such a host MUST answer /api/health with
    // the TaskFlow healthy payload — anything else (Railway's JSON
    // "Application not found", a hosting HTML 404 page, a non-ok status)
    // means the deploy is wired to a dead backend even though the domain
    // still resolves.
    const apiHosts = new Set();
    const absRe = /https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*(?::\d{1,5})?(?:\/[^\s"'`\\]*)?/g;
    for (const m of bundle.matchAll(absRe)) {
      let url;
      try {
        url = new URL(m[0]);
      } catch { continue; /* skip malformed */ }
      const hostname = url.hostname.toLowerCase();
      if (hostname === 'socket.io' || hostname === 'www.socket.io') continue;
      if (url.pathname === '/' || url.pathname === '' || url.pathname.startsWith('/api')) {
        apiHosts.add(url.origin);
      }
    }
    for (const host of apiHosts) {
      const h = new URL(host).hostname;
      if (h === spaHost || /(^|\.)localhost$/.test(h) || h === '127.0.0.1' || h.endsWith('.example.com')) {
        continue; // guard-text examples, never real endpoints
      }
      try {
        const health = await fetchText(`${host}/api/health`);
        let body = null;
        try { body = JSON.parse(health.text); } catch { /* HTML error page etc. */ }
        if (health.status !== 200 || !body || body.status !== 'ok') {
          const detail = body ? JSON.stringify(body).slice(0, 160) : '(non-JSON response)';
          failures.push(
            `bundle is wired to API host ${host} but ${host}/api/health → HTTP ${health.status} ${detail} — ` +
            'the baked-in API endpoint is dead or unhealthy'
          );
        }
      } catch (err) {
        failures.push(
          `bundle is wired to API host ${host} but it is unreachable (${err.message}) — ` +
          'a dead API endpoint is baked into the deploy'
        );
      }
    }
  }

  // ── 4. /api/health placement ──────────────────────────────────────────────
  let spaHealth;
  try {
    spaHealth = await fetchText(`${spaOrigin}/api/health`);
  } catch {
    spaHealth = { status: 0, text: '', contentType: '' };
  }
  const spaHealthIsJsonApi =
    spaHealth.status === 200 && /application\/json/i.test(spaHealth.contentType);
  if (apiOrigin) {
    // Split deploy: the SPA origin must NOT answer the API's health route.
    if (spaHealthIsJsonApi) {
      // Allowed only if SPA and API are the same origin (single-service deploy).
      if (spaOrigin === apiOrigin) {
        console.log('spa-config-check: SPA and API share an origin (single-service deploy) — /api/health expected');
      } else {
        failures.push(
          `${spaOrigin}/api/health returned JSON — a static SPA host must not answer the API's health route. ` +
          'The bundle is probably still calling same-origin /api.'
        );
      }
    }
    // The API origin must be healthy.
    try {
      const apiHealth = await fetchText(`${apiOrigin}/api/health`);
      let body = null;
      try { body = JSON.parse(apiHealth.text); } catch { /* not JSON */ }
      if (apiHealth.status !== 200 || !body || body.status !== 'ok') {
        failures.push(`API origin ${apiOrigin}/api/health → HTTP ${apiHealth.status} ${body ? JSON.stringify(body) : '(non-JSON)'}`);
      }
    } catch (err) {
      failures.push(`API origin ${apiOrigin} unreachable: ${err.message}`);
    }
  } else if (!spaHealthIsJsonApi) {
    console.log(
      'spa-config-check: note — no --api-url given and the SPA origin does not answer /api/health. ' +
      'If this is a split deploy, pass --api-url so the API itself can be verified.'
    );
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  if (failures.length > 0) {
    console.error('spa-config-check: FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('spa-config-check: PASS — SPA reachable, bundle carries the production API-config guard, no dead hosts baked in');
  process.exit(0);
}

main().catch((err) => {
  console.error(`spa-config-check: unexpected error: ${err.message}`);
  process.exit(1);
});
