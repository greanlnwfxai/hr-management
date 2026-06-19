#!/usr/bin/env bash
set -euo pipefail

# security-review.sh — combined security review runner.
#
# Runs:
#   1. scripts/security-audit.sh  — dependency vulnerability audit
#   2. scripts/secret-scan.sh     — secret / sensitive-value scan
#
# Then prints a manual review reminder checklist.
# Does NOT mutate files, run npm audit fix, or touch Docker.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }
section() { echo ""; echo "══════════════════════════════════════════════"; echo " $1"; echo "══════════════════════════════════════════════"; }

AUDIT_STATUS=0
SCAN_STATUS=0

section "HR Management — Security Review"
echo " Full docs: docs/SECURITY_HARNESS.md"
echo " Checklist: docs/SECURITY_REVIEW_CHECKLIST.md"
echo " Policy:    docs/SECURITY_PATCH_POLICY.md"

# ── 1. Dependency Audit ────────────────────────────────────────────────────────
section "Step 1 — Dependency Vulnerability Audit"
"$ROOT/scripts/security-audit.sh" || AUDIT_STATUS=$?

# ── 2. Secret Scan ─────────────────────────────────────────────────────────────
section "Step 2 — Secret Scan"
"$ROOT/scripts/secret-scan.sh" || SCAN_STATUS=$?

# ── 3. Manual Review Reminder ──────────────────────────────────────────────────
section "Step 3 — Manual Review Checklist (NOT automated)"
echo ""
echo "The following items require human review. See docs/SECURITY_REVIEW_CHECKLIST.md"
echo "for full checklists and acceptance criteria."
echo ""
echo "  [ ] Auth / JWT guard applied to all new/changed endpoints"
echo "  [ ] RBAC — role checks correct (ADMIN vs EMPLOYEE vs SUPER_ADMIN)"
echo "  [ ] Password / hash — no plain-text passwords in logs or responses"
echo "  [ ] Token security — no tokens hardcoded; storage secure in mobile"
echo "  [ ] Data privacy — PII not over-exposed in list/detail endpoints"
echo "  [ ] Logging — no secrets or tokens in log output"
echo "  [ ] Error handling — no stack traces or DB schema exposed in production"
echo "  [ ] Dependency advisories — check npm advisories for new packages added"
echo "  [ ] Docker safety — no destructive commands in scripts or compose files"
echo "  [ ] Swagger — disabled or protected in production config"
echo ""
echo "Full checklist: docs/SECURITY_REVIEW_CHECKLIST.md"

# ── Summary ────────────────────────────────────────────────────────────────────
section "Security Review Summary"

OVERALL=0
[ "$AUDIT_STATUS" -ne 0 ] && OVERALL=1
[ "$SCAN_STATUS"  -ne 0 ] && OVERALL=1

if [ "$OVERALL" -eq 0 ]; then
  pass "SECURITY REVIEW PASSED — automated checks clear"
  echo ""
  echo "Reminder: manual checklist items above still require human sign-off."
else
  fail "SECURITY REVIEW FAILED — see findings above"
  echo ""
  echo "Resolve all FAIL items before marking this task PASS."
  echo "See docs/SECURITY_PATCH_POLICY.md for patch guidance."
fi

echo "══════════════════════════════════════════════"
exit "$OVERALL"
