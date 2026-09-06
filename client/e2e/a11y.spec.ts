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

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

function blocking(violations: AxeResult[]): AxeResult[] {
  return violations.filter((v) => v.impact != null && BLOCKING_IMPACTS.has(v.impact));
}

test.describe('Accessibility — login screen (logged out)', () => {
  // The projects boot authenticated via the setup storageState; opt back out
  // here so this suite scans the actual login screen, not the dashboard.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login screen — no serious/critical violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible({ timeout: 15000 });

    const results: AxeResults = await new AxeBuilder({ page }).analyze();
    const bad = blocking(results.violations);
    expect(bad, `axe serious/critical on login:\n${JSON.stringify(bad, null, 2)}`).toEqual([]);
  });
});

test.describe('Accessibility — authenticated dashboard', () => {
  test('dashboard — no serious/critical violations', async ({ page }) => {
    // Uses the setup project's storageState (verified fixture user).
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15000 });

    const results: AxeResults = await new AxeBuilder({ page }).analyze();
    const bad = blocking(results.violations);
    expect(bad, `axe serious/critical on dashboard:\n${JSON.stringify(bad, null, 2)}`).toEqual([]);
  });
});
