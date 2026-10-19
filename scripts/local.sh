#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
local_env="$project_dir/.env.local-docker"
action="${1:-start}"

case "$action" in
  start|stop|logs|status) ;;
  *) printf 'Usage: ./scripts/local.sh [start|stop|logs|status]\n' >&2; exit 1 ;;
esac
if ! command -v docker >/dev/null 2>&1; then
  printf 'Install Docker Desktop, open it, then run this command again:\nhttps://docs.docker.com/desktop/setup/install/mac-install/\n' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  printf 'Docker Compose is required. Install or update Docker Desktop.\n' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf 'Open Docker Desktop and wait until its engine is running, then try again.\n' >&2
  exit 1
fi
if [ ! -f "$local_env" ]; then
  if [ "$action" != start ]; then
    printf 'No local installation exists yet. Run ./scripts/local.sh first.\n' >&2
    exit 1
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    printf 'OpenSSL is required to generate local credentials.\n' >&2
    exit 1
  fi
  umask 077
  postgres_password="$(openssl rand -hex 32)"
  app_password="$(openssl rand -hex 32)"
  control_password="$(openssl rand -hex 32)"
  jwt_secret="$(openssl rand -hex 32)"
  cat > "$local_env" <<ENV
POSTGRES_PASSWORD=$postgres_password
APP_DATABASE_PASSWORD=$app_password
CONTROL_DATABASE_PASSWORD=$control_password
JWT_SECRET=$jwt_secret
WEB_URL=http://localhost:3000
ENV
  printf 'Generated private local credentials.\n'
fi

compose=(docker compose --project-name multitenant-saas-local --env-file "$local_env" -f compose.yml -f compose.local.yml)
case "$action" in
  start)
    printf 'Building and starting the app. The first run downloads dependencies and images.\n'
    "${compose[@]}" up -d --wait postgres
    # Additive, idempotent upgrade for existing installations. Never removes volumes.
    "${compose[@]}" exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /migrations/05_business.sql'
    "${compose[@]}" exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /migrations/06_administration.sql'
    "${compose[@]}" up --build -d --wait
    printf '\nApp ready: http://localhost:3000\nCreate an account using the “Créer un compte” button.\nStop: ./scripts/local.sh stop\nLogs: ./scripts/local.sh logs\n'
    if [ "$(uname -s)" = Darwin ] && command -v open >/dev/null 2>&1; then
      open http://localhost:3000 || true
    fi
    ;;
  stop) "${compose[@]}" down ;;
  logs) "${compose[@]}" logs --follow --tail 100 ;;
  status) "${compose[@]}" ps ;;
esac
