#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# docker-verify.sh — full-stack Docker verification
#   1. docker compose down
#   2. docker compose up -d --build
#   3. wait for the API /health endpoint
#   4. show docker compose ps
# Exits non-zero if the stack fails to become healthy.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEALTH_URL="http://localhost:4002/health"
MAX_WAIT=120   # seconds

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "docker-verify.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " HR Management — Docker Verify"
echo "=============================================="

info "Tearing down existing stack..."
docker compose down

info "Building and starting stack..."
docker compose up -d --build

info "Waiting for API health at ${HEALTH_URL} (max ${MAX_WAIT}s)..."
elapsed=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    fail "API did not become healthy within ${MAX_WAIT}s"
    echo "---- docker compose ps ----"
    docker compose ps
    echo "---- api logs (tail) ----"
    docker compose logs api --tail=50
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
pass "API health check OK"

echo "---- docker compose ps ----"
docker compose ps

echo "=============================================="
pass "DOCKER STACK HEALTHY"
echo "=============================================="
