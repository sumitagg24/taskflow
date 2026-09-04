# Implementation Spec: Notification System

Implements `docs/prd/notification-system.md` (approved). The repo already has
scaffolding — Notification model, `/api/notifications` controller/routes, a
client NotificationsPage, and an email template — but **nothing produces
notifications**. This spec wires it end to end.

## Current state (verified)

- `server/models/Notification.js` — full schema incl. `task_due_soon`,
  `task_overdue`, `daily_digest` types. ✓
- `server/controllers/notificationController.js` + `routes/notificationRoutes.js`
  — list / mark-read / mark-all / delete. `createNotification` helper exists but
  has **zero callers**. ✓
- `server/services/emailService.js` — `sendNotificationEmail` exists, **zero
  callers**, Ethereal-only transport. ✓
- `server/services/socketService.js` — `getIO()`, rooms `user:<id>` already
  established. ✓
- `client` — NotificationsPage, sidebar Bell item (no badge), API client
  functions, but **no socket.io-client dependency and no socket connection**.
- `User.preferences.{notifications,emailNotifications}` — exist, editable in
  Settings, default `true`.

## Server changes

### 1. `server/services/notificationService.js` (new)
Single producer. `notifyUser({ userId, type, title, message, relatedId, relatedType, metadata })`:
1. Read `User` → if `!preferences.notifications`, return `null`.
2. `Notification.create(...)`.
3. Best-effort socket emit `notification:new` to `user:<id>` room via
   `socketService.getIO()` wrapped in try/catch (no-op when io uninitialized,
   e.g. tests).
4. Best-effort email: if `preferences.emailNotifications` and
   `emailService.isConfigured()`, fire-and-forget `sendNotificationEmail`
   (catch + log). Never blocks/throws to caller.

`notificationController.createNotification` is deleted; producers call the service.

### 2. `server/controllers/taskController.js` — reactive triggers
- `createTask`: if `task.assignee && task.assignee != req.user._id` →
  `notifyUser` type `task_assigned` to assignee.
- `updateTask`: 
  - assignee changed (and non-null, != actor) → `task_assigned` to new assignee.
  - `oldStatus !== newStatus` → `task_status_changed` to assignee if set, else
    owner (never the actor).
- `addComment`: 
  - `comment_added` to assignee (if set) and owner, excluding commenter.
  - Scan comment text for `@username` mentions → `mention` to each mentioned
    user (excluding commenter/actor).
- Pass `relatedId`=task._id, `relatedType`='task', `metadata`={status} for
  status change (client routes click-through).
- All `notifyUser` calls are `await`-ed but the service never throws.

### 3. `server/services/notificationScheduler.js` (new) + `server.js`
Every 15 min (`setInterval`, alongside existing jobs):
- **due soon**: tasks `dueDate` in `(now, now+24h)`, status ∉
  {completed,cancelled} → `task_due_soon` to owner + assignee.
- **overdue**: tasks `dueDate < now`, status ∉ {completed,cancelled} →
  `task_overdue` to owner + assignee.
- **Dedupe**: before create, check `Notification.exists({ userId, type,
  relatedId: task._id, 'metadata.reminderDate': dateKey })` where `dateKey` =
  `YYYY-MM-DD` of the dueDate → one reminder per task/user/day.
- Runs only after DB connect (inside `connectDB().then`).

### 4. `server/services/emailService.js` — real transport
- `getTransporter`: if `EMAIL_HOST` set, create SMTP transport
  (host/port/user/pass/secure); else existing Ethereal.
- `isConfigured()` reflects SMTP config (`EMAIL_HOST` present) — used by
  `notificationService` to decide whether email is possible. Ethereal dev
  preview stays for other email (verification/reset) paths.

## Client changes

### 5. `client/package.json` — add `socket.io-client` (v4, matches server).

### 6. `client/src/context/NotificationContext.tsx` (new)
Provider mounted inside `AuthProvider` (AppContent, authenticated branch).
- Connects `io` with `auth: { token }` from localStorage when authenticated,
  disconnects on logout.
- Listens `notification:new` → updates `unreadCount`, shows Sonner toast for
  high-signal types (mention, task_assigned, task_overdue, task_due_soon),
  bumps a `refreshKey` consumed by NotificationsPage to reload.
- Exposes `unreadCount`, `refreshKey`, `refresh()` (calls
  `getNotifications({unreadOnly:true, limit:1})` for count).
- Also re-fetches count after mark-read/mark-all via context method `decrement`.

### 7. `client/src/components/layout/Sidebar.tsx`
- Bell nav item shows unread-count badge when `unreadCount > 0`.

### 8. `client/src/components/pages/NotificationsPage.tsx`
- Listens to `refreshKey` → reloads list.
- Clicking a notification: mark read; if `relatedType === 'task'`, navigate to
  the task via existing window `navigate` event (`onNavigate('all')` is
  insufficient) — dispatch `window.dispatchEvent(new CustomEvent('open-task',
  { detail: { id } }))`; AppContent handles it by opening the task edit modal.

### 9. `client/src/App.tsx`
- Wrap authenticated content in `NotificationProvider`.
- Listen for `open-task` event → fetch task via `getTask(id)` and open edit
  modal (`setEditTask` + `setShowForm(true)`).

## Acceptance criteria → verification

| AC | Verification |
|----|--------------|
| Assignment creates in-app notif + badge without reload | server test asserts Notification row + socket emit; client live via `notification:new` |
| Comment mention notifies other user, not self | server test on `addComment` with `@username` |
| Due-soon/overdue generated, not re-emitted per tick | scheduler test runs twice, 1 notif |
| Prefs toggles respected | server test with `notifications:false` |
| Click-through opens task & marks read | client dispatch handled by AppContent |
| Email failures never break request | `sendNotificationEmail` wrapped in try/catch |
| Existing endpoints keep working | full server suite |

## Out of scope (PRD non-goals)
Browser push, daily digest job, per-type prefs, retention/cleanup, activity
feed separation.

## Open decisions made (from PRD OQ)
- Scheduler freq 15 min; dedupe per task/user/day.
- Digest deferred.
- Status-change notif: any status change, to assignee (else owner), excl. actor.
- Email: SMTP env transport; skip when unconfigured.