#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# mobile-verify.sh — local mobile build verification
#   1. Mobile TypeScript typecheck
#   2. Expo web export (static bundle)
# Kept separate from verify.sh because Expo export is significantly slower
# than API/web builds and not needed for every backend change.
# Exits non-zero on the first failure.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "mobile-verify.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " HR Management — Mobile Verify"
echo "=============================================="

# 1. TypeScript typecheck
info "Running mobile TypeScript typecheck (apps/mobile)..."
cd "$ROOT/apps/mobile"
npm run typecheck
pass "Mobile typecheck"

# 2. Expo web export
info "Running Expo web export (apps/mobile)..."
npx expo export --platform web
pass "Expo web export"

echo "=============================================="
pass "ALL MOBILE CHECKS PASSED"
echo "=============================================="
