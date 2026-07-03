# Leave Balance Module

## Purpose

Tracks the leave quota (entitlement) for each employee per leave type per year. HR creates balance records; approval of leave requests deducts from balances atomically. For VACATION leave, a dedicated setup endpoint and an immutable adjustment ledger extend the base model — see [[Vacation Leave Policy]] for the full workflow.

## Module Path

`apps/api/src/leave-balance/`

Adjacent modules:
- `apps/api/src/leave-adjustment/` — adjustment ledger
- `apps/api/src/vacation-setup/` — policy-aware VACATION setup

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /leave-balances | ✅ | SUPER_ADMIN, HR_ADMIN | Create balance for an employee (non-VACATION types) |
| GET | /leave-balances/my | ✅ | Any | Own leave balances (paginated) |
| GET | /leave-balances | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | All balances (paginated) |
| GET | /leave-balances/:id | ✅ | Any (owner, manager, or admin) | Single balance (includes `adjustmentDays` + `effectiveTotalDays` for VACATION) |
| PATCH | /leave-balances/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update entitledDays or usedDays — **VACATION returns 400; use adjustment endpoint** |
| POST | /leave-balances/:id/adjustments | ✅ | SUPER_ADMIN, HR_ADMIN | Append signed-delta correction to VACATION balance ledger |
| GET | /leave-balances/:id/adjustments | ✅ | SUPER_ADMIN, HR_ADMIN | List all adjustments for a balance (paginated, newest-first) |
| GET | /leave-balances/vacation-setup/suggest | ✅ | SUPER_ADMIN, HR_ADMIN | Get tenure data and policy suggestion for an employee/year |
| POST | /leave-balances/vacation-setup | ✅ | SUPER_ADMIN, HR_ADMIN | Create VACATION balance with usedDays = entitledDays − remainingDays |

Route ordering note: `GET /leave-balances/my` and `GET /leave-balances/vacation-setup/suggest` must be declared **before** `GET /leave-balances/:id` to prevent the parameter segment from capturing them.

## Query Parameters

`page` · `limit` · `employeeId` · `leaveType` · `year`

## Field Naming

| Context | Field Name | Notes |
|---|---|---|
| DB column | `totalDays` | Represents the entitled quota at setup time |
| API create/update body | `entitledDays` | Maps to `totalDays` |
| API response (all types) | `totalDays` + `adjustmentDays` + `effectiveTotalDays` + `remainingDays` | `effectiveTotalDays = totalDays + adjustmentDays`; `adjustmentDays = 0` for non-VACATION |

`remainingDays` is **never accepted** from request body — always server-computed.

## Business Rules

- **Unique per (employeeId, leaveType, year)** — duplicate returns 409
- HR must create a balance record before the first approval can succeed for that employee/type/year
- `PATCH` update that would result in negative `remainingDays` → 422 Unprocessable
- `usedDays` is incremented automatically during leave approval (atomic transaction)
- **VACATION type:** `PATCH /leave-balances/:id` returns 400 — use the adjustment ledger instead
- **VACATION type:** effective entitlement = `totalDays + SUM(adjustment.deltaDays)` at read time

## Balance Deduction on Approval

Handled by `LeaveService.approve()`. The approval check aggregates any ledger adjustments first, then uses `effectiveTotalDays` for the remaining-days check (for all leave types; `adjSum = 0` for non-VACATION):

```
prisma.$transaction(async (tx) => {
  await tx.leaveBalance.update({ usedDays: { increment: record.totalDays } });
  return tx.leaveRequest.update({ status: APPROVED, ... });
});
```

## Adjustment Ledger (VACATION)

`LeaveAdjustment` model (immutable):

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `leaveBalanceId` | UUID | FK to `LeaveBalance` |
| `deltaDays` | Float | Signed, non-zero; supports half-days (0.5, −0.5) |
| `reason` | String | Min 5 chars after trim |
| `actorUserId` | String | JWT user UUID |
| `adjustedById` | UUID? | FK to `Employee` (nullable) |
| `createdAt` | DateTime | No `updatedAt`, no `deletedAt` |

Audit event: `LEAVE_BALANCE_ADJUSTED`

## Vacation Setup

`POST /leave-balances/vacation-setup` creates VACATION balances with:
- `totalDays = entitledDays`
- `usedDays = entitledDays − remainingDays` (server-derived)

Tenure tiers and full workflow documented in [[Vacation Leave Policy]].

Audit event: `LEAVE_BALANCE_VACATION_SETUP`

## Web Admin UI — Employee Selection in Balance Modals (v1.2.64)

The **Vacation Balance Setup** modal and the **Add Balance** modal (both
admin-only, gated client-side by `isAdmin()` and server-side by
`@Roles(SUPER_ADMIN, HR_ADMIN)` on the underlying endpoints) populate their
employee `<select>` from `GET /employees`, not from this module's own
endpoints. Fixed in `v1.2.64-leave-employee-dropdown-thai-localization`
(HOTFIX-LEAVE-UI-001):

- **Root cause:** the web page requested `GET /employees?limit=200`, but the
  backend's `QueryEmployeeDto` caps `limit` at `@Max(100)`, so the request
  returned `400 Bad Request`. The error was swallowed by an empty `.catch()`,
  leaving both dropdowns showing only the placeholder with zero options.
- **Fix:** replaced the single oversized call with a paginated loader
  (`limit: 100`, the backend max) that fetches all pages in parallel when
  `meta.totalPages > 1`, filtered to `status: 'ACTIVE'`. Fetch failures now
  surface an inline error with a **Retry** button instead of failing silently.
- **Vacation Balance Setup modal** was also fully localized to Thai/English at
  the same time — every field, the eligibility/suggestion panel, the override
  warning, and the entitled/remaining/used preview now go through `t()`.
- **RBAC unchanged:** these modals remain visible only to SUPER_ADMIN/HR_ADMIN;
  MANAGER and EMPLOYEE never see them, and no backend endpoint or permission
  changed.

## Known Limitations

- `totalDays` (DB) vs `entitledDays` (API) naming inconsistency — column rename planned for v1.1
- All leave types require a balance record — UNPAID leave (future) will need bypass logic
- TOCTOU on balance check before transaction (acceptable for HR load)
- Adjustment ledger is VACATION-only in v1; other types still use PATCH

## Related ADRs

- [[ADR-026 Vacation Leave Entitlement and Adjustment Ledger]]
- [[ADR-011 Leave Workflow]]
- [[ADR-006 RBAC]]
- [[ADR-019 Audit Trail and Admin Review]]

## Related Notes

- [[Vacation Leave Policy]]
- [[Leave Request Module]]
- [[Leave Rules]]
- [[API Route Index]]
- [docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md](../../../docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md) — production migration-drift recovery for the `leave_adjustments` table (P2021, since resolved)

#domain #leave #backend-v1 #business-rules
