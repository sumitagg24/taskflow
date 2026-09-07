import { BrowserContext, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Env-overridable so the isolated stack (E2E_API_URL=http://localhost:5058/api)
// and the classic dev API (http://localhost:5000/api default) share one helper.
// E2E_API_BASE is accepted as a legacy alias (auth.setup.ts predates the name).
export const API_BASE =
  process.env.E2E_API_URL ?? process.env.E2E_API_BASE ?? 'http://localhost:5000/api';

/** Generate a unique test user to avoid collisions between parallel runs. */
export function generateTestUser() {
  const id = Date.now().toString(36).slice(-6);
  return {
    name: `Test User ${id}`,
    username: `testuser_${id}`,
    email: `e2e_${id}@test.taskflow.app`,
    password: 'TestPass1!',
  };
}

/** Create a user via the API and return the full auth response (tokens + user). */
export async function createUserViaApi(user: { name: string; username: string; email: string; password: string }) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(`Failed to create user: ${res.status} ${JSON.stringify(body)}`);
  }
  const body = await res.json();
  // The server 403s every protected route for unverified users, so a freshly
  // registered API user cannot use the app until verified — flip the flag
  // directly in MongoDB, exactly like the `setup` project does for the
  // fixture user. Same database resolution (isolated memory URI first,
  // server/.env otherwise), so this never touches real user data by accident.
  await markEmailVerifiedViaDb(user.email);
  return body;
}

// client/ is ESM ("type": "module"), so __dirname is unavailable — derive it.
const HERE = path.dirname(fileURLToPath(import.meta.url));

const SERVER_PACKAGE_PATH = path.join(HERE, '..', '..', 'server', 'package.json');
const SERVER_ENV_PATH = path.join(HERE, '..', '..', 'server', '.env');

function resolveMongoUri(): string {
  const isolated = process.env.E2E_MONGO_URI;
  if (isolated !== undefined && isolated !== '') return isolated;
  if (!fs.existsSync(SERVER_ENV_PATH)) {
    throw new Error(
      `[helpers] server/.env not found at ${SERVER_ENV_PATH}. ` +
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
    throw new Error(`[helpers] MONGO_URI is missing or empty in ${SERVER_ENV_PATH}.`);
  }
  return uri;
}

/** Flip `emailVerified` for one user. Mongoose resolves via the server package (client/ cannot import it). */
async function markEmailVerifiedViaDb(email: string): Promise<void> {
  const serverRequire = createRequire(SERVER_PACKAGE_PATH);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongoose = serverRequire('mongoose') as typeof import('mongoose');
  await mongoose.connect(resolveMongoUri());
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('[helpers] no MongoDB database handle after connect.');
    await db.collection('users').updateOne({ email }, { $set: { emailVerified: true } });
  } finally {
    await mongoose.disconnect();
  }
}

/** Log in and return the auth response. */
export async function loginViaApi(identifier: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return res.json();
}

/** Verify an email via the API. */
export async function verifyEmailViaApi(token: string) {
  const res = await fetch(`${API_BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return res.json();
}

/** Request a password reset via the API. */
export async function forgotPasswordViaApi(email: string) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return res.json();
}

/** Reset a password via the API. */
export async function resetPasswordViaApi(token: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password: newPassword }),
  });
  return res.json();
}

/** Create a task for the authenticated user. */
export async function createTaskViaApi(accessToken: string, task: { title: string; description?: string; priority?: string; status?: string; dueDate?: string; category?: string; tags?: string[] }) {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(task),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(`Failed to create task: ${res.status} ${JSON.stringify(body)}`);
  }
  return res.json();
}

/** Get all tasks for the authenticated user. */
export async function getTasksViaApi(accessToken: string) {
  const res = await fetch(`${API_BASE}/tasks`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  return res.json();
}

/** Delete a task for the authenticated user. */
export async function deleteTaskViaApi(accessToken: string, taskId: string) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`);
  return res.json();
}

/**
 * Remove EVERY task the user owns (active + trash) so screenshot/route tests
 * start from identical state on every run. Active tasks are soft-deleted one
 * by one, then the trash is emptied in a single call.
 */
export async function clearAllTasksViaApi(accessToken: string): Promise<void> {
  const listRes = await fetch(`${API_BASE}/tasks?paginate=false`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Failed to list tasks: ${listRes.status}`);
  const list = await listRes.json();
  const active: Array<{ _id: string }> = Array.isArray(list) ? list : (list.data ?? []);
  for (const t of active) {
    await deleteTaskViaApi(accessToken, t._id);
  }
  const emptyRes = await fetch(`${API_BASE}/tasks/trash`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!emptyRes.ok) throw new Error(`Failed to empty trash: ${emptyRes.status}`);
}

/** Get the auth status (profile) for the user. */
export async function getProfileViaApi(accessToken: string) {
  const res = await fetch(`${API_BASE}/auth/profile`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get profile: ${res.status}`);
  return res.json();
}

/** Update user profile via the API. */
export async function updateProfileViaApi(accessToken: string, updates: Record<string, any>) {
  const res = await fetch(`${API_BASE}/auth/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(`Failed to update profile: ${res.status} ${JSON.stringify(body)}`);
  }
  return res.json();
}

/** Parse a verification token from an email. In the test environment, the API
 *  returns the verification token directly. For real email, you'd extract from
 *  the email link. */
export async function getVerificationToken(user: { email: string }) {
  // In the test environment, the verification token is generated by the server.
  // We need to fetch it from the user document indirectly.
  // For E2E tests, we use the resend-verification endpoint which returns the
  // verification info. In test mode, tokens are logged.
  return null; // Test-specific handling below
}

/**
 * Seed the browser with an authenticated session.
 *
 * The app is cookie-authenticated (httpOnly `accessToken`/`refreshToken` +
 * readable `tf_session` flag); it ignores tokens in localStorage on boot, so
 * the session must be installed as real cookies via `context.addCookies`.
 * Works before any navigation when given an explicit domain.
 *
 * localStorage tokens are STILL written for backward compatibility: existing
 * specs read them for direct API calls (the api client sends them as a Bearer
 * fallback), and the server keeps accepting them.
 *
 * The localStorage write goes through `addInitScript` (not `page.evaluate`):
 * a fresh page is still `about:blank`, whose opaque origin makes any direct
 * localStorage access throw `SecurityError` on current Chromium. The init
 * script runs before page scripts on the first real navigation instead.
 */
export async function setAuthInStorage(page: Page, auth: { accessToken: string; refreshToken: string; user: any }) {
  const context: BrowserContext = page.context();
  await context.addCookies([
    { name: 'accessToken', value: auth.accessToken, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
    { name: 'refreshToken', value: auth.refreshToken, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
    { name: 'tf_session', value: '1', domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' },
  ]);
  await context.addInitScript(({ accessToken, refreshToken, user }) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    // Set a flag that auth context can check on mount
    window.dispatchEvent(new Event('auth-storage-changed'));
  }, auth);
}

/** Clear auth: drop session cookies (the app's real session) + legacy localStorage tokens. */
export async function clearAuthInStorage(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('auth-storage-changed'));
  });
}

const CREDENTIALS_PATH = path.join(HERE, '.auth', 'credentials.json');

/**
 * Read the `setup` project's fixture credentials (email + password for the
 * verified user behind the shared storageState). Throws loudly when the
 * setup project has not run yet — never silently fall back.
 */
export function readFixtureCredentials(): { email: string; password: string } {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `[helpers] fixture credentials not found at ${CREDENTIALS_PATH}. ` +
        `The 'setup' project must run first (it writes storageState + credentials).`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')) as {
    email?: string;
    password?: string;
  };
  if (!parsed.email || !parsed.password) {
    throw new Error(`[helpers] malformed credentials at ${CREDENTIALS_PATH}. Re-run the 'setup' project.`);
  }
  return { email: parsed.email, password: parsed.password };
}

/**
 * Log the fixture user in via the API and return tokens. Prefers the token
 * pair the `setup` project persisted (same session the pages run in — zero
 * extra logins). Falls back to a password login only when tokens.json is
 * absent (e.g. a setup run predating it); note the fallback rotates the
 * server's single stored refresh token, so prefer fresh setups.
 */
export async function loginFixtureViaApi(): Promise<{ accessToken: string; refreshToken: string }> {
  const tokensPath = path.join(HERE, '.auth', 'tokens.json');
  if (fs.existsSync(tokensPath)) {
    const parsed = JSON.parse(fs.readFileSync(tokensPath, 'utf8')) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (parsed.accessToken && parsed.refreshToken) {
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
    }
  }
  const { email, password } = readFixtureCredentials();
  return loginViaApi(email, password);
}
