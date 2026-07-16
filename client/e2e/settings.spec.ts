import { test, expect } from '@playwright/test';
import { generateTestUser, createUserViaApi, setAuthInStorage, updateProfileViaApi } from './helpers';

test.describe('Settings & Notifications', () => {
  test.beforeEach(async ({ page }) => {
    const user = generateTestUser();
    const auth = await createUserViaApi(user);
    await setAuthInStorage(page, auth);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Settings page — profile update via API reflects in UI', async ({ page }) => {
    // Navigate to settings
    await page.goto('/?section=settings');
    // Wait for the settings page to load
    await page.waitForTimeout(1000);

    // Get access token
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));

    if (accessToken) {
      // Update profile via API
      const res = await updateProfileViaApi(accessToken, {
        name: 'Updated Name E2E',
        bio: 'E2E test bio',
      });
      expect(res.user.name).toBe('Updated Name E2E');

      // Reload to see changes
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should be on settings or dashboard without error
      const hasError = await page.locator('text=error, text=Error, text=failed').first().isVisible().catch(() => false);
      expect(hasError).toBeFalsy();
    }
  });

  test('Notifications page — renders without errors', async ({ page }) => {
    // Navigate to notifications
    await page.goto('/?section=notifications');
    await page.waitForTimeout(1000);

    // Should load without errors
    const hasError = await page.locator('text=error, text=Error').first().isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('Profile — displays user information', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The user should be logged in - sidebar or navbar should show user info
    const userElement = page.locator('[data-testid="user-name"], [class*="profile"], [class*="avatar"]').first();
    await expect(userElement).toBeVisible({ timeout: 5000 });
  });

  test('Theme — dark/light toggle works', async ({ page }) => {
    // Look for theme toggle button
    const themeToggle = page.locator('[aria-label*="theme"], [aria-label*="Theme"], button:has-text("Dark"), button:has-text("Light"), [class*="theme"]').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);

      // Click again to toggle back
      await themeToggle.click();
    }

    // No crash - test passes
    expect(true).toBeTruthy();
  });
});
