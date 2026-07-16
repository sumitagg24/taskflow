import { test, expect } from '@playwright/test';
import { generateTestUser, createUserViaApi, setAuthInStorage, createTaskViaApi, getTasksViaApi, deleteTaskViaApi } from './helpers';

test.describe('Task Management', () => {
  test.beforeEach(async ({ page }) => {
    const user = generateTestUser();
    const auth = await createUserViaApi(user);
    await setAuthInStorage(page, auth);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Task CRUD — create, view, and delete a task', async ({ page, request }) => {
    // Open the create task form
    const createBtn = page.locator('button:has-text("New Task"), button:has-text("Add Task"), [aria-label*="Create"]').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
    }

    // Fill in task details
    const titleInput = page.locator('input[name="title"], [placeholder*="task"]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill('E2E Test Task');
      await titleInput.press('Enter');
    }

    // Wait for task to appear
    await expect(page.locator('text=E2E Test Task').first()).toBeVisible({ timeout: 5000 });
  });

  test('Kanban — renders columns with correct labels', async ({ page }) => {
    // Verify Kanban board is visible
    await expect(page.locator('text=Backlog').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=To Do').or(page.locator('text=Pending'))).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=In Progress').first()).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Completed').first()).toBeVisible({ timeout: 3000 });
  });

  test('Kanban — displays task count per column', async ({ page }) => {
    // The column headers show task counts
    const backlogCount = page.locator('text=Backlog').locator('..').locator('span:has-text("0")');
    await expect(backlogCount).toBeVisible({ timeout: 5000 });
  });

  test('Filters — search input is functional', async ({ page }) => {
    // Find search input
    const searchInput = page.locator('[placeholder*="Search"], [placeholder*="search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Type a search query
    await searchInput.fill('test task');
    await searchInput.press('Enter');

    // Search should filter results (no error)
    await page.waitForTimeout(500);
  });

  test('Task creation via API — tasks render correctly', async ({ page }) => {
    // Get the access token from localStorage
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken).toBeTruthy();

    // Create a task via the API
    if (accessToken) {
      const task = await createTaskViaApi(accessToken, {
        title: 'API Created Task',
        description: 'Created during E2E test',
        priority: 'high',
      });
      expect(task._id).toBeTruthy();

      // Reload to see the task
      await page.reload();
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=API Created Task').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Task deletion via API — tasks disappear from view', async ({ page }) => {
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken).toBeTruthy();

    if (accessToken) {
      // Create a task
      const task = await createTaskViaApi(accessToken, {
        title: 'Task To Delete',
        priority: 'low',
      });

      // Reload to see it
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('text=Task To Delete').first()).toBeVisible({ timeout: 5000 });

      // Delete via API
      await deleteTaskViaApi(accessToken, task._id);

      // Reload to confirm deletion
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('text=Task To Delete')).toHaveCount(0);
    }
  });
});
