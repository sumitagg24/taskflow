#!/usr/bin/env node
/**
 * Post-deploy smoke check: poll /api/health on a deployed base URL until it
 * reports { status: "ok", db: "connected" } (or time out).
 *
 * Dependency-free (Node 18+ global fetch). Used by .github/workflows/deploy.yml
 * after `railway up --detach`, which returns before the deployment is live —
 * this script is what actually waits for the new release to serve traffic.
 *
 * Usage:
 *   node scripts/deploy-smoke.cjs --url https://taskflow.up.railway.app
 *   node scripts/deploy-smoke.cjs --url https://x --timeout-seconds 600
 *
 * Env fallback: SMOKE_BASE_URL (used when --url is absent).
 * Exit codes: 0 healthy · 1 timeout/unhealthy · 2 bad arguments
 */

const DEFAULT_TIMEOUT_SECONDS = 600;
const POLL_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;

function parseArgs(argv) {
  const args = { url: process.env.SMOKE_BASE_URL || '', timeoutSeconds: DEFAULT_TIMEOUT_SECONDS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i] || '';
    else if (a.startsWith('--url=')) args.url = a.slice('--url='.length);
    else if (a === '--timeout-seconds') args.timeoutSeconds = Number(argv[++i]);
    else if (a.startsWith('--timeout-seconds=')) args.timeoutSeconds = Number(a.slice('--timeout-seconds='.length));
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function normalizeBase(raw) {
  let url = (raw || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported protocol in base URL: ${parsed.protocol}`);
  }
  return parsed.origin;
}

async function checkOnce(base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
    const bodyText = await res.text();
    let body = null;
    try { body = JSON.parse(bodyText); } catch { /* non-JSON (e.g. HTML error page) */ }
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/deploy-smoke.cjs --url <base> [--timeout-seconds N]');
    process.exit(0);
  }
  let base;
  try {
    base = normalizeBase(args.url);
  } catch (err) {
    console.error(`deploy-smoke: invalid --url/SMOKE_BASE_URL: ${err.message}`);
    process.exit(2);
  }
  if (!base) {
    console.error(
      'deploy-smoke: no base URL given.\n' +
      'Pass --url https://<app>.up.railway.app or set the SMOKE_BASE_URL env var\n' +
      '(in GitHub Actions: set the RAILWAY_PUBLIC_DOMAIN repository variable).'
    );
    process.exit(2);
  }

  const deadline = Date.now() + args.timeoutSeconds * 1000;
  let attempt = 0;
  let lastDetail = 'no attempt made';

  console.log(`deploy-smoke: polling ${base}/api/health (up to ${args.timeoutSeconds}s)`);

  while (Date.now() < deadline) {
    attempt++;
    try {
      const { res, body } = await checkOnce(base);
      if (res.status === 200 && body && body.status === 'ok' && body.db === 'connected') {
        console.log(`deploy-smoke: OK after ${attempt} attempt(s) — status=ok db=connected requestId=${body.requestId || 'n/a'}`);
        process.exit(0);
      }
      lastDetail = `HTTP ${res.status} ${body ? JSON.stringify(body) : '(non-JSON body)'}`;
    } catch (err) {
      lastDetail = `${err.name === 'AbortError' ? `request timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : err.message}`;
    }
    console.log(`deploy-smoke: attempt ${attempt} not ready yet (${lastDetail}) — retrying in ${POLL_INTERVAL_MS / 1000}s`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.error(`deploy-smoke: FAILED — ${base}/api/health not healthy after ${attempt} attempt(s). Last response: ${lastDetail}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`deploy-smoke: unexpected error: ${err.message}`);
  process.exit(1);
});
