#!/usr/bin/env bash
set -euo pipefail

# secret-scan.sh — scan source files for likely committed secrets.
#
# WHAT IT CHECKS:
#   Phase 1 — Committed .env files tracked by git (not .env.example)
#   Phase 2 — PEM private key blocks in source files
#   Phase 3 — Suspicious patterns in source files with placeholder filtering
#
# WHAT IT DOES NOT CHECK:
#   - Binary files, generated assets, or compiled output
#   - Historical secrets in git history (use truffleHog or git-secrets for that)
#   - Secrets passed only at runtime through environment variables
#
# KNOWN LIMITATIONS:
#   - Variable names like accessToken, refreshToken, passwordHash are common in
#     NestJS auth code and may appear as WARN findings requiring manual review.
#   - Placeholder filtering is keyword-based; unusual placeholder patterns may not
#     be caught and could produce false negatives.
#   - Test files may set process.env.JWT_SECRET to obvious test values — these are
#     filtered by the PLACEHOLDER_REGEX below.
#   - This script is a lightweight local check. It does NOT replace GitGuardian,
#     truffleHog, or git-secrets for a full historical scan.
#
# FAIL conditions: committed .env files, PEM key blocks in source.
# WARN conditions: suspicious patterns in source files (require manual review).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
warn() { printf '\033[0;33m[WARN]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

SCAN_FAILURES=0
SCAN_WARNINGS=0

echo "=============================================="
echo " HR Management — Secret Scan"
echo "=============================================="

# ── Placeholder / safe-value regex (grep -E compatible) ────────────────────────
# Lines matching these are considered intentional placeholders, not real secrets.
# Each alternation is a pattern that marks a line as a safe placeholder/env-read.
PLACEHOLDER_REGEX='CHANGE_THIS|your-secret|change-me|placeholder|REPLACE_ME|YOUR_SECRET|YOUR_KEY|process\.env\.|getenv|os\.environ|CHANGE_THIS_PASSWORD|STRONG_RANDOM|test-secret|mock\.jwt|mock\.|fake\.|stub\.|example\.com|localhost|admin1234|hr\.local|CHANGE_ME|not set|environment variable|fromEnvVar|env\("'

# ── grep helper: scan source files, excluding generated/vendor dirs and docs ───
# Excludes: .git, node_modules, dist, build, .next, coverage, .expo, generated
# Also excludes: .env.example, documentation files, this script itself.
grep_source() {
  local pattern="$1"
  grep -rn \
    --include="*.ts" --include="*.tsx" \
    --include="*.js" --include="*.jsx" \
    --include="*.mjs" --include="*.cjs" \
    --exclude-dir=".git" \
    --exclude-dir="node_modules" \
    --exclude-dir="dist" \
    --exclude-dir="build" \
    --exclude-dir=".next" \
    --exclude-dir="coverage" \
    --exclude-dir=".expo" \
    --exclude-dir="generated" \
    --exclude="*.env.example" \
    --exclude="secret-scan.sh" \
    "$pattern" "$ROOT" 2>/dev/null \
    | grep -v -E "docs/|CLAUDE\.md|README\.md|prisma\.config\.ts" \
    || true
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Committed .env files
# ─────────────────────────────────────────────────────────────────────────────
info "Phase 1: Checking for committed .env files..."

COMMITTED_ENVS=$(git -C "$ROOT" ls-files \
  | grep -E '(^|/)\.(env)(\.|$)' \
  | grep -v '\.env\.example$' \
  || true)

if [ -n "$COMMITTED_ENVS" ]; then
  fail "Committed .env file(s) found — may contain real secrets:"
  echo "$COMMITTED_ENVS" | while IFS= read -r f; do echo "  FAIL: $f"; done
  SCAN_FAILURES=$((SCAN_FAILURES + 1))
else
  pass "No committed .env files found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — PEM private key blocks
# ─────────────────────────────────────────────────────────────────────────────
info "Phase 2: Scanning for PEM private key blocks..."

PEM_FINDINGS=$(find "$ROOT" \
  \( -name ".git" -o -name "node_modules" -o -name "dist" -o -name "build" \
     -o -name ".next" -o -name "coverage" -o -name ".expo" \) -prune \
  -o -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
     -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" \
     -o -name "*.pem" -o -name "*.key" -o -name "*.crt" \) -print \
  | xargs grep -l "BEGIN.*PRIVATE KEY\|BEGIN RSA PRIVATE\|BEGIN EC PRIVATE\|BEGIN OPENSSH PRIVATE" 2>/dev/null \
  || true)

if [ -n "$PEM_FINDINGS" ]; then
  fail "PEM private key block found in source file(s):"
  echo "$PEM_FINDINGS" | while IFS= read -r f; do echo "  FAIL: $f"; done
  SCAN_FAILURES=$((SCAN_FAILURES + 1))
else
  pass "No PEM private key blocks found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — Suspicious patterns in source files
# Patterns are searched in TS/JS/JSX/TSX source only.
# Lines matching PLACEHOLDER_REGEX are filtered out.
# Remaining findings are WARN (require manual review) unless noted.
# ─────────────────────────────────────────────────────────────────────────────
info "Phase 3: Scanning source files for suspicious patterns..."

check_pattern() {
  local pattern="$1"
  local label="$2"

  local raw
  raw=$(grep_source "$pattern" || true)

  # Filter out lines that look like obvious placeholders or env-var reads
  local findings
  findings=$(echo "$raw" | grep -v -E "$PLACEHOLDER_REGEX" || true)

  if [ -n "$findings" ]; then
    warn "$label — manual review required:"
    echo "$findings" | head -10
    echo "  (showing up to 10 lines; grep '$pattern' for full results)"
    SCAN_WARNINGS=$((SCAN_WARNINGS + 1))
    return 0
  fi
}

# Config-style patterns — likely hardcoded if they appear outside env reads
check_pattern "JWT_SECRET"        "JWT_SECRET in source"
check_pattern "SMTP_PASS"         "SMTP_PASS in source"
check_pattern "SMTP_USER"         "SMTP_USER in source"
check_pattern "SMTP_FROM"         "SMTP_FROM in source"
check_pattern "DATABASE_URL"      "DATABASE_URL in source"
check_pattern "PRIVATE_KEY"       "PRIVATE_KEY in source"
check_pattern "serviceAccountKey" "serviceAccountKey in source"
check_pattern "clientSecret"      "clientSecret in source"
check_pattern "secretKey"         "secretKey in source"
check_pattern "apiKey"            "apiKey in source"

# NOTE: accessToken, refreshToken, passwordHash are intentionally NOT scanned
# at WARN level here — they are standard NestJS auth variable names (e.g.
# `const accessToken = await this.jwt.signAsync(payload)`) and would produce
# near-100% false positives in this codebase. They are included in the
# SECURITY_REVIEW_CHECKLIST.md for manual code review instead.

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo "=============================================="

if [ "$SCAN_FAILURES" -eq 0 ] && [ "$SCAN_WARNINGS" -eq 0 ]; then
  pass "Secret scan completed — no findings"
elif [ "$SCAN_FAILURES" -eq 0 ]; then
  warn "Secret scan completed — $SCAN_WARNINGS warning(s) require manual review"
  pass "No automatic FAIL conditions triggered"
else
  fail "Secret scan FAILED — $SCAN_FAILURES failure(s), $SCAN_WARNINGS warning(s)"
fi

echo "=============================================="
exit "$SCAN_FAILURES"
