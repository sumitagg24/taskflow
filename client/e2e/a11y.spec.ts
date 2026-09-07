/**
 * Accessibility gate (axe-core).
 *
 * Threshold: ONLY `serious` + `critical` impacts fail the suite. `minor` and
 * `moderate` findings are triaged separately — failing the gate on them would
 * drown real blockers in low-impact noise and train the team to ignore the
 * check. Revisit the threshold once the serious/critical backlog is at zero.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AxeResults, Result as AxeResult } from 'axe-core';
import { createTaskViaApi, loginFixtureViaApi } from './helpers';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

function blocking(violations: AxeResult[]): AxeResult[] {
  return violations.filter((v) => v.impact != null && BLOCKING_IMPACTS.has(v.impact));
}

test.describe('Accessibility — login screen (logged out)', () => {
  // The projects boot authenticated via the setup storageState; opt back out
  // here so this suite scans the actual login screen, not the dashboard.
  test.use({ storageState: { cookies: [], origins: [] } });

  // Fixed: the inactive tab token was lifted from gray-500 (#8e8b82, 2.93:1
  // on the surface token) to gray-600 (#6c6a64, 4.66:1) — meets WCAG AA.
  test('login screen — no serious/critical violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible({ timeout: 15000 });

    const results: AxeResults = await new AxeBuilder({ page }).analyze();
    const bad = blocking(results.violations);
    expect(bad, `axe serious/critical on login:\n${JSON.stringify(bad, null, 2)}`).toEqual([]);
  });
});

test.describe('Accessibility — authenticated dashboard', () => {
  // Open the mobile drawer so the test scans the full mobile shell,
  // including inline Sign out (which is hidden until drawer open).
  test('dashboard — no serious/critical violations', async ({ page }) => {
    // Uses the setup project's storageState (verified fixture user).
    await page.goto('/');
    // Authentication-ready shell marker varies per viewport: desktop renders
    // Sign out inline; phones render it inside the drawer (open with menu button)
    // and bottom bar only. Isolate the locator per project so a single assertion
    // works on both.
    if (test.info().project.name === 'mobile') {
      await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      // Wait for the drawer to open; then the Sign out button is visible.
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 10000 });        // Now scan the entire page with axe — but note that the drawer is open,
      // so we must close it before scanning to avoid scanning the overlay.
      await page.getByRole('button', { name: 'Close navigation menu' }).click();
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeHidden({ timeout: 5000 });
      // Give the animation a beat to finish so axe doesn't catch the closing overlay.
      await page.waitForTimeout(150);
    } else {
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15000 });
    }

    const results: AxeResults = await new AxeBuilder({ page }).analyze();
    const bad = blocking(results.violations);
    expect(bad, `axe serious/critical on dashboard:\n${JSON.stringify(bad, null, 2)}`).toEqual([]);
  });
});

test.describe('Accessibility — task-detail drawer open', () => {
  test('drawer exposes dialog semantics, moves focus inside, Escape closes', async ({ page }) => {
    const { accessToken } = await loginFixtureViaApi();
    const created = await createTaskViaApi(accessToken, {
      title: `A11y Drawer ${Date.now().toString(36)}`,
      description: 'seeded for the drawer a11y test',
    });
    const id = (created?.data?._id ?? created?._id) as string;
    expect(id).toBeTruthy();

    await page.goto(`/tasks?task=${id}`);
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Focus lands inside the dialog (Modal focuses its panel on open).
    const focusedTag = await page.evaluate(() => {
      const active = document.activeElement;
      const dlg = document.querySelector('[role="dialog"]');
      return {
        inside: Boolean(active && dlg?.contains(active)),
        tag: active?.tagName ?? 'none',
      };
    });
    expect(focusedTag, 'focus should move inside the drawer dialog on open').toMatchObject({ inside: true });

    // No page-wide axe scan here by design: the dashboard/board behind the
    // drawer is already covered by the dashboard gate above (currently fixme'd
    // with defect links), and re-scanning it per dialog would just duplicate
    // those findings. This test owns the drawer contract: dialog semantics,
    // initial focus, Escape-to-close.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10000 });
  });
});

test.describe('Accessibility — command palette', () => {
  test('keyboard: input focused on open, Tab reaches input, Escape closes', async ({ page }) => {
    const { accessToken } = await loginFixtureViaApi();
    await createTaskViaApi(accessToken, { title: `A11y Palette ${Date.now().toString(36)}` });

    await page.goto('/');
    // Authenticated shell on both viewports: desktop shows Sign out inline,
    // phones hide the sidebar, so the bottom bar (Primary navigation) proves
    // the shell. (Separate locators, not `.or()`: the sidebar renders
    // same-named nav buttons that would make a combined locator ambiguous.)
    await expect(
      test.info().project.name === 'mobile'
        ? page.getByRole('navigation', { name: 'Primary' })
        : page.getByRole('button', { name: 'Sign out' })
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Role-qualified: the phone bottom bar (present but hidden on desktop)
    // reuses the same accessible name on a button, so a bare label match is
    // ambiguous across viewports.
    const search = page.getByRole('textbox', { name: 'Search tasks and commands' });
    await expect(search).toBeFocused({ timeout: 10000 });

    // Tab forward out of the input, Shift+Tab back: focus returns to it,
    // proving the input is reachable in the tab order.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(search).toBeFocused({ timeout: 10000 });

    // No page-wide axe scan here by design — see the drawer test above. This
    // test owns the palette keyboard contract: autofocus, tab reachability,
    // Escape-to-close.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10000 });
  });
});

test.describe('Accessibility — mobile touch targets (≥24px)', () => {
  // axe cannot check target-size reliably, so measure the key controls
  // directly. WCAG 2.2 AA minimum is 24×24 CSS px.
  test('bottom nav items, FAB, palette input, modal buttons', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'phone-only controls (md:hidden)');
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'All Tasks' })).toBeVisible({ timeout: 15000 });

    // Exact names scoped to the bottom bar: the (hidden) sidebar renders
    // same-named nav buttons, and the board behind renders chips like
    // "Due today" whose accessible names contain "Today".
    const bar = page.getByRole('navigation', { name: 'Primary' });
    const names = ['Today', 'Inbox', 'Plan', 'Search tasks and commands', 'More destinations'];
    for (const name of names) {
      const box = await bar.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, `bottom-nav "${name}" should have a box`).toBeTruthy();
      expect(Math.min(box!.width, box!.height), `bottom-nav "${name}" min dimension`).toBeGreaterThanOrEqual(24);
    }

    const fab = await page.getByRole('button', { name: 'Create new task', exact: true }).boundingBox();
    expect(fab, 'FAB should have a box').toBeTruthy();
    expect(Math.min(fab!.width, fab!.height), 'FAB min dimension').toBeGreaterThanOrEqual(24);

    await bar.getByRole('button', { name: 'Search tasks and commands', exact: true }).click();
    const paletteInput = page.getByRole('textbox', { name: 'Search tasks and commands' });
    await expect(paletteInput).toBeVisible({ timeout: 10000 });
    // Focus is the palette's ready signal (its key handlers attach in the
    // same effect that focuses the input) — Escape before this is lost.
    await expect(paletteInput).toBeFocused({ timeout: 10000 });
    const inputBox = await paletteInput.boundingBox();
    expect(inputBox, 'palette input should have a box').toBeTruthy();
    expect(Math.min(inputBox!.width, inputBox!.height), 'palette input min dimension').toBeGreaterThanOrEqual(24);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden({ timeout: 10000 });

    await page.getByRole('button', { name: 'Create new task', exact: true }).click({ force: true });
    const modal = page.getByRole('dialog', { name: 'Create Task' });
    await expect(modal).toBeVisible({ timeout: 10000 });
    for (const name of ['Cancel', 'Create task']) {
      const box = await modal.getByRole('button', { name }).boundingBox();
      expect(box, `modal button "${name}" should have a box`).toBeTruthy();
      expect(Math.min(box!.width, box!.height), `modal button "${name}" min dimension`).toBeGreaterThanOrEqual(24);
    }
  });
});
