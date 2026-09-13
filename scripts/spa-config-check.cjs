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

/** Absolute http(s) hosts mentioned in a bundle (deduped, own origin excluded is caller's job). */
function extractAbsoluteHosts(bundleText) {
  const hosts = new Set();
  const re = /https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*(?::\d{1,5})?/g;
  for (const m of bundleText.matchAll(re)) {
    try {
      hosts.add(new URL(m[0]).origin);
    } catch { /* skip */ }
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

  // ── 2. entry bundle exists and is reachable ───────────────────────────────
  const entrySrc = index.text ? extractEntryScript(index.text) : null;
  let bundle = null;
  if (!entrySrc) {
    failures.push('index.html contains no <script type="module" src=…> entry — SPA build looks wrong');
  } else {
    const entryUrl = entrySrc.startsWith('http') ? entrySrc : `${spaOrigin}${entrySrc}`;
    try {
      const res = await fetchText(entryUrl);
      if (res.status !== 200) {
        failures.push(`entry bundle ${entryUrl} → HTTP ${res.status}`);
      } else {
        bundle = res.text;
      }
    } catch (err) {
      failures.push(`entry bundle ${entryUrl} unreachable: ${err.message}`);
    }
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
