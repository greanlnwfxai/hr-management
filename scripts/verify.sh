#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# verify.sh — local build & schema verification
#   1. API build (nest build)
#   2. Prisma schema validate
#   3. Web build (next build)
# Exits non-zero on the first failure.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "verify.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " HR Management — Local Verify"
echo "=============================================="

# 1. API build
info "Building API (apps/api)..."
cd "$ROOT/apps/api"
npm run build
pass "API build"

# 2. Prisma validate
info "Validating Prisma schema..."
npx prisma validate
pass "Prisma schema valid"

# 3. Web build
info "Building Web (apps/web)..."
cd "$ROOT/apps/web"
npm run build
pass "Web build"

echo "=============================================="
pass "ALL CHECKS PASSED"
echo "=============================================="
