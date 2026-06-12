# Leave Balance Module

## Purpose

Tracks the leave quota (entitlement) for each employee per leave type per year. HR creates balance records; approval of leave requests deducts from balances atomically.

## Module Path

`apps/api/src/leave-balance/`

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /leave-balances | ✅ | SUPER_ADMIN, HR_ADMIN | Create balance for an employee |
| GET | /leave-balances/my | ✅ | Any | Own leave balances (paginated) |
| GET | /leave-balances | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | All balances (paginated) |
| GET | /leave-balances/:id | ✅ | Any (owner, manager, or admin) | Single balance |
| PATCH | /leave-balances/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update entitledDays or usedDays |

Note: `GET /leave-balances/my` must be declared **before** `GET /leave-balances/:id`.

## Query Parameters

`page` · `limit` · `employeeId` · `leaveType` · `year`

## Field Naming

| Context | Field Name | Notes |
|---|---|---|
| DB column | `totalDays` | Represents the entitled quota |
| API create/update body | `entitledDays` | Maps to `totalDays` |
| API response | `totalDays` + `remainingDays` | `remainingDays = totalDays − usedDays` (computed) |

`remainingDays` is **never accepted** from request body — always server-computed.

## Business Rules

- **Unique per (employeeId, leaveType, year)** — duplicate returns 409
- HR must create a balance record before the first approval can succeed for that employee/type/year
- `PATCH` update that would result in negative `remainingDays` → 422 Unprocessable
- `usedDays` is incremented automatically during leave approval (atomic transaction)

## Balance Deduction on Approval

Handled by `LeaveService.approve()`:

```
prisma.$transaction(async (tx) => {
  await tx.leaveBalance.update({ usedDays: { increment: record.totalDays } });
  return tx.leaveRequest.update({ status: APPROVED, ... });
});
```

## Known Limitations

- `totalDays` (DB) vs `entitledDays` (API) naming inconsistency — column rename planned for v1.1
- All leave types require a balance record — UNPAID leave (future) will need bypass logic
- TOCTOU on balance check before transaction (acceptable for HR load)

## Related ADRs

- [[ADR-011 Leave Workflow]]
- [[ADR-006 RBAC]]

## Related Notes

- [[Leave Request Module]]
- [[Leave Rules]]
- [[API Route Index]]

#domain #leave #backend-v1 #business-rules
