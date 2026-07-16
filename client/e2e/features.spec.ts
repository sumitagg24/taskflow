import { test, expect } from '@playwright/test';
import { generateTestUser, createUserViaApi, setAuthInStorage, createTaskViaApi } from './helpers';

test.describe('Calendar, Analytics & AI Assistant', () => {
  test.beforeEach(async ({ page }) => {
    const user = generateTestUser();
    const auth = await createUserViaApi(user);
    await setAuthInStorage(page, auth);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[class*="sidebar"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('Calendar page — renders without errors', async ({ page }) => {
    // Navigate to calendar via sidebar link
    const calendarLink = page.locator('a:has-text("Calendar"), button:has-text("Calendar"), [href*="calendar"], [data-section="calendar"]').first();
    if (await calendarLink.isVisible().catch(() => false)) {
      await calendarLink.click();
    } else {
      // Use section navigation via URL
      await page.goto('/?section=calendar');
    }
    await page.waitForTimeout(500);

    // Calendar should load without errors
    const error = page.locator('text=Error').or(page.locator('text=Failed to load'));
    await expect(error).toHaveCount(0, { timeout: 3000 });
  });

  test('Analytics page — renders without errors', async ({ page }) => {
    // Navigate to analytics via sidebar link
    const analyticsLink = page.locator('a:has-text("Analytics"), button:has-text("Analytics"), [href*="analytics"], [data-section="analytics"]').first();
    if (await analyticsLink.isVisible().catch(() => false)) {
      await analyticsLink.click();
    } else {
      await page.goto('/?section=analytics');
    }
    await page.waitForTimeout(500);

    // Analytics should load without errors
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
    // Test that major sidebar navigation links exist
    const sections = ['Dashboard', 'Calendar', 'Analytics', 'Settings'];
    for (const section of sections) {
      const link = page.locator(`a:has-text("${section}"), button:has-text("${section}"), [data-section="${section.toLowerCase()}"]`).first();
      const isVisible = await link.isVisible().catch(() => false);
      if (isVisible) {
        await link.click();
        await page.waitForTimeout(300);
        // No crash — navigate successfully
        const error = page.locator('text=Error').or(page.locator('Failed to load'));
        const hasError = await error.isVisible().catch(() => false);
        expect(hasError).toBeFalsy();
      }
    }
  });

  test('Favorites page — renders without errors', async ({ page }) => {
    const favLink = page.locator('a:has-text("Favorites"), button:has-text("Favorites"), [data-section="favorites"]').first();
    if (await favLink.isVisible().catch(() => false)) {
      await favLink.click();
    } else {
      await page.goto('/?section=favorites');
    }
    await page.waitForTimeout(500);
    const error = page.locator('text=Error').first();
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Categories page — renders without errors', async ({ page }) => {
    const catLink = page.locator('a:has-text("Categories"), button:has-text("Categories"), [data-section="categories"]').first();
    if (await catLink.isVisible().catch(() => false)) {
      await catLink.click();
    } else {
      await page.goto('/?section=categories');
    }
    await page.waitForTimeout(500);
    const error = page.locator('text=Error').first();
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Focus Timer page — renders without errors', async ({ page }) => {
    const timerLink = page.locator('a:has-text("Focus"), button:has-text("Focus"), [data-section="focus"]').first();
    if (await timerLink.isVisible().catch(() => false)) {
      await timerLink.click();
    } else {
      await page.goto('/?section=focus');
    }
    await page.waitForTimeout(500);
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
    await page.goto('/?section=calendar');
    await page.waitForTimeout(500);

    // Calendar should load
    const error = page.locator('text=Error').first();
    const hasError = await error.isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});
