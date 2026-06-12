#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# api-smoke-test.sh — authenticated API smoke test
#   Covers all completed backend modules as of v1.0 hardening (T-022).
#   Requires: jq, a running stack at API_URL (default http://localhost:4002)
# ─────────────────────────────────────────────────────────────────────────────

API="${API_URL:-http://localhost:4002}"
EMAIL="admin@hr.local"
PASSWORD="admin1234"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "api-smoke-test.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " HR Management — API Smoke Test"
echo "=============================================="

# ── dependency check ──────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
  fail "jq is required but not installed"
  exit 1
fi
pass "jq present"

# ── health ────────────────────────────────────────────────────────────────────
info "GET /health..."
HEALTH="$(curl -fsS "${API}/health")"
STATUS="$(echo "$HEALTH" | jq -r '.status')"
if [ "$STATUS" != "ok" ]; then
  fail "GET /health did not return status=ok (got: ${STATUS})"
  exit 1
fi
pass "GET /health OK"

# ── auth/login ────────────────────────────────────────────────────────────────
info "POST /auth/login (${EMAIL})..."
LOGIN_RESPONSE="$(curl -fsS -X POST "${API}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"

TOKEN="$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  fail "accessToken is empty or null"
  echo "Response: $LOGIN_RESPONSE" >&2
  exit 1
fi
pass "POST /auth/login OK — accessToken received"

AUTH_HEADER="Authorization: Bearer ${TOKEN}"

# ── auth/me ───────────────────────────────────────────────────────────────────
info "GET /auth/me..."
ME="$(curl -fsS "${API}/auth/me" -H "$AUTH_HEADER")"
ME_ID="$(echo "$ME" | jq -r '.id')"
if [ -z "$ME_ID" ] || [ "$ME_ID" = "null" ]; then
  fail "GET /auth/me did not return an id"
  exit 1
fi
pass "GET /auth/me OK — id=${ME_ID}"

# ── employees ─────────────────────────────────────────────────────────────────
info "GET /employees..."
EMP_RESP="$(curl -fsS "${API}/employees" -H "$AUTH_HEADER")"
EMP_TOTAL="$(echo "$EMP_RESP" | jq -r '.meta.total')"
if [ "$EMP_TOTAL" = "null" ]; then
  fail "GET /employees did not return meta.total"
  exit 1
fi
pass "GET /employees OK — total=${EMP_TOTAL}"

# ── departments ───────────────────────────────────────────────────────────────
info "GET /departments..."
DEPT_RESP="$(curl -fsS "${API}/departments" -H "$AUTH_HEADER")"
DEPT_TOTAL="$(echo "$DEPT_RESP" | jq -r '.meta.total')"
if [ "$DEPT_TOTAL" = "null" ]; then
  fail "GET /departments did not return meta.total"
  exit 1
fi
pass "GET /departments OK — total=${DEPT_TOTAL}"

# ── positions ─────────────────────────────────────────────────────────────────
info "GET /positions..."
POS_RESP="$(curl -fsS "${API}/positions" -H "$AUTH_HEADER")"
POS_TOTAL="$(echo "$POS_RESP" | jq -r '.meta.total')"
if [ "$POS_TOTAL" = "null" ]; then
  fail "GET /positions did not return meta.total"
  exit 1
fi
pass "GET /positions OK — total=${POS_TOTAL}"

# ── attendance ────────────────────────────────────────────────────────────────
info "GET /attendance..."
ATT_RESP="$(curl -fsS "${API}/attendance" -H "$AUTH_HEADER")"
ATT_TOTAL="$(echo "$ATT_RESP" | jq -r '.meta.total')"
if [ "$ATT_TOTAL" = "null" ]; then
  fail "GET /attendance did not return meta.total"
  exit 1
fi
pass "GET /attendance OK — total=${ATT_TOTAL}"

# ── leave ─────────────────────────────────────────────────────────────────────
info "GET /leave..."
LEAVE_RESP="$(curl -fsS "${API}/leave" -H "$AUTH_HEADER")"
LEAVE_TOTAL="$(echo "$LEAVE_RESP" | jq -r '.meta.total')"
if [ "$LEAVE_TOTAL" = "null" ]; then
  fail "GET /leave did not return meta.total"
  exit 1
fi
pass "GET /leave OK — total=${LEAVE_TOTAL}"

# ── leave-balances ────────────────────────────────────────────────────────────
info "GET /leave-balances..."
LB_RESP="$(curl -fsS "${API}/leave-balances" -H "$AUTH_HEADER")"
LB_TOTAL="$(echo "$LB_RESP" | jq -r '.meta.total')"
if [ "$LB_TOTAL" = "null" ]; then
  fail "GET /leave-balances did not return meta.total"
  exit 1
fi
pass "GET /leave-balances OK — total=${LB_TOTAL}"

# ── dashboard ─────────────────────────────────────────────────────────────────
info "GET /dashboard..."
DASH_RESP="$(curl -fsS "${API}/dashboard" -H "$AUTH_HEADER")"
DASH_TZ="$(echo "$DASH_RESP" | jq -r '.timezone')"
if [ "$DASH_TZ" != "Asia/Bangkok" ]; then
  fail "GET /dashboard did not return timezone=Asia/Bangkok (got: ${DASH_TZ})"
  exit 1
fi
DASH_EMP="$(echo "$DASH_RESP" | jq -r '.employees.totalEmployees')"
if [ "$DASH_EMP" = "null" ]; then
  fail "GET /dashboard missing employees.totalEmployees"
  exit 1
fi
pass "GET /dashboard OK — timezone=${DASH_TZ}, totalEmployees=${DASH_EMP}"

# ── unauthorized guard ────────────────────────────────────────────────────────
info "GET /dashboard without token (expect 401)..."
HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "${API}/dashboard")"
if [ "$HTTP_STATUS" != "401" ]; then
  fail "Expected 401 from unauthenticated /dashboard, got ${HTTP_STATUS}"
  exit 1
fi
pass "GET /dashboard unauthenticated → 401"

# ─────────────────────────────────────────────────────────────────────────────
echo "=============================================="
pass "API SMOKE TEST PASSED"
echo "=============================================="
