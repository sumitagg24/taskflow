/**
 * Playwright `setup` project: builds the shared authenticated fixture.
 *
 * Flow: register a fresh user through the BROWSER context (`page.request`
 * shares the context cookie jar, so the httpOnly `accessToken`/`refreshToken`
 * Set-Cookies land in it), flip `emailVerified` directly in MongoDB (login
 * and all protected routes 403 unverified users), log in to mint a fresh
 * cookie pair, then persist `storageState` for the desktop+mobile projects.
 *
 * DB access: mongoose is a SERVER dependency (not resolvable from `client/`),
 * so it is loaded via `createRequire` anchored at `server/package.json`.
 * `mongodb-memory-server` is deliberately NOT used here — the fixture targets
 * the same real database the dev servers run against.
 */
import { test as setup } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// client/ is ESM ("type": "module"), so __dirname is unavailable — derive it.
const HERE = path.dirname(fileURLToPath(import.meta.url));

const AUTH_DIR = path.join(HERE, '.auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'user.json');
const CREDENTIALS_PATH = path.join(AUTH_DIR, 'credentials.json');
const SERVER_ENV_PATH = path.join(HERE, '..', '..', 'server', '.env');
// E2E_API_URL is the canonical var (helpers.ts); E2E_API_BASE is the legacy
// alias this file originally used. Isolated runs export both to the same value.
const API_BASE = process.env.E2E_API_URL ?? process.env.E2E_API_BASE ?? 'http://localhost:5000/api';

/**
 * Resolve the MongoDB the API is actually using. The isolated harness exports
 * E2E_MONGO_URI (an in-memory server) so the verify-flip below lands in the
 * same database the API reads — never in the developer's real database.
 * Classic local runs fall back to MONGO_URI from server/.env as before.
 */
function readMongoUri(): string {
  const isolated = process.env.E2E_MONGO_URI;
  if (isolated !== undefined && isolated !== '') return isolated;
  return readMongoUriFromServerEnv();
}

/** Read MONGO_URI straight from server/.env. Throws loudly — never mask it. */
function readMongoUriFromServerEnv(): string {
  if (!fs.existsSync(SERVER_ENV_PATH)) {
    throw new Error(
      `[auth.setup] server/.env not found at ${SERVER_ENV_PATH}. ` +
        `Copy server/.env.example to server/.env and set MONGO_URI before running e2e.`
    );
  }
  const raw = fs.readFileSync(SERVER_ENV_PATH, 'utf8');
  const line = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('MONGO_URI='));
  const uri = (line?.slice('MONGO_URI='.length) ?? '').trim().replace(/^["']|["']$/g, '');
  if (!uri) {
    throw new Error(
      `[auth.setup] MONGO_URI is missing or empty in ${SERVER_ENV_PATH}. ` +
        `Set it to the MongoDB used by the dev API server before running e2e.`
    );
  }
  return uri;
}

const serverRequire = createRequire(path.join(HERE, '..', '..', 'server', 'package.json'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mongoose = serverRequire('mongoose') as typeof import('mongoose');

setup('authenticate (verified fixture user)', async ({ page }) => {
  const worker = process.env.TEST_WORKER_INDEX ?? '0';
  // Isolated runs (E2E_MONGO_URI) boot a FRESH in-memory database per run, so
  // a fixed identity is collision-free AND keeps screenshots deterministic
  // (the sidebar renders the fixture email — a run-unique address would bust
  // every visual baseline). Classic local runs keep the random identity to
  // stay collision-free on the shared developer database.
  const isolated = (process.env.E2E_MONGO_URI ?? '') !== '';
  const uniq = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const user = {
    name: 'E2E Fixture',
    username: isolated ? 'e2efixture' : `e2efix_${worker}_${uniq}`.slice(0, 30),
    email: isolated ? 'e2e_fixture@test.taskflow.app' : `e2e_fixture_${worker}_${uniq}@test.taskflow.app`,
    password: 'TestPass1!',
  };

  // Hit the SPA first so the context is live on the app origin.
  await page.goto('/');

  const register = await page.request.post(`${API_BASE}/auth/register`, { data: user });
  if (!register.ok()) {
    throw new Error(
      `[auth.setup] register failed: ${register.status()} ${await register.text()} — is the API up at ${API_BASE}?`
    );
  }

  const mongoUri = readMongoUri();
  await mongoose.connect(mongoUri);
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('[auth.setup] no MongoDB database handle after connect.');
    const result = await db
      .collection('users')
      .updateOne({ email: user.email }, { $set: { emailVerified: true } });
    if (result.matchedCount !== 1) {
      throw new Error(`[auth.setup] user ${user.email} not found in MongoDB after register.`);
    }
  } finally {
    await mongoose.disconnect();
  }

  // Login AFTER verification: unverified logins 403 (EMAIL_NOT_VERIFIED).
  const login = await page.request.post(`${API_BASE}/auth/login`, {
    data: { identifier: user.email, password: user.password },
  });
  if (!login.ok()) {
    throw new Error(`[auth.setup] login failed: ${login.status()} ${await login.text()}.`);
  }
  const loginBody = (await login.json()) as { accessToken?: string; refreshToken?: string };

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });

  // The httpOnly cookies are opaque to specs; persist the fixture credentials
  // alongside so specs (e.g. smoke-auth) can log back in through the UI.
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ email: user.email, password: user.password }));

  // Persist THIS session's token pair for test-side API seeding (specs acting
  // as the fixture user). Reusing these beats logging in again per test: the
  // server stores a SINGLE refresh token per user, so every extra password
  // login silently invalidates the browser session the specs run in.
  if (!loginBody.accessToken || !loginBody.refreshToken) {
    throw new Error('[auth.setup] login response carried no token pair — cannot write tokens.json.');
  }
  fs.writeFileSync(
    path.join(AUTH_DIR, 'tokens.json'),
    JSON.stringify({ accessToken: loginBody.accessToken, refreshToken: loginBody.refreshToken })
  );

  const saved = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, 'utf8')) as {
    cookies: Array<{ name: string }>;
  };
  const names = saved.cookies.map((c) => c.name);
  for (const required of ['accessToken', 'refreshToken', 'tf_session']) {
    if (!names.includes(required)) {
      throw new Error(
        `[auth.setup] storageState at ${STORAGE_STATE_PATH} is missing cookie "${required}" (has: ${names.join(', ')}).`
      );
    }
  }
});
