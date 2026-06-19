# CTO Summary

## Step
**T-052A.2 — Security Patch & Accepted-Risk Resolution**
Date: 2026-06-19
Previous: T-052A.1 — Security Harness Foundation

---

## Status
**PASS** — Security audit now exits 0. Safe patch applied for `form-data` (HIGH).
All remaining HIGH advisories documented as accepted risk with full justification.
`scripts/security-review.sh` exits 0 for the first time.

---

## Scope Completed

1. Inspected npm audit JSON for all workspaces to identify fix paths.
2. Applied safe non-breaking patch (`npm audit fix`, no `--force`) for `form-data` in apps/api.
3. Identified all remaining HIGH advisory GHSA IDs (2 API, 12 Mobile).
4. Created `.security-accepted-risks` — the project-level accepted-risk registry.
5. Updated `scripts/security-audit.sh` — JSON-based per-advisory accepted-risk check.
6. Documented all accepted-risk entries in `docs/SECURITY_REVIEW_LOG.md`.
7. Ran full verification: all scripts, build, and API tests pass.

---

## Files Created

| File | Purpose |
|---|---|
| `.security-accepted-risks` | Accepted-risk registry (GHSA ID + workspace + date + reason per line) |
| `docs/CTO_SUMMARY_T052A2.md` | This document |

---

## Files Modified

| File | Change |
|---|---|
| `apps/api/package-lock.json` | `form-data` patched via `npm audit fix` (260 lines updated; package.json unchanged) |
| `scripts/security-audit.sh` | Rewritten to use JSON-based accepted-risk check |
| `docs/SECURITY_REVIEW_LOG.md` | Added T-052A.2 entry with all patch and accepted-risk details |

---

## Dependency Audit — Patch Applied

### form-data HIGH (GHSA-hmw2-7cc7-3qxx) — PATCHED

- **Vulnerability**: CRLF injection via unescaped multipart field names and filenames
- **Fix method**: `npm audit fix` (no `--force`; non-breaking lockfile update)
- **Scope**: `apps/api/package-lock.json` updated; `package.json` unchanged
- **Verification**: API build PASS, 202/202 tests PASS

---

## Dependency Audit — Accepted Risks Documented

All entries visible in `.security-accepted-risks` and `docs/SECURITY_REVIEW_LOG.md`.

### API — multer DoS (2 advisories) — Accepted Risk

| Advisory | Severity | Justification |
|---|---|---|
| GHSA-72gw-mp4g-v24j | HIGH | DoS requires multipart/form-data POST; API has no multipart routes |
| GHSA-3p4h-7m6x-2hcm | HIGH | DoS via aborted upload; API has no multipart routes |

Fix path: requires `@nestjs/core@7.5.5` (NestJS major downgrade — completely incompatible with NestJS 11).
Review: when `@nestjs/platform-express` ships a multer fix compatible with NestJS 11.

### Mobile — @xmldom/xmldom XML injection (5 advisories) — Accepted Risk

| Advisory | Severity | Justification |
|---|---|---|
| GHSA-wh4c-j3r5-mjhp | HIGH | Build-tool only; not in app runtime bundle |
| GHSA-2v35-w6hq-6mfw | HIGH | Build-tool only; not in app runtime bundle |
| GHSA-f6ww-3ggp-fr8h | HIGH | Build-tool only; not in app runtime bundle |
| GHSA-x6wf-f3px-wcqx | HIGH | Build-tool only; not in app runtime bundle |
| GHSA-j759-j44w-7fr8 | HIGH | Build-tool only; not in app runtime bundle |

Context: @xmldom/xmldom is used by `@expo/config-plugins` for iOS .plist/xcode XML processing during Expo native build. Not included in the mobile app bundle.
Fix path: requires expo@56.0.12 (major version upgrade; full Expo migration + regression testing required).

### Mobile — node-tar path traversal (7 advisories) — Accepted Risk

| Advisory | Severity | Justification |
|---|---|---|
| GHSA-34x7-hfp2-rc4v | HIGH | npm cacache build tool only; not in app runtime |
| GHSA-8qq5-rm4j-mr97 | HIGH | npm cacache build tool only; not in app runtime |
| GHSA-83g3-92jg-28cx | HIGH | npm cacache build tool only; not in app runtime |
| GHSA-qffp-2rhf-9h96 | HIGH | npm cacache build tool only; not in app runtime |
| GHSA-9ppj-qmqm-q256 | HIGH | npm cacache build tool only; not in app runtime |
| GHSA-r6q2-hw4h-h46w | HIGH | npm cacache build tool only; not in app runtime |
| GHSA-vmf3-w455-68vh | HIGH | npm cacache build tool only; not in app runtime |

Context: node-tar is used by npm's `cacache` for package archive extraction during Expo build. Not included in the mobile app bundle.
Fix path: requires expo@56.0.12 (major version upgrade).

---

## security-audit.sh — Key Changes

| Before (T-052A.1) | After (T-052A.2) |
|---|---|
| `npm audit --audit-level=high` (exits non-zero on any HIGH) | `npm audit --json` + node parsing |
| No accepted-risk concept | Reads `.security-accepted-risks` by GHSA ID |
| FAIL on all HIGH regardless of context | PASS if all HIGHs are accepted; FAIL on unaccepted |
| Could not distinguish real new risk from documented known issues | Every WARN clearly shows `[ACCEPTED-RISK]` with GHSA ID |

Unchanged behavior: all findings are always printed. Nothing is hidden. New unaccepted advisories still cause FAIL immediately.

---

## Verification Results

| Check | Result |
|---|---|
| `./scripts/security-audit.sh` | **PASS** — form-data patched; 14 HIGHs accepted-risk documented |
| `./scripts/secret-scan.sh` | **PASS** — no committed secrets or PEM blocks |
| `./scripts/security-review.sh` | **PASS** — all automated checks clear |
| `./scripts/verify.sh` | **PASS** — API build, Prisma validate, Web build all pass |
| `npm --prefix apps/api test` | **PASS** — 202/202 tests, 17 suites |

---

## Docker Safety Compliance

- No Docker commands run in this task
- No `docker compose down`, `down -v`, `system prune`, or volume removal

---

## Known Limitations

1. Accepted-risk entries must be reviewed when safe fix paths become available (primarily when Expo 56 migration is planned, and when NestJS 11.x gets a compatible multer fix)
2. `.security-accepted-risks` should be reviewed each time a new advisory is reported for the same packages
3. If a new unrelated vulnerability appears in multer or tar, it will correctly appear as `[UNACCEPTED]` and cause a FAIL — the accepted-risk file only covers specific GHSA IDs

---

## Security Review (T-052A.2)

| Field | Assessment |
|---|---|
| Auth impact | None — no endpoints changed |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None |
| Dependency/advisory impact | form-data HIGH patched; 14 HIGHs documented accepted-risk |
| Secrets/logging check | PASS — no changes to logging; no secrets committed |
| New endpoints protected | None |
| Risk level | **LOW** — form-data patched; remaining accepted risks are build-tool/no-route scope |
| Security decision | **PASS** |

---

## Risk
**LOW** — form-data CRLF injection patched. Remaining accepted HIGHs have clearly limited attack surface (no multipart routes in API; build-tool-only in Mobile).

---

## Security Decision
**PASS**

---

## Overall Decision
**PASS** — All automated security checks exit 0. API tests pass. Build passes.

---

## Git Status Summary

Changed files:
- `apps/api/package-lock.json` — form-data safe patch (lockfile only)
- `scripts/security-audit.sh` — accepted-risk JSON check
- `docs/SECURITY_REVIEW_LOG.md` — T-052A.2 entries added
- `docs/CTO_SUMMARY_T052A2.md` — this file (new)
- `.security-accepted-risks` — new accepted-risk registry

Unchanged:
- All `package.json` files
- All product source code
- Prisma schema
- All other scripts

---

## Recommended Commit Message
```
chore(security): patch form-data and document accepted risks (T-052A.2)
```

---

## Next Recommended Task
**T-052A.3 — Security Harness CI**

Scope:
- Add GitHub Actions security job (`./scripts/security-review.sh` on every PR)
- Configure Dependabot for automated dependency update PRs
- Establish external advisory review workflow
- Schedule review of accepted-risk entries for Expo 56 migration
