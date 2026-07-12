# CTO Summary

## Step
T-098 — HR Production Stability / Regression Checklist

## Status
PASS

## Scope
Create a practical, manual production stability and regression checklist covering the areas stabilized across `v1.2.89`–`v1.2.94` (off-site review, leave overlap hotfix, department i18n polish, local Playwright e2e runner), for the user to run before/after future production releases. Docs-only — no runtime behavior change, no production redeploy.

## Files Created
- `docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md` — the checklist itself, sections A–I as specified (pre-release, production health, Admin Web, Mobile/PWA, leave, attendance/off-site, local tooling, post-release, deferred work)
- `docs/CTO_SUMMARY_T098_PRODUCTION_STABILITY_REGRESSION.md` — this summary

## Files Modified
- `HR-Knowledge/01-START-HERE/Current Status.md` — added a `v1.2.94` (LOCAL-E2E-ENV-001) release-timeline row that was missing, plus a T-098 row documenting this checklist
- `HR-Knowledge/08-SOP/Verification Workflow.md` — added a pointer to the new checklist under Related Notes (this repo uses `08-SOP/` in place of a `06-RUNBOOKS/` directory, which does not exist)

## Checklist Coverage
- **A. Pre-release checks** — git status, tag/commit note, CI green, migration/`.env` diff checks, conditional DB backup, conditional security-review
- **B. Production health checks** — copy/paste `curl` commands for API `/health`, Admin Web `/dashboard`, Mobile/PWA root, and 5 key admin routes (`/departments`, `/attendance/offsite-review`, `/attendance/risk-reviews`, `/leave`, `/offsite`), using the internal LAN IPs `172.16.2.31:4002/3002/3004` (confirmed against `docker-compose.yml` port mappings) with public-domain fallbacks (`hr.eds-center.com`, `mobilehr.eds-center.com`) noted, since prior QA (T-089) found the LAN IP unreachable from outside the office network
- **C. Admin Web regression** — login/dashboard, employees, departments (Thai count/date/manager-fallback per DEPT-POLISH-001), leave admin, off-site review (RBAC, reviewer-name, GPS-privacy), off-site requests, risk review (Thai i18n, GPS-privacy)
- **D. Mobile/PWA regression** — launch, login, home/calendar/attendance, approved-leave overlay consistency across all three surfaces, normal and off-site check-in/out (required note per REQ-002E-F1), no blank-page/React-mismatch symptoms
- **E. Leave regression** — single/multi-day display, cross-surface consistency, PENDING/REJECTED non-override, explicit overlap-semantics assertion for `GET /leave/me`
- **F. Attendance/off-site regression** — geofence, mock/stale/replay rejection (test only where safe), nonce/timezone payload completeness, admin review workflow, reviewer name, GPS-privacy rule
- **G. Local regression tooling** — `e2e-local.sh` usage and rationale, `.env` non-editing discipline
- **H. Post-release checks** — health re-check commands, mobile PWA cache/stale-bundle caveat, final tag verification
- **I. Known deferred work** — native attestation (SEC-ATT-005/006, DEFERRED), and explicitly flagged pre-existing RBAC UI gaps from `QA_T089` (BUG-001–004) so they are not misreported as new regressions

## Runtime Impact
None. No files under `apps/`, `scripts/`, or `prisma/` were touched — verified via `git diff --stat -- apps/ scripts/ prisma/` (empty).

## Database/Migration Impact
None. No schema or migration changes.

## Security/RBAC/Privacy Impact

| Field | Assessment |
|---|---|
| Auth impact | None — no auth code touched |
| RBAC impact | None — no RBAC code touched. Checklist *documents* existing RBAC behavior, including known unfixed gaps (BUG-001–004 from QA_T089), explicitly labeled as pre-existing so they aren't mistaken for new regressions |
| Data privacy impact | None — no data access changed. Checklist reinforces the existing no-raw-GPS display rule for off-site review and risk review |
| Password/token/hash impact | None |
| Mobile security impact | None |
| Dependency/advisory impact | None — no packages added |
| Secrets/logging check | No secrets, tokens, or credentials included in the checklist; production login example commands are not included (checklist only lists routes/health checks, no credential-bearing calls) |
| New endpoints protected | N/A — no new endpoints |
| Risk level | LOW |
| Security decision | PASS |

`./scripts/security-review.sh` was **not run** — this task touched only Markdown docs (no runtime, auth, RBAC, token, dependency, or CI-security files), which is the documented condition under which security-review is not required (see `HR-Knowledge/08-SOP/Verification Workflow.md` § Security Verification Guidance and `docs/SECURITY_HARNESS.md`).

## Verification Commands and Results

```
git status --short
 M "HR-Knowledge/01-START-HERE/Current Status.md"
 M "HR-Knowledge/08-SOP/Verification Workflow.md"
?? docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md
?? docs/CTO_SUMMARY_T098_PRODUCTION_STABILITY_REGRESSION.md

git diff --stat
 HR-Knowledge/01-START-HERE/Current Status.md | 2 ++
 HR-Knowledge/08-SOP/Verification Workflow.md | 1 +
 2 files changed, 3 insertions(+)

git diff --stat -- apps/ scripts/ prisma/
 (empty — confirms docs-only, no runtime/schema files touched)
```

`./scripts/verify.sh` — not run. Optional for docs-only per CLAUDE.md; skipped since no `apps/` files changed and there is nothing for a build/schema-validate step to catch in this change set.
`./scripts/docker-verify.sh` — not run (no runtime change to verify; stack left as-is per Docker Safety Rules).
`./scripts/api-smoke-test.sh` — not run (no API change).

## Remaining/Deferred Work
- Native attestation (SEC-ATT-005/006) remains DEFERRED pending a native-app build decision — unchanged by this task, referenced in checklist Section I.
- The pre-existing Admin Web RBAC UI gaps from `QA_T089` (`HOTFIX-T089A`/`HOTFIX-T089B`) remain open/paused — not addressed here, only documented so future regression runs don't misreport them as new.
- Department pagination i18n (limitation #22) and the local `.env` `NEXT_PUBLIC_API_URL` question (limitation #20) remain open, as before — unaffected by this task.
- The checklist itself has not yet been run end-to-end against a live environment as part of this task (docs-only scope, no test accounts/live browser used) — recommend the user execute it once against the next actual release.

## Recommended Commit Message
```
docs(qa): add production stability regression checklist

Add docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md, a practical
pre/post-release regression checklist covering production health,
Admin Web (departments/off-site review/risk review/leave), Mobile/PWA
(approved-leave overlay, off-site check-in/out), leave-overlap
semantics, and attendance/off-site GPS-privacy rules, synthesizing the
v1.2.89-v1.2.94 stabilization work. Adds a v1.2.94 Current Status.md
timeline row that was missing and links the checklist from the
Verification Workflow SOP. Docs-only, no runtime/schema change.
```

## Decision
PASS
