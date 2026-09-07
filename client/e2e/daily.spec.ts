import { test, expect } from '@playwright/test';
import { generateTestUser, createUserViaApi, setAuthInStorage, API_BASE } from './helpers';

async function api(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test.describe('Phase 6 daily loop — Inbox → Today → complete/defer → weekly reset', () => {
  let token: string;

  test.beforeEach(async ({ page }) => {
    const user = generateTestUser();
    const auth = await createUserViaApi(user);
    token = auth.accessToken;
    await setAuthInStorage(page, auth);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('API: inbox quick capture (title only) → triage to Today → Top Three → resolve', async () => {
    // Quick capture needs only a title.
    const created = await api(token, '/daily/inbox', { method: 'POST', body: JSON.stringify({ title: 'E2E inbox thought' }) });
    expect(created.status).toBe(201);
    expect(created.body.inbox).toBe(true);

    // Triage: move to Today.
    const triaged = await api(token, '/daily/triage', {
      method: 'POST',
      body: JSON.stringify({ taskIds: [created.body._id], updates: { priority: 'high' }, moveToToday: true }),
    });
    expect(triaged.status).toBe(200);

    // Today shows it in flexible (no time), Top Three stays empty (never auto-filled).
    const today = await api(token, `/daily/today?tzOffset=${new Date().getTimezoneOffset()}`);
    expect(today.status).toBe(200);
    expect(today.body.topThree).toHaveLength(0);
    const ids = [...today.body.scheduled, ...today.body.flexible].map((t: { _id: string }) => t._id);
    expect(ids).toContain(created.body._id);

    // Promote to Top Three (max 3 enforced server-side).
    const top = await api(token, '/daily/top-three', {
      method: 'PUT',
      body: JSON.stringify({ taskIds: [created.body._id] }),
    });
    expect(top.status).toBe(200);
    expect(top.body.topThree).toHaveLength(1);

    // End-of-day: complete it; nothing duplicated or deleted.
    const resolved = await api(token, '/daily/resolve', {
      method: 'POST',
      body: JSON.stringify({ resolutions: [{ taskId: created.body._id, action: 'complete' }] }),
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.summary.completed).toBe(1);

    // Weekly review recaps it without streak pressure.
    const review = await api(token, '/daily/weekly-review');
    expect(review.status).toBe(200);
    expect(review.body.completedCount).toBeGreaterThanOrEqual(1);
    expect(review.body).not.toHaveProperty('streak');
  });

  test('UI: Today and Inbox routes render with three sections', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: /Today/i }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Top Three/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Scheduled/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Flexible/i).first()).toBeVisible({ timeout: 5000 });

    await page.goto('/inbox');
    await expect(page.getByRole('heading', { name: /Inbox/i }).first()).toBeVisible({ timeout: 8000 });
  });

  test('UI: quick capture shortcut hint and starter templates surface', async ({ page }) => {
    await page.goto('/inbox');
    // Heading role, not raw text: the desktop sidebar's hidden "Inbox" span
    // precedes visible mobile elements in DOM order and would match first.
    await expect(page.getByRole('heading', { name: /Inbox/i }).first()).toBeVisible({ timeout: 8000 });
    await page.goto('/templates');
    await expect(page.getByText(/Start from a starter/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Personal weekly plan/i).first()).toBeVisible({ timeout: 5000 });
  });
});
