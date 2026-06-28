# CTO Summary

## Task
REQ-002D — Off-site Attendance Review API / Audit Hardening

## Status
PASS

## Scope
Backend-only. Three new protected API endpoints that allow HR_ADMIN / SUPER_ADMIN to list,
approve, and reject unplanned off-site attendance records. No schema changes, no frontend
changes, no mobile changes.

## Files Created
- `apps/api/src/attendance/dto/approve-offsite.dto.ts` — optional `reviewNote` (max 500 chars)
- `apps/api/src/attendance/dto/reject-offsite.dto.ts` — optional `reviewNote` (max 500 chars)
- `apps/api/src/attendance/dto/query-offsite-review.dto.ts` — pagination + `reviewStatus`, `employeeId`, date-range filters
- `docs/CTO_SUMMARY_REQ_002D.md` — this document

## Files Modified
- `apps/api/src/attendance/attendance.service.ts` — added `findOffsiteReview`, `approveOffsiteAttendance`, `rejectOffsiteAttendance`; added three DTO imports
- `apps/api/src/attendance/attendance.controller.ts` — added three new endpoints; added three DTO imports
- `apps/api/src/attendance/attendance.service.spec.ts` — added 30 unit tests across three new `describe` blocks
- `apps/api/src/attendance/attendance.controller.spec.ts` — added mock methods, three delegation tests, three RBAC decorator tests

## API Endpoints Added

| Method | Path | Guard | Description |
|---|---|---|---|
| GET | `/attendance/offsite-review` | JWT + SUPER_ADMIN / HR_ADMIN | List off-site records (all sources/statuses, filterable) |
| PATCH | `/attendance/offsite-review/:id/approve` | JWT + SUPER_ADMIN / HR_ADMIN | Approve a PENDING_REVIEW record |
| PATCH | `/attendance/offsite-review/:id/reject` | JWT + SUPER_ADMIN / HR_ADMIN | Reject a PENDING_REVIEW record |

**Route ordering**: `GET /offsite-review` is placed before `GET /:id` in the controller to avoid
NestJS capturing "offsite-review" as the `:id` wildcard.

## Business Rules Enforced

1. Only records with `attendanceSource` in `[OFFSITE_UNPLANNED, OFFSITE_PLANNED]` can be reviewed.
   Records with `attendanceSource = COMPANY_GEOFENCE` throw `400 BadRequestException`.
2. Only records with `reviewStatus = PENDING_REVIEW` can be approved or rejected.
   `AUTO_ACCEPTED`, `APPROVED`, `REJECTED`, and `MISSING_CHECKOUT` records throw `400 BadRequestException`.
3. `reviewedAt` is always set on approve/reject.
4. `reviewedById` (Employee FK) is set if the reviewing admin has a linked employee profile;
   left unset if they do not. Reviewer identity is preserved via audit `actorUserId` regardless.
   This covers the common case where `admin@hr.local` (SUPER_ADMIN with no employee profile)
   performs the review — `reviewedById` will be null, which is schema-legal (`String?`).
5. `reviewNote` is optional for both approve and reject, consistent with the existing
   `ApproveOffSiteRequestDto` / `RejectOffSiteRequestDto` pattern in the off-site module.

## Audit Hardening

Privacy-safe audit events `ATTENDANCE_OFFSITE_APPROVED` and `ATTENDANCE_OFFSITE_REJECTED`
are emitted via `recordBestEffort()`. Metadata never contains raw GPS:

```
attendanceId, employeeId, date, attendanceSource,
previousReviewStatus, newReviewStatus,
hasReviewNote (bool), hasReviewedByEmployee (bool), hasCoordinates (bool)
```

No `latitude`, `longitude`, `checkInLatitude`, `checkInLongitude`, or raw accuracy/distance
values appear in audit metadata. The existing `AUDIT_SENSITIVE_KEYS` sanitizer provides a
secondary defense layer.

## Verification Results

```
./scripts/verify.sh               → PASS
  API build (nest build)          → PASS — no TypeScript errors
  Prisma schema validate          → PASS — schema valid
  Web build (next build)          → PASS — 15 pages, TypeScript clean

./scripts/docker-verify.sh        → NOT RUN (script uses `docker compose down`,
                                     violates Docker safety rules)

Docker rebuild + live verification:
  docker compose build api          → PASS
  docker compose up -d api          → PASS (hr-db: Healthy, hr-api: Started)
  GET /health                       → 200 OK
  GET /attendance/offsite-review (no token) → 401 Unauthorized (auth guard active)
  POST /auth/login admin@hr.local   → accessToken received
  GET /attendance/offsite-review (Bearer) → 200 OK (route registered, SUPER_ADMIN access confirmed)
  Route ordering confirmed: /offsite-review no longer falls through to /:id

./scripts/api-smoke-test.sh       → PASS (11/11 checks)

Unit tests (attendance suite):
  npx jest attendance --no-coverage → 150/150 PASS
  New tests: 31 (across service + controller spec)
    — added: attendanceSource invariant test (OFFSITE_UNPLANNED/PLANNED filter never leaks COMPANY_GEOFENCE)
  Existing tests: 119 — all still green (no regressions)

./scripts/security-review.sh      → PASS (automated checks clear)
  Dependency audit                → PASS (HIGH findings have documented accepted risk)
  Secret scan                     → PASS (no committed secrets)
```

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | Three new endpoints. All are inside the `@UseGuards(JwtAuthGuard, RolesGuard)` class-level guard on `AttendanceController`. Unauthorized callers receive 401. |
| RBAC impact | All three new endpoints carry `@Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)`. EMPLOYEE and MANAGER roles are denied with 403. Decorator presence verified by 3 new RBAC unit tests via `Reflect.getMetadata`. |
| Data privacy impact | `GET /attendance/offsite-review` returns full attendance records (including stored GPS fields). This is intentional — admin review requires location context. GPS is NOT exposed in audit log metadata. |
| Password/token/hash impact | None. |
| Mobile security impact | None. No mobile-facing changes. |
| Dependency/advisory impact | No new packages added. Existing HIGH advisories (Multer DoS) have documented accepted risk. |
| Secrets/logging check | No secrets, tokens, or raw GPS coordinates appear in audit log metadata or API response error messages. |
| New endpoints protected | `GET /attendance/offsite-review` — JWT + SUPER_ADMIN/HR_ADMIN. `PATCH /attendance/offsite-review/:id/approve` — JWT + SUPER_ADMIN/HR_ADMIN. `PATCH /attendance/offsite-review/:id/reject` — JWT + SUPER_ADMIN/HR_ADMIN. |
| Risk level | LOW |
| Security decision | PASS |

## Issues Found
None.

## Risk
Low. Changes are additive (no schema changes, no existing endpoint modifications). Three new
read/write endpoints, strictly guarded to SUPER_ADMIN and HR_ADMIN. Reviewer identity is
always captured in audit log via `actorUserId` regardless of whether `reviewedById` can be set.

## Decision
PASS

## Next Step
REQ-002E — Off-site Attendance Review (Mobile / Employee View), or as directed.

## Recommended Commit Message
```
feat(attendance): add off-site attendance review API

Add GET /attendance/offsite-review and PATCH .../approve + .../reject
endpoints restricted to SUPER_ADMIN and HR_ADMIN. Only PENDING_REVIEW
off-site records (OFFSITE_UNPLANNED / OFFSITE_PLANNED) can be reviewed;
AUTO_ACCEPTED and already-reviewed records are rejected with 400.
reviewedById is set when the reviewer has a linked employee profile and
left null otherwise (reviewer identity preserved via audit actorUserId).
Audit events (ATTENDANCE_OFFSITE_APPROVED / REJECTED) emit privacy-safe
metadata — no raw GPS coordinates. 149/149 unit tests pass.
```
