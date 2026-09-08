/**
 * Isolated E2E stack runner.
 *
 * Boots a fully hermetic stack on non-conflicting ports (defaults: API :5058,
 * client :5174 — :3000/:5000 are occupied on this machine), runs Playwright
 * against it, then tears everything down:
 *
 *   1. mongodb-memory-server (ephemeral; nothing touches real user data)
 *   2. Express API  (`node server.js`, PORT=5058, MONGO_URI=<memory>)
 *   3. Vite client  (e2e/vite.e2e.config.js, :5174, /api → :5058)
 *   4. `playwright test` with E2E_BASE_URL / E2E_API_URL / E2E_MONGO_URI set
 *      (E2E_NO_WEBSERVER=1 so Playwright does not boot a second dev server)
 *   5. Kill children + stop memory mongo, exit with Playwright's code.
 *
 * Usage (from client/):
 *   node e2e/run-isolated.cjs [playwright args…]
 *   node e2e/run-isolated.cjs routes visual --project=chromium
 *   node e2e/run-isolated.cjs visual --update-snapshots
 *   node e2e/run-isolated.cjs --list
 *   node e2e/run-isolated.cjs --boot-only        # leave stack up for manual runs
 *
 * Env overrides: E2E_API_PORT (5058), E2E_CLIENT_PORT (5174),
 * E2E_MONGO_VERSION (pinned binary, default 7.0.24 — matches the local cache).
 */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { createRequire } = require('node:module');

const CLIENT_DIR = path.join(__dirname, '..');
const SERVER_DIR = path.join(CLIENT_DIR, '..', 'server');
const serverRequire = createRequire(path.join(SERVER_DIR, 'package.json'));

const API_PORT = Number(process.env.E2E_API_PORT ?? '5058');
const CLIENT_PORT = Number(process.env.E2E_CLIENT_PORT ?? '5174');
const API_URL = `http://localhost:${API_PORT}`;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;

const children = [];
let mongod = null;

function log(tag, msg) {
  process.stdout.write(`[${tag}] ${msg}\n`);
}

/** Pipe a child's stdio with a tag prefix (attributable, still streaming). */
function attach(child, tag) {
  children.push(child);
  for (const [stream, label] of [[child.stdout, tag], [child.stderr, `${tag}:err`]]) {
    if (!stream) continue;
    stream.on('data', (buf) => {
      for (const line of String(buf).split(/\r?\n/)) {
        if (line.trim() !== '') log(label, line);
      }
    });
  }
  child.on('exit', (code, signal) => {
    log(tag, `exited code=${code} signal=${signal ?? '-'}`);
  });
}

async function startMemoryMongo() {
  const { MongoMemoryServer } = serverRequire('mongodb-memory-server');
  const pinned = process.env.E2E_MONGO_VERSION ?? '7.0.24';
  try {
    log('mongo', `starting in-memory MongoDB (pinned binary ${pinned})…`);
    mongod = await MongoMemoryServer.create({ binary: { version: pinned } });
  } catch (err) {
    log('mongo', `pinned binary ${pinned} failed (${err.message}); retrying with default version…`);
    mongod = await MongoMemoryServer.create();
  }
  const uri = mongod.getUri();
  log('mongo', `ready (ephemeral database, host-only)`);
  return uri;
}

function waitForHttp(url, { timeoutMs, label }) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (Date.now() >= deadline) {
          return reject(new Error(`[run-isolated] ${label} never became ready at ${url}: ${err.message}`));
        }
        setTimeout(tick, 1000);
      }
    };
    tick();
  });
}

async function shutdown(exitCode) {
  for (const child of children.splice(0)) {
    try {
      if (!child.killed && child.exitCode === null) child.kill();
    } catch { /* already gone */ }
  }
  if (mongod) {
    try { await mongod.stop(); } catch { /* already gone */ }
    mongod = null;
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

async function main() {
  const rawArgs = process.argv.slice(2);
  const bootOnly = rawArgs.includes('--boot-only');
  const pwArgs = rawArgs.filter((a) => a !== '--boot-only');

  const mongoUri = await startMemoryMongo();

  // --- API ---------------------------------------------------------------
  // NODE_ENV=test: silent logger, localhost CORS/CSRF allowlist, same flags
  // the server Jest suites run under. OAuth providers are forced OFF (empty
  // string beats server/.env via dotenv-without-override) so social-auth
  // assertions are hermetic — no Google SDK network dependency.
  const api = spawn(
    process.execPath,
    ['server.js'],
    {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        MONGO_URI: mongoUri,
        NODE_ENV: 'test',
        JWT_SECRET: 'e2e-isolated-access-secret-0123456789abcdef',
        JWT_REFRESH_SECRET: 'e2e-isolated-refresh-secret-0123456789abcdef',
        CLIENT_URL,
        ALLOWED_ORIGINS: CLIENT_URL,
        GOOGLE_CLIENT_ID: '',
        GITHUB_CLIENT_ID: '',
        GITHUB_CLIENT_SECRET: '',
        // Auth0 stays off in the isolated stack: deterministic suites, no
        // dependency on a real tenant. Blank strings keep dotenv from
        // filling these in from server/.env.
        AUTH0_DOMAIN: '',
        AUTH0_CLIENT_ID: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  attach(api, 'api');

  await waitForHttp(`${API_URL}/api/health`, { timeoutMs: 90_000, label: 'API' });
  log('api', `health OK at ${API_URL}`);

  // --- Client ------------------------------------------------------------
  const vite = spawn(
    process.execPath,
    [path.join(CLIENT_DIR, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', path.join('e2e', 'vite.e2e.config.js')],
    {
      cwd: CLIENT_DIR,
      env: {
        ...process.env,
        E2E_CLIENT_PORT: String(CLIENT_PORT),
        E2E_API_TARGET: API_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  attach(vite, 'client');

  await waitForHttp(CLIENT_URL, { timeoutMs: 120_000, label: 'client' });
  log('client', `ready at ${CLIENT_URL}`);

  if (bootOnly) {
    log('run', `stack up — API ${API_URL} · client ${CLIENT_URL}. Ctrl+C to tear down.`);
    log('run', `manual: $env:E2E_BASE_URL='${CLIENT_URL}'; $env:E2E_API_URL='${API_URL}/api'; $env:E2E_MONGO_URI='<from log>'; $env:E2E_NO_WEBSERVER='1'; npx playwright test`);
    await new Promise(() => {}); // park until SIGINT/SIGTERM
    return;
  }

  // --- Playwright --------------------------------------------------------
  const pwEnv = {
    ...process.env,
    E2E_BASE_URL: CLIENT_URL,
    E2E_API_URL: `${API_URL}/api`,
    E2E_API_BASE: `${API_URL}/api`,
    E2E_MONGO_URI: mongoUri,
    E2E_NO_WEBSERVER: '1',
  };
  const pw = spawn(
    process.execPath,
    [path.join(CLIENT_DIR, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', ...pwArgs],
    { cwd: CLIENT_DIR, env: pwEnv, stdio: 'inherit' }
  );
  children.push(pw);
  const code = await new Promise((resolve) => pw.on('close', resolve));
  await shutdown(code);
}

main().catch((err) => {
  log('run', `FATAL: ${err.stack || err.message}`);
  shutdown(1);
});
