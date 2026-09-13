#!/usr/bin/env node
/** Local guard: vercel.json files stay frontend-correct.
 * Fails when SPA rewrites would shadow /api, when the client project
 * declares functions/crons (API must not run on the static SPA project),
 * or when required build fields drift. Run: node scripts/vercel-config-check.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const failures = [];

function load(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (err) {
    failures.push(`${rel}: unreadable (${err.message})`);
    return null;
  }
}

const clientCfg = load('client/vercel.json');
if (clientCfg) {
  const rewrites = clientCfg.rewrites || [];
  const spa = rewrites.find((r) => r.destination === '/index.html');
  if (!spa) failures.push('client/vercel.json: missing SPA rewrite to /index.html');
  else if (!/\(\?!api/i.test(spa.source)) {
    failures.push(
      `client/vercel.json: SPA rewrite source "${spa.source}" would shadow /api/* with index.html — ` +
      'use a negative lookahead like "/((?!api/).*)" so misconfigured API calls 404 instead of returning HTML'
    );
  }
  if (clientCfg.functions || clientCfg.crons) {
    failures.push('client/vercel.json: must not declare functions/crons — the SPA project is static-only');
  }
}

const rootCfg = load('vercel.json');
if (rootCfg) {
  if (rootCfg.outputDirectory !== 'client/dist') {
    failures.push(`vercel.json: outputDirectory should be client/dist (got ${rootCfg.outputDirectory})`);
  }
  const apiRewrite = (rootCfg.rewrites || []).find((r) => String(r.source).startsWith('/api'));
  if (!apiRewrite) failures.push('vercel.json: missing /api/* rewrite to the serverless function');
  const spa = (rootCfg.rewrites || []).find((r) => r.destination === '/index.html');
  if (spa && !/\(\?!api/i.test(spa.source)) {
    failures.push(`vercel.json: SPA rewrite source "${spa.source}" would shadow /api/*`);
  }
}

if (failures.length > 0) {
  console.error('vercel-config-check: FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('vercel-config-check: PASS');
