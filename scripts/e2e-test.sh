#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# e2e-test.sh — Run Playwright E2E tests against the local Docker stack.
#   Prerequisites:
#     1. Docker stack is healthy: ./scripts/docker-verify.sh
#     2. Playwright browsers installed: cd apps/web && npx playwright install chromium
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }

echo "=============================================="
echo " HR Management — Playwright E2E Tests"
echo "=============================================="

# Verify web is reachable
info "Checking http://localhost:3002 ..."
if ! curl -fsS --max-time 5 "http://localhost:3002" >/dev/null 2>&1; then
  fail "Web app not reachable at http://localhost:3002. Run ./scripts/docker-verify.sh first."
  exit 1
fi
pass "Web app reachable"

# Verify API is reachable
info "Checking http://localhost:4002/health ..."
if ! curl -fsS --max-time 5 "http://localhost:4002/health" >/dev/null 2>&1; then
  fail "API not reachable at http://localhost:4002. Run ./scripts/docker-verify.sh first."
  exit 1
fi
pass "API reachable"

# Run tests
info "Running Playwright tests..."
cd "$WEB"
npm run test:e2e "$@"

echo "=============================================="
pass "E2E TESTS COMPLETE"
echo "=============================================="
