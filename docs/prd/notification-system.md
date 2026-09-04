# PRD: Notification System

Feature: turn the existing (unwired) notification scaffolding into a working
notification system for TaskFlow.

Status: Draft — no implementation yet.

---

## Problem

TaskFlow advertises notifications (README) and ships partial scaffolding —
`Notification` model, `/api/notifications` routes, a `NotificationsPage`, an
email template function, and `notifications` / `emailNotifications` user
preferences — but **nothing ever produces a notification**:

- `createNotification` has zero callers; no task event (assignment, status
  change, comment, mention) emits one.
- No scheduled job generates due-soon, overdue, or daily-digest
  notifications, despite `task_due_soon` / `task_overdue` / `daily_digest`
  types existing in the model enum.
- `sendNotificationEmail` has no callers and ignores the user's
  `emailNotifications` preference.
- No real-time push: the sidebar has no unread badge and new notifications
  never reach an open client until a page reload.

Users therefore have a "notifications" page that stays empty and a settings
toggle that does nothing.

## Goal

Ship a working notification system, in-app and optional email, covering
reactive task events and scheduled reminders. Reuse the existing model,
controller, routes, page, and preferences rather than building new ones.

## User experience

- **In-app center (existing `NotificationsPage`)** lists notifications newest
  first, unread highlighted, one-click mark-read and mark-all-read. Add:
  - Clicking a task-linked notification navigates to that task.
  - Real-time arrival of new notifications while the app is open (no reload).
- **Sidebar bell** shows an unread-count badge; the count updates live.
- **In-app toast** (Sonner) on arrival of a high-signal notification (mention,
  assignment, overdue) when the user is not on the notifications page.
- **Email** for deadline alerts (due soon / overdue), status changes,
  assignments, mentions, and daily digest — gated by the user's
  `preferences.emailNotifications`. Email is best-effort: a configured mail
  transport is required; otherwise notifications stay in-app and degrade
  silently.
- **Settings (existing toggles)** continue to control in-app (`notifications`)
  and email (`emailNotifications`) delivery.

## Requirements

### R1 — Notification generation (service)
A single `notificationService` that wraps `createNotification`, checks the
target user's `preferences.notifications` toggle, persists the notification,
and pushes it via Socket.IO. All producers go through this one path.

### R2 — Reactive triggers (in task/comment flows)
Emit notifications for:
- `task_assigned` → user becomes assignee (incl. on create).
- `task_status_changed` → task moves to/from a completed/blocked status.
- `comment_added` → owner/assignee of the task, excluding the commenter.
- `mention` → user's username/name appears in a comment, excluding self.

Each notification carries `relatedId` (task id) + `relatedType: 'task'` so the
client can route clicks.

### R3 — Scheduled triggers (background job)
A periodic job (frequency: every 15 min) that scans tasks with a due date and
emits:
- `task_due_soon` — due within 24h, one notification per task per user per
  day (dedupe via notification metadata/date so a task isn't re-announced
  every tick).
- `task_overdue` — past due and not completed, one per task until resolved.

Plus an optional `daily_digest` job (hourly or configurable) summarizing
today's due/overdue tasks and activity. Digest may be deferred to a later
iteration (see Non-goals).

### R4 — Real-time delivery
- Socket.IO: server emits `notification:new` into `user:<id>` room on every
  created notification (reuse existing `getIO`).
- Client: existing socket connection listens for `notification:new`, updates
  the sidebar unread badge, shows a Sonner toast for high-signal types, and
  refreshes the page list if open.

### R5 — Unread badge
Sidebar bell badge reflects server `unreadCount`. Sources: initial
`getNotifications()` response + live `notification:new` increments + read
actions decrement.

### R6 — Click-through
Notifications with `relatedType: 'task'` navigate to the task (existing
task view/board route) and mark the notification read.

### R7 — Email delivery
- Wire `emailService.sendNotificationEmail` from `notificationService` for
  types: `task_assigned`, `task_status_changed`, `task_due_soon`,
  `task_overdue`, `comment_added`, `mention`.
- Gate on `preferences.emailNotifications`. Never block the request on email
  failure (log + continue).
- Add a real SMTP/Resend transport path (currently Ethereal only); default
  remains the existing behavior when unconfigured.

### R8 — Preferences respected
`preferences.notifications = false` suppresses in-app creation and (by
extension) push; `preferences.emailNotifications = false` suppresses email.
Existing settings UI and `authController` update path already support this.

## Acceptance criteria

1. Assigning a task creates an in-app notification for the assignee; it
   appears in the notifications list and increments the sidebar badge without
   a reload.
2. Adding a comment mentioning another user notifies that user; the
   notifier/commenter is not notified of their own action.
3. A task due within 24h or overdue (and not completed) generates
   `task_due_soon` / `task_overdue` notifications, and is not re-emitted every
   scheduler tick for the same task/user/day.
4. `preferences.notifications = false` stops new in-app notifications;
   `preferences.emailNotifications = false` stops email (email verified only
   where a transport is configured).
5. Clicking a task-linked notification navigates to that task and marks it
   read.
6. Email sending failures never break the triggering request or the
   scheduler run.
7. Existing `NotificationsPage` behaviors (list, mark read, mark all read)
   keep working; server tests and client unit tests for the notification
   endpoints continue to pass.

## Edge cases

- **Self-notification** — no notification for actions a user takes on their
  own task/comment/assignment.
- **Multiple assignees** — each assignee gets their own notification.
- **Duplicate reminders** — scheduler dedupe prevents spam on every tick.
- **Disabled preferences** — user toggles off mid-session; take effect on the
  next produced notification without an error.
- **Email misconfigured** — Ethereal or transport creation failure must not
  throw into request handlers or the scheduler.
- **Orphaned relatedId** — deleted task referenced by a notification; click
  should degrade to the notifications page, not a dead route.
- **Race on mark-read** — concurrent read + delete of the same notification
  must not error or resurrect data.
- **High volume** — no unbounded growth; see constraint on pruning.

## Constraints

- Reuse existing `Notification` model, controller, routes, API client
  functions, `NotificationsPage`, and socket room `user:<id>`.
- Notification creation must stay non-blocking and best-effort; failures are
  logged, never propagated as request errors.
- Rate limiting already applies to `/api/notifications`; do not add new
  per-notification endpoints unless necessary.
- Email config must not add a hard startup dependency (degrades gracefully).

## Non-goals

- Browser push notifications (Web Push) — out of scope for this iteration.
- Daily digest email generation — can follow later; the `daily_digest` type
  stays available.
- Full notification preference matrix (per-type toggles) — the two existing
  boolean toggles are the scope.
- Notification retention/cleanup jobs and settings UI for them.
- Activity feed vs. notification separation.

## Technical considerations

- **Single producer**: all creation flows through one `notificationService`
  that checks preferences, persists, pushes socket event, and best-effort
  emails — the smallest wiring surface.
- **Scheduler**: new `setInterval` alongside existing jobs in `server.js` (or
  a dedicated module); frequency ~15 min; dedupe keyed on
  `userId + type + taskId + date` in `metadata`.
- **Socket emit**: extend `socketService` with an emit helper using the
  existing `getIO()`; client adds a `notification:new` listener alongside
  existing `task:move` / `task:update` handling.
- **Email transport**: add SMTP/Resend path in `emailService` mirroring the
  existing `sendEmail` structure; keep Ethereal as dev default.
- **Badge source of truth**: server `unreadCount` from
  `getNotifications`; client updates are optimistic until next fetch.
- **Wiring points**: task create/update in `taskController` (assignment +
  status change), comment add in `taskController` (comment + mention scan),
  `server.js` scheduler.

## Open questions

1. Should the scheduler also generate the daily digest in this iteration, or
   only due-soon/overdue? (Scope currently excludes digest.)
2. Exact dedupe window for `task_due_soon` — once per task per user per day is
   the default; is per-task-per-status-change preferred?
3. What mail transport should be the production default — SMTP env config or
   Resend? Existing code only wires Ethereal.
4. Should status-change notifications fire on every transition or only
   meaningful ones (e.g., entered `completed` / `blocked`)?
5. Digest email content/format — defer to a follow-up PRD?