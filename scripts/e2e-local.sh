#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# e2e-local.sh — local-safe Playwright E2E runner (LOCAL-E2E-ENV-001)
#
# PROBLEM
#   Root .env doubles as the env file for docker-compose.yml, and on this
#   machine it currently holds PRODUCTION values — NEXT_PUBLIC_API_URL points
#   at https://hr.eds-center.com/api, CORS_ORIGIN is the production origin
#   list, TRUST_PROXY=true, and THROTTLE_LIMIT/LOGIN_THROTTLE_LIMIT are the
#   tight production defaults. `docker compose up -d --build` auto-loads
#   .env, so a plain local rebuild bakes the production API URL into the
#   Admin Web bundle (NEXT_PUBLIC_* vars are inlined into the JS bundle at
#   Next.js BUILD time — see apps/web/Dockerfile) and applies production
#   rate limits. Result: local Playwright runs either call the real
#   production API (CORS failure, since the browser origin is
#   http://localhost:3002) or trip the throttler mid-suite.
#
#   This is a known, already-diagnosed limitation — see the "Environment
#   note" under Next Recommended Task in
#   HR-Knowledge/01-START-HERE/Current Status.md (found during SEC-ATT-007B,
#   confirmed unrelated to any specific feature).
#
# FIX
#   Export a local-safe env override in THIS SHELL ONLY, before invoking
#   docker compose. Docker Compose variable interpolation prefers real shell
#   environment variables over the .env file, so these values win for the
#   vars below without editing .env — the same mechanism CI's e2e-ci job
#   already relies on (it has no .env file at all, only job env).
#
#   Only the vars that actually differ between local and production are
#   overridden. Everything else (DATABASE_URL, POSTGRES_*, JWT_SECRET, ...)
#   is left to fall through from .env, because the local `postgres_data`
#   Docker volume was already initialized with those credentials — copying
#   in different ones would break DB auth against the existing volume.
#
# GUARANTEES
#   - .env is never read for the purpose of modification, and NEVER written.
#   - docker-compose.production.yml is never referenced.
#   - No destructive Docker command is used (enforced by the guard below).
#   - Only the `api` and `web` services are rebuilt; `db` and `mobile` are
#     left as-is (mobile is untouched per this task's scope).
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WEB="$ROOT/apps/web"
HEALTH_URL="http://localhost:4002/health"
WEB_URL="http://localhost:3002"
MAX_WAIT=120

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "e2e-local.sh failed (line $LINENO) — containers were left running for inspection"' ERR

# ── Safety guard ──────────────────────────────────────────────────────────────
# Refuse to run if a destructive Docker command has been added to this file.
SELF="${BASH_SOURCE[0]}"
FORBIDDEN_PATTERN='docker[[:space:]]+compose[[:space:]]+down|docker[[:space:]]+system[[:space:]]+prune|docker[[:space:]]+volume[[:space:]]+rm|docker[[:space:]]+container[[:space:]]+rm|docker[[:space:]]+image[[:space:]]+rm|docker[[:space:]]+network[[:space:]]+rm'
if grep -vE '^[[:space:]]*#' "$SELF" | grep -Eq "$FORBIDDEN_PATTERN"; then
  fail "Safety guard tripped: a destructive Docker command was found in $(basename "$SELF"). Refusing to run."
  exit 1
fi

echo "=============================================="
echo " HR Management — Local-Safe E2E Runner"
echo "=============================================="

# ── Local-safe env overrides (this shell/session only — .env is untouched) ───
export NEXT_PUBLIC_API_URL="http://localhost:4002"
export CORS_ORIGIN="http://localhost:3002"
export TRUST_PROXY="false"
export THROTTLE_TTL="60"
export THROTTLE_LIMIT="500"
export LOGIN_THROTTLE_TTL="60"
export LOGIN_THROTTLE_LIMIT="20"
export NEXT_TELEMETRY_DISABLED="1"
export E2E_BASE_URL="http://localhost:3002"
export E2E_API_URL="http://localhost:4002"
export E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@hr.local}"
export E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-admin1234}"

info "Overriding these vars for THIS shell only — root .env is NOT modified:"
info "  NEXT_PUBLIC_API_URL  = ${NEXT_PUBLIC_API_URL}"
info "  CORS_ORIGIN          = ${CORS_ORIGIN}"
info "  TRUST_PROXY          = ${TRUST_PROXY}"
info "  THROTTLE_LIMIT       = ${THROTTLE_LIMIT} (TTL ${THROTTLE_TTL}s)"
info "  LOGIN_THROTTLE_LIMIT = ${LOGIN_THROTTLE_LIMIT} (TTL ${LOGIN_THROTTLE_TTL}s)"
info "  E2E_BASE_URL         = ${E2E_BASE_URL}"
info "  E2E_API_URL          = ${E2E_API_URL}"
info "  E2E_ADMIN_EMAIL      = ${E2E_ADMIN_EMAIL}"
info "Left untouched (sourced from .env / the already-initialized DB volume):"
info "  DATABASE_URL, POSTGRES_*, JWT_SECRET, JWT_EXPIRES_IN, SWAGGER_ENABLED, ATTENDANCE_*"
info "docker-compose.production.yml is not referenced by this script — production is unaffected."

# ── Rebuild only api + web with the local-safe env (non-destructive) ─────────
info "Building and starting api + web (docker compose up -d --build api web)..."
docker compose up -d --build api web
pass "api + web build/start complete"

info "Waiting for API health at ${HEALTH_URL} (max ${MAX_WAIT}s)..."
elapsed=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    fail "API did not become healthy within ${MAX_WAIT}s"
    docker compose logs api --tail=100
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
pass "API health check OK"

info "Waiting for Web app at ${WEB_URL} (max ${MAX_WAIT}s)..."
elapsed=0
until curl -fsS --max-time 5 "$WEB_URL" >/dev/null 2>&1; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    fail "Web app not reachable within ${MAX_WAIT}s"
    docker compose logs web --tail=100
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
pass "Web app reachable"

# ── Confirm the browser bundle was actually built with the local API URL ─────
# Positive check: the local URL must be present.
info "Confirming the Admin Web bundle was built against the local API..."
if docker compose exec -T web grep -rq "localhost:4002" /app/.next/static 2>/dev/null; then
  pass "Web bundle references http://localhost:4002 (local build confirmed)"
else
  fail "Web bundle does not reference localhost:4002 — the build did not pick up the local override."
  exit 1
fi

# Negative check: whatever host .env's NEXT_PUBLIC_API_URL currently points at
# (read-only — .env is never written) must NOT be present, if it isn't
# localhost. This is what actually distinguishes a local build from a
# prod-baked one: Next.js/SWC dead-code-eliminates the `?? 'localhost:4002'`
# source fallback whenever NEXT_PUBLIC_API_URL is set at build time, so its
# absence alone would not prove the override worked.
if [ -f "$ROOT/.env" ]; then
  ENV_API_HOST="$(grep -m1 '^NEXT_PUBLIC_API_URL=' "$ROOT/.env" 2>/dev/null | cut -d= -f2- | sed -E 's#^[a-z]+://##; s#/.*$##')"
  if [ -n "$ENV_API_HOST" ] && [ "$ENV_API_HOST" != "localhost:4002" ]; then
    if docker compose exec -T web grep -rq "$ENV_API_HOST" /app/.next/static 2>/dev/null; then
      fail "Web bundle still references .env's configured host (${ENV_API_HOST}) — local override did not take effect."
      exit 1
    fi
    pass "Web bundle does not reference .env's non-local host (${ENV_API_HOST})"
  fi
fi

# ── Preflight: confirm the local DB is migrated/seeded before Playwright runs ─
info "Verifying admin login against the local API (${E2E_API_URL})..."
LOGIN_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${E2E_API_URL}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${E2E_ADMIN_EMAIL}\",\"password\":\"${E2E_ADMIN_PASSWORD}\"}")"
if [ "$LOGIN_STATUS" != "200" ]; then
  fail "Admin login returned HTTP ${LOGIN_STATUS} — local DB may not be migrated/seeded."
  fail "Fix: cd apps/api && npx prisma migrate deploy && npx prisma db seed"
  exit 1
fi
pass "Admin login OK — local DB is migrated and seeded"

# ── Run Playwright ────────────────────────────────────────────────────────────
cd "$WEB"
info "Running Playwright E2E tests (baseURL=${E2E_BASE_URL})..."
npm run test:e2e -- "$@"

echo "=============================================="
pass "LOCAL E2E RUN COMPLETE"
info "Containers are left running (non-destructive) — no teardown was performed."
echo "=============================================="
