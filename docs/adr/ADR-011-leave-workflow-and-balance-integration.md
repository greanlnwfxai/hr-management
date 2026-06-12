# ADR-011: Leave Workflow and Balance Integration

## Status
Accepted

## Date
2026-06-12

## Context
Employees need to submit leave requests and have them reviewed by HR or administrators. The system must track leave quotas per employee per year and enforce that leave cannot be approved when the employee has insufficient remaining days. The workflow needs to be atomic — a partial approval (status changed but balance not deducted, or vice versa) would corrupt data.

## Decision
Implement leave as two tightly integrated modules: **Leave Request** (`/leave/*`) and **Leave Balance** (`/leave-balances/*`), with the approval flow enforcing balance checks and deductions within a single database transaction.

### Leave Request module (`src/leave/`)

#### Endpoint style
The module uses `/leave` (not `/leave-requests`) to match the naming convention established when the module was first built:

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | /leave/request | any auth | Submit leave (own employee) |
| GET | /leave/me | any auth | Own leave requests (paginated) |
| GET | /leave | SUPER_ADMIN, HR_ADMIN | All leave requests (paginated) |
| GET | /leave/:id | owner or admin | Single leave request |
| PATCH | /leave/:id/approve | SUPER_ADMIN, HR_ADMIN | Approve PENDING request |
| PATCH | /leave/:id/reject | SUPER_ADMIN, HR_ADMIN | Reject PENDING request |

#### Submission rules
- The requesting user must have a linked `Employee` record (via `Employee.userId`). If not, returns 400.
- `startDate` must be ≤ `endDate`; otherwise 400.
- `totalDays` is computed server-side: `Math.round((end - start) / 86400000) + 1`.
- Overlapping leave requests (same employee, status PENDING or APPROVED, overlapping date range) are rejected with 409.
- Initial status is always `PENDING`.

#### Approval rules
1. Only `PENDING` requests can be approved (400 if already APPROVED or REJECTED).
2. A matching `LeaveBalance` record must exist for `(employeeId, leaveType, year of startDate)`.
   - If not found → 400 with actionable message.
3. Remaining days (`totalDays − usedDays`) must be ≥ leave request `totalDays`.
   - If insufficient → 400 with `"${remaining} day(s) remaining, ${requested} requested"`.
4. Approval is atomic: `LeaveBalance.usedDays` is incremented and `LeaveRequest.status` is set to `APPROVED` in a single `prisma.$transaction`.
5. `approvedById` is set to the approver's `Employee.id` (if they have a linked employee record).
6. `approvedAt` is set to the current UTC timestamp.

#### Rejection rules
- Only `PENDING` requests can be rejected (400 otherwise).
- No balance deduction on rejection.
- `approvedById` is set to the rejector's `Employee.id` if available.
- A `rejectReason` field is accepted in the DTO body but **not persisted** — the `LeaveRequest` model has no `rejectReason` column. This is a known limitation.

### Leave Balance module (`src/leave-balance/`)

#### Endpoint style

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | /leave-balances | SUPER_ADMIN, HR_ADMIN | Create balance |
| GET | /leave-balances/my | any auth | Own balances (paginated) |
| GET | /leave-balances | SUPER_ADMIN, HR_ADMIN, MANAGER | All balances |
| GET | /leave-balances/:id | owner, manager, or admin | Single balance |
| PATCH | /leave-balances/:id | SUPER_ADMIN, HR_ADMIN | Update entitled or used days |

#### Field naming
- DB column: `totalDays` (represents the entitled quota for the period).
- API create/update input: `entitledDays` (maps to `totalDays`).
- API response: includes both `totalDays` (from DB) and computed `remainingDays = totalDays − usedDays`.
- `remainingDays` is never accepted from the request body.

#### Balance constraints
- Unique per `(employeeId, leaveType, year)`. Duplicate → 409.
- `PATCH` update that would result in negative `remainingDays` → 422 Unprocessable.
- HR must create a balance record before the first approval can succeed for a given employee/type/year.

### Leave types
Current enum: `SICK | VACATION | PERSONAL | OTHER`

Known limitations:
- **ANNUAL** (requested in T-020 spec) is not in the schema. `VACATION` covers annual leave in practice.
- **UNPAID** is not in the schema. UNPAID leave (which should bypass the balance check) is deferred.
- A future enum migration (`prisma migrate dev`) can add `ANNUAL` and `UNPAID` safely. The approval flow will need a type-specific bypass for `UNPAID`.

### Concurrency note
The balance check (step 3 of approval rules) happens before the `$transaction`. This is a TOCTOU (time-of-check/time-of-use) window. Under concurrent approvals for the same employee, two approvals could theoretically slip through. This is acceptable for HR workloads (serial approvals by a single HR officer). `SELECT FOR UPDATE` can harden this if needed.

## Consequences

**Positive**
- Approval + balance deduction are atomic — no partial state.
- Clear error messages guide HR when a balance is missing or insufficient.
- Self-service endpoints (`/leave/me`, `/leave-balances/my`) let employees check their own leave without HR involvement.
- Overlap detection prevents duplicate leave for the same period.

**Negative**
- All leave types require a balance record — UNPAID leave cannot be approved without one.
- `rejectReason` is lost (DTO accepts it, DB does not persist it).
- MANAGER cannot view all leave requests (`GET /leave`) — only HR and SUPER_ADMIN can.
- `totalDays` / `entitledDays` naming inconsistency requires developer documentation.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Single `/leave` model (no balance) | No quota enforcement; over-approval possible |
| Balance check inside the transaction | Correct for strict concurrency; `$transaction` with interactive client already used — pre-check chosen for simpler error reporting |
| Separate approval service | Over-engineering for the current scale; approval logic fits cleanly in `LeaveService.approve()` |
| Client-calculated `totalDays` | Trust issue; server-side calculation ensures correctness |

## Follow-up Tasks
- Add `UNPAID` (and optionally `ANNUAL`) to the `LeaveType` enum with a safe migration.
- Implement UNPAID leave bypass in `LeaveService.approve()`.
- Add `rejectReason` column to `LeaveRequest` model.
- Clarify MANAGER access to `GET /leave` with stakeholders.
- Rename `LeaveBalance.totalDays` → `entitledDays` in a future migration.
- Harden the TOCTOU window with `SELECT FOR UPDATE` if concurrent HR approval becomes a concern.
