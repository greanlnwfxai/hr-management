# Leave Rules

## Leave Request Lifecycle

```
[Submitted] → status: PENDING
      │
      ├── HR/Admin/Manager approves ──► status: APPROVED  (balance deducted)
      │
      └── HR/Admin/Manager rejects ──► status: REJECTED   (no balance change)
```

Only `PENDING` requests can be transitioned. Already-approved or already-rejected requests cannot be modified.

## Submission Rules

1. Requesting user must have a linked `Employee` record — 400 if not linked
2. `startDate` must be ≤ `endDate` — 400 if violated
3. `totalDays` is **computed server-side**: `Math.round((end - start) / 86400000) + 1`
4. Overlapping requests (same employee, PENDING or APPROVED status, overlapping date range) → 409

## Approval Rules (enforced in order)

| Step | Check | Fail Response |
|---|---|---|
| 1 | Request is PENDING | 400 |
| 2 | LeaveBalance exists for (employeeId, leaveType, year of startDate) | 400 with message |
| 3 | `remainingDays ≥ totalDays` requested | 400 with remaining/requested counts |
| 4 | Atomic: increment `usedDays` + set `status = APPROVED` in `$transaction` | — |

Step 4 is atomic — partial state (balance deducted but status not updated, or vice versa) cannot occur.

## Rejection Rules

- Only `PENDING` → `REJECTED`
- No balance deduction on rejection
- `rejectReason` is accepted in the DTO body but **not persisted** (no DB column) — known limitation

## Balance Requirement

- A `LeaveBalance` record must be created by HR **before** the first approval can succeed for a given `(employeeId, leaveType, year)` combination
- Balance is unique per `(employeeId, leaveType, year)`

## Vacation Entitlement Policy

VACATION leave entitlement is determined by completed years of service from `Employee.hireDate`. HR Admins use dedicated setup endpoints (not the generic `POST /leave-balances`) to create VACATION balances.

### Tenure Tiers

| Completed years of service | Entitled days |
|---|---|
| < 1 year | 0 (ineligible — no balance created) |
| ≥ 1 and < 3 years | 7 |
| ≥ 3 and < 5 years | 10 |
| ≥ 5 and < 7 years | 12 |
| ≥ 7 years | 15 |

- Tenure source: `Employee.hireDate` (not `createdAt`)
- Tenure method: calendar-based UTC year subtraction
- No proration in v1

### Adjustment Ledger Rules

Post-setup corrections to VACATION entitlement must use the adjustment ledger, not `PATCH /leave-balances/:id` (which returns 400 for VACATION type).

- `POST /leave-balances/:id/adjustments` — requires `deltaDays` (Float, signed, non-zero) and `reason` (min 5 chars)
- Adjustment rejected (422) if it would produce negative remaining days
- Each adjustment is immutable — no updates or deletes
- Restricted to SUPER_ADMIN and HR_ADMIN
- Audit event `LEAVE_BALANCE_ADJUSTED` fires on every successful adjustment

Effective entitlement: `effectiveTotalDays = totalDays + SUM(adjustment.deltaDays)`

See [[Vacation Leave Policy]] and [[ADR-026 Vacation Leave Entitlement and Adjustment Ledger]] for the full setup and correction workflow.

## Leave Types

| Type | Description | Notes |
|---|---|---|
| `SICK` | Sick leave | Active in schema |
| `VACATION` | Annual/vacation leave | Also covers ANNUAL in practice |
| `PERSONAL` | Personal/emergency leave | Active in schema |
| `OTHER` | General other leave | Active in schema |

### Deferred Leave Types

- **`ANNUAL`**: frequently mentioned in HR policy but not in the Prisma schema. `VACATION` is used in its place. A future enum migration will add `ANNUAL` safely.
- **`UNPAID`**: not in schema. UNPAID leave should bypass the balance check (employees can take unpaid leave regardless of balance). This bypass logic is deferred until `UNPAID` is added to the schema.

## Field Naming Note

`LeaveBalance` DB column is `totalDays` (the entitled quota). API response includes:
- `totalDays` — entitled days (from DB)
- `usedDays` — used so far
- `remainingDays` — `totalDays − usedDays` (computed server-side, never accepted from request)

## Manager Leave Approval Scope (v1.2.0)

MANAGER can now approve and reject leave requests, but only for employees in the department they manage.

- Scoping key: `Department.managerId` → `managedDepartment` back-relation on Employee
- A MANAGER without a managed department cannot approve or reject any leave
- List visibility (`GET /leave`) is org-wide for MANAGER; scoping is approve/reject only
- SUPER_ADMIN and HR_ADMIN retain org-wide approval authority
- Forbidden message (approve): `คุณสามารถอนุมัติลาได้เฉพาะพนักงานในแผนกของคุณเท่านั้น`
- Forbidden message (reject): `คุณสามารถปฏิเสธลาได้เฉพาะพนักงานในแผนกของคุณเท่านั้น`

See [[ADR-023 Department Manager Leave Approval Scope]].

## Known Limitations

- MANAGER list access (`GET /leave`) is org-wide — only approve/reject is department-scoped
- `rejectReason` not persisted in DB
- TOCTOU window: balance check happens before `$transaction`; concurrent approvals for the same employee could theoretically both succeed (acceptable for serial HR workflows)
- `ANNUAL` and `UNPAID` leave types not in schema

## Related ADRs

- [[ADR-026 Vacation Leave Entitlement and Adjustment Ledger]]
- [[ADR-011 Leave Workflow]]
- [[ADR-006 RBAC]]
- [[ADR-023 Department Manager Leave Approval Scope]]

## Related Notes

- [[Vacation Leave Policy]]
- [[Leave Request Module]]
- [[Leave Balance Module]]
- [[RBAC Rules]]

#business-rules #leave #rag-ready
