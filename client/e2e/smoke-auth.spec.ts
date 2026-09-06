/**
 * Proves the `setup` fixture: the storageState user is already authenticated.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// client/ is ESM ("type": "module"), so __dirname is unavailable — derive it.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(HERE, '.auth', 'credentials.json');

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
  test('setup user lands directly in app — no login redirect', async ({ page }) => {
    await page.goto('/');
    // Authenticated shell, not the auth page.
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveCount(0);
  });

  test('can log out and back in via UI', async ({ page }) => {
    const { email, password } = readFixtureCredentials();

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible({ timeout: 10000 });

    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15000 });
  });
});
