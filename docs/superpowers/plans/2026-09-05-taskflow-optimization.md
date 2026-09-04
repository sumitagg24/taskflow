# TaskFlow Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `GET /tasks` cost (pagination, lean, projection, text search), shrink the initial client bundle and board re-render cost, and close resilience/a11y gaps — with all tests green.

**Architecture:** Internal changes only: same Express+Mongoose API (new `page`/`limit`/`paginate` query params, `paginate=false` escape hatch), same React routes (four heavy components become `lazy()`), one new `ErrorBoundary`, one new `useFocusTrap` hook. No new dependencies, no env changes, no migrations.

**Tech Stack:** Node/Express/Mongoose (jest+supertest), React 18+Vite (vitest+Testing Library, `tsc --noEmit`).

**Spec:** `docs/superpowers/specs/2026-09-05-taskflow-optimization-design.md`

## Global Constraints

- Breaking `GET /tasks` shape change is accepted, but `?paginate=false` must return the legacy bare-array shape.
- `limit` clamp is 1–200, default page size 50.
- All four verifications must pass: `npm run test --prefix server`, `npm run test --prefix client`, `npm run typecheck --prefix client`, `npm run build --prefix client`.
- No new runtime dependencies. `mongodb-memory-server` moves from `dependencies` to `devDependencies` only.
- Follow existing code patterns (sonner toasts, `ownedLive` scoping, `EmptyState`/`PageLoader` UI, `logger` on server).

---

## File Map

| File | Responsibility |
|---|---|
| `server/controllers/taskController.js:122-171` | `getTasks`: paginate, lean, project, trim populate, text-search-first |
| `server/models/Task.js:123-130` | Add sort-covering compound indexes |
| `server/server.js:213-282` | Overlap guards on the 4 `setInterval` jobs |
| `server/package.json:12-34` | Move `mongodb-memory-server` to `devDependencies` |
| `server/__tests__/tasks.test.js:51-99` | Update `GET /tasks` assertions + new pagination/search/index tests |
| `client/src/api/tasks.ts:3-13,157` | `TaskParams` gains `page/limit/paginate`; add `toTaskArray` helper |
| `client/src/api/tasks.test.ts:92-97` | Add `toTaskArray` tests (existing `getTasks` param test stays green) |
| `client/src/App.tsx:1-24,134-145,296-311,391-473` | Lazy heavies, deferred board list, fetch-error toast, skip link, live region |
| `client/src/components/pages/FavoritesPage.tsx:17-28` | Use `toTaskArray` |
| `client/src/components/pages/Dashboard.tsx:81-92` | Use `toTaskArray` |
| `client/src/components/TaskForm.tsx:218-231` | Use `toTaskArray` (replaces inline `Array.isArray` guard) |
| `client/src/components/pages/CategoriesPage.tsx:18-24` | Use `toTaskArray` |
| `client/src/components/pages/CalendarPage.tsx:27-38` | Use `toTaskArray` |
| `client/src/components/ui/ErrorBoundary.tsx` | NEW: class error boundary with retry |
| `client/src/components/ui/ErrorBoundary.test.tsx` | NEW: fallback + retry tests |
| `client/src/components/ui/index.ts:30` | Export `ErrorBoundary` |
| `client/src/main.tsx:43-47` | Mount `ErrorBoundary` + `MotionConfig reducedMotion="user"` |
| `client/src/context/NotificationContext.tsx:27-34` | Toast once per session on count-refresh failure |
| `client/src/components/KanbanBoard.tsx` | `memo(Card)`, per-column windowing, keyboard move, stable callbacks |
| `client/src/components/KanbanBoard.test.tsx` | NEW: windowing + keyboard-move tests |
| `client/src/hooks/useFocusTrap.ts` | NEW: focus-trap hook for non-Modal dialogs |
| `client/src/components/AIAssistant.tsx:111` | Trap + `role="dialog"` on panel |
| `client/src/components/CommandPalette.tsx:322-334` | Trap on panel (role already present) |
| `client/src/components/ui/ShortcutsModal.tsx:21` | Trap + `role="dialog"` on panel |
| `client/vite.config.js:28-37` | Add `vendor-socket` chunk for `socket.io-client` |

### Task 1: Paginated `GET /tasks` with lean + projection

**Files:**
- Modify: `server/controllers/taskController.js:20-26,122-171`
- Test: `server/__tests__/tasks.test.js:51-99`

**Interfaces:**
- Consumes: `ownedLive`, `VALID_STATUSES`, `VALID_PRIORITIES`, `sanitizeString` (unchanged).
- Produces: `GET /tasks` returns `{ data, page, limit, total, totalPages }` by default, bare array when `?paginate=false`. `parsePagination(query)` helper used by Task 2.

- [ ] **Step 1: Update the three `GET /tasks` tests to unwrap both shapes**

In `server/__tests__/tasks.test.js`, after line 9 (`let token, userId;`), insert:

```js
const listOf = (body) => (Array.isArray(body) ? body : body.data);
```

Then in the `GET /api/tasks` describe (lines 51–99), replace every `res.body` with `listOf(res.body)` (4 occurrences: lines 58–59, 71, 82–84, 95–97). Example, lines 52–60 become:

```js
it('returns empty list when no tasks', async () => {
  const res = await request(app)
    .get('/api/tasks')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(Array.isArray(listOf(res.body))).toBe(true);
  expect(listOf(res.body).length).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they still pass (no behavior change yet)**

Run: `npm run test --prefix server` (from repo root `C:\Users\Sumit\projects\task-tracker`)
Expected: PASS (shape is still the bare array, `listOf` unwraps it).

- [ ] **Step 3: Implement pagination in `getTasks`**

In `server/controllers/taskController.js`, after the `VALID_PRIORITIES` const (line 25), insert:

```js
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

// Offset pagination for list endpoints. `?paginate=false` keeps the legacy
// bare-array shape for scripts that predate paging.
const parsePagination = (query) => {
  const paginate = query.paginate !== 'false';
  let page = Number.parseInt(query.page, 10);
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_PAGE_LIMIT;
  if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT;
  return { paginate, page, limit };
};
exports.parsePagination = parsePagination;

// List rows never need the heaviest subdocuments: attachments, the embedded
// activity log and time sessions. Comments stay (the board shows the count
// badge); the detail endpoint still returns everything.
const LIST_PROJECTION = '-attachments -activityLog -timeSessions';
```

Replace the query tail of `getTasks` (lines 162–167):

```js
const tasks = await Task.find(filter)
  .sort(sortOption)
  .populate('assignee', 'name email avatar')
  .populate('comments.userId', 'name email avatar');

res.json(tasks);
```

with:

```js
const { paginate, page, limit } = parsePagination(req.query);

const baseQuery = () =>
  Task.find(filter)
    .sort(sortOption)
    .select(LIST_PROJECTION)
    .populate('assignee', 'name email avatar')
    .lean();

if (!paginate) {
  const tasks = await baseQuery();
  return res.json(tasks);
}

const [tasks, total] = await Promise.all([
  baseQuery().skip((page - 1) * limit).limit(limit),
  Task.countDocuments(filter),
]);

res.json({ data: tasks, page, limit, total, totalPages: Math.ceil(total / limit) });
```

Note: the list no longer populates `comments.userId` (was line 165). The board only reads `comments.length`; names come from `GET /tasks/:id`.

- [ ] **Step 4: Run tests**

Run: `npm run test --prefix server`
Expected: PASS (`listOf` handles the new `{ data }` shape; `paginate=false` path untested yet — covered in Task 5's new tests).

- [ ] **Step 5: Commit**

```bash
git add server/controllers/taskController.js server/__tests__/tasks.test.js
git commit -m "perf(api): paginate GET /tasks with lean + projection, keep paginate=false legacy shape"
```

### Task 2: Text-search-first with regex fallback

**Files:**
- Modify: `server/controllers/taskController.js:143-149` (search block inside `getTasks`)
- Test: `server/__tests__/tasks.test.js` (`GET /api/tasks` describe)

**Interfaces:**
- Consumes: `parsePagination`, `LIST_PROJECTION` from Task 1; existing text index `Task.js:130`.
- Produces: same response shapes as Task 1; `search>=2 chars` tries `$text` first.

- [ ] **Step 1: Write the failing test**

Append inside the `GET /api/tasks` describe block (after the `searches by title` test ending at line 98):

```js
it('finds tasks via text search', async () => {
  await createTestTask(userId, { title: 'Quarterly planning session' });

  const res = await request(app)
    .get('/api/tasks?search=planning')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(listOf(res.body).length).toBe(1);
});

it('falls back to partial matching for short queries', async () => {
  await createTestTask(userId, { title: 'Buy groceries' });

  const res = await request(app)
    .get('/api/tasks?search=gro')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(listOf(res.body).length).toBe(1);
});
```

- [ ] **Step 2: Run to verify the second test fails**

Run: `npm run test --prefix server -- -t "falls back to partial matching"`
Expected: FAIL (regex `gro` never appears once `$text` takes over — actually `$text` stems `gro` to nothing, returns 0).

- [ ] **Step 3: Implement text-first search**

Replace the search block (lines 143–149):

```js
if (search) {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  filter.$or = [
    { title: { $regex: escaped, $options: 'i' } },
    { description: { $regex: escaped, $options: 'i' } },
  ];
}
```

with:

```js
// Full-text first (uses the title/description text index), regex fallback
// for partial/short queries that stemming would miss. `useText` is tracked
// so the count query below uses the same predicate that produced the rows.
let useText = false;
const rawSearch = typeof search === 'string' ? search.trim() : '';
if (rawSearch.length >= 2) {
  filter.$text = { $search: rawSearch };
  useText = true;
} else if (rawSearch) {
  const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  filter.$or = [
    { title: { $regex: escaped, $options: 'i' } },
    { description: { $regex: escaped, $options: 'i' } },
  ];
}
```

And update the query tail from Task 1 to retry with regex when `$text` finds nothing. Replace:

```js
const [tasks, total] = await Promise.all([
  baseQuery().skip((page - 1) * limit).limit(limit),
  Task.countDocuments(filter),
]);

res.json({ data: tasks, page, limit, total, totalPages: Math.ceil(total / limit) });
```

with:

```js
const runPaged = (activeFilter) => Promise.all([
  Task.find(activeFilter)
    .sort(sortOption)
    .select(LIST_PROJECTION)
    .populate('assignee', 'name email avatar')
    .skip((page - 1) * limit)
    .limit(limit)
    .lean(),
  Task.countDocuments(activeFilter),
]);

let [tasks, total] = await runPaged(filter);
if (useText && tasks.length === 0) {
  const { $text, ...rest } = filter;
  const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fallback = {
    ...rest,
    $or: [
      { title: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ],
  };
  [tasks, total] = await runPaged(fallback);
}

res.json({ data: tasks, page, limit, total, totalPages: Math.ceil(total / limit) });
```

Also update the `!paginate` branch from Task 1 to share the fallback. Replace:

```js
if (!paginate) {
  const tasks = await baseQuery();
  return res.json(tasks);
}
```

with:

```js
if (!paginate) {
  let tasks = await baseQuery();
  if (useText && tasks.length === 0) {
    const { $text, ...rest } = filter;
    const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    tasks = await Task.find({
      ...rest,
      $or: [
        { title: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
      ],
    })
      .sort(sortOption)
      .select(LIST_PROJECTION)
      .populate('assignee', 'name email avatar')
      .lean();
  }
  return res.json(tasks);
}
```

(`baseQuery` from Task 1 stays and is reused by the `!paginate` branch.)

- [ ] **Step 4: Run tests**

Run: `npm run test --prefix server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/controllers/taskController.js server/__tests__/tasks.test.js
git commit -m "perf(api): text-search-first with regex fallback on GET /tasks"
```

### Task 3: Sort-covering indexes

**Files:**
- Modify: `server/models/Task.js:123-130`
- Test: `server/__tests__/tasks.test.js`

**Interfaces:**
- Consumes: nothing new. Produces: `updatedAt`/`createdAt`/`title` sorts covered.

- [ ] **Step 1: Write the failing test**

Append a new describe after the `GET /api/tasks` block closes (after line 99's `});`):

```js
describe('tasks indexes', () => {
  it('has covering indexes for list sorts', async () => {
    const indexes = await Task.collection.getIndexes();
    const keys = Object.values(indexes).map((idx) => Object.keys(idx.key).join(','));
    expect(keys).toEqual(
      expect.arrayContaining([
        'userId,deletedAt,updatedAt',
        'userId,deletedAt,createdAt',
        'userId,deletedAt,title',
      ])
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --prefix server -- -t "covering indexes"`
Expected: FAIL (indexes do not exist yet).

- [ ] **Step 3: Add the indexes**

In `server/models/Task.js`, after line 129 (`taskSchema.index({ userId: 1, deletedAt: 1, order: 1 });`), insert:

```js
// Cover the remaining list sort paths (`updated`, `oldest`, `title`) so
// sorted pages never fall back to an in-memory sort at scale.
taskSchema.index({ userId: 1, deletedAt: 1, updatedAt: -1 });
taskSchema.index({ userId: 1, deletedAt: 1, createdAt: 1 });
taskSchema.index({ userId: 1, deletedAt: 1, title: 1 });
```

- [ ] **Step 4: Run tests**

Run: `npm run test --prefix server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/models/Task.js server/__tests__/tasks.test.js
git commit -m "perf(db): covering indexes for updated/created/title sorts"
```

### Task 4: Scheduler overlap guards + dev-only memory server

**Files:**
- Modify: `server/server.js:213-223,259-282`, `server/package.json`

**Interfaces:**
- Consumes: `processRecurringTasks`, `purgeExpiredTrash`, `processDueDateNotifications` (unchanged signatures).
- Produces: no overlapping tick ever runs twice concurrently.

- [ ] **Step 1: Guard the four intervals**

In `server/server.js`, replace lines 213–223 with:

```js
// Recurring tasks check (runs every hour). The `running` flag skips a tick
// while the previous one is still in flight — with >1 replica each instance
// still runs its own sweep, but a slow sweep never stacks up locally.
const { processRecurringTasks, purgeExpiredTrash } = require('./controllers/taskController');
let recurringRunning = false;
setInterval(() => {
  if (recurringRunning) return;
  recurringRunning = true;
  processRecurringTasks()
    .catch(err => logger.error('Recurring task processing failed:', err))
    .finally(() => { recurringRunning = false; });
}, 60 * 60 * 1000);

// Trash retention sweep (runs every 6 hours). Soft-deleted tasks are restorable
// for 30 days; this is what makes that promise finite.
let purgeRunning = false;
setInterval(() => {
  if (purgeRunning) return;
  purgeRunning = true;
  purgeExpiredTrash()
    .catch(err => logger.error('Trash purge failed:', err))
    .finally(() => { purgeRunning = false; });
}, 6 * 60 * 60 * 1000);
```

Replace lines 259–282 (daily focus reset + notification reminders) with:

```js
// Daily reset of focus time
let focusResetRunning = false;
setInterval(async () => {
  if (focusResetRunning) return;
  focusResetRunning = true;
  try {
    const User = require('./models/User');
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    await User.updateMany(
      { lastActiveDate: { $lt: new Date(yesterday) } },
      { focusTimeToday: 0 }
    );
  } catch (err) {
    logger.error('Daily focus time reset failed:', err);
  } finally {
    focusResetRunning = false;
  }
}, 60 * 60 * 1000);

// Due-soon / overdue notification reminders (every 15 minutes)
const { processDueDateNotifications } = require('./services/notificationScheduler');
processDueDateNotifications().catch((err) =>
  logger.error('Initial notification reminder run failed:', err)
);
let notifyRunning = false;
setInterval(() => {
  if (notifyRunning) return;
  notifyRunning = true;
  processDueDateNotifications()
    .catch((err) => logger.error('Notification reminder run failed:', err))
    .finally(() => { notifyRunning = false; });
}, 15 * 60 * 1000);
```

- [ ] **Step 2: Move `mongodb-memory-server` to devDependencies**

In `server/package.json`, remove the line `"mongodb-memory-server": "^11.2.0",` from `dependencies` and add the identical line to `devDependencies` (after `"jest": "^29.7.0",`). Then run `npm install --prefix server` to refresh `server/package-lock.json`.

- [ ] **Step 3: Run tests**

Run: `npm run test --prefix server`
Expected: PASS (memory server still resolves from devDependencies).

- [ ] **Step 4: Commit**

```bash
git add server/server.js server/package.json server/package-lock.json
git commit -m "chore(server): guard scheduler overlap, move mongodb-memory-server to devDeps"
```

### Task 5: Client `toTaskArray` + all `getTasks` callers

**Files:**
- Modify: `client/src/api/tasks.ts:3-13,157`, `client/src/App.tsx:134-145`, `client/src/components/pages/FavoritesPage.tsx:17-28`, `client/src/components/pages/Dashboard.tsx:81-92`, `client/src/components/TaskForm.tsx:218-231`, `client/src/components/pages/CategoriesPage.tsx:18-24`, `client/src/components/pages/CalendarPage.tsx:27-38`
- Test: `client/src/api/tasks.test.ts:92-97`

**Interfaces:**
- Consumes: paginated `GET /tasks` from Task 1.
- Produces: `toTaskArray(data: unknown): any[]` — every list caller renders again.

- [ ] **Step 1: Add failing tests for `toTaskArray`**

In `client/src/api/tasks.test.ts`, after the `getTasks sends GET to /tasks with params` test (line 97), insert:

```ts
it('toTaskArray unwraps paginated and legacy shapes', async () => {
  const { toTaskArray } = await import('./tasks');
  const rows = [{ _id: '1', title: 'A' }];
  expect(toTaskArray(rows)).toEqual(rows);
  expect(toTaskArray({ data: rows, page: 1, limit: 50, total: 1, totalPages: 1 })).toEqual(rows);
  expect(toTaskArray(null)).toEqual([]);
  expect(toTaskArray(undefined)).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --prefix client -- tasks.test`
Expected: FAIL with "toTaskArray is not a function" (or "not defined").

- [ ] **Step 3: Implement `toTaskArray` + paginated params**

In `client/src/api/tasks.ts`, extend `TaskParams` (lines 3–13):

```ts
interface TaskParams {
  status?: string;
  priority?: string;
  sort?: string;
  search?: string;
  category?: string;
  tag?: string;
  isFavorite?: string;
  dueDateBefore?: string;
  dueDateAfter?: string;
  page?: number;
  limit?: number;
  paginate?: boolean;
}
```

After the `getTasks` export (line 157), insert:

```ts
/**
 * `GET /tasks` returns `{ data, page, limit, total, totalPages }` unless
 * `?paginate=false` was sent (legacy bare array). Every list caller unwraps
 * through here so neither shape can crash a `.map`/`.filter`.
 */
export const toTaskArray = (data: unknown): any[] => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: any[] }).data;
  }
  return [];
};
```

- [ ] **Step 4: Update the six callers**

`client/src/App.tsx:134-145` — replace `setTasks(data);` with `setTasks(toTaskArray(data));`, update the import on line 6 to `import { getTasks, toTaskArray, deleteTask, restoreTask } from '@/api/tasks';`, and surface failures:

```ts
const fetchTasks = useCallback(async () => {
  try {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v && v !== '')
    );
    const { data } = await getTasks(params);
    setTasks(toTaskArray(data));
  } catch {
    toast.error('Could not load tasks', {
      action: { label: 'Retry', onClick: () => fetchTasks() },
    });
  } finally {
    setLoading(false);
  }
}, [filters]);
```

(`toast` is already imported in `App.tsx:2`.)

`FavoritesPage.tsx:20-21`: `const { data } = await getTasks({ isFavorite: 'true' }); setTasks(toTaskArray(data));` + add `toTaskArray` to its `@/api/tasks` import.

`Dashboard.tsx:83-84`: `setTasks(toTaskArray(tasksRes.data));` + import update.

`TaskForm.tsx:223-224`: replace `setCandidates(Array.isArray(data) ? data : []);` with `setCandidates(toTaskArray(data));` + import update.

`CategoriesPage.tsx:20-21`: `setTasks(toTaskArray(data));` + import update.

`CalendarPage.tsx:30-31`: `setTasks(toTaskArray(data));` + import update.

- [ ] **Step 5: Run client tests + typecheck**

Run: `npm run test --prefix client -- tasks.test` then `npm run typecheck --prefix client`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/api/tasks.ts client/src/api/tasks.test.ts client/src/App.tsx client/src/components/pages/FavoritesPage.tsx client/src/components/pages/Dashboard.tsx client/src/components/TaskForm.tsx client/src/components/pages/CategoriesPage.tsx client/src/components/pages/CalendarPage.tsx
git commit -m "feat(client): toTaskArray unwraps paginated tasks, error toast with retry"
```

### Task 6: Lazy-load heavy dialogs + socket chunk

**Files:**
- Modify: `client/src/App.tsx:9,13-15,435-461`, `client/vite.config.js:28-37`

**Interfaces:**
- Consumes: `toTaskArray` task done (no conflicts in same hunks).
- Produces: `TaskForm`/`TaskDetailDrawer`/`AIAssistant`/`CommandPalette` load on first open only.

- [ ] **Step 1: Convert the four eager imports to `lazy()`**

In `client/src/App.tsx`, replace lines 9 and 13–15:

```ts
import CommandPalette from '@/components/CommandPalette';
...
import TaskForm from '@/components/TaskForm';
import TaskDetailDrawer from '@/components/TaskDetailDrawer';
import AIAssistant from '@/components/AIAssistant';
```

with:

```ts
const CommandPalette = lazy(() => import('@/components/CommandPalette'));
const TaskForm = lazy(() => import('@/components/TaskForm'));
const TaskDetailDrawer = lazy(() => import('@/components/TaskDetailDrawer'));
const AIAssistant = lazy(() => import('@/components/AIAssistant'));
```

(`lazy`/`Suspense` already imported on line 1.)

- [ ] **Step 2: Wrap each lazy usage in `Suspense`**

The `<Modal>` wrapping `TaskForm` (lines 413–425) becomes:

```tsx
<Suspense fallback={null}>
  <Modal
    isOpen={showForm}
    onClose={() => { setShowForm(false); setEditTask(null); }}
    title={editTask ? 'Edit Task' : 'Create Task'}
    subtitle={editTask ? 'Update task details' : 'Add a new task to your workspace'}
    size="xl"
  >
    {showForm && (
      <TaskForm
        existingTask={editTask}
        onSuccess={handleFormSubmit}
        onCancel={() => { setShowForm(false); setEditTask(null); }}
      />
    )}
  </Modal>
</Suspense>
```

Wrap `TaskDetailDrawer` (lines 435–441), `AIAssistant` (line 451) and `CommandPalette` (lines 453–460) each in `<Suspense fallback={null}>`. Also guard the drawer: `{detailTaskId && (<TaskDetailDrawer ... />)}` so its data fetch only runs when opened.

- [ ] **Step 3: Split `socket.io-client` into its own chunk**

In `client/vite.config.js`, inside `manualChunks` after `'vendor-axios': ['axios'],` add:

```js
// Realtime client loads with the notification shell, not first paint
'vendor-socket': ['socket.io-client'],
```

- [ ] **Step 4: Verify build + typecheck**

Run: `npm run typecheck --prefix client` then `npm run build --prefix client`
Expected: PASS; `dist/assets` lists `vendor-socket-*.js` plus lazy chunks for the four components.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/vite.config.js
git commit -m "perf(client): lazy-load TaskForm, drawer, AI assistant, palette; split socket chunk"
```

### Task 7: Root `ErrorBoundary`

**Files:**
- Create: `client/src/components/ui/ErrorBoundary.tsx`
- Create: `client/src/components/ui/ErrorBoundary.test.tsx`
- Modify: `client/src/components/ui/index.ts:30`, `client/src/main.tsx:43-47`

**Interfaces:**
- Consumes: existing `Button`, `EmptyState` from `./Feedback`, `LogoMark` from `./Logo`.
- Produces: `<ErrorBoundary>` export used by `main.tsx`.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/ui/ErrorBoundary.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom() {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('renders fallback with retry when a child crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    (console.error as any).mockRestore();
  });

  it('retry resets and re-renders children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    function Flaky() {
      if (fail) throw new Error('flaky');
      return <p>recovered</p>;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
    (console.error as any).mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --prefix client -- ErrorBoundary`
Expected: FAIL with "ErrorBoundary is not exported from ./ErrorBoundary" (file missing).

- [ ] **Step 3: Implement the boundary**

Create `client/src/components/ui/ErrorBoundary.tsx`:

```tsx
import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './Feedback';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Remount the subtree when any key changes (e.g. active section). */
  resetKeys?: unknown[];
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render crashes below it so one broken widget cannot unmount the
 * whole shell. Mount once at the root; the fallback offers Retry (re-render)
 * plus a Dashboard escape hatch via `window.location.hash`? No — plain reload
 * fallback below keeps it dependency-free.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKeys !== this.props.resetKeys) {
      this.setState({ error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <EmptyState
          icon={<AlertTriangle size={22} />}
          title="Something went wrong"
          description="This panel crashed. Your data is safe — try rendering it again."
          action={<Button onClick={this.handleRetry}>Try again</Button>}
          secondaryAction={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
```

Append to `client/src/components/ui/index.ts`:

```ts
export { ErrorBoundary } from './ErrorBoundary';
```

- [ ] **Step 4: Mount at the root**

In `client/src/main.tsx`, replace lines 43–47 with:

```tsx
import { MotionConfig } from 'framer-motion';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </MotionConfig>
  </React.StrictMode>
);
```

(`MotionConfig reducedMotion="user"` also resolves the missing reduced-motion guard: every `motion.*` animation in the app now renders statically when the OS requests it. Add the two imports at the top of `main.tsx`.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test --prefix client -- ErrorBoundary` then `npm run typecheck --prefix client`
Expected: PASS. (Also check `Button` accepts default variant + `variant="secondary"` — both used in `App.tsx:329,336`, so yes.)

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ui/ErrorBoundary.tsx client/src/components/ui/ErrorBoundary.test.tsx client/src/components/ui/index.ts client/src/main.tsx
git commit -m "feat(client): root ErrorBoundary with retry, honor prefers-reduced-motion"
```

### Task 8: Error toasts, skip link, live region

**Files:**
- Modify: `client/src/context/NotificationContext.tsx:27-34`, `client/src/App.tsx:391-411`

**Interfaces:**
- Consumes: `ErrorBoundary` mounted (Task 7); `toast` already imported in both files.
- Produces: no silent fetch failure in the shell; keyboard skip link; screen-reader task count.

- [ ] **Step 1: Toast once per session on notification-count failure**

In `client/src/context/NotificationContext.tsx`, add a `failedOnce` ref next to `socketRef` (line 23):

```ts
const failedToastShown = useRef(false);
```

Replace the `refreshCount` catch (lines 31–33):

```ts
} catch {
  // Count is decoration: toast once per session instead of on every
  // reconnect, then stay silent until the next load succeeds.
  if (!failedToastShown.current) {
    failedToastShown.current = true;
    toast.error('Could not refresh notifications');
  }
}
```

- [ ] **Step 2: Skip link + live region in the shell**

In `client/src/App.tsx`, inside the root `<div className="flex min-h-screen">` (line 393), before `<Sidebar ...>`, insert:

```tsx
<a
  href="#task-main"
  className="sr-only-focusable absolute z-[60] m-2 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-medium text-gray-950"
>
  Skip to tasks
</a>
```

(`sr-only-focusable` already exists — used by `LoadingRegion` in `Feedback.tsx:99`.)

Give the landmark an id (line 406): `<main id="task-main" className="flex-1 overflow-auto" key={activeSection}>`.

In the list header (after line 310's count `<span>`), add:

```tsx
<p className="sr-only" role="status">
  {scoped.length} {scoped.length === 1 ? 'task' : 'tasks'} shown
</p>
```

- [ ] **Step 3: Run client tests + typecheck**

Run: `npm run test --prefix client` then `npm run typecheck --prefix client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/context/NotificationContext.tsx client/src/App.tsx
git commit -m "feat(a11y): notification error toast, skip link, board live region"
```

### Task 9: Kanban memo + windowing + keyboard move

**Files:**
- Modify: `client/src/components/KanbanBoard.tsx:1,64-81,200-270,311-330,405-509`
- Create: `client/src/components/KanbanBoard.test.tsx`

**Interfaces:**
- Consumes: `updateCardStatus` (stable, `useCallback` on line 83); `toTaskArray` lists from Task 5.
- Produces: same drag/drop API; plus keyboard move and `Show more` windowing. No parent changes.

- [ ] **Step 1: Read lines 120–200, stabilize the callbacks passed to `Column`**

Open `client/src/components/KanbanBoard.tsx:120-200` and ensure `handleDeleteCard`, `handleAddCard`, `toggleSelect`, `clearSelection` are `useCallback`-wrapped (like `updateCardStatus:83` already is). Convert any plain function among them to `useCallback` with correct deps. Verify with `npm run typecheck --prefix client`.

- [ ] **Step 2: Write the failing tests**

Create `client/src/components/KanbanBoard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KanbanBoard from './KanbanBoard';

const makeTasks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `t${i}`,
    title: `Task ${i}`,
    status: 'pending',
    priority: 'medium',
  }));

describe('KanbanBoard windowing', () => {
  it('windows columns over 100 cards with Show more', () => {
    render(<KanbanBoard tasks={makeTasks(120)} onRefresh={() => {}} />);
    expect(screen.queryByText('Task 119')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByText('Task 119')).toBeInTheDocument();
  });
});

describe('KanbanBoard keyboard move', () => {
  it('arrow keys move a focused card between columns', async () => {
    const { updateTask } = await import('@/api/tasks');
    (updateTask as any).mockResolvedValue?.({}) ?? null;
    render(<KanbanBoard tasks={makeTasks(2)} onRefresh={() => {}} />);
    const card = screen.getByLabelText(/Task 0.*move with arrow keys/i);
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    const mod = await import('@/api/tasks');
    expect((mod as any).updateTask ?? updateTask).toBeDefined();
  });
});
```

Note: mock `@/api/tasks` with `vi.mock('@/api/tasks', ...)` at the top of the test file following the pattern in `TaskDetailDrawer.test.tsx` (it already mocks API modules — copy its `vi.mock` block verbatim). Check `client/src/components/TaskDetailDrawer.test.tsx:1-62` for the exact mock shape before finalizing this file.

- [ ] **Step 3: Run to verify they fail**

Run: `npm run test --prefix client -- KanbanBoard`
Expected: FAIL (no windowing; no keyboard handler).

- [ ] **Step 4: Implement memo + windowing + keyboard**

1. Line 1: add `memo` to the React import: `import { useState, useCallback, useRef, useMemo, useEffect, memo, DragEvent, FormEvent } from 'react';`
2. `Column` (line 325): add windowing state at the top — `const [visibleCount, setVisibleCount] = useState(100);` — reset it when `cards.length` changes via `useEffect(() => setVisibleCount(100), [cards.length]);`. Render `cards.slice(0, visibleCount)` instead of `cards`, and after the list, when `cards.length > visibleCount`, render:

```tsx
<button
  type="button"
  onClick={() => setVisibleCount((c) => c + 100)}
  className="mt-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
>
  Show more ({cards.length - visibleCount} remaining)
</button>
```

3. `Card` (line 509): extend `CardProps` with `onMoveCard: (id: string, direction: -1 | 1) => void;`. In `Column`, define:

```ts
const moveNeighbor = useCallback((cardId: string, direction: -1 | 1) => {
  const order = columns.map((c) => c.id);
  const card = cards.find((c) => c._id === cardId);
  if (!card) return;
  const next = order[order.indexOf(card.status as ColumnType) + direction];
  if (next) onUpdateStatus(cardId, next);
}, [cards, onUpdateStatus]);
```

and pass `onMoveCard={moveNeighbor}` where `Card` is rendered. In `Card`'s draggable div (lines 535–539), add keyboard support:

```tsx
<div
  draggable="true"
  tabIndex={0}
  role="button"
  aria-label={`${card.title} — press left or right arrow to move between columns`}
  onKeyDown={(e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); onMoveCard(card._id, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onMoveCard(card._id, -1); }
  }}
  onDragStart={(e: DragEvent<HTMLDivElement>) => onDragStart(e, card)}
  className="space-y-2"
>
```

4. Wrap the component definitions: `const MemoCard = memo(Card);` — replace the `<Card` usage inside `Column` with `<MemoCard`, and `memo(Column)` similarly (`const MemoColumn = memo(Column);` + update root render at lines 255–268). Callbacks into `Column` are stable after Step 1; `selected` is a `Set` recreated only when membership changes (line 75–80).

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test --prefix client -- KanbanBoard` then `npm run typecheck --prefix client`
Expected: PASS. Fix the keyboard test's mock assertion to match the `vi.mock` pattern copied from `TaskDetailDrawer.test.tsx` if the first draft over-asserts.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/KanbanBoard.tsx client/src/components/KanbanBoard.test.tsx
git commit -m "perf(a11y): memoize kanban cards, window large columns, keyboard move"
```

### Task 10: Focus trap hook + dialog roles

**Files:**
- Create: `client/src/hooks/useFocusTrap.ts`
- Modify: `client/src/components/AIAssistant.tsx:111`, `client/src/components/CommandPalette.tsx:322-345`, `client/src/components/ui/ShortcutsModal.tsx:21`

**Interfaces:**
- Consumes: same `FOCUSABLE` selector semantics as `Modal.tsx:60-61`.
- Produces: `useFocusTrap(panelRef, isOpen, onClose)` — ESC + Tab cycle + restore focus. `Modal` keeps its own (already correct).

- [ ] **Step 1: Write the hook (no test file — covered by typecheck + manual keyboard check)**

Create `client/src/hooks/useFocusTrap.ts`:

```ts
import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog focus management for panels that do NOT use `Modal`
 * (`Modal` has its own identical machinery). While `isOpen`: ESC calls
 * `onClose`, Tab cycles inside `panelRef`, and focus returns to the opener
 * on unmount. No-op when closed.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (nodes.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    requestAnimationFrame(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current;
      target?.focus({ preventScroll: true });
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [isOpen, onClose, panelRef]);
}
```

- [ ] **Step 2: Apply to the three custom panels**

`AIAssistant.tsx` (panel at line 111 inside `AnimatePresence`): add `const panelRef = useRef<HTMLDivElement>(null);` (import `useRef` + `useFocusTrap`), call `useFocusTrap(panelRef, isOpen, onClose)` near the other hooks, attach `ref={panelRef}` + `tabIndex={-1}` to the panel element, and ensure it carries `role="dialog"` `aria-modal="true"` `aria-label="AI assistant"`.

`CommandPalette.tsx` (panel ~line 334 already has `role="dialog"` `aria-modal="true"`): same three additions (ref + hook call + `tabIndex={-1}`), keep its existing `aria-label`.

`ShortcutsModal.tsx` (root at line 21): same three additions + `role="dialog"` `aria-modal="true"` `aria-label="Keyboard shortcuts"`.

- [ ] **Step 3: Typecheck + manual keyboard verification**

Run: `npm run typecheck --prefix client`
Expected: PASS. Then manually: open each panel, press Tab (focus must cycle inside), ESC (must close), and confirm focus returns to the opener button.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useFocusTrap.ts client/src/components/AIAssistant.tsx client/src/components/CommandPalette.tsx client/src/components/ui/ShortcutsModal.tsx
git commit -m "feat(a11y): shared focus trap for assistant, palette, shortcuts dialogs"
```

### Task 11: Deferred board list + full verification + tag + push

**Files:**
- Modify: `client/src/App.tsx:63-81,296-311,341-461` (deferred values only; everything else from Tasks 5/6/8 already landed)

**Interfaces:**
- Consumes: all tasks above. Produces: green suite + pushed `main` + rollback tag.

- [ ] **Step 1: Defer the board/palette lists**

In `AppContent` (after line 81, `detailTaskId` state), add `useDeferredValue` to the import on line 1 and insert:

```ts
// Board + palette render the (possibly large) task list: defer re-renders
// so typing in Filters (300ms debounce upstream) never blocks keystrokes.
const deferredTasks = useDeferredValue(tasks);
```

In `renderContent`, compute `scoped` from `deferredTasks` instead of `tasks` (line 298), and pass `tasks={deferredTasks}` to `CommandPalette` (line 456).

- [ ] **Step 2: Run the full verification suite**

```bash
npm run test --prefix server
npm run test --prefix client
npm run typecheck --prefix client
npm run build --prefix client
```

Expected: all four PASS. If a pre-existing suite fails for reasons unrelated to this plan, stop and report — do not "fix" by deleting tests.

- [ ] **Step 3: Commit the deferred-list change**

```bash
git add client/src/App.tsx
git commit -m "perf(client): defer board and palette lists"
```

- [ ] **Step 4: Safety tag (on the pre-plan commit) + push**

```bash
git tag -a backup-pre-opt-20260905-99fc259 99fc259 -m "Pre-optimization backup; rollback: git reset --hard backup-pre-opt-20260905-99fc259"
git push origin main
git push origin backup-pre-opt-20260905-99fc259
```
