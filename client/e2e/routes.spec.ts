/**
 * Router E2E — the typed URL router (react-router migration).
 *
 * Runs on BOTH the desktop (chromium) and mobile projects via the `setup`
 * storageState (verified fixture user). Seeding goes through the API as the
 * SAME user: the page keeps its fixture cookies while `loginFixtureViaApi`
 * mints a token for test-side setup.
 *
 * Assertions stick to visible text/roles and URL shape — never component or
 * state internals. Distinctive headings were read off the page components:
 * TasksRoute LIST_TITLES plus each page's own <h2>.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTaskViaApi, loginFixtureViaApi } from './helpers';

interface RouteCase {
  path: string;
  heading: string;
}

const ROUTES: RouteCase[] = [
  { path: '/tasks', heading: 'All Tasks' },
  { path: '/calendar', heading: 'Calendar' },
  { path: '/insights', heading: 'Insights' },
  { path: '/settings', heading: 'Settings' },
  { path: '/team', heading: 'Invite & grow' },
  { path: '/trash', heading: 'Trash' },
  { path: '/templates', heading: 'Templates' },
  { path: '/notifications', heading: 'Notifications' },
];

async function expectRoute(page: Page, path: string, heading: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15000 });
  expect(new URL(page.url()).pathname).toBe(path);
}

test.describe('Router — direct navigation renders the right view', () => {
  for (const { path, heading } of ROUTES) {
    test(`${path} shows ${heading}`, async ({ page }) => {
      await expectRoute(page, path, heading);
    });
  }
});

test.describe('Router — redirects and fallbacks', () => {
  test('/tasks/bogus lands on All Tasks', async ({ page }) => {
    await page.goto('/tasks/bogus');
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe('/tasks');
  });

  test('/analytics redirects to /insights', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/insights/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Insights' }).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Router — ?task=<id> deep link opens the detail drawer', () => {
  const TITLE = 'Deep-link drawer target';

  async function seedTask(): Promise<{ id: string; title: string }> {
    const { accessToken } = await loginFixtureViaApi();
    const title = `${TITLE} ${Date.now().toString(36)}`;
    const created = await createTaskViaApi(accessToken, {
      title,
      description: 'seeded for the deep-link test',
    });
    const id = (created?.data?._id ?? created?._id ?? created?.id) as string | undefined;
    expect(id, 'API should return the created task id').toBeTruthy();
    return { id: id as string, title };
  }

  test('deep link opens the drawer with the task title; closing returns to the list route', async ({ page }) => {
    const { id, title } = await seedTask();
    await page.goto(`/tasks?task=${id}`);

    // Drawer opens keyed by the ?task= param; its dialog is named for the task.
    const dialog = page.getByRole('dialog', { name: title }).first();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Closing drops the param (replace navigation) and keeps the list route.
    await page.getByRole('button', { name: 'Close dialog' }).first().click();
    await expect(page).toHaveURL((url) => !url.searchParams.has('task'), { timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe('/tasks');
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 15000 });
  });

  test('reload on a deep route keeps the drawer open', async ({ page }) => {
    const { id, title } = await seedTask();
    await page.goto(`/tasks?task=${id}`);
    await expect(page.getByRole('dialog', { name: title }).first()).toBeVisible({ timeout: 15000 });

    await page.reload();
    await expect(page.getByRole('dialog', { name: title }).first()).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).searchParams.get('task')).toBe(id);
  });

  test('Back button returns to the previous view', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 15000 });
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: 'Calendar' }).first()).toBeVisible({ timeout: 15000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/tasks/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 15000 });
  });
});
