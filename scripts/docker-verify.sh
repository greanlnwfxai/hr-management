#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# docker-verify.sh — full-stack Docker verification (NON-DESTRUCTIVE)
#
#   1. validate docker compose config
#   2. docker compose up -d --build   (build/start only — no teardown)
#   3. wait for the API /health endpoint
#   4. check web and mobile route reachability
#   5. show docker compose ps
#   6. on failure, print recent logs (docker compose logs --tail) — read-only
#
# Exits non-zero if the stack fails to become healthy.
#
# SAFETY RULE (do not violate):
#   This script MUST NOT run `docker compose down` (with or without -v),
#   `docker system prune`, or any `docker volume/container/image/network rm`
#   command. It must never stop or remove containers, volumes, images, or
#   networks. Containers are left RUNNING when this script exits, whether
#   it passes or fails. Stopping/removing containers is a manual, explicit
#   user decision only — Claude/Codex must never run teardown commands.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEALTH_URL="http://localhost:4002/health"
WEB_URL="http://localhost:3002"
MOBILE_URL="http://localhost:3004"
MAX_WAIT=120   # seconds

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "docker-verify.sh failed (line $LINENO) — containers were left running for inspection"' ERR

# ── Safety guard ──────────────────────────────────────────────────────────────
# Self-check: refuse to run if a destructive Docker command has been
# reintroduced into this file outside of a comment line. This is a guard
# against future edits accidentally undoing the T-091 non-destructive fix.
SELF="${BASH_SOURCE[0]}"
FORBIDDEN_PATTERN='docker[[:space:]]+compose[[:space:]]+down|docker[[:space:]]+system[[:space:]]+prune|docker[[:space:]]+volume[[:space:]]+rm|docker[[:space:]]+container[[:space:]]+rm|docker[[:space:]]+image[[:space:]]+rm|docker[[:space:]]+network[[:space:]]+rm'
if grep -vE '^[[:space:]]*#' "$SELF" | grep -Eq "$FORBIDDEN_PATTERN"; then
  fail "Safety guard tripped: a destructive Docker command was found in $(basename "$SELF"). Refusing to run."
  exit 1
fi

echo "=============================================="
echo " HR Management — Docker Verify (non-destructive)"
echo "=============================================="
info "This script does NOT stop or remove containers, volumes, images, or"
info "networks. It only validates config, builds/starts services, and checks"
info "health. Containers will remain running after this script finishes."

info "Validating docker compose config..."
docker compose config >/dev/null
pass "docker compose config valid"

info "Building and starting stack (docker compose up -d --build)..."
docker compose up -d --build

info "Waiting for API health at ${HEALTH_URL} (max ${MAX_WAIT}s)..."
elapsed=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    fail "API did not become healthy within ${MAX_WAIT}s"
    echo "---- docker compose ps ----"
    docker compose ps
    echo "---- api logs (tail, read-only) ----"
    docker compose logs api --tail=100
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
pass "API health check OK"

wait_for_reachable() {
  local url="$1" name="$2" service="$3"
  local elapsed=0
  info "Checking ${name} reachability at ${url} (max ${MAX_WAIT}s)..."
  until curl -fsS --max-time 5 "$url" >/dev/null 2>&1; do
    if [ "$elapsed" -ge "$MAX_WAIT" ]; then
      fail "${name} not reachable at ${url} within ${MAX_WAIT}s"
      echo "---- docker compose ps ----"
      docker compose ps
      echo "---- ${service} logs (tail, read-only) ----"
      docker compose logs "$service" --tail=100
      exit 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  pass "${name} reachable"
}

wait_for_reachable "$WEB_URL" "Web app" "web"
wait_for_reachable "$MOBILE_URL" "Mobile app" "mobile"

echo "---- docker compose ps ----"
docker compose ps

echo "=============================================="
pass "DOCKER STACK HEALTHY"
info "Containers are still running. This script does not stop or remove them."
info "Stopping/removing containers is a manual user decision only."
echo "=============================================="
