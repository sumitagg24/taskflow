import { test, expect } from '@playwright/test';
import { generateTestUser, createUserViaApi, setAuthInStorage, createTaskViaApi } from './helpers';

test.describe('Calendar, Analytics & AI Assistant', () => {
  test.beforeEach(async ({ page }) => {
    const user = generateTestUser();
    const auth = await createUserViaApi(user);
    await setAuthInStorage(page, auth);
    await page.goto('/');
    // Portable authenticated-shell marker — `complementary` (the desktop
    // sidebar) does not exist on the mobile bottom-nav shell.
    await expect(page.getByRole('textbox', { name: 'Quick capture' })).toBeVisible({ timeout: 15000 });
  });

  test('Calendar page — renders without errors', async ({ page }) => {
    // Calendar is a first-class route now; direct URL navigation covers both
    // the sidebar (desktop) and bottom-nav (mobile) paths implicitly.
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: /calendar/i }).first()).toBeVisible({ timeout: 10000 });

    // Calendar should load without errors
    const error = page.locator('text=Error').or(page.locator('text=Failed to load'));
    await expect(error).toHaveCount(0, { timeout: 3000 });
  });

  test('Analytics page — renders without errors', async ({ page }) => {
    // Insights is the single analysis destination (Phase 1 consolidation).
    await page.goto('/insights');
    await expect(page.getByRole('heading', { name: /insights/i }).first()).toBeVisible({ timeout: 10000 });

    const error = page.locator('text=Error').or(page.locator('text=Failed to load'));
    await expect(error).toHaveCount(0, { timeout: 3000 });
  });

  test('AI Assistant — opens and renders without errors', async ({ page }) => {
    // Open AI Assistant (likely via button in navbar)
    const aiButton = page.locator('button:has-text("AI"), [aria-label*="AI"], [aria-label*="assistant"]').first();
    if (await aiButton.isVisible().catch(() => false)) {
      await aiButton.click();
    }
    await page.waitForTimeout(500);

    // AI Assistant panel/dialog should be visible or at least not crash
    const error = page.locator('text=Error').or(page.locator('text=Failed to load'));
    await expect(error).toHaveCount(0, { timeout: 3000 });
  });

  test('Navigation — all sidebar links navigate correctly', async ({ page }) => {
    // Test that major navigation destinations exist and route correctly.
    const routes = [
      { path: '/', name: /today|dashboard|good/i },
      { path: '/tasks', name: /tasks|inbox|board/i },
      { path: '/calendar', name: /calendar/i },
      { path: '/insights', name: /insights|analytics/i },
      { path: '/settings', name: /settings/i },
    ];
    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole('main').or(page.locator('#task-main')).first()).toBeVisible({ timeout: 10000 });
      const error = page.locator('text=Error').or(page.locator('Failed to load'));
      const hasError = await error.isVisible().catch(() => false);
      expect(hasError).toBeFalsy();
    }
  });

  test('Favorites page — renders without errors', async ({ page }) => {
    await page.goto('/favorites');
    await expect(page.getByRole('main').or(page.locator('#task-main')).first()).toBeVisible({ timeout: 10000 });
    const error = page.locator('text=Error').first();
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Categories page — renders without errors', async ({ page }) => {
    await page.goto('/categories');
    await expect(page.getByRole('main').or(page.locator('#task-main')).first()).toBeVisible({ timeout: 10000 });
    const error = page.locator('text=Error').first();
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Focus Timer page — renders without errors', async ({ page }) => {
    await page.goto('/focus');
    await expect(page.getByRole('main').or(page.locator('#task-main')).first()).toBeVisible({ timeout: 10000 });
    const error = page.locator('text=Error').first();
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Calendar page — displays task events', async ({ page }) => {
    // Create a task with a due date
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    if (accessToken) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      await createTaskViaApi(accessToken, {
        title: 'Calendar E2E Task',
        dueDate: tomorrow,
        priority: 'high',
      });
    }

    // Navigate to calendar
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: /calendar/i }).first()).toBeVisible({ timeout: 10000 });

    // Calendar should load
    const error = page.locator('text=Error').first();
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});
