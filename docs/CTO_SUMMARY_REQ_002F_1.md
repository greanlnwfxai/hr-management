# CTO Summary

## Step
REQ-002F-1 — Backend Mixed Checkout Exception Foundation

## Status
PASS

## Scope
Backend-only implementation of the mixed attendance checkout exception flow:
an employee who checked in on-site (COMPANY_GEOFENCE) can submit a GPS-verified,
reason-required checkout exception from outside the company geofence. The record is
placed into PENDING_REVIEW for HR/Admin approval. No schema migration required.
No mobile UI changes in this task.

## Files Created
- `apps/api/src/attendance/dto/mixed-checkout-exception.dto.ts` — new DTO for exception submission

## Files Modified
- `apps/api/src/attendance/attendance.service.ts` — structured OUTSIDE_GEOFENCE error, new `mixedCheckoutException()` method, extended `findOffsiteReview()` query, updated `approveOffsiteAttendance()` and `rejectOffsiteAttendance()` guards
- `apps/api/src/attendance/attendance.controller.ts` — new `POST /attendance/offsite/mixed-checkout-exception` endpoint
- `apps/api/src/attendance/attendance.service.spec.ts` — 30 new/updated tests

## Endpoint Contract

```
POST /attendance/offsite/mixed-checkout-exception
Authorization: Bearer <JWT>   (any authenticated employee)
```

Request body:
| Field | Type | Validation |
|---|---|---|
| `latitude` | number | Required, -90–90 |
| `longitude` | number | Required, -180–180 |
| `accuracy` | number | Required, positive, ≤ 100 m |
| `workLocationName` | string | Required, 1–200 chars |
| `reason` | string | Required, 3–500 chars |
| `note` | string | Optional, ≤ 500 chars |

Responses:
| HTTP | Condition |
|---|---|
| 200 | Exception submitted — `reviewStatus=PENDING_REVIEW` |
| 404 | No clock-in record for today |
| 409 | Already checked out, or exception already submitted |
| 422 | Record is not COMPANY_GEOFENCE, or employee is inside the geofence |

## Validation Behavior
1. Employee must have a linked employee profile.
2. Today's attendance record must exist with `checkIn` set.
3. `checkOut` must be null (no double checkout).
4. `attendanceSource` must be `COMPANY_GEOFENCE`.
5. `reviewStatus` must be null (no resubmission).
6. If geofence is enabled and configured: employee must be OUTSIDE the radius.
   If geofence is disabled or unconfigured: exception is allowed (cannot validate).

## Structured Geofence Error
`POST /attendance/clock-out` and `POST /attendance/clock-in` outside the company
radius now return:
```json
{ "message": "You are outside the allowed company area.", "code": "OUTSIDE_GEOFENCE" }
```
(HTTP 422, unchanged status code — only added `code` field for mobile detection)

## Review API Integration
- `GET /attendance/offsite-review` now uses `OR` to include both:
  - OFFSITE_UNPLANNED and OFFSITE_PLANNED records (existing)
  - COMPANY_GEOFENCE records with non-null reviewStatus (mixed checkout exceptions)
- `PATCH /attendance/offsite-review/:id/approve` and `reject` — guards updated to
  allow COMPANY_GEOFENCE + PENDING_REVIEW records (mixed checkout exceptions).
  Normal COMPANY_GEOFENCE records (null reviewStatus) still blocked.
  No change to route or HTTP interface.

## Data Model
No schema migration needed. All required columns already existed on `Attendance`:
`checkOut`, `checkOutLatitude/Longitude/AccuracyMeters/DistanceFromCompanyMeters`,
`workLocationName`, `offsiteReason`, `reviewStatus`, `reviewedById`, `reviewedAt`, `reviewNote`.

Mixed checkout exception records are identified by:
`attendanceSource = COMPANY_GEOFENCE` AND `reviewStatus IS NOT NULL`
`attendanceSource` and `workMode` are NOT changed — check-in truth and payroll unchanged.

## Audit Behavior
New audit event: `ATTENDANCE_MIXED_CHECKOUT_SUBMITTED`

Safe metadata (no raw GPS):
```json
{
  "attendanceId": "...",
  "employeeId": "...",
  "date": "...",
  "attendanceSource": "COMPANY_GEOFENCE",
  "newReviewStatus": "PENDING_REVIEW",
  "workLocationName": "Client Office",
  "hasCoordinates": true,
  "accuracyBucket": "HIGH|MEDIUM|LOW",
  "hasDistanceData": true,
  "hasNote": false,
  "checkoutAt": "2026-06-29T..."
}
```
Raw `latitude`, `longitude`, `accuracy` are never written to audit log —
confirmed stripped by `audit-log.sanitizer.ts`.

## Test Results

```
Tests: 498 passed, 498 total (from 468 before this task)
New/updated tests in attendance.service.spec.ts: 30
```

New test coverage includes:
- OUTSIDE_GEOFENCE structured code on clock-out and clock-in
- `mixedCheckoutException`: success path, attendanceSource/workMode unchanged
- Rejection: no record, already checked out, exception already submitted,
  wrong attendanceSource, inside geofence, no employee profile
- Geofence disabled / unconfigured → exception allowed
- Audit event emitted, no raw GPS in metadata
- Best-effort audit (audit failure does not block submission)
- `findOffsiteReview` returns mixed checkout records
- `approveOffsiteAttendance` works for COMPANY_GEOFENCE + PENDING_REVIEW
- `rejectOffsiteAttendance` works for COMPANY_GEOFENCE + PENDING_REVIEW
- Updated tests: COMPANY_GEOFENCE + null reviewStatus still blocked on approve/reject

## Verification Result
```
./scripts/verify.sh   — PASS (API build, Prisma schema, Web build)
./scripts/api-smoke-test.sh — PASS (login, /employees, /attendance, /dashboard)
./scripts/security-review.sh — PASS (dependency audit, secret scan)
npx jest (498 tests) — PASS
```

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | New endpoint `POST /attendance/offsite/mixed-checkout-exception` protected by JwtAuthGuard (inherited from controller). No unauthenticated path. |
| RBAC impact | Employee submits for their own record only (userId from JWT → `requireEmployeeId()`). HR review uses existing SUPER_ADMIN/HR_ADMIN guards unchanged. |
| Data privacy impact | Checkout GPS stored in `Attendance` table only (existing pattern for off-site). Never written to `AuditLog`. `workLocationName` and `offsiteReason` are employee-supplied text. |
| Password/token/hash impact | None. |
| Mobile security impact | No changes to mobile in this task. Backend does not initiate background location. |
| Dependency/advisory impact | No new packages added. Existing API acceptedrisk advisories (Multer DoS) unchanged. |
| Secrets/logging check | `workLocationName` and `offsiteReason` are not logged in NestJS interceptors (interceptors log route + status only). Raw GPS never in audit metadata. |
| Geofence bypass risk | Backend validates employee is outside company radius before accepting the exception. Returns 422 if inside. Prevents abuse of the exception flow. |
| New endpoints protected | `POST /attendance/offsite/mixed-checkout-exception` — JwtAuthGuard ✓ |
| Risk level | LOW |
| Security decision | PASS |

## Issues Found
None.

## Risk
Low

## Decision
PASS

## Next Step
REQ-002F-2 — Mobile UI: Add mixed checkout home screen states (B/C/D/E) and
new `/mixed-checkout` screen. Resolves open decisions OD-1 (resubmission policy)
and OD-4 (proactive vs reactive exception card) before starting mobile.

## Recommended Commit Message
```
feat(attendance): add mixed checkout exception backend

POST /attendance/offsite/mixed-checkout-exception allows ONSITE employees
to check out outside the company geofence with GPS + reason, setting
reviewStatus=PENDING_REVIEW for HR review. Adds structured OUTSIDE_GEOFENCE
error code to clock-out rejection. Extends offsite-review queue to include
mixed checkout records. No schema migration required.
```
