#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# api-smoke-test.sh — authenticated API smoke test
#   1. POST /auth/login (admin@hr.local / admin1234)
#   2. extract accessToken (fail if empty/null)
#   3. GET /employees with the token (fail on non-2xx)
# Requires: jq
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

# Dependency check
if ! command -v jq >/dev/null 2>&1; then
  fail "jq is required but not installed"
  exit 1
fi
pass "jq present"

# 1. Login
info "Logging in as ${EMAIL}..."
LOGIN_RESPONSE="$(curl -fsS -X POST "${API}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"

# 2. Extract token
TOKEN="$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')"
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  fail "accessToken is empty or null"
  echo "Response: $LOGIN_RESPONSE" >&2
  exit 1
fi
pass "Login OK — accessToken received"

# 3. GET /employees
info "Calling GET /employees..."
EMPLOYEES_RESPONSE="$(curl -fsS "${API}/employees" \
  -H "Authorization: Bearer ${TOKEN}")"

TOTAL="$(echo "$EMPLOYEES_RESPONSE" | jq -r '.meta.total')"
if [ "$TOTAL" = "null" ]; then
  fail "GET /employees did not return a meta.total field"
  echo "Response: $EMPLOYEES_RESPONSE" >&2
  exit 1
fi
pass "GET /employees OK — total=${TOTAL}"

echo "=============================================="
pass "API SMOKE TEST PASSED"
echo "=============================================="
