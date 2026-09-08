#!/usr/bin/env bash
# TaskFlow — Oracle Cloud Always-Free VM bootstrap.
#
# Idempotent: safe to re-run. Installs Docker, clones/updates the repo, writes
# the production env, swaps the Caddy domain placeholder, builds and starts the
# stack (app + Caddy edge), then polls /api/health until it reports
# { status: ok, db: connected }.
#
# Usage (as a sudo-capable user on the VM):
#   bash scripts/oracle-vm-setup.sh --domain api.yourdomain.com [--env-file p]
#
# Flags:
#   --domain <host>   public hostname Caddy serves (required on first run
#                     unless the Caddyfile was already edited)
#   --env-file <p>    source for deploy/oracle/.env.prod (copied if missing)
#   --dir <path>      install dir (default /opt/taskflow)
#   --repo <url>      git remote (default this project's GitHub URL)
#   --branch <name>   default main
#   --yes             non-interactive

set -euo pipefail

REPO_URL="https://github.com/sumitagg24/taskflow.git"
INSTALL_DIR="/opt/taskflow"
BRANCH="main"
DOMAIN=""
ENV_FILE_SRC=""
ASSUME_YES=0

log()  { printf '\033[1;34m[taskflow]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[taskflow]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[taskflow]\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)   DOMAIN="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE_SRC="${2:-}"; shift 2 ;;
    --dir)      INSTALL_DIR="${2:-}"; shift 2 ;;
    --repo)     REPO_URL="${2:-}"; shift 2 ;;
    --branch)   BRANCH="${2:-}"; shift 2 ;;
    --yes)      ASSUME_YES=1; shift ;;
    *) die "unknown flag: $1" ;;
  esac
done

[[ $(id -u) -eq 0 ]] || die "run as root (sudo)."

# ── 1. Docker Engine ────────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  log "Docker already installed: $(docker --version)"
else
  log "Installing Docker Engine…"
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
fi
docker compose version >/dev/null 2>&1 || die "docker compose plugin missing."

# ── 2. Repo ─────────────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Updating repo at $INSTALL_DIR…"
  git -C "$INSTALL_DIR" fetch --all --prune
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  log "Cloning $REPO_URL → $INSTALL_DIR…"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── 3. Production env ───────────────────────────────────────────────────────
ENV_FILE="deploy/oracle/.env.prod"
if [[ -f "$ENV_FILE" ]]; then
  log "$ENV_FILE exists — keeping it."
elif [[ -n "$ENV_FILE_SRC" ]]; then
  [[ -f "$ENV_FILE_SRC" ]] || die "env file not found: $ENV_FILE_SRC"
  install -m 600 "$ENV_FILE_SRC" "$ENV_FILE"
  log "Copied env from $ENV_FILE_SRC."
else
  cp deploy/oracle/.env.prod.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  warn "$ENV_FILE created from the template — fill it in (MONGO_URI, JWT secrets), then re-run."
  [[ $ASSUME_YES -eq 1 ]] || { echo "  nano $ENV_FILE"; read -r -p "Press ENTER once saved…"; }
fi
grep -q "^MONGO_URI=mongodb" "$ENV_FILE" || die "$ENV_FILE needs a real MONGO_URI before deploying."

# ── 4. Caddy domain ─────────────────────────────────────────────────────────
CADDYFILE="deploy/oracle/Caddyfile"
if [[ -n "$DOMAIN" ]]; then
  sed -i "s#^api\.taskflow\.example\.com {#$DOMAIN {#" "$CADDYFILE"
  log "Caddy will serve: $DOMAIN"
elif grep -q "api.taskflow.example.com" "$CADDYFILE"; then
  warn "Caddyfile still contains the placeholder domain."
  if [[ $ASSUME_YES -eq 0 ]]; then
    read -r -p "Enter the public hostname (blank = keep placeholder): " DOMAIN
    [[ -n "$DOMAIN" ]] && sed -i "s#^api\.taskflow\.example\.com {#$DOMAIN {#" "$CADDYFILE"
  fi
fi

# ── 5. Build + start ────────────────────────────────────────────────────────
log "Building and starting the stack (first build takes a few minutes)…"
docker compose -f deploy/oracle/docker-compose.yml up -d --build

# ── 6. Health gate ──────────────────────────────────────────────────────────
log "Waiting for the app container to report healthy…"
APP_CID="$(docker compose -f deploy/oracle/docker-compose.yml ps -q app)"
for i in $(seq 1 60); do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$APP_CID" 2>/dev/null)" == "healthy" ]]; then
    log "App container is healthy."
    break
  fi
  if [[ $i -eq 60 ]]; then
    docker compose -f deploy/oracle/docker-compose.yml logs --tail 50 app
    die "app did not become healthy in 5 minutes."
  fi
  sleep 5
done

HOSTNAME_PUBLIC="${DOMAIN:-127.0.0.1}"
log "Smoke-checking https://$HOSTNAME_PUBLIC/api/health (Caddy needs a moment for the TLS cert on first run)…"
for i in $(seq 1 30); do
  BODY="$(curl -fsS --max-time 10 "https://$HOSTNAME_PUBLIC/api/health" 2>/dev/null || true)"
  if echo "$BODY" | grep -q '"db":"connected"'; then
    log "LIVE: $BODY"
    log "Done. Next: set the Vercel env (VITE_API_URL/VITE_SOCKET_URL) to https://$HOSTNAME_PUBLIC and redeploy the SPA."
    exit 0
  fi
  sleep 10
done
warn "App is healthy internally but https://$HOSTNAME_PUBLIC is not answering yet — check DNS and the security list (80/443 open), then re-run this script."