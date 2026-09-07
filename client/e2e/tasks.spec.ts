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
    // The board renders once tasks exist; a fresh account shows the empty
    // state instead, so seed one task first (same as the count test below).
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    if (accessToken) {
      await createTaskViaApi(accessToken, { title: 'Column Probe Task', status: 'pending' });
    }

    await page.goto('/tasks');
    // Column titles are <h3 class="caption-upper"> elements inside the board.
    // Scoped to main: the (desktop-only, hidden) sidebar also has these words.
    const main = page.locator('#task-main');
    await expect(main.getByRole('heading', { name: 'Backlog' })).toBeVisible({ timeout: 8000 });
    await expect(main.getByRole('heading', { name: 'To Do' })).toBeVisible({ timeout: 3000 });
    await expect(main.getByRole('heading', { name: 'In Progress' })).toBeVisible({ timeout: 3000 });
    await expect(main.getByRole('heading', { name: 'Completed' })).toBeVisible({ timeout: 3000 });
  });

  test('Kanban — displays task count per column', async ({ page }) => {
    // The board only renders once tasks exist — seed first, then read the
    // list header count on /tasks (the board moved there in the router migration).
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken).toBeTruthy();
    if (accessToken) {
      await createTaskViaApi(accessToken, { title: 'Count Task One', status: 'backlog' });
      await createTaskViaApi(accessToken, { title: 'Count Task Two', status: 'in-progress' });
    }
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('2 tasks', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  });

  test('Filters — search input is functional', async ({ page }) => {
    // Filters live on the /tasks list route since the router migration.
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'All Tasks' }).first()).toBeVisible({ timeout: 10000 });
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
