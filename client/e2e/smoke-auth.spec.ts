/**
 * Proves the `setup` fixture: the storageState user is already authenticated.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE } from './helpers';

// client/ is ESM ("type": "module"), so __dirname is unavailable — derive it.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(HERE, '.auth');
const CREDENTIALS_PATH = path.join(AUTH_DIR, 'credentials.json');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'user.json');
const TOKENS_PATH = path.join(AUTH_DIR, 'tokens.json');

function readFixtureCredentials(): { email: string; password: string } {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `[smoke-auth] fixture credentials not found at ${CREDENTIALS_PATH}. ` +
        `The 'setup' project must run first (it writes storageState + credentials).`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')) as {
    email?: string;
    password?: string;
  };
  if (!parsed.email || !parsed.password) {
    throw new Error(`[smoke-auth] malformed credentials at ${CREDENTIALS_PATH}. Re-run the 'setup' project.`);
  }
  return { email: parsed.email, password: parsed.password };
}

test.describe('Auth fixture (setup storageState)', () => {
  // Authenticated-shell marker per viewport. Desktop shows an (icon-only)
  // Sign out in the sidebar; phones hide the sidebar, so the bottom bar
  // (Primary navigation) proves the shell. Kept separate — never `.or()`d —
  // because the sidebar also renders same-named nav buttons, which would
  // make a combined locator resolve to 2+ elements (strict violation).
  const inApp = (page: Page) =>
    test.info().project.name === 'mobile'
      ? page.getByRole('navigation', { name: 'Primary' })
      : page.getByRole('button', { name: 'Sign out' });

  async function signOutViaUi(page: Page): Promise<void> {
    const direct = page.getByRole('button', { name: 'Sign out' });
    if (await direct.isVisible().catch(() => false)) {
      await direct.click();
      return;
    }
    // Phone layout: the sidebar (and its Sign out) hides behind the menu button.
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(direct).toBeVisible({ timeout: 5000 });
    await direct.click();
  }

  test('setup user lands directly in app — no login redirect', async ({ page }) => {
    await page.goto('/');
    // Authenticated shell, not the auth page.
    await expect(inApp(page)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveCount(0);
  });

  test('can log out and back in via UI', async ({ page, request }) => {
    const { email, password } = readFixtureCredentials();

    await page.goto('/');
    await expect(inApp(page)).toBeVisible({ timeout: 15000 });

    await signOutViaUi(page);
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible({ timeout: 10000 });

    await page.getByLabel('Email or username').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    // Capture the login response: the BROWSER body must carry NO tokens —
    // auth is cookie-only for browsers (the raw pair would be XSS-readable).
    const loginResponse = page.waitForResponse(
      (res) => res.url().endsWith('/api/auth/login') && res.ok()
    );
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const response = await loginResponse;
    const loginBody = (await response.json().catch(() => null)) as {
      accessToken?: string;
      refreshToken?: string;
      user?: unknown;
    } | null;

    await expect(inApp(page)).toBeVisible({ timeout: 15000 });

    // Security contract: browser login responses expose no token material.
    expect(loginBody?.accessToken, 'browser login must not return accessToken').toBeUndefined();
    expect(loginBody?.refreshToken, 'browser login must not return refreshToken').toBeUndefined();
    expect(loginBody?.user, 'browser login should return the session user').toBeTruthy();

    // Self-healing fixture: the UI logout above denylisted the SHARED session
    // (server-side token denylist), which would 401 every test running after
    // this one. Mint a fresh pair through the documented non-browser path
    // (no Sec-Fetch-Site on Playwright's isolated request context = API
    // client) and persist it so tokens.json describes a live session.
    // NOTE: `request` (not page.request) — a cookie-less context. A cookie-
    // bearing POST without Origin would rightly trip the CSRF middleware.
    const apiLogin = await request.post(`${API_BASE}/auth/login?tokenResponse=bearer`, {
      data: { identifier: email, password },
    });
    expect(apiLogin.ok(), 'non-browser token login should succeed').toBeTruthy();
    const apiBody = (await apiLogin.json()) as { accessToken?: string; refreshToken?: string };
    expect(apiBody.accessToken, 'API-client login should return an access token').toBeTruthy();
    expect(apiBody.refreshToken, 'API-client login should return a refresh token').toBeTruthy();
    fs.writeFileSync(TOKENS_PATH, JSON.stringify({ accessToken: apiBody.accessToken, refreshToken: apiBody.refreshToken }));
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  });
});
