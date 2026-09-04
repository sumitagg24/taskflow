# TaskFlow Optimization & Completion — Design Spec

Date: 2026-09-05
Status: Approved (Approach A: backend-first perf + frontend hardening)
Scope: `sumitagg24/taskflow`, branch `main`. Local dir `C:\Users\Sumit\projects\task-tracker`.

## 1. Context & Findings

Audit of HEAD `61509d7` found no genuine TODO/FIXME/stub pages: all 17 client pages
(Dashboard, Calendar, Analytics, Insights, Settings, Team, Trash, Favorites,
Categories, Templates, FocusTimer, Notifications, Auth/Forgot/Reset/Verify +
auth/*) render real data with loading/empty states, and no skipped tests.
The work is therefore optimization + hardening, not feature completion.

Hot spots confirmed by audit:

- Backend: `GET /tasks` (`server/controllers/taskController.js:122-171`) has no
  pagination, no `.lean()`, no projection, regex `$regex` search instead of the
  existing text index, and double `populate` on an unbounded set. Contrast:
  notifications/time-tracking/trash/export already paginate + `lean()`.
- Frontend: `client/src/App.tsx` lazies 11 secondary pages but eagerly imports
  `TaskForm`, `AIAssistant`, `CommandPalette`, `TaskDetailDrawer`; zero
  `React.memo` on board cards; `tasks.filter` client-side over full fetch;
  `socket.io-client` + `sonner` left in main chunk.
- Resilience/UX: zero `ErrorBoundary`; `fetchTasks` (`App.tsx:141`) and
  `NotificationContext.tsx:31` swallow errors; Kanban uses HTML5 DnD with no
  keyboard alternative; no focus-trap audit; no `prefers-reduced-motion` guard;
  no skip-link.

## 2. Goals / Non-Goals

Goals:

1. Bound `GET /tasks` cost (pagination + lean + projection + text search).
2. Cut initial bundle and board re-render cost (lazy modals, memo, deferred search).
3. Eliminate silent failures (ErrorBoundary + toasts + retry).
4. Close keyboard/focus/motion gaps without visual redesign.

Non-goals: no visual rebrand, no new pages, no Redis/BullMQ/react-query
(deferred to Approach B), no auth/payment changes, no mobile app changes.

## 3. Architecture

Keep Express + Mongoose + React Vite structure. Changes are internal:

- API: cursor/offset pagination on list endpoints only; detail endpoints unchanged.
- Client: same routes; heavier dialogs become `lazy()` + `Suspense`.
- No new services, no new env vars, no migration scripts. Index additions are
  backward-compatible (`createIndex` via Mongoose schema, built in background).

## 4. Components & Changes

### 4.1 Backend (`server/`)

- `controllers/taskController.js#getTasks`: accept `page` (default 1),
  `limit` (default 50, clamp 1–200), `paginate` (default true). When
  `paginate=false`, preserve legacy full-array shape for the escape hatch.
  Paginated shape: `{ data, page, limit, total, totalPages }`.
  Apply `.select()` projection (exclude `comments`, `attachments`, `activity`
  from list), `.lean()`, populate only `assignee` (`name username avatar`),
  drop `comments.userId` populate on list (stays on `getTask` detail).
- Search: prefer `$text: { $search }` when `search` is present and text index
  exists; fall back to escaped case-insensitive regex for partial matches.
  Add compound index in `models/Task.js` covering `(userId, deletedAt, status,
  updatedAt)` and `(userId, deletedAt, dueDate)` to cover sort paths
  (`-updatedAt`, `dueDate`, `title`).
- `getTrash`, activity log, recurring-job scans: add `.lean()` + batch caps
  (`limit(200)` already on trash; keep) and avoid per-doc `populate`.
- `sanitizeDependencies`: keep correctness, batch assignee existence check
  with single `$in` query instead of per-item `find`.
- Rate limiting/compression/helmet unchanged.

### 4.2 Frontend (`client/`)

- `App.tsx`: convert `TaskForm`, `TaskDetailDrawer`, `AIAssistant`,
  `CommandPalette` to `lazy()`; wrap each usage in existing `Suspense`
  (`PageLoader` fallback). Keep `Dashboard`, `KanbanBoard`, `Sidebar`,
  `Navbar` eager (above-the-fold).
- `KanbanBoard.tsx`: `React.memo` card component (`TaskCard`), `key` by `_id`,
  memoize column lists; render window guard: when column items > 100, render
  first 100 + "Show more" increment (no new dep; full virtualizer deferred).
- `Filters.tsx` + `CommandPalette.tsx`: `useDeferredValue` for query input;
  board filters consume deferred value to avoid per-keystroke full re-filter.
- `vite.config.js`: add `socket.io-client`, `sonner` to vendor chunk split;
  keep existing `manualChunks` names stable.
- New `components/ui/ErrorBoundary.tsx`: class component with
  `getDerivedStateFromError` + reset-on-route-change + "Retry" button that
  calls `window.location.reload()` fallback and `reset()` when `resetKeys`
  change. Mount at root in `main.tsx` (outside `Theme/Auth` providers so a
  context crash still renders fallback) plus one per lazy page section.

### 4.3 UX / Accessibility

- Errors: `fetchTasks` catch → `toast.error` with Retry action; notification
  fetch failure → toast once per session; per-page error card with Retry
  (reuses `Feedback.EmptyState` pattern, no new design language).
- Kanban keyboard: each card gets "Move to" menu (existing status list) +
  arrow-key handler on focused card (`ArrowLeft/Right` moves column);
  `aria-grabbed`/`aria-live="polite"` region announces moves via existing
  `sonner` + live region.
- Modals (`Modal`, `TaskDetailDrawer`, `AIAssistant`, `CommandPalette`):
  focus-trap on open, return focus on close, ESC closes (verify existing,
  add where missing). Add `skip-link` ("Skip to tasks") in `App.tsx`.
- Motion: `useReducedMotion()` hook (`matchMedia('(prefers-reduced-motion:
  reduce)')`); when true, skip `framer-motion` animations (render static).
- Fonts/theming unchanged; no token renames.

## 5. Data Flow

Before: `GET /tasks` → full Mongoose docs + double populate → full JSON →
client stores all → `filter()` per render.

After: `GET /tasks?page&limit&search&status&...` → validate → Mongoose
`find().select().lean().populate(assignee-lite).skip().limit()` + parallel
`countDocuments` → `{ data, page, limit, total, totalPages }` → client stores
page + total, renders windowed columns, prefetches next page on "Show more".
Detail drawer calls `GET /tasks/:id` (full populate) only when opened.
`?paginate=false` returns legacy array for scripts/tests.

## 6. Error Handling

- API: invalid `page/limit` → `400` with field errors via existing validator
  pattern; DB errors → existing `errorHandler` middleware (no change).
- Client: `ErrorBoundary` fallback (message + Retry + "Go to Dashboard");
  page-level fetch errors → error card + Retry button calling same fetcher;
  background failures (notifications) → single toast, no modal.
- Scheduler/recurring jobs: wrap each interval tick in try/catch + `logger`,
  skip overlapping tick if previous still running (boolean guard, no new dep).

## 7. Testing & Verification

- Update `server/__tests__/tasks.test.js` for paginated shape (assert
  `data/page/total` + legacy `paginate=false` case + text-search case).
- Add `server/__tests__/tasksPagination.test.js` if existing file grows
  unwieldy: page clamp, limit clamp, projection (no `comments` key on list),
  lean (plain objects), index existence assertion.
- Client: extend `Filters.test.tsx` / new `ErrorBoundary.test.tsx` +
  `KanbanBoard` memo smoke (render 150 tasks, assert windowing + Show more).
- Commands: `npm run test --prefix server`, `npm run test --prefix client`,
  `npm run typecheck --prefix client`, `npm run build --prefix client`.
  All four must pass before push. No new flaky network tests; OAuth e2e
  stays env-gated.

## 8. Rollout & Rollback

- Backward-compatible by default except `GET /tasks` shape change, mitigated
  by `?paginate=false` escape hatch. Breaking change accepted by owner
  (2026-09-05), no mobile client pinning to old shape.
- Rollback tag for this cycle to be created before implementation push
  (follow existing convention `backup-pre-push-<date>-<sha>`); rollback via
  `git reset --hard <tag> && git push --force origin main`.
- No env/DB migration; indexes build in background; safe to roll forward.

## 9. Risks

- Text-search relevance differs from regex substring: mitigated by fallback
  regex for short/partial queries and keeping `search` semantics documented.
- `lean()` returns plain objects: audit for code relying on Mongoose doc
  methods in `getTasks` path (none expected; detail path keeps docs).
- Lazy modals shift first-open cost: acceptable; Suspense fallback covers it.
- Windowing ("Show more") is not full virtualization: keeps dep-free scope;
  full `react-window` deferred to Approach B if lists exceed ~1k routinely.
