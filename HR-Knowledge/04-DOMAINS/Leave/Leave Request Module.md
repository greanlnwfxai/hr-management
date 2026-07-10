# Leave Request Module

## Purpose

Manages the employee leave request lifecycle: submission, review, approval (with balance deduction), and rejection. Tightly integrated with [[Leave Balance Module]] — approval is atomic across both.

## Module Path

`apps/api/src/leave/`

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /leave/request | ✅ | Any | Submit leave (own employee) |
| GET | /leave/me | ✅ | Any | Own leave requests (paginated) |
| GET | /leave | ✅ | SUPER_ADMIN, HR_ADMIN | All leave requests (paginated) |
| GET | /leave/:id | ✅ | Any (owner or admin) | Single leave request |
| PATCH | /leave/:id/approve | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | Approve PENDING request (MANAGER: own-department only) |
| PATCH | /leave/:id/reject | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | Reject PENDING request (MANAGER: own-department only) |

Note: `GET /leave/me` must be declared **before** `GET /leave/:id` in the controller to prevent NestJS routing conflict.

## Query Parameters (GET /leave, GET /leave/me)

`page` · `limit` · `status` · `leaveType` · `startDate` · `endDate` · `employeeId` (admin list only)

## Leave Request Lifecycle

```
[PENDING] ──approve──► [APPROVED]
[PENDING] ──reject──►  [REJECTED]
```

Only `PENDING` requests can be approved or rejected.

## Submission Rules

- Requesting user must have a linked `Employee` record — 400 if not linked
- `startDate` must be ≤ `endDate` — 400 if violated
- `totalDays` is computed server-side: `Math.round((end - start) / 86400000) + 1`
- Overlapping requests (same employee, PENDING or APPROVED status, overlapping dates) → 409

## Approval Rules (in order)

1. Request must be `PENDING` → 400 otherwise
2. Matching `LeaveBalance` must exist for `(employeeId, leaveType, year)` → 400 if missing
3. `remainingDays` ≥ `totalDays` requested → 400 if insufficient
4. **Atomic**: `usedDays` incremented + `status → APPROVED` in a single `prisma.$transaction`
5. `approvedById` = approver's `Employee.id` (if linked)
6. `approvedAt` = current UTC timestamp

## Rejection Rules

- Only `PENDING` → `REJECTED`
- No balance deduction
- `rejectReason` accepted in DTO body but **not persisted** (no DB column) — known limitation

## Leave Types (Current)

`SICK` · `VACATION` · `PERSONAL` · `OTHER`

- `ANNUAL` ≈ `VACATION` in practice (ANNUAL not in schema)
- `UNPAID` deferred (requires schema migration + approval bypass)

## Manager Leave Approval Scope (v1.2.0)

MANAGER approve/reject is now scoped to the department they manage:

- `PATCH /leave/:id/approve` — MANAGER may only approve leave for employees in their managed department
- `PATCH /leave/:id/reject` — MANAGER may only reject leave for employees in their managed department
- Forbidden message (approve): `คุณสามารถอนุมัติลาได้เฉพาะพนักงานในแผนกของคุณเท่านั้น`
- Forbidden message (reject): `คุณสามารถปฏิเสธลาได้เฉพาะพนักงานในแผนกของคุณเท่านั้น`

Scoping uses `Department.managerId` (the `managedDepartment` back-relation on Employee), not the `Employee.managerId` reporting hierarchy. See [[ADR-023 Department Manager Leave Approval Scope]].

**List access remains org-wide:** MANAGER can view all leave requests via `GET /leave`; only approve/reject is scoped.

## Mobile Display (STEP Connect)

STEP Connect Mobile/PWA overlays **approved** leave onto the day-type label
across all three relevant screens — home (today-schedule card), calendar
(grid dots + day-detail card), and the attendance tab header — via a shared,
unit-tested `findApprovedLeaveForDate()` helper
(`apps/mobile/src/utils/leaveOverlay.ts`) that does an inclusive client-side
date-range check against the employee's own `status=APPROVED` leave requests.
When approved leave covers the displayed date, it replaces the normal
workday/weekend label with the leave type (e.g. "ลาพักร้อน") and an approved
status line; pending/rejected leave never overrides. This was closed across
three sequential hotfixes (home+calendar, then a React version-mismatch
regression fix, then the attendance tab, which had been missed by the first
fix) — see
[docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_CALENDAR_001.md](../../../docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_CALENDAR_001.md)
and
[docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_ATTENDANCE_001.md](../../../docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_ATTENDANCE_001.md).
Frontend-only; no backend/schema change.

## Known Limitations

- MANAGER list access (`GET /leave`) is org-wide — only approve/reject is department-scoped
- `rejectReason` not persisted in DB
- TOCTOU on balance check (pre-transaction) — acceptable for HR load
- **`GET /leave/me`'s `buildDateFilter` uses containment, not overlap** (`apps/api/src/leave/leave.service.ts`): it filters `startDate >= query.startDate AND endDate <= query.endDate`, so a date-range query can silently miss a multi-day leave request that merely overlaps the queried window (e.g. a single-day query inside a longer approved range). Found during the mobile leave-display hotfixes above; the mobile fix avoided depending on this endpoint's date-range params rather than patching it, to stay frontend-only. **Open — HOTFIX-LEAVE-ME-OVERLAP**: switch to an overlap filter (`startDate: { lte: end }, endDate: { gte: start }`), mirroring `create()`'s existing overlap check.

## Related ADRs

- [[ADR-011 Leave Workflow]]
- [[ADR-006 RBAC]]
- [[ADR-023 Department Manager Leave Approval Scope]]

## Related Notes

- [[Leave Balance Module]]
- [[Leave Rules]]
- [[API Route Index]]

#domain #leave #backend-v1 #business-rules
