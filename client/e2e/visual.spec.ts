/**
 * Snapshot regression — one pinned screenshot per primary view, desktop
 * (chromium) + mobile projects.
 *
 * Determinism strategy:
 * - Frozen clock (2026-09-05T12:00:00, near the real today so server-side
 *   relative times agree) installed via addInitScript before any app code runs.
 * - beforeEach wipes the fixture user's tasks (active + trash) and seeds the
 *   same 5 fixed tasks, so every run starts from identical state no matter how
 *   often the suite re-runs or in what order tests execute.
 * - `animations: 'disabled'` + heading-gated waits (lazy chunks settled) so
 *   shots never catch skeletons mid-shimmer.
 * - No `mask` except one documented case: the team page's invite link embeds
 *   the fixture user's random referral code (`?ref=<code>`), masked inline.
 *   If another screen starts showing nondeterministic data (ids, live quotes),
 *   prefer a `mask` on the offending locator over deleting the shot.
 *
 * Baselines live in e2e/__snapshots__/ (`<name>-chromium.png`,
 * `<name>-mobile.png` — the `-<project>` suffix comes free from the
 * snapshotPathTemplate in playwright.config.ts). Regenerate deliberately:
 *   npm run test:e2e:isolated:snapshots --prefix client
 * which runs `node e2e/run-isolated.cjs visual --update-snapshots`.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { clearAllTasksViaApi, createTaskViaApi, getTasksViaApi, loginFixtureViaApi } from './helpers';

const FROZEN_ISO = '2026-09-05T12:00:00';

// Fixed seed, dates relative to the frozen clock: today / tomorrow / overdue /
// undated / completed. Titles are stable so committed baselines stay valid.
const SEED_TASKS = [
  { title: 'Visual Alpha — due today', priority: 'high', status: 'in-progress', dueDate: '2026-09-05' },
  { title: 'Visual Beta — due tomorrow', priority: 'medium', status: 'pending', dueDate: '2026-09-06' },
  { title: 'Visual Gamma — overdue', priority: 'critical', status: 'pending', dueDate: '2026-09-03' },
  { title: 'Visual Delta — no date', priority: 'low', status: 'backlog' },
  { title: 'Visual Epsilon — done', priority: 'medium', status: 'completed', dueDate: '2026-09-04' },
] as const;

test.beforeEach(async ({ page }) => {
  // Freeze time before the app boots: no-arg `new Date()` / Date.now() pin to
  // the fixed instant; explicit-arg constructions behave normally.
  await page.addInitScript((frozen: string) => {
    const Fixed = new Date(frozen);
    const Real = Date;
    (window as unknown as { Date: unknown }).Date = class extends Real {
      constructor(...args: never[]) {
        super(...((args.length > 0 ? args : [Fixed.getTime()]) as []));
      }
      static now(): number {
        return Fixed.getTime();
      }
    };
  }, FROZEN_ISO);

  const { accessToken } = await loginFixtureViaApi();
  await clearAllTasksViaApi(accessToken);
  for (const t of SEED_TASKS) {
    await createTaskViaApi(accessToken, { ...t });
  }
});

async function shoot(page: Page, name: string, mask: Locator[] = []): Promise<void> {
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false, animations: 'disabled', mask });
}

test.describe('Visual — desktop + mobile views', () => {
  test('dashboard', async ({ page }) => {
    await page.goto('/');
    // Hero greeting + quick-capture prove the dashboard settled past skeletons.
    await expect(page.getByText('Quick capture')).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await shoot(page, 'dashboard');
  });

  test('task board', async ({ page }) => {
    await page.goto('/tasks');
    // Two "All Tasks" headings render (navbar h1 + page h2) — either proves
    // the board settled.
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await shoot(page, 'board');
  });

  test('calendar', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await shoot(page, 'calendar');
  });

  test('insights', async ({ page }) => {
    await page.goto('/insights');
    await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await shoot(page, 'insights');
  });

  test('settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await shoot(page, 'settings');
  });

  test('team', async ({ page }) => {
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: 'Invite & grow' })).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    // Mask: the invite link embeds the user's random referral code
    // (`?ref=<code>`, fresh per fixture user), so it can never match a
    // committed baseline. Everything else on the page is seeded/fixed.
    await shoot(page, 'team', [page.getByText(/\?ref=/)]);
  });

  test('task-detail drawer open', async ({ page }) => {
    const { accessToken } = await loginFixtureViaApi();
    const body = await getTasksViaApi(accessToken);
    const tasks: Array<{ _id: string; title: string }> = Array.isArray(body) ? body : (body.data ?? []);
    const target = tasks.find((t) => t.title.startsWith('Visual Alpha'));
    expect(target, 'seeded Visual Alpha task should exist').toBeTruthy();
    await page.goto(`/tasks?task=${(target as { _id: string })._id}`);
    await expect(page.getByRole('dialog', { name: 'Visual Alpha — due today' })).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await shoot(page, 'drawer');
  });

  test('mobile nav — bottom bar visible', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'bottom bar is phone-only (md:hidden)');
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 10000 });
    // Open the More sheet so this baseline is distinct from the plain board
    // shot — the sheet is part of the phone navigation (extra destinations).
    await page.getByRole('button', { name: 'More destinations', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'More destinations' })).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await shoot(page, 'mobile-nav');
  });

  test('mobile capture — New Task modal via FAB', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'FAB is phone-only (md:hidden)');
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Create new task', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Create Task' })).toBeVisible({ timeout: 15000 });
    await shoot(page, 'mobile-capture');
  });
});
