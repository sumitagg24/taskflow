# TaskFlow on Oracle Cloud Always-Free

TaskFlow's API host as of the Railway migration. One **always-free** Ampere A1
VM runs a single Docker stack — the Node API (Express + Socket.IO + background
jobs) behind a Caddy edge that terminates TLS — while the React SPA stays on
Vercel and MongoDB stays on the existing free Atlas cluster.

Cost: **$0/month**. What Always Free includes (per tenancy, more than enough):

| Resource | Always-Free allowance | TaskFlow usage |
|---|---|---|
| Compute | 4 Ampere A1 OCPUs + 24 GB RAM (splittable across VMs) | 1 VM: 1 OCPU / 6 GB |
| Block storage | 200 GB total | 50 GB boot volume |
| Outbound data | 10 TB/month | far below |
| MongoDB | (not on Oracle) Atlas **M0 free tier** — unchanged | unchanged |

> Signup requires a card (small pre-auth hold, immediately released). Idle
> **Always-Free** VMs can be reclaimed under sustained low utilization — the
> app's steady request/job activity plus `docker compose` restart policy keeps
> it a live workload. Nothing sleeps, unlike Render/Koyeb free tiers.

---

## 1. Create the VM (your part, ~10 minutes)

1. **Sign up** at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
   (card required for verification only).
2. Console → **Compute → Instances → Create Instance**:
   - **Name:** `taskflow-api`
   - **Image:** Ubuntu 24.04 (canonical, aarch64)
   - **Shape:** *Ampere* → `VM.Standard.A1.Flex` — **1 OCPU, 6 GB RAM**
     (shows "Always Free Eligible")
   - **Boot volume:** 50 GB (default is fine)
   - **SSH keys:** *Paste public keys* → paste the deploy public key
     (`C:\Users\Sumit\.ssh\taskflow-oracle.pub`, shown in the migration
     checklist) — plus any personal key you want.
3. Create it and note the **Public IP address**.
4. **Open the ports** — Console → Networking → Virtual Cloud Networks →
   your VCN → Security Lists → Default Security List → *Add Ingress Rules*
   (source `0.0.0.0/0`):
   - TCP **22** (usually pre-added — SSH)
   - TCP **80** (Caddy ACME HTTP-01)
   - TCP **443** (HTTPS)

## 2. Point a domain at it

Public CAs don't issue certificates for bare IPs, and the cookie auth flow
needs real HTTPS — so give the API a hostname:

- **Own a domain:** add an `A` record, e.g. `api.yourdomain.com → <public IP>`.
- **No domain:** create a free [DuckDNS](https://www.duckdns.org) subdomain
  (`taskflow-api.duckdns.org`) and set its IP to the VM's public IP.

## 3. First deploy (mine or yours)

Either hand me SSH access (VM IP + username, and confirm the deploy key above
was added) and I'll drive it, or run it yourself:

```bash
ssh ubuntu@<VM_PUBLIC_IP>                       # user is `ubuntu` on Ubuntu images
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/sumitagg24/taskflow/main/scripts/oracle-vm-setup.sh)" -- \
  --domain api.yourdomain.com
```

The script is idempotent and: installs Docker, clones the repo to
`/opt/taskflow`, creates `deploy/oracle/.env.prod` from the template (fill in
`MONGO_URI` + JWT secrets when prompted — reuse the values from the old
`server/.env`, they are production-grade), swaps the Caddy domain placeholder,
builds the image, starts the stack, and polls until
`/api/health` returns `{ "status": "ok", "db": "connected" }`.

After it reports live, continue with §4.

---

## 4. Rewire the rest of the stack

| Where | Change | Why |
|---|---|---|
| **Vercel env** | `VITE_API_URL=https://<api-domain>/api`, `VITE_SOCKET_URL=https://<api-domain>` → redeploy | SPA must call the new API origin (baked at build time) |
| **Server env** (`deploy/oracle/.env.prod`) | `CLIENT_URL` + `ALLOWED_ORIGINS` = `https://taskflow-ebon-tau.vercel.app` | OAuth redirect target; production CORS + CSRF are fail-closed against this list |
| **GitHub OAuth app** | callback `https://<api-domain>/api/auth/github/callback` | the flow starts on the API host |
| **Auth0 app** | add the Vercel origin to Allowed Callback/Web/Logout URLs | popup sign-in happens from the SPA origin |
| **Google (legacy direct)** | no change needed (UI uses Auth0) | — |

## 5. Continuous deployment

`.github/workflows/deploy.yml` (replaced from the Railway version) SSHes into
the VM after every successful CI run on main and runs `git pull` +
`docker compose up -d --build`, then smoke-checks `/api/health` via
`scripts/deploy-smoke.cjs`. It **self-skips with a notice** until these repo
secrets/variables exist:

- Secrets: `ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY`
- Variable: `ORACLE_PUBLIC_DOMAIN` (no scheme) — enables the smoke check

Manual deploy: push to main, or Actions → Deploy → Run workflow.

## 6. Verify, operate, roll back

```bash
curl -s https://<api-domain>/api/health        # {"status":"ok","db":"connected",...}
npm run smoke:deploy -- --url https://<api-domain>
ssh ubuntu@<VM_PUBLIC_IP> 'sudo docker compose -f /opt/taskflow/deploy/oracle/docker-compose.yml logs -f app'
```

- **Logs** — `docker compose -f deploy/oracle/docker-compose.yml logs app`
  (request IDs correlate with `X-Request-Id` headers).
- **Rollback** — on the VM: `git -C /opt/taskflow checkout <previous-sha>` then
  re-run `docker compose -f deploy/oracle/docker-compose.yml up -d --build`.
  Procedure details: `docs/ops/rollback.md`.
- **Backups** — data lives in Atlas (`docs/ops/backup-restore.md`); attachments
  live in the `uploads` Docker volume (persist across redeploys — better than
  Railway's ephemeral disk; still export periodically).
- **Updates** — `sudo apt update && sudo apt upgrade` monthly + reboot for
  kernel updates; Oracle won't patch a free VM for you.

## 7. Decommission Railway

1. Railway dashboard → project → **Delete** (stops any billing).
2. Repo → Settings → Secrets → delete `RAILWAY_TOKEN`.
3. `railway.json`, `scripts/railway-setup.cjs` and `docs/ops/railway.md`
   stay in the repo as an archived reference (marked deprecated) — they are
   inert without a linked project.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ssh: connect timed out` | Security list missing TCP 22, or wrong IP |
| Site unreachable on 443 but SSH works | Security list missing TCP 80/443 |
| Caddy logs `no certificate available` / ACME errors | DNS not pointing at the VM yet, or 80 blocked (HTTP-01 needs it) |
| Health returns `db: connecting/disconnected` | `MONGO_URI` wrong, or Atlas Network Access doesn't allow the VM IP (add `0.0.0.0/0` — M0 has no static egress) |
| Browser CORS/403 errors | `ALLOWED_ORIGINS` missing the exact Vercel origin |
| `403 Cross-origin request forbidden` on mutations | Same — CSRF uses the same allowlist |
| Login loop right after sign-in | `NODE_ENV` must be `production` (set in compose) so cookies get `SameSite=None; Secure`; browser must allow third-party cookies for cross-origin auth |
| Container restart-loop | `docker compose logs app` — startup validation refused to boot (missing `MONGO_URI`/`JWT_SECRET`/`CLIENT_URL` or secrets < 32 chars) |