/**
 * Proves the `setup` fixture: the storageState user is already authenticated.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  test('can log out and back in via UI', async ({ page }) => {
    const { email, password } = readFixtureCredentials();

    await page.goto('/');
    await expect(inApp(page)).toBeVisible({ timeout: 15000 });

    await signOutViaUi(page);
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible({ timeout: 10000 });

    await page.getByLabel('Email or username').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    // Capture the login response: its body carries the fresh token pair.
    const loginResponse = page.waitForResponse(
      (res) => res.url().endsWith('/api/auth/login') && res.ok()
    );
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const response = await loginResponse;
    const loginBody = (await response.json().catch(() => null)) as {
      accessToken?: string;
      refreshToken?: string;
    } | null;

    await expect(inApp(page)).toBeVisible({ timeout: 15000 });

    // Self-healing fixture: the UI logout above denylisted the SHARED session
    // (server-side token denylist), which would 401 every test running after
    // this one. Persist the just-minted pair + cookies so the fixture files
    // describe a live session again for all later tests in the run.
    const accessToken = loginBody?.accessToken;
    const refreshToken = loginBody?.refreshToken;
    expect(accessToken, 'UI login should return an access token').toBeTruthy();
    expect(refreshToken, 'UI login should return a refresh token').toBeTruthy();
    fs.writeFileSync(TOKENS_PATH, JSON.stringify({ accessToken, refreshToken }));
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  });
});
