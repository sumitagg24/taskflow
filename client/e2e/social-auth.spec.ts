/**
 * Social sign-in row — Auth0 (single button).
 *
 * What renders is the intersection of two truths: the server's configured
 * providers (`GET /api/auth/providers`) and the client's VITE_AUTH0_* env
 * (the browser needs both to open the popup). Google and other social
 * providers are delivered through Auth0's Universal Login, not per-provider
 * UI, so the row is exactly one button when enabled and nothing otherwise.
 *
 * Assertions go through accessible names; the suite proves a configured
 * provider stays mounted and wired — it does not demand a real tenant.
 */
import { test, expect, type Page } from '@playwright/test';

type Mode = 'login' | 'register';

async function readAuth0Enabled(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/auth/providers');
  expect(res.ok(), `GET /api/auth/providers answered ${res.status()} — is the API up?`).toBe(true);
  const body = await res.json();
  return Boolean(body?.auth0);
}

/** Land on the auth page, waiting for the mode switch rather than sleeping. */
async function openAuth(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
}

/** Switching mode re-keys AuthPage's motion.div, so the row fully remounts. */
async function switchTo(page: Page, mode: Mode) {
  const tab = page.getByRole('tab', { name: mode === 'register' ? 'Sign up' : 'Sign in' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

const socialButton = (page: Page, mode: Mode = 'login') =>
  page.getByRole('button', {
    name: `${mode === 'register' ? 'Sign up' : 'Continue'} with Auth0`,
  });

test.describe('Social sign-in row', () => {
  // Every test here asserts on the logged-OUT auth page, which never renders
  // under the `setup` fixture session — opt out to a clean session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('renders the Auth0 button exactly when the server has it configured', async ({ page }) => {
    const auth0Enabled = await readAuth0Enabled(page);
    await openAuth(page);

    if (auth0Enabled) {
      await expect(socialButton(page)).toBeVisible();
    } else {
      await expect(socialButton(page)).toHaveCount(0);
    }
  });

  test('the Auth0 button re-labels with the mode and survives switches', async ({ page }) => {
    const auth0Enabled = await readAuth0Enabled(page);
    test.skip(!auth0Enabled, 'Auth0 is not configured on this server');

    await openAuth(page);

    for (let i = 1; i <= 20; i += 1) {
      const mode: Mode = i % 2 === 1 ? 'register' : 'login';
      await switchTo(page, mode);
      await expect(socialButton(page, mode), `switch ${i}/20`).toBeVisible();
    }
  });

  test('the auth page loads with no uncaught errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await openAuth(page);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    expect(pageErrors, 'uncaught exceptions on the auth page').toEqual([]);
  });

  test('the Auth0 button opens the popup handshake against the right client', async ({ page }) => {
    const auth0Enabled = await readAuth0Enabled(page);
    test.skip(!auth0Enabled, 'Auth0 is not configured on this server');

    const domain = process.env.VITE_AUTH0_DOMAIN;
    test.skip(
      !domain,
      'VITE_AUTH0_DOMAIN unknown to the test runner — run via the dev server env'
    );

    await openAuth(page);

    // Intercept the popup's authorize navigation instead of leaving the app:
    // proves the SPA → Auth0 handshake with the configured client.
    let authorizeUrl: URL | null = null;
    await page.context().route(`https://${domain}/authorize**`, (route) => {
      authorizeUrl = new URL(route.request().url());
      return route.fulfill({ status: 200, body: 'intercepted' });
    });

    await socialButton(page).click();
    await expect
      .poll(() => authorizeUrl !== null, { timeout: 15_000 })
      .toBeTruthy();

    const u = authorizeUrl as unknown as URL;
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:3000');
  });
});
