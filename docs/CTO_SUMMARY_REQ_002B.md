# CTO Summary

## Step
REQ-002B — Off-site Work Attendance Implementation Specification and Phased Plan

## Status
PASS

## Scope
Technical implementation specification and phased implementation plan for the Off-site Work Attendance feature, based on the approved REQ-002A Hybrid Model (Option C). Covers 17 sections: affected files inventory, Prisma schema changes, API contract (5 new endpoints), business rules, OffSiteRequest integration, audit events with GPS-free metadata, STEP Connect mobile UX plan, Admin Web off-site review UI plan, test plan, phased roadmap (REQ-002C through REQ-002H), open questions, risk analysis, and explicit v1 non-goals. No runtime code changes, schema migrations, data mutation, or Docker commands executed.

## Files Created
- `docs/REQ_002B_OFFSITE_WORK_ATTENDANCE_IMPLEMENTATION_SPEC.md` — Full implementation specification
- `docs/CTO_SUMMARY_REQ_002B.md` — This file

## Files Modified
None.

## Verification Result
```
git status --short     → docs/REQ_002B_OFFSITE_WORK_ATTENDANCE_IMPLEMENTATION_SPEC.md (untracked, correct)
                         docs/CTO_SUMMARY_REQ_002B.md (untracked, correct)
git diff --check       → clean (no whitespace errors)
git diff --stat        → no tracked file changes
Documentation review   → PASS (both files created, content verified)
./scripts/verify.sh    → NOT RUN (spec/plan-only task; no runtime code changed)
./scripts/docker-verify.sh   → NOT RUN (spec/plan-only task)
./scripts/api-smoke-test.sh  → NOT RUN (spec/plan-only task)
./scripts/security-review.sh → NOT RUN (spec/plan-only task; no endpoints, dependencies, or runtime code added)
```

## Key Technical Findings

### 1. Clock-out Bug — Precise Description
`attendance.service.ts:clockOut()` calls `validateGeofence()` as its **very first action** before fetching the attendance record. `validateGeofence()` no-ops for non-mobile source, so **the bug is mobile-source-specific**: a mobile employee who checked in as OFFSITE is rejected by the company radius check on clock-out because the record's `workMode` is not yet known at that point in the call stack. Fix is scoped to REQ-002C.

### 2. Existing Off-site Branch Conflict
`clockIn()` lines 67–87 throw 403 when no APPROVED `OffSiteRequest` exists — this is the old strict pre-approval path. This directly contradicts the new unplanned → PENDING_REVIEW path. The new dedicated `POST /attendance/offsite/clock-in` endpoint supersedes this branch. The branch is deprecated (kept in-place with a warning log) in REQ-002C until the mobile app migrates to the new endpoint in REQ-002E.

### 3. Migration Sequencing (Critical)
`useAttendance.ts` in mobile auto-injects `workMode: 'OFFSITE'` onto the regular `POST /attendance/clock-in` when there is an approved OffSiteRequest. This must be removed **in REQ-002E** — not before. Removing it before mobile is migrated would break planned off-site check-in for mobile users.

### 4. Timezone Finding
The existing `todayUtc()` helper returns the UTC calendar day. Bangkok (UTC+7) during 00:00–06:59 local time has a different calendar date from UTC. Both `attendance.date` and OffSiteRequest matching must use `todayBangkok()` — a new helper mirroring the `isLateInBangkok()` +7h offset pattern already in the code. This is a behavior change: a pre-7am Bangkok check-in will be attributed to the Bangkok calendar day, not the UTC day.

### 5. Enum Rule Adherence
Two new enums — `AttendanceSource` and `AttendanceReviewStatus` — must appear in **both** `schema.prisma` and `src/common/enums.ts` per the CLAUDE.md enum rule. Services use the `common/enums.ts` values and map to Prisma types with type-only imports.

### 6. GPS Column Type
`Float?` is recommended for `checkInLatitude / checkInLongitude / checkOutLatitude / checkOutLongitude`, consistent with the existing `GeofenceConfig.latitude / longitude` field type. The REQ-002A conceptual sketch used `Decimal`; this spec corrects to match the codebase convention.

### 7. Audit Event Prefix Note
`off-site.service.ts` currently emits `OFFSITE_APPROVED` / `OFFSITE_REJECTED` without the `ATTENDANCE_` prefix. New attendance review events will use `ATTENDANCE_OFFSITE_APPROVED` / `ATTENDANCE_OFFSITE_REJECTED`. The inconsistency in the off-site service is documented but not fixed in this spec — it would be a breaking change to existing audit queries.

## New Endpoints (REQ-002C / REQ-002D)

| Endpoint | Role | Purpose |
|---|---|---|
| `POST /attendance/offsite/clock-in` | All roles (own) | Hybrid off-site check-in |
| `POST /attendance/offsite/clock-out` | All roles (own) | Off-site check-out (no geofence) |
| `GET /attendance/offsite` | HR_ADMIN, SUPER_ADMIN | Admin review list with filters |
| `PATCH /attendance/offsite/:id/approve` | HR_ADMIN, SUPER_ADMIN | Approve PENDING_REVIEW record |
| `PATCH /attendance/offsite/:id/reject` | HR_ADMIN, SUPER_ADMIN | Reject PENDING_REVIEW record |

Manager read-only access deferred to v1.1 (blocked on HOTFIX-T089A).

## Phased Roadmap

| Phase | Scope | Depends on |
|---|---|---|
| REQ-002C | Backend schema + new off-site API endpoints + clockOut bug fix | OQ#2 answer for GPS columns |
| REQ-002D | Audit events + admin review API (approve/reject endpoints) | REQ-002C |
| REQ-002E | STEP Connect mobile off-site UX + migration from old endpoint | REQ-002C + REQ-002D |
| REQ-002F | Admin Web off-site review page | REQ-002C + REQ-002D (can parallel REQ-002E) |
| REQ-002G | Runtime verification / QA / security review | REQ-002E + REQ-002F |
| REQ-002H | HR-Knowledge sync + ADR | REQ-002G |

## Open Questions (Carried from REQ-002A)

| # | Question | Blocks |
|---|---|---|
| OQ#2 | Store raw lat/lon in Attendance table? (PDPA) | **REQ-002C schema** — GPS columns conditional on this answer |
| OQ#3 | `reason` mandatory for planned path (Path 1)? | REQ-002C DTO validation |
| OQ#1 | GPS accuracy threshold: 100m or 200m for off-site? | REQ-002C service logic |
| OQ#4 | Missing check-out auto-close time: 23:59 BKK or scheduled end? | Background job in REQ-002D |
| OQ#5 | Manager read-only in v1? | RBAC guard in REQ-002D |
| OQ#6 | Reject → auto-ABSENT, or manual HR action? | REQ-002D reject logic |

**OQ#2 must be resolved before REQ-002C can begin.** All other open questions have v1-safe defaults documented in the spec.

## Issues Found
None in this task. Pre-existing issues documented:

1. **Off-site clock-out geofence bug** (pre-existing from REQ-002A): Mobile off-site clock-out fails because `validateGeofence()` is called before record lookup. Fix is REQ-002C scope.
2. **Audit event prefix inconsistency** in `off-site.service.ts` (`OFFSITE_APPROVED` vs `ATTENDANCE_OFFSITE_APPROVED`): documented, not changed in this spec.

## Runtime Code Changed
No.

## Database / Schema Changed
No.

## Data Mutation
No.

## Docker Destructive Commands
None executed.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints added in this task. All five planned new endpoints require `JwtAuthGuard`. Specified in §6 of the spec. |
| RBAC impact | No code changes. Roles documented: EMPLOYEE/MANAGER → own check-in/out only; HR_ADMIN/SUPER_ADMIN → review all. Manager review scope explicitly blocked by guard (deferred to v1.1 per HOTFIX-T089A). |
| Data privacy impact | Raw GPS column inclusion is conditional on OQ#2 / PDPA review. GPS is never written to audit log (enforced by `AUDIT_SENSITIVE_KEYS`). `accuracyBucket` used in metadata instead of raw accuracy. |
| Password/token/hash impact | None. Spec-only. |
| Mobile security impact | Off-site check-in uses foreground GPS only. No background tracking. Backend remains authority for all validation. Geofence bypass is explicit and audited — not a bug. |
| Dependency/advisory impact | No new packages. |
| Secrets/logging check | Audit metadata schema in §9 explicitly forbids `latitude`, `longitude`, `accuracy`, `distance`, `note` content, `reviewNote` content. Privacy alternatives specified for all. |
| New endpoints protected | No new endpoints added in REQ-002B. Future endpoints documented: all five require JWT + role guard as specified. |
| Risk level | LOW (spec/plan only; no code changes) |
| Security decision | PASS |

## Risk
Low — documentation and specification only; no runtime changes.

## Decision
PASS

## Next Step
**REQ-002C** — Backend schema migration + off-site attendance API foundation.

Before REQ-002C begins, the user should answer **OQ#2** (GPS lat/lon storage on Attendance record, PDPA alignment) as it determines whether the `checkIn/checkOutLatitude/Longitude Float?` columns appear in the Prisma schema. All other OQ answers have v1-safe defaults and do not block REQ-002C start.

## Recommended Commit Message
```
docs(req): add off-site attendance implementation spec REQ-002B

Technical implementation specification and phased plan for off-site
work check-in/check-out. Covers schema changes, 5 new API endpoints,
business rules, Bangkok timezone fix, audit metadata, STEP Connect
UX plan, admin web review UI, test plan, and REQ-002C→H roadmap.
Spec-only; no runtime code or schema changes.
```
