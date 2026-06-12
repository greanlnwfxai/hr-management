# Leave Rules

## Leave Request Lifecycle

```
[Submitted] → status: PENDING
      │
      ├── HR/Admin approves ──► status: APPROVED  (balance deducted)
      │
      └── HR/Admin rejects ──► status: REJECTED   (no balance change)
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

## Known Limitations

- MANAGER cannot view `GET /leave` (all leave requests) — only SUPER_ADMIN and HR_ADMIN
- `rejectReason` not persisted in DB
- TOCTOU window: balance check happens before `$transaction`; concurrent approvals for the same employee could theoretically both succeed (acceptable for serial HR workflows)
- `ANNUAL` and `UNPAID` leave types not in schema

## Related ADRs

- [[ADR-011 Leave Workflow]]
- [[ADR-006 RBAC]]

## Related Notes

- [[Leave Request Module]]
- [[Leave Balance Module]]
- [[RBAC Rules]]

#business-rules #leave #rag-ready
