#!/usr/bin/env bash
set -euo pipefail

# security-audit.sh — dependency vulnerability audit for all workspaces.
#
# PASS criteria:
#   - No HIGH or CRITICAL advisories found, OR
#   - All HIGH/CRITICAL advisories are documented in .security-accepted-risks
#
# FAIL criteria:
#   - Any HIGH or CRITICAL advisory NOT listed in .security-accepted-risks
#
# To document an accepted risk:
#   1. Add the GHSA ID to .security-accepted-risks (see format in that file)
#   2. Add a full entry in docs/SECURITY_REVIEW_LOG.md
#   3. Get user approval before committing
#
# Does NOT run npm audit fix or modify any files.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
warn() { printf '\033[0;33m[WARN]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

ACCEPTED_RISK_FILE="$ROOT/.security-accepted-risks"
OVERALL=0

echo "=============================================="
echo " HR Management — Dependency Security Audit"
echo "=============================================="

# ── Accepted-risk lookup ───────────────────────────────────────────────────────
is_accepted() {
  local ghsa_id="$1"
  [ -f "$ACCEPTED_RISK_FILE" ] && grep -qE "^${ghsa_id}[[:space:]]" "$ACCEPTED_RISK_FILE" 2>/dev/null
}

# ── Per-workspace audit ────────────────────────────────────────────────────────
# Runs `npm audit --json`, extracts GHSA IDs from HIGH/CRITICAL findings,
# checks each against .security-accepted-risks, and prints PASS/WARN/FAIL.
# Falls back to text audit if JSON parsing fails.
audit_workspace() {
  local workspace_dir="$1"
  local label="$2"

  info "Auditing ${label} dependencies (${workspace_dir})..."

  local json
  json=$(npm --prefix "$ROOT/$workspace_dir" audit --json 2>/dev/null || true)

  # Extract unique GHSA IDs from HIGH/CRITICAL vulnerabilities using node
  local findings=""
  if [ -n "$json" ]; then
    findings=$(echo "$json" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const seen = new Set();
Object.values(d.vulnerabilities||{}).forEach(v => {
  if (!['high','critical'].includes(v.severity)) return;
  (v.via||[]).filter(x=>typeof x==='object').forEach(a=>{
    const id = (a.url||'').split('/').pop();
    if(id && !seen.has(id)){
      seen.add(id);
      console.log(id+'|'+v.severity+'|'+(a.title||'no title'));
    }
  });
});
" 2>/dev/null || true)
  fi

  # If JSON parsing produced no findings, fall back to text audit to verify
  if [ -z "$findings" ]; then
    local text_exit=0
    npm --prefix "$ROOT/$workspace_dir" audit --audit-level=high > /dev/null 2>&1 || text_exit=$?
    if [ "$text_exit" -eq 0 ]; then
      pass "$label dependency audit passed — no HIGH/CRITICAL found"
    else
      fail "$label: audit found issues but JSON parsing failed — run npm audit manually"
      OVERALL=1
    fi
    return
  fi

  # Classify each finding as accepted or unaccepted
  local has_unaccepted=0
  local accepted_list=""
  local unaccepted_list=""

  while IFS='|' read -r ghsa severity title; do
    ghsa="${ghsa// /}"
    [ -z "$ghsa" ] && continue
    if is_accepted "$ghsa"; then
      accepted_list="${accepted_list}  [ACCEPTED-RISK] ${ghsa}: ${title}\n"
    else
      unaccepted_list="${unaccepted_list}  [UNACCEPTED]   ${ghsa}: ${title}\n"
      has_unaccepted=1
    fi
  done <<< "$findings"

  # Print accepted findings as warnings (always visible, never hidden)
  if [ -n "$accepted_list" ]; then
    warn "$label: HIGH findings with documented accepted risk:"
    printf "%b" "$accepted_list"
    echo "  Full justification: .security-accepted-risks | docs/SECURITY_REVIEW_LOG.md"
  fi

  if [ "$has_unaccepted" -eq 1 ]; then
    fail "$label: UNACCEPTED HIGH/CRITICAL vulnerabilities found:"
    printf "%b" "$unaccepted_list"
    echo "  Action: patch or add accepted-risk entry per docs/SECURITY_PATCH_POLICY.md"
    OVERALL=1
  else
    pass "$label audit — all HIGH/CRITICAL have documented accepted risk"
  fi
}

echo "----------------------------------------------"
audit_workspace "apps/api" "API"
echo "----------------------------------------------"
audit_workspace "apps/web" "Web"
echo "----------------------------------------------"
audit_workspace "apps/mobile" "Mobile"
echo "=============================================="

if [ "$OVERALL" -eq 0 ]; then
  pass "ALL DEPENDENCY AUDITS PASSED"
else
  fail "ONE OR MORE AUDITS FAILED — review findings above"
  echo ""
  echo "NEXT STEPS:"
  echo "  1. Review each [UNACCEPTED] finding above."
  echo "  2. Patch or document accepted-risk per docs/SECURITY_PATCH_POLICY.md."
  echo "  3. Do NOT run: npm audit fix --force"
fi

echo "=============================================="
exit "$OVERALL"
