# TaskFlow

An AI-assisted task management platform built around a Kanban workflow, with focus
timers, time tracking, analytics, recurring tasks, calendar sync, and team
collaboration. The app is a single deployable unit: an Express + Socket.IO API that
also serves the built React SPA.

---

## Table of Contents

- [Overview](#overview)
- [Screenshots](#screenshots)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API](#api)
- [AI Providers](#ai-providers)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [License](#license)

---

## Overview

TaskFlow helps individuals and teams organize work through a flexible Kanban board
and a rich task model. Beyond basic CRUD, it offers:

- **AI assistance** for parsing natural language into tasks, breaking tasks down,
  suggesting priorities, generating daily digests, and chatting about your workload.
- **Focus & time tracking** via a Pomodoro-style timer and per-task time sessions.
- **Recurring tasks** that regenerate on a schedule (hourly job in the server).
- **Calendar integration** with iCal export and one-click Google / Outlook / Apple links.
- **Real-time collaboration** powered by Socket.IO (task moves, updates, presence).
- **Notifications** (in-app + optional email) for assignments, deadlines, mentions, and digests.
- **Insights & analytics** — productivity score, streaks, velocity/burndown, time reports.
- **Growth & plans** — Free/Pro/Team tiers with usage limits, referral codes, team invites.
- **Everyday speed** — ⌘K command palette, task detail drawer, Trash with 30-day restore,
  keyboard-accessible Kanban, and a paginated, indexed task API.

The AI, email, and external calendar features are all **optional** — the app degrades
gracefully (heuristic fallbacks) when no API keys are configured.

---

## Screenshots

| Screen | Preview |
|--------|---------|
| Login | <img src="client/e2e/screenshots/01-login.png" width="400" /> |
| Signup | <img src="client/e2e/screenshots/02-signup.png" width="400" /> |
| Dashboard | <img src="client/e2e/screenshots/03-dashboard.png" width="400" /> |
| Kanban | <img src="client/e2e/screenshots/04-kanban.png" width="400" /> |
| Calendar | <img src="client/e2e/screenshots/05-calendar.png" width="400" /> |
| Analytics | <img src="client/e2e/screenshots/06-analytics.png" width="400" /> |
| Focus Timer | <img src="client/e2e/screenshots/07-focus-timer.png" width="400" /> |
| AI Assistant | <img src="client/e2e/screenshots/08-ai-assistant.png" width="400" /> |
| Insights | <img src="client/e2e/screenshots/10-insights.png" width="400" /> |
| Trash | <img src="client/e2e/screenshots/11-trash.png" width="400" /> |
| Team | <img src="client/e2e/screenshots/12-team.png" width="400" /> |
| Favorites | <img src="client/e2e/screenshots/13-favorites.png" width="400" /> |
| Settings | <img src="client/e2e/screenshots/09-settings.png" width="400" /> |

> Screenshots are regenerated from the running app (`client/e2e` capture script)
> and show the current UI with demo data.

---

## Features

### Task Management
- Kanban board with drag-and-drop across statuses (`backlog`, `pending`, `in-progress`, `review`, `completed`, `blocked`, `cancelled`) — plus full keyboard move support (←/→ on a focused card) and memoized, windowed columns.
- Rich tasks: subtasks, comments, tags, attachments, categories, priority, due dates, dependencies, favorites, and ordering.
- Task detail drawer (deep-linkable), ⌘K/Ctrl-K command palette with fuzzy search, saved views + smart views (due today, overdue, next 7 days, critical).
- Trash with 30-day restore, purge, and empty-trash.
- Batch operations and bulk actions.
- CSV / iCal export.
- Paginated list API (`page`, `limit`, `paginate=false` legacy shape) backed by covering indexes and full-text search with regex fallback.

### AI Assistant
- Natural-language task parsing (`/api/ai/parse`).
- Automatic subtask breakdown from a task title/description.
- Priority suggestions across a task list.
- Daily digest generation and "next best action" recommendations.
- Conversational assistant aware of your task context.
- Provider-agnostic — plug in OpenAI, Gemini, Claude, Groq, OpenRouter, Together AI, or any OpenAI-compatible endpoint.

### Focus & Time Tracking
- Configurable Pomodoro timer (work / break / long-break durations, sessions before long break).
- Per-task time sessions with pause tracking, notes, and tags.
- Daily focus-time accumulation and streaks per user.

### Recurring Tasks
- Intervals: `daily`, `weekly`, `monthly`, `yearly`, `weekdays`.
- Optional end date; next occurrence computed automatically by a background job.

### Calendar
- Export filtered tasks to `.ics`.
- One-click subscription/add links for Google Calendar, Outlook, and Apple Calendar.

### Insights & Analytics
- Productivity score with completion / on-time / momentum / consistency breakdown.
- Streaks, velocity (created vs completed), burndown, backlog age, and time reports over 7/30/90 days.
- Analytics page with priority distribution and timeframe switching.

### Growth & Plans
- Free / Pro / Team tiers enforced server-side (`server/config/plans.js` is the single source for UI + enforcement; plan upgrades are never client-writable).
- Referral codes with credit caps, invite tracking, and daily invite limits.
- Team page with plan usage meters, referral link, and invite management.

### Notifications
- In-app notifications for assignments, status changes, due-soon / overdue, mentions, and daily digests.
- Optional email delivery (deadline alerts, status changes, daily digest) via SMTP / Resend.

### Collaboration & Real-Time
- Socket.IO rooms per user; authenticated connections only.
- Live task move/update propagation and collaboration cursors.
- Team page, shared templates, notes, and an activity timeline.

### Accounts & Security
- Email/password auth with bcrypt hashing, refresh-token rotation + reuse detection, account lockout, and email verification.
- Google Sign-In and GitHub OAuth.
- Helmet security headers, CORS allow-list, rate limiting (in-memory or Redis-backed), request-ID tracing, and a global error handler.

### Reliability & Accessibility
- Root `ErrorBoundary` with retry so one broken widget can't blank the app; fetch errors surface as toasts with retry actions.
- Focus-trapped dialogs, ESC-to-close, skip-to-tasks link, screen-reader live regions, and `prefers-reduced-motion` support.
- Lazy-loaded dialogs/drawers, code-split vendor chunks, and deferred board rendering.

### Customization
- Light / dark / system themes.
- Per-user preferences (notifications, Pomodoro settings) and profile (name, username, bio, avatar).

---

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  React SPA (client/)    │  HTTP/  │  Express API (server/)        │
│  Vite + Tailwind + TS   │  WS     │  REST + Socket.IO             │
│  Served as static build │ ──────► │  Controllers → Services →     │
│  from the same server   │         │  Mongoose Models              │
└─────────────────────────┘         └───────────────┬──────────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │  MongoDB (Mongoose)│
                                            └──────────────────┘
                                                     │
                          Optional integrations ─────┼───────
                          • AI providers (OpenAI,    │
                            Gemini, Claude, …)        │
                          • Email (SMTP/Resend)       │
                          • Google OAuth              │
```

**Request flow:** `server.js` wires global middleware (Helmet → request ID →
compression → logging → CORS → body parsing), initializes Socket.IO, mounts the
static SPA build and the `/api/*` routers, serves Swagger docs, and falls back to
`index.html` for any non-API route. Every API route except health/docs is protected
by the `protect` auth middleware and a rate limiter.

**Background jobs** run inside the server process (each guarded against overlapping ticks):
- Recurring-task generation (hourly).
- Trash purge after the 30-day retention window (every 6 hours).
- Daily reset of per-user `focusTimeToday` (hourly).
- Due-soon / overdue notification reminders (every 15 minutes).

**Real-time:** the client opens a single authenticated Socket.IO connection; the
server joins each socket to a `user:<id>` room and emits sanitized `task:created`,
`task:moved`, `task:updated`, and `collaboration:cursor` events.

---

## Tech Stack

| Layer        | Technology |
|--------------|------------|
| Frontend     | React 18, TypeScript, Vite 6, Tailwind CSS 4, Framer Motion, Lucide React, Axios, Sonner |
| Backend      | Node.js, Express 4, Mongoose 8, Socket.IO 4 |
| Database     | MongoDB |
| Auth         | JWT (access + refresh), bcrypt, Helmet, CORS, express-rate-limit |
| AI           | OpenAI SDK (provider abstraction over OpenAI / Gemini / Anthropic / Groq / OpenRouter / Together) |
| Email        | Nodemailer (SMTP / Resend, Ethereal in dev) |
| Calendar     | ical-generator |
| Docs         | Swagger (swagger-jsdoc + swagger-ui-express) |
| Infra        | Docker + Docker Compose |

---

## Project Structure

```
task-tracker/
├── client/                     # React + TypeScript SPA
│   ├── src/
│   │   ├── api/                # API client functions (axios, toTaskArray)
│   │   ├── components/         # pages/, ui/ (+ErrorBoundary), layout/, widgets/, domain components
│   │   ├── context/            # Auth, Theme & Notification providers
│   │   ├── hooks/              # Custom hooks (focus timer, Google auth, focus trap)
│   │   ├── lib/                # Utilities (fuzzy search, plan limits, referrals)
│   │   ├── App.tsx             # Router & app shell
│   │   └── main.tsx            # Entry point
│   ├── public/                 # Static assets, service worker
│   └── vite.config.ts
├── server/                     # Express API
│   ├── config/                 # db, cors, swagger, upload, plans
│   ├── controllers/            # auth, task, ai, aiSettings, template, calendar, timeTracking, notification, growth, system
│   ├── middleware/             # auth, errorHandler, rateLimiter, requestId
│   ├── models/                 # User, Task, TimeSession, TaskTemplate, Notification, ActivityLog
│   ├── routes/                 # Express routers per domain
│   ├── services/               # aiService, aiProviders/, emailService, icalService, socketService, passwordService, notificationService/Scheduler
│   ├── validators/             # express-validator schemas
│   ├── utils/                  # logger, response, shutdown
│   └── server.js               # App entry point
├── docker-compose.yml          # mongo + server + client services
├── package.json                # Root scripts (dev, build, start)
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- A MongoDB instance (local `mongod` or a MongoDB Atlas connection string)

### Local Development

```bash
# 1. Install dependencies for all three workspaces
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# 2. Configure the server
cp server/.env.example server/.env
# Set at least MONGO_URI, JWT_SECRET, JWT_REFRESH_SECRET, CLIENT_URL

# 3. Run client + server together
npm run dev
```

- Web app: `http://localhost:3000`
- API: `http://localhost:5000`
- API docs: `http://localhost:5000/api/docs`

> The server serves the built client from `client/dist`. For development you
> typically run the Vite dev server on :3000 and the API on :5000; for production
> you build the client and let the API serve it.

### Using Docker

```bash
docker-compose up -d
```

This starts MongoDB, the API (`:5000`), and the built client (`:3000` → `:80`).

---

## Configuration

All server configuration is via environment variables. Copy `server/.env.example`
to `server/.env` and edit as needed.

| Variable             | Required | Default                  | Description |
|----------------------|----------|--------------------------|-------------|
| `MONGO_URI`          | Yes      | —                        | MongoDB connection string |
| `JWT_SECRET`         | Prod     | —                        | Access-token signing secret |
| `JWT_REFRESH_SECRET` | Prod     | —                        | Refresh-token signing secret |
| `CLIENT_URL`         | Prod     | `http://localhost:3000`  | Allowed CORS origin / app URL |
| `PORT`               | No       | `5000`                   | API port (1–65535) |
| `NODE_ENV`           | No       | `development`            | `development` or `production` |
| `GOOGLE_CLIENT_ID`   | No       | —                        | Enables Google Sign-In |
| `RESEND_API_KEY`     | No       | —                        | Enables transactional email |
| `REDIS_URL`          | No       | —                        | Enables Redis-backed rate limiting |
| `VITE_GOOGLE_CLIENT_ID` | No   | —                        | Client-side Google button (`client/.env`) |

Secrets are validated on startup — the server refuses to boot if `MONGO_URI` is
missing, and in production if `JWT_SECRET`, `JWT_REFRESH_SECRET`, or `CLIENT_URL`
are missing.

---

## API

Interactive docs: `GET /api/docs` (Swagger UI) and `GET /api/docs.json` (OpenAPI spec).
All routes below require a `Bearer` access token unless marked otherwise.

### Tasks
`GET /api/tasks` is paginated by default and returns
`{ data, page, limit, total, totalPages }`. Pass `?paginate=false` for the
legacy bare-array shape. Supports `status`, `priority`, `sort`, `search`
(full-text first, regex fallback), `category`, `tag`, `isFavorite`,
`dueDateBefore/After`, `page`, `limit`.

| Method | Endpoint                        | Purpose |
|--------|---------------------------------|---------|
| GET    | `/api/tasks`                    | List/filter tasks (paginated) |
| POST   | `/api/tasks`                    | Create task |
| GET    | `/api/tasks/:id`                | Get one task (fully populated) |
| PUT    | `/api/tasks/:id`                | Update task |
| DELETE | `/api/tasks/:id`                | Soft-delete → Trash |
| GET    | `/api/tasks/trash`              | List trashed tasks + purge dates |
| POST   | `/api/tasks/:id/restore`        | Restore from Trash |
| DELETE | `/api/tasks/:id/purge`          | Permanently delete |
| DELETE | `/api/tasks/trash`              | Empty Trash |
| GET    | `/api/tasks/stats`              | Task statistics |
| GET    | `/api/tasks/activity`           | Activity log |
| GET    | `/api/tasks/export`             | CSV export |
| POST   | `/api/tasks/batch`              | Bulk update |
| PUT    | `/api/tasks/order`              | Reorder tasks |
| POST   | `/api/tasks/:id/subtasks`       | Add subtask |
| PUT    | `/api/tasks/:id/subtasks/:sid`  | Update subtask |
| DELETE | `/api/tasks/:id/subtasks/:sid`  | Delete subtask |
| POST   | `/api/tasks/:id/comments`       | Add comment |
| DELETE | `/api/tasks/:id/comments/:cid`  | Delete comment |
| POST   | `/api/tasks/:id/timer/start`    | Start time session |
| POST   | `/api/tasks/:id/timer/stop`     | Stop time session |
| POST   | `/api/tasks/:id/favorite`       | Toggle favorite |

### AI
| Method | Endpoint                       | Purpose |
|--------|--------------------------------|---------|
| POST   | `/api/ai/parse`                | Parse natural language → task |
| POST   | `/api/ai/breakdown/:id`        | Generate subtasks |
| POST   | `/api/ai/suggest-priorities`   | Suggest priorities |
| GET    | `/api/ai/digest`               | Daily digest |
| POST   | `/api/ai/chat`                 | Chat with assistant |
| POST   | `/api/ai/generate-title`       | Generate title from description |
| GET    | `/api/ai/suggest-next-action`  | Recommend next task |

### Other
| Method | Endpoint                         | Purpose |
|--------|----------------------------------|---------|
| GET/POST/PUT/DELETE | `/api/templates[/:id]` | Task templates (+ `/shared`, `/:id/apply`, `/:id/copy`) |
| GET    | `/api/calendar/export`           | iCal (`.ics`) export |
| GET    | `/api/calendar/links?taskId=`    | Google/Outlook/Apple links |
| POST   | `/api/time-tracking/:taskId/start\|stop\|pause\|resume` | Time sessions |
| GET    | `/api/time-tracking/history\|report\|export` | Time reports |
| GET    | `/api/notifications`             | List (`{ items, pagination, unreadCount }`) |
| PUT    | `/api/notifications/:id/read`    | Mark one read |
| PUT    | `/api/notifications/read-all`    | Mark all read |
| DELETE | `/api/notifications/:id`         | Delete notification |
| GET    | `/api/growth`                    | Plan, usage, referral, invites |
| POST   | `/api/growth/invite`             | Invite by email |
| DELETE | `/api/growth/invite/:email`      | Revoke invite |
| GET    | `/api/health`                    | Health check |
| GET    | `/api/system/*`                  | Dev diagnostics |

---

## AI Providers

AI keys are entered **per user** in *Settings → AI* and stored securely on the
`User` document (the key is excluded from API responses). If no provider is
configured, the AI service returns safe heuristic fallbacks so the app keeps
working.

| Provider           | Default Model | Notes |
|--------------------|---------------|-------|
| OpenAI             | `gpt-4o-mini` | General purpose |
| Google Gemini      | `gemini-1.5-flash` | Free tier available |
| Anthropic Claude   | `claude-3-5-sonnet` | Reasoning-focused |
| Groq               | `llama-3.3-70b` | Low-latency, free tier |
| OpenRouter         | `openai/gpt-4o-mini` | 200+ models via one key |
| Together AI        | `Llama-3.3-70B` | Open-source models |
| OpenAI Compatible  | (custom) | Any self-hosted / custom endpoint |

---

## Scripts

| Command            | Location | Purpose |
|--------------------|----------|---------|
| `npm run dev`      | root     | Run client + server concurrently |
| `npm run build`    | root     | Build the client for production |
| `npm start`        | root     | Start the production server (serves built client) |
| `npm run dev`      | `server` | Run API with nodemon |
| `npm start`        | `server` | Run API with node |
| `npm test`         | `server` | Run Jest tests |
| `npm run dev`      | `client` | Run Vite dev server |
| `npm run build`    | `client` | Build client bundle |
| `npm run typecheck`  | `client` | Strict TypeScript check (`tsc --noEmit`) |
| `npm test`         | `client` | Run Vitest unit tests |
| `npm run test:e2e` | `client` | Run Playwright E2E tests |

---

## Testing

- **Server:** `npm run test --prefix server` — Jest + Supertest over an
  in-memory MongoDB (6 suites, 177 tests: auth, tasks incl. pagination/search/indexes,
  growth, security, system, notification triggers).
- **Client:** `npm run test --prefix client` — Vitest (11 files, 160 tests:
  API client, Kanban windowing/keyboard, drawer, filters, UI kit, plan/referral libs)
  plus `npm run typecheck --prefix client` and `npm run build --prefix client`.
- **Live smoke test:** boots the real server against a real database and exercises
  29 checks end-to-end — register → CRUD → pagination/search → trash lifecycle →
  notifications/growth/templates/calendar/timer → docs/SPA → Socket.IO realtime
  broadcast. Currently **29/29 passing**.
- **E2E/screenshots:** Playwright (`client/e2e`) drives the real UI for the
  screenshots above; OAuth suites stay env-gated.

Run server tests before opening a pull request.

---

## Deployment

**Single-process (recommended):** build the client, then start the server — it
serves both the API and the SPA from one port.

```bash
npm run build      # builds client/dist
npm start          # NODE_ENV=production, serves API + SPA on PORT
```

Set `NODE_ENV=production`, configure `MONGO_URI`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, and `CLIENT_URL`. For rate limiting at scale, set `REDIS_URL`.

**Docker:** `docker-compose up -d` provisions MongoDB, the API, and the client.

---

## License

MIT
