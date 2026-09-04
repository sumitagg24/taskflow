/**
 * Social sign-in row — Google (GSI) and GitHub.
 *
 * What renders is the intersection of two truths: the providers the server has
 * configured (`GET /api/auth/providers`) and, for Google, a client that both
 * holds `VITE_GOOGLE_CLIENT_ID` and managed to initialise the GSI SDK. Each
 * test therefore resolves what *should* be on screen before asserting on it and
 * skips when a provider is switched off here — the suite proves a configured
 * provider stays mounted and wired, it does not demand credentials.
 *
 * Assertions go through accessible names ("Continue with Google") rather than
 * Google's rendered widget: the row is our own markup driving
 * `useGoogleAuth().signIn()`, because GSI's `renderButton` refuses to shrink
 * below ~200px and would break the 2-up grid.
 */
import { test, expect, type Page } from '@playwright/test';

type Providers = { google: boolean; github: boolean };
type Mode = 'login' | 'register';

async function readProviders(page: Page): Promise<Providers> {
  const res = await page.request.get('/api/auth/providers');
  expect(res.ok(), `GET /api/auth/providers answered ${res.status()} — is the API up?`).toBe(true);
  const body = await res.json();
  return { google: Boolean(body?.google), github: Boolean(body?.github) };
}

/** Land on the auth page, waiting for the mode switch rather than sleeping. */
async function openAuth(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
}

/** True once the GSI script has loaded and `initialize()` has run. */
function sdkReady(page: Page) {
  return page.evaluate(() => {
    const gsi = (window as unknown as { google?: { accounts?: { id?: unknown } } }).google;
    return Boolean(gsi?.accounts?.id);
  });
}

/** Switching mode re-keys AuthPage's motion.div, so the row fully remounts. */
async function switchTo(page: Page, mode: Mode) {
  const tab = page.getByRole('tab', { name: mode === 'register' ? 'Sign up' : 'Sign in' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

const socialButton = (page: Page, provider: 'Google' | 'GitHub', mode: Mode = 'login') =>
  page.getByRole('button', {
    name: `${mode === 'register' ? 'Sign up' : 'Continue'} with ${provider}`,
  });

test.describe('Social sign-in row', () => {
  test('renders exactly the providers the server has configured', async ({ page }) => {
    const providers = await readProviders(page);
    await openAuth(page);

    if (providers.github) {
      await expect(socialButton(page, 'GitHub')).toBeVisible();
    } else {
      await expect(socialButton(page, 'GitHub')).toHaveCount(0);
    }

    if (!providers.google) {
      // No server-side client ID means the popup could never open, so the
      // button must not be offered at all.
      await expect(socialButton(page, 'Google')).toHaveCount(0);
    } else if (await sdkReady(page)) {
      await expect(socialButton(page, 'Google')).toBeVisible();
    }
  });

  test('the Google button survives ten consecutive reloads', async ({ page }) => {
    const providers = await readProviders(page);
    test.skip(!providers.google, 'GOOGLE_CLIENT_ID is not configured on the server');

    await openAuth(page);
    test.skip(!(await sdkReady(page)), 'the GSI SDK did not load in this environment');

    for (let i = 1; i <= 10; i += 1) {
      await page.reload();
      // Enabled, not merely present: the button stays disabled until
      // useGoogleAuth reports `ready`.
      await expect(socialButton(page, 'Google'), `reload ${i}/10`).toBeEnabled();
    }
  });

  test('both buttons survive twenty mode switches and re-label with the mode', async ({ page }) => {
    const providers = await readProviders(page);
    test.skip(!providers.github, 'GitHub OAuth is not configured on the server');

    await openAuth(page);
    const googleShown = providers.google && (await sdkReady(page));

    for (let i = 1; i <= 20; i += 1) {
      const mode: Mode = i % 2 === 1 ? 'register' : 'login';
      await switchTo(page, mode);
      await expect(socialButton(page, 'GitHub', mode), `switch ${i}/20`).toBeVisible();
      if (googleShown) {
        await expect(socialButton(page, 'Google', mode), `switch ${i}/20`).toBeVisible();
      }
    }
  });

  test('the GSI client script is injected exactly once, however often the row remounts', async ({
    page,
  }) => {
    const providers = await readProviders(page);
    test.skip(!providers.google, 'GOOGLE_CLIENT_ID is not configured on the server');

    await openAuth(page);
    test.skip(!(await sdkReady(page)), 'the GSI SDK did not load in this environment');

    // Every remount runs useGoogleAuth's effect; its module-level promises are
    // what keep that from re-loading the SDK.
    for (const mode of ['register', 'login', 'register', 'login'] as const) {
      await switchTo(page, mode);
    }
    await expect(socialButton(page, 'Google')).toBeVisible();

    const bySrc = await page.evaluate(() => {
      const counts: Record<string, number> = {};
      document.querySelectorAll('script[src*="accounts.google.com"]').forEach((s) => {
        const src = s.getAttribute('src') ?? '';
        if (src) counts[src] = (counts[src] ?? 0) + 1;
      });
      return counts;
    });

    const duplicated = Object.entries(bySrc).filter(([, count]) => count > 1);
    expect(duplicated, 'the same GSI script was appended more than once').toEqual([]);
  });

  test('the auth page loads with no uncaught errors and no Google fallback notice', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const providers = await readProviders(page);
    await openAuth(page);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    expect(pageErrors, 'uncaught exceptions on the auth page').toEqual([]);

    // useGoogleAuth surfaces a hard SDK failure through this copy, so with the
    // SDK up it must not appear.
    if (providers.google && (await sdkReady(page))) {
      await expect(page.getByText('Google sign-in is unavailable right now')).toHaveCount(0);
    }
  });

  test('the GitHub button hands off to the server-side authorize route', async ({ page }) => {
    const providers = await readProviders(page);
    test.skip(!providers.github, 'GitHub OAuth is not configured on the server');

    await openAuth(page);

    // A full-page handoff, not a fetch: the server holds the client secret and
    // sets the CSRF state cookie. Intercept it rather than following GitHub's
    // redirect out of the app.
    const handoff = page.waitForRequest((req) => new URL(req.url()).pathname === '/api/auth/github');
    await page.route('**/api/auth/github', (route) => route.abort());

    await socialButton(page, 'GitHub').click();
    expect(new URL((await handoff).url()).pathname).toBe('/api/auth/github');

    // The row locks while the redirect is in flight so a second click cannot
    // start a competing exchange.
    await expect(socialButton(page, 'GitHub')).toBeDisabled();
  });
});
