# CTO Summary

## Step
T-096 — HR-Knowledge & ADR Sync Through v1.2.71

## Status
PASS

## Scope
Docs/knowledge-only sync bringing `HR-Knowledge/` and `docs/` current through
`v1.2.71-personal-summary-ring-date-polish`, covering:

- T-092 (v1.2.68) and T-093 (v1.2.69), already captured — verified, not re-added
- T-094 (v1.2.70) and T-095 (v1.2.71) — personal-summary Thai status labels,
  pending-KPI rename, leave-balance ring UI, and leave date-range formatting
- A previously-undocumented production DB migration-drift incident
  (`leave_adjustments` P2021 + a second migration whose enum already existed
  in production) — now recorded with a reusable recovery procedure
- The SEC-ATT-001…007 roadmap — previously only referenced inline in two
  places, now has a dedicated orientation index

No application code, schema, migration, or RBAC changes. No new ADR was
added — v1.2.68–v1.2.71 are a docs sync, a doc-sanitization pass, and two
frontend UI/i18n polish releases; none introduced a new architecture decision,
so existing ADR-029–032 remain the current set (32 total). No git operations
were performed (add/commit/push/tag remain the user's manual step).

## Files Created
- `docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md` — incident record for the `leave_adjustments` P2021 recovery and the `offsite_attendance_fields` "already exists" resolution via `prisma migrate resolve --applied`, plus a reusable step-by-step recovery procedure for future migration drift
- `docs/SEC_ATT_ROADMAP.md` — orientation index for SEC-ATT-001 through SEC-ATT-007, with the architecture note that PWA/web cannot strongly prove device integrity, that native wrapper is required only for SEC-ATT-005/006, and that backend validation (002–004, 007) should land first
- `docs/CTO_SUMMARY_T096_KNOWLEDGE_ADR_SYNC.md` (this file)

## Files Modified
| File | Change |
|---|---|
| `HR-Knowledge/01-START-HERE/Current Status.md` | Bumped header/date to v1.2.71; extended Release Timeline table with v1.2.68–v1.2.71 rows; added a production migration-drift note near the top and in Security/Process Notes; updated Next Recommended Task to link the new SEC-ATT roadmap doc; added Related Notes links to the two new docs |
| `HR-Knowledge/04-DOMAINS/Dashboard/Dashboard Module.md` | Added three new sections: Personal Summary Thai Localization and Pending KPI Rename (T-094), Leave Balance Ring UI (T-094/T-095), Leave Date Formatting (T-095) — all explicitly noted frontend-only, RBAC/schema unchanged |
| `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` | Linked the new SEC-ATT roadmap doc from the existing SEC-ATT-001 follow-up note; added Related Notes links to both new docs |
| `HR-Knowledge/04-DOMAINS/Attendance/Off-site Work Mode.md` | Added a Related Notes cross-reference to the migration-incident doc (covers the `attendanceSource`/review fields this mode depends on) |
| `HR-Knowledge/04-DOMAINS/Leave/Leave Balance Module.md` | Added a Related Notes cross-reference to the migration-incident doc (covers the `leave_adjustments` table) |

No files were deleted. No files outside `docs/` and `HR-Knowledge/` were touched.

## Sections NOT Modified (verified already current)
- **ADR Index / ADR Pack count** — remains 32; ADR-029–032 (v1.2.66–v1.2.67) were already added by T-092. No new ADR was warranted by v1.2.68–v1.2.71 (see Scope).
- **Security baseline v1.2.66/v1.2.67** — already fully captured by T-092 (ADR-029, ADR-031) and cross-referenced; re-checked, no gaps found.
- **Credential sanitization (v1.2.69/T-093)** — already applied across `docs/` and `HR-Knowledge/`; re-checked via `grep -n "admin1234"` on this diff, the only hit is the pre-existing descriptive reference in `Current Status.md` ("admin1234 is the dev/CI/local seed default only and no longer works against production"), identical in nature to the one T-092 already reviewed and accepted — not a new secret.

## Verification Result
```
git status --short                          → 5 modified, 2 new files, all under docs/ or HR-Knowledge/
git diff --check                             → PASS (no whitespace/conflict-marker issues)
./scripts/secret-scan.sh                     → PASS (Phase 1/2/3 all clean)
git diff | grep -niE 'admin1234|accessToken"?\s*[:=]\s*"eyJ|
  refreshToken"?\s*[:=]\s*"eyJ|Bearer eyJ|password\s*[:=]\s*"[a-z0-9]{6,}"'
                                              → 1 match: the pre-existing dev/CI
                                                seed-default reference described
                                                above — descriptive, not a new
                                                secret, no value repeated
```
`./scripts/verify.sh` was **not run** — this task touches no `apps/api` or
`apps/web` source files (confirmed via `git status --short` above), so API
build / Prisma validate / web build provide no verification value for a
docs-only diff. Same reasoning `./scripts/docker-verify.sh` was skipped:
no runtime code changed, no Docker command was run, and no container was
inspected, started, or stopped. No markdown linter is configured in this
repo (confirmed in T-093).

## Issues Found
None. The production migration-drift incident referenced in the task prompt
had already been resolved out-of-band (prior to this documentation task) and
had no existing write-up; it is now captured in
`docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md`.

## Risk
Low

## Decision
PASS

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None. No auth endpoint or guard was added or changed. |
| RBAC impact | None. No `@Roles` decorator or RBAC matrix changed. Dashboard Module doc explicitly notes T-094/T-095 are frontend-only, RBAC unchanged. |
| Data privacy impact | None. No new data exposure; the migration-incident doc lists column/field names only, no data values, and explicitly avoids raw GPS values per repo convention (see [[Audit Log Module]] denylist, referenced from `SEC_ATT_ROADMAP.md`). |
| Password/token/hash impact | None. No password, token, or hash value appears in any file created or modified. The migration-incident doc explicitly confirms no credential was read, printed, or logged during the recovery it documents. |
| Mobile security impact | None — mobile app and geofence/GPS behavior unchanged; `SEC_ATT_ROADMAP.md` is orientation-only and defers all native-wrapper-dependent work (SEC-ATT-005/006) as not-yet-scoped. |
| Dependency/advisory impact | None. No `package.json`/lockfile changes; no new packages. |
| Secrets/logging check | Verified via `secret-scan.sh` PASS and targeted greps (see Verification Result) — no secrets, tokens, or new credential values introduced. |
| New endpoints protected | None — no endpoints were added by this task. |
| Risk level | LOW |
| Security decision | PASS |

**Security FAIL conditions checked — none triggered:** no password/token/hash exposed; no endpoint changes; no RBAC change; no secret committed to source control; no dependency change; no destructive Docker command used; no fabricated external advisory details.

## Next Step
SEC-ATT-001 — Cross-Platform Attendance Anti-Spoofing Spec (see `docs/SEC_ATT_ROADMAP.md` for full sequencing).

## Recommended Commit Message
```
docs(knowledge): sync HR knowledge and ADRs through v1.2.71

- Add docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md recording
  the leave_adjustments P2021 recovery and the offsite_attendance_fields
  migrate-resolve recovery, plus a reusable drift-recovery procedure
- Add docs/SEC_ATT_ROADMAP.md indexing SEC-ATT-001 through SEC-ATT-007
  with the native-wrapper-vs-backend-hardening sequencing rationale
- Update Current Status.md release timeline through v1.2.71 (T-092
  through T-095), link the two new docs, and note the migration-drift
  recovery
- Update Dashboard Module.md for T-094/T-095: personal-summary Thai
  status labels, pending-KPI rename, leave balance ring UI, and leave
  date-range formatting (frontend-only, RBAC/schema unchanged)
- Cross-reference the migration-incident doc from Attendance Module,
  Off-site Work Mode, and Leave Balance Module

No application code, schema, or migration changes. No new ADR (no new
architecture decision in this release range). No secrets included. No
git operations performed as part of this task.
```
