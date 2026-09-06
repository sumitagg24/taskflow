# Rollback

Short, unscripted, human-approved. Every step below is a command you run
deliberately — there is no rollback script, by policy.

## 1. Identify the target

Prefer a tag; fall back to a commit SHA. Recent history and tags:

```bash
git log --oneline -10
git tag --list --sort=-creatordate | head
```

Verify the target builds and passes suites *before* pointing traffic at it
(see VERIFY below).

## 2. Move the branch (local)

```bash
git reset --hard <tag-or-sha>
```

This only moves your local checkout. Nothing remote changes until step 3.

## 3. Force-push policy — explicit approval required

A force-push rewrites shared history. Do NOT run it on your own authority:

1. Get explicit approval (second engineer or incident commander).
2. Announce it in the team channel first (who, why, target tag/SHA).
3. Then, and only then:

```bash
git push --force-with-lease origin <branch>
```

`--force-with-lease` (never bare `--force`) so you cannot silently clobber
someone else's push that landed after your reset.

## 4. Database backward-compat note

Migrations in this codebase are additive: the only migration,
`server/migrations/migrate_usernames.js`, backfills missing usernames and
drops nothing, so rolling the app back does not require rolling the database
back. General rule still applies — if a deploy ever ships a destructive or
renaming migration, pair it with a forward fix instead of a reset, and
restore from `docs/ops/backup-restore.md` (Atlas snapshot or `mongorestore`)
rather than improvising.

## 5. Vercel redeploy note

The client (`client/vercel.json` is a plain SPA rewrite) redeploys on push
to the connected branch, so the force-pushed rollback redeploys
automatically. If the dashboard shows a stale deployment, use
**Deployments → … → Redeploy** on the rolled-back commit instead of
pushing empty commits.

## VERIFY (after rollback)

```bash
npm run test --prefix server
npm run test --prefix client
npm run typecheck --prefix client
npm run build --prefix client
```
