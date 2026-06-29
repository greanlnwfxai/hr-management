# CTO Summary

## Step
REQ-002F — Mixed Attendance Flow Spec: On-site Check-in to Off-site Check-out

## Status
PASS (SPEC ONLY)

## Scope
Design specification for the mixed attendance scenario where an employee checks in at the
company (on-site, COMPANY_GEOFENCE) and later needs to check out from outside the company
geofence due to legitimate off-site work during the day. No runtime code was modified.

## Files Created
- `docs/REQ_002F_MIXED_ATTENDANCE_FLOW_SPEC.md` — full product and technical specification

## Files Modified
None. This is a spec-only deliverable.

## Verification Result

```
git diff --check — PASS (no whitespace issues, clean new file)
grep "COMPANY_GEOFENCE" apps/api/src/attendance/attendance.service.ts — confirms exact error
  thrown at line 799: UnprocessableEntityException("You are outside the allowed company area.")
  No structured code field exists today → spec mandates adding code: "OUTSIDE_GEOFENCE"
Existing review endpoints confirmed non-breaking: approve/reject PATCHes do not filter by
  attendanceSource, so they will work for mixed checkout records without change.
```

## Design Summary

### Data Model
No schema migration required for MVP. All needed columns exist:
`checkOut`, `checkOutLatitude/Longitude/AccuracyMeters/DistanceFromCompanyMeters`,
`workLocationName`, `offsiteReason`, `reviewStatus`, `reviewedById`, `reviewedAt`, `reviewNote`.

The combination `attendanceSource=COMPANY_GEOFENCE` + `reviewStatus=PENDING_REVIEW` is
currently impossible in normal flows and uniquely identifies a mixed checkout exception.

### API Changes Required
| Change | Type | Risk |
|---|---|---|
| Add `code: "OUTSIDE_GEOFENCE"` to 422 error in `validateGeofence()` | Minimal | LOW |
| New DTO `MixedCheckoutExceptionDto` | New file | LOW |
| New service method `mixedCheckoutException()` | New method | MEDIUM |
| New endpoint `POST /attendance/offsite/mixed-checkout-exception` | New route | LOW |
| Extend `findOffsiteReview()` query to include mixed checkout records | Query update | LOW |

### Mobile Changes Required
| Change | Type |
|---|---|
| `home.tsx` — add 4 new state cards (B/C/D/E) for mixed checkout lifecycle | New conditionals |
| New screen `/mixed-checkout` | New file |
| New hook `useMixedCheckoutAttendance.ts` | New file |

### Existing Endpoints Unchanged
`PATCH /attendance/offsite-review/:id/approve` and `reject` require no changes — they operate
on any Attendance UUID with `reviewStatus=PENDING_REVIEW`.

## Issues Found
None blocking. Four open product decisions documented in spec (OD-1 through OD-4):
- OD-1: Rejected mixed checkout resubmission (recommended: no, manual HR resolution)
- OD-2: Admin Web badge for mixed records (recommended: defer)
- OD-3: Type filter in review query (recommended: defer)
- OD-4: Proactive vs reactive exception card on mobile (recommended: reactive — avoids polling)

## Risk
Low

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | New endpoint requires JWT. No unauthenticated path. |
| RBAC impact | Employee submits own record only (userId from JWT). HR review uses existing guards. |
| Data privacy impact | Checkout GPS stored in Attendance table only (existing pattern). Never in audit log. workLocationName is employee text — no auto-geocoding. |
| Password/token/hash impact | None. |
| Mobile security impact | No new token storage. GPS captured once on submission. No background tracking. |
| Dependency/advisory impact | No new packages for spec. None anticipated for implementation. |
| Secrets/logging check | workLocationName and offsiteReason must not be logged at INFO level in interceptors. Confirmed: existing NestJS interceptors log route + status only, not body fields. |
| New endpoints protected | POST /attendance/offsite/mixed-checkout-exception — JwtAuthGuard (same as all /attendance routes). |
| Geofence bypass | Backend explicitly validates employee is OUTSIDE geofence before accepting exception. Returns 422 if inside. Prevents abuse. |
| Risk level | LOW |
| Security decision | PASS |

## Decision
PASS — Spec approved for implementation planning.

## Next Step
REQ-002F Implementation:
1. Start with T-001 (add `code: "OUTSIDE_GEOFENCE"` to structured error — smallest change, unblocks mobile)
2. T-002 → T-005: Backend DTO, service method, controller, review query extension
3. T-006 → T-008: Mobile home screen states, mixed-checkout screen, hook
4. T-009: Tests

Resolve Open Decisions OD-1 and OD-4 with product owner before starting T-006 (mobile screens
depend on these choices).

## Recommended Commit Message
```
docs: add REQ-002F mixed attendance flow spec

Specifies on-site check-in → off-site check-out exception flow.
No schema migration required; all fields exist. New endpoint
POST /attendance/offsite/mixed-checkout-exception, structured
OUTSIDE_GEOFENCE error code, review queue extension.
```
