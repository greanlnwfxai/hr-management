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
| PATCH | /leave/:id/approve | ✅ | SUPER_ADMIN, HR_ADMIN | Approve PENDING request |
| PATCH | /leave/:id/reject | ✅ | SUPER_ADMIN, HR_ADMIN | Reject PENDING request |

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

## Known Limitations

- MANAGER cannot access `GET /leave` (admin list) — asymmetry with `/leave-balances`
- `rejectReason` not persisted in DB
- TOCTOU on balance check (pre-transaction) — acceptable for HR load

## Related ADRs

- [[ADR-011 Leave Workflow]]
- [[ADR-006 RBAC]]

## Related Notes

- [[Leave Balance Module]]
- [[Leave Rules]]
- [[API Route Index]]

#domain #leave #backend-v1 #business-rules
