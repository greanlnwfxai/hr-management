# CTO Summary

## Step
REQ-002G-1 — Manager-based Off-site Attendance Approval: Implementation

## Status
PASS

## Scope

Runtime implementation of MANAGER role as an approver for off-site attendance records. Extends three existing review endpoints to allow MANAGER access with department-scoped filtering and self-review prohibition. Updates admin web UI for MANAGER access, updates mobile pending status text, and adds comprehensive backend service tests.

## Files Created

| File | Purpose |
|------|---------|
| `docs/CTO_SUMMARY_REQ_002G_IMPLEMENTATION.md` | This document |

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/attendance/attendance.service.ts` | Added `REVIEW_SELECT` (no raw GPS); updated `findOffsiteReview` to accept userId/userRole and apply dept-scoped filter for MANAGER; updated `approveOffsiteAttendance` and `rejectOffsiteAttendance` with MANAGER scope + self-review 403 guards; switch response select to `REVIEW_SELECT` |
| `apps/api/src/attendance/attendance.controller.ts` | Added `UserRole.MANAGER` to `@Roles` on `findOffsiteReview`, `approveOffsiteRecord`, `rejectOffsiteRecord`; passed `user.id` and `user.role` to `findOffsiteReview` |
| `apps/api/src/attendance/attendance.controller.spec.ts` | Updated 3 RBAC metadata tests to assert MANAGER in the roles array; updated `findOffsiteReview` delegation test to pass user context |
| `apps/api/src/attendance/attendance.service.spec.ts` | Added MANAGER scope test blocks: `findOffsiteReview — MANAGER scope`, `approveOffsiteAttendance — MANAGER scope`, `rejectOffsiteAttendance — MANAGER scope` (17 new tests) |
| `apps/web/lib/auth.ts` | Added `isAdminOrManager()` helper |
| `apps/web/components/AppLayout.tsx` | Added `/attendance/offsite-review` to MANAGER nav |
| `apps/web/app/(app)/attendance/offsite-review/page.tsx` | Updated access gate from `isAdmin` to `isAdminOrManager`; role-differentiated page title (MANAGER: "ของทีม" suffix); updated access-denied message |
| `apps/mobile/app/attendance.tsx` | `PENDING_REVIEW` label: "รอ HR ตรวจสอบ" → "รอหัวหน้างาน/HR ตรวจสอบ" |
| `apps/mobile/app/home.tsx` | Same label change (reviewStatusLabel + banner title) |

## Verification Result

```
./scripts/verify.sh       → [PASS] ALL CHECKS PASSED
./scripts/docker-verify.sh → [PASS] DOCKER STACK HEALTHY (all services healthy)
./scripts/api-smoke-test.sh → [PASS] API SMOKE TEST PASSED
./scripts/security-review.sh → [PASS] SECURITY REVIEW PASSED — automated checks clear
npx jest (512 tests)      → 512 passed, 0 failed
```

## Issues Found

**Blocking issue caught and fixed:** The spec claimed GPS was "already excluded" by the frontend `OffsiteReviewRecord` TypeScript type. This was false — `ATTENDANCE_SELECT` selected all four raw lat/lon fields (`checkInLatitude`, `checkInLongitude`, `checkOutLatitude`, `checkOutLongitude`) and returned them on the wire to all API callers. A separate `REVIEW_SELECT` was created omitting those four fields. The internal findUnique in approve/reject still uses `ATTENDANCE_SELECT` so the `hasCoordinates` audit field remains accurate.

**Empty-list fallback safety:** The `findOffsiteReview` MANAGER branch explicitly returns `{ data: [], meta: { total: 0 } }` when no `managedDepartment` is found. A conditional spread (`where: { ...(deptId && ...) }`) would have returned org-wide data if `deptId` were falsy — this pattern was avoided.

## Risk
Low — MANAGER scope is strictly tighter than HR scope. No schema migration. HR/SUPER_ADMIN behaviour unchanged. GPS privacy fixed proactively.

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | Three existing JWT-guarded endpoints extended to MANAGER. No new unguarded surface. |
| RBAC impact | MANAGER added to `@Roles` on list/approve/reject. Service-layer scope enforcement ensures MANAGER can only act on their managed department. Self-review explicitly blocked with 403. |
| Data privacy impact | **GPS privacy fixed:** raw `checkInLatitude`, `checkInLongitude`, `checkOutLatitude`, `checkOutLongitude` are no longer returned from the review endpoints (replaced with `REVIEW_SELECT`). Distance/accuracy fields remain. Fix applies to HR and MANAGER responses equally. |
| Password/token/hash impact | None. |
| Mobile security impact | Text change only. No token storage or API call changes. |
| Dependency/advisory impact | No new packages. |
| Secrets/logging check | Audit log records `actorRole` (role string, not credentials). No lat/lon in audit metadata (only `hasCoordinates` boolean). |
| New endpoints protected | No new endpoints. Three existing endpoints now admit MANAGER with service-layer scope enforcement. |
| Risk level | LOW |
| Security decision | PASS |

## Decision
PASS

## Next Step
REQ-002H — Leave approval or other remaining backlog items.

## Recommended Commit Message
```
feat(attendance): add manager-based off-site review access (REQ-002G-1)

- MANAGER role added to GET /attendance/offsite-review,
  PATCH .../approve, PATCH .../reject
- Service: dept-scoped list via Department.managerId; self-review 403;
  cross-dept 403; no-managedDepartment → empty list (not global data)
- GPS privacy fix: REVIEW_SELECT omits raw lat/lon from review API
  response (was leaking via ATTENDANCE_SELECT); audit retains
  hasCoordinates boolean via internal ATTENDANCE_SELECT read
- Admin web: isAdminOrManager gate; MANAGER nav item; role-aware title
- Mobile: "รอหัวหน้างาน/HR ตรวจสอบ" in attendance + home screens
- Tests: 17 new MANAGER scope tests; all 512 tests pass
```
