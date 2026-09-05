# Backup & Restore

Concise runbook for MongoDB + app-level exports. The connection string lives
in `server/.env` as `MONGO_URI` — never echo it or paste it into tickets.

## 1. Atlas automated snapshots (primary)

1. Atlas console → your cluster → **Backup** → enable **Cloud Backup**.
2. Turn on **Point-in-Time Recovery** (oplog window, typically 7 days).
3. Retention guidance: keep **daily snapshots for 7 days minimum**; keep one
   weekly snapshot for 4 weeks for slower-burn data loss.
4. Restore: **Backup → Restore** → pick snapshot / point-in-time → restore
   into a new cluster or download, then point `MONGO_URI` at it.

## 2. Logical backup with mongodump (offsite copy)

```bash
mongodump --uri="$MONGO_URI" --out=./backup-YYYYMMDD
```

Replace `YYYYMMDD` with the date (e.g. `backup-20260905`). The shell expands
`$MONGO_URI` from the environment — do not `echo` it. Run from a host that
already has `MONGO_URI` set (same env as `server/.env`).

## 3. Restore from mongodump

```bash
mongorestore --uri="$MONGO_URI" ./backup-YYYYMMDD
```

For a single collection:

```bash
mongorestore --uri="$MONGO_URI" --nsInclude='taskflow.tasks' ./backup-YYYYMMDD
```

## 4. App-level export (per-user safety net)

Authenticated users can export their own live tasks (JSON or CSV):

```bash
curl -H "Authorization: Bearer <access-token>" \
  'https://<host>/api/tasks/export?format=json' -o tasks-export.json
```

Scoped to the caller's tasks only — not a full-database backup.

## 5. Restore order

1. `users` → 2. `tasks` → 3. `templates` → 4. `notifications`.
   Respect FK-ish references (`userId`, template `sharedWith`, notification
   targets) so later collections resolve against already-restored owners.
   Index rebuild is automatic via Mongoose schema definitions on next connect.

## 6. Recommended schedule

- **Daily:** Atlas automated snapshot (retention ≥ 7 days).
- **Weekly:** `mongodump` to offsite storage (separate account/region).
- **Pre-deploy:** per-user `GET /api/tasks/export?format=json` for any
  account touched by a risky migration, plus a fresh Atlas snapshot.
