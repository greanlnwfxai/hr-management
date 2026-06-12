# ADR-011: Leave Workflow and Balance Integration

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Implement leave as two tightly integrated modules — **Leave Request** (`/leave/*`) and **Leave Balance** (`/leave-balances/*`) — with approval enforcing balance checks and deductions in a single atomic database transaction.

## Leave Request Endpoints

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | /leave/request | any auth | Submit leave (own employee) |
| GET | /leave/me | any auth | Own leave requests |
| GET | /leave | SUPER_ADMIN, HR_ADMIN | All leave requests |
| GET | /leave/:id | owner or admin | Single leave request |
| PATCH | /leave/:id/approve | SUPER_ADMIN, HR_ADMIN | Approve PENDING |
| PATCH | /leave/:id/reject | SUPER_ADMIN, HR_ADMIN | Reject PENDING |

## Approval Rules (in order)

1. Request must be `PENDING` (400 otherwise)
2. Matching `LeaveBalance` must exist for `(employeeId, leaveType, year)` — 400 if not found
3. `remainingDays` must be ≥ `totalDays` requested — 400 if insufficient
4. Atomic: `LeaveBalance.usedDays` incremented + `LeaveRequest.status → APPROVED` in `prisma.$transaction`
5. `approvedById` set to approver's `Employee.id` (if linked)
6. `approvedAt` set to current UTC timestamp

## Rejection Rules

- Only `PENDING` → `REJECTED`
- No balance deduction
- `rejectReason` accepted in DTO body but **not persisted** (schema has no column) — known limitation

## Leave Balance Endpoints

| Method | Path | Roles |
|---|---|---|
| POST | /leave-balances | SUPER_ADMIN, HR_ADMIN |
| GET | /leave-balances/my | any auth |
| GET | /leave-balances | SUPER_ADMIN, HR_ADMIN, MANAGER |
| GET | /leave-balances/:id | owner, manager, or admin |
| PATCH | /leave-balances/:id | SUPER_ADMIN, HR_ADMIN |

## Leave Types (Current)

`SICK` · `VACATION` · `PERSONAL` · `OTHER`

- `ANNUAL` ≈ `VACATION` in practice (ANNUAL not in schema yet)
- `UNPAID` deferred (requires schema migration + approval bypass logic)

## Known Limitations

- `rejectReason` not persisted
- MANAGER cannot view `GET /leave` (can view `GET /leave-balances`)
- TOCTOU window on balance check (pre-transaction) — acceptable for HR load

## Source

`docs/adr/ADR-011-leave-workflow-and-balance-integration.md`

## Related Notes

- [[Leave Request Module]]
- [[Leave Balance Module]]
- [[Leave Rules]]
- [[ADR Index]]

#adr #business-rules #leave
