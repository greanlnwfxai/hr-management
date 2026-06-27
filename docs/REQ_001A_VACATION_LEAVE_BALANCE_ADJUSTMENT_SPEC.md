# REQ-001A — Vacation Leave Balance Adjustment Specification

**Type:** Product / Technical Specification
**Status:** Draft — Pending Approval
**Date:** 2026-06-27
**Author:** Claude Code (AI assistant)
**Task:** REQ-001A
**Replaces / Supersedes:** Nothing (new requirement)

---

## 1. Requirement Summary

HR/Admin must be able to adjust an employee's **vacation leave balance** — for example, to correct a data entry error, award additional days for a special occasion, or claw back days following a policy change.

This spec covers the design of a **safe, auditable, rollback-friendly** adjustment mechanism. It does **not** change any runtime code; it is a design document for review and approval before implementation begins.

---

## 2. Current System Analysis

### 2.1 Data Model (Prisma)

```
LeaveBalance {
  id          UUID (PK)
  employeeId  UUID → Employee
  leaveType   LeaveType (SICK | VACATION | PERSONAL | OTHER)
  year        Int
  totalDays   Int   ← entitled quota (confusingly named; a rename is on the backlog)
  usedDays    Int   ← auto-incremented on leave approval
  createdAt   DateTime
  updatedAt   DateTime
  UNIQUE(employeeId, leaveType, year)
}
```

`remainingDays` is **computed server-side** as `totalDays − usedDays`; it is never stored.

### 2.2 Existing API Endpoints

| Method | Path | Roles | Behaviour |
|--------|------|-------|-----------|
| POST | /leave-balances | SUPER_ADMIN, HR_ADMIN | Create a new balance record for employee/type/year |
| GET | /leave-balances/my | Any | Own balances (paginated) |
| GET | /leave-balances | SUPER_ADMIN, HR_ADMIN, MANAGER | All balances (paginated) |
| GET | /leave-balances/:id | Owner / manager / admin | Single record |
| PATCH | /leave-balances/:id | SUPER_ADMIN, HR_ADMIN | **Currently: directly overwrite `entitledDays` and/or `usedDays`** |

Source: `apps/api/src/leave-balance/leave-balance.controller.ts` (lines 81–93) and `leave-balance.service.ts` (lines 149–172).

### 2.3 Critical Finding: Option A Is Already Deployed (and Unaudited)

**`PATCH /leave-balances/:id` already implements a direct balance overwrite (Option A).**
The only guard is a 422 if the edit would produce negative `remainingDays`.

Critically, `leave-balance.service.ts` **injects no `AuditLogService`** and records **nothing** to the audit log. Compare with `leave.service.ts`, which records `LEAVE_APPROVED` and `LEAVE_REJECTED` with full actor, IP, and metadata.

**Current state of play:** HR can silently change any employee's balance with no actor record, no reason, and no rollback trail.
This is the primary motivating weakness this spec addresses.

### 2.4 Balance Deduction Mechanism

`usedDays` is incremented **atomically during leave approval** inside a Prisma `$transaction` in `leave.service.ts:210–225`. This mechanism is independent of any adjustment feature and must remain untouched by any implementation option. Every design option must coexist with it.

### 2.5 Admin Web UI (Current)

`apps/web/app/(app)/leave/page.tsx` exposes an **Edit Balance** modal (lines 495–517) that shows raw fields `entitledDays` and `usedDays`. There is no reason field, no history, and no audit event fired. This is a direct front-end to the unaudited PATCH endpoint above.

### 2.6 Mobile App (STEP Connect)

`apps/mobile/src/hooks/useLeave.ts` calls `GET /leave-balances/my` and displays balance summary cards (remaining / total per leave type and year). There is **no** adjustment history visible to the employee.

### 2.7 Existing Files / Modules Inspected

| File | Relevance |
|------|-----------|
| `apps/api/prisma/schema.prisma` | `LeaveBalance`, `LeaveRequest`, `AuditLog` models |
| `apps/api/src/leave-balance/leave-balance.service.ts` | Balance CRUD — no audit integration |
| `apps/api/src/leave-balance/leave-balance.controller.ts` | PATCH endpoint — roles and DTO |
| `apps/api/src/leave-balance/dto/update-leave-balance.dto.ts` | Current update fields |
| `apps/api/src/leave-balance/dto/create-leave-balance.dto.ts` | Create fields |
| `apps/api/src/leave/leave.service.ts` | Approval/rejection flow + audit usage |
| `apps/api/src/audit-log/audit-log.types.ts` | `AuditLogEvent` interface |
| `apps/api/src/common/enums.ts` | `LeaveType`, `UserRole` enums |
| `apps/web/app/(app)/leave/page.tsx` | Admin web leave + balance UI |
| `apps/mobile/src/hooks/useLeave.ts` | Mobile balance display |
| `HR-Knowledge/07-BUSINESS-RULES/Leave Rules.md` | Business rules |
| `HR-Knowledge/04-DOMAINS/Leave/Leave Balance Module.md` | Module documentation |
| `docs/adr/ADR-011-leave-workflow-and-balance-integration.md` | Leave ADR |

---

## 3. Business Rules (Current and Proposed)

### 3.1 Current rules that remain unchanged

1. Balance is unique per `(employeeId, leaveType, year)`.
2. `usedDays` is auto-incremented on APPROVED leave (atomic, inside `$transaction`).
3. HR must create a balance record before any approval can succeed.
4. PATCH that results in `remainingDays < 0` → 422 Unprocessable.

### 3.2 Proposed rules for adjustment

1. Only **VACATION** leave type is in scope for v1 adjustment. Other types (SICK, PERSONAL, OTHER) are deferred.
2. An adjustment changes the **entitled quota** (`totalDays`), not `usedDays`. This preserves the integrity of the used-days accounting which is owned by the approval flow.
3. Every adjustment **must include a non-empty reason** (mandatory, not optional).
4. Every adjustment is **recorded in AuditLog** with actor, role, IP, reason, before/after values, and timestamp.
5. Negative `remainingDays` after adjustment must be rejected (same as today's 422 guard, but now audited even on rejection).
6. **Only SUPER_ADMIN and HR_ADMIN** may create adjustments. MANAGER role is excluded.
7. Adjustments take effect **immediately** (no effective-date scheduling in v1).
8. Employees and managers may **view** adjustment history for themselves / their team, but may not create adjustments.

---

## 4. Role / RBAC Rules

| Action | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|--------|-------------|----------|---------|----------|
| Create adjustment | ✅ | ✅ | ❌ | ❌ |
| View own adjustment history | ✅ | ✅ | ✅ | ✅ |
| View all adjustments | ✅ | ✅ | read-only (dept) | ❌ |
| Delete/reverse adjustment | ❌ | ❌ | ❌ | ❌ (ledger only) |

**Why exclude MANAGER from creating adjustments?**
Managers have approval authority over leave requests within their department, but not over entitlement allocation. Entitlement is a policy decision owned by HR. Granting managers adjustment rights would create inconsistency across departments and bypass HR oversight. If a manager believes a correction is needed, they should request it from HR.

---

## 5. Design Options

### Option A — Direct Balance Edit (Current State, Evaluated for Replacement)

#### Summary

Admin directly overwrites `entitledDays` and/or `usedDays` on the `LeaveBalance` record via `PATCH /leave-balances/:id`. **This is already deployed.**

#### Data Model Impact

None — uses existing `LeaveBalance.totalDays` and `LeaveBalance.usedDays` fields.

#### API Impact

No new endpoints. The existing `PATCH /leave-balances/:id` already handles this. Enhancement needed: add `reason` field to `UpdateLeaveBalanceDto` and wire audit logging into `LeaveBalanceService`.

#### UI Impact

The existing Edit Balance modal in the admin web requires a `Reason` input field and should display the last-updated timestamp and actor.

#### Audit Impact

Currently **zero audit coverage** — this is the critical gap. Adding audit requires injecting `AuditLogService` into `LeaveBalanceService` and recording before/after values.

#### Pros

- Already deployed; no schema migration, no new tables.
- Minimal code changes (add reason field + audit call).
- Simple mental model for HR: "set the total to X".

#### Cons

- **Destructive overwrite**: once changed, the prior value is gone from the balance table. Only the audit log preserves the history.
- Cannot distinguish "HR corrected an error" from "HR adjusted for a policy reason" or "HR reversed a prior change" — all look the same.
- Cannot reconstruct a running adjustment balance without re-reading the full audit log.
- `usedDays` override is dangerous: it decouples the accounting from actual approved leave, creating potential ghost days.
- "Set to X" UX is error-prone: HR must mentally calculate the new total rather than specifying a delta.

#### Risk

**Medium** — The core accounting integrity risk is that `usedDays` can be overwritten, making the computed `remainingDays` a lie relative to actual approved leave. Restricting adjustment to `entitledDays` only (and removing `usedDays` from the PATCH) reduces risk substantially.

#### Recommendation

**Do not retain as-is.** Minimum acceptable improvement: restrict PATCH to `entitledDays` only (remove `usedDays` override capability), add mandatory `reason`, and add audit logging. However Option B is preferred.

---

### Option B — Adjustment Transaction Ledger (Recommended)

#### Summary

Introduce a new `LeaveAdjustment` table. Each adjustment is an immutable delta record (`+N` or `−N`) with reason, actor, and timestamp. The effective entitled quota for a given balance is `LeaveBalance.totalDays + SUM(adjustments.delta)`. No existing data is overwritten; history is inherent in the table.

#### Data Model Impact (Proposed Schema Addition)

```
LeaveAdjustment {
  id            UUID (PK)
  leaveBalanceId UUID → LeaveBalance
  delta          Int      ← positive = add days, negative = remove days
  reason         String   ← mandatory
  adjustedById   String?  → Employee (the actor's employee record, if linked)
  actorUserId    String   → User (the actor's user id, always captured)
  createdAt      DateTime (immutable — adjustments are never updated or deleted)
}
```

Effective entitlement: `LeaveBalance.totalDays + SUM(LeaveAdjustment.delta WHERE leaveBalanceId = X)`
Effective remaining: `effectiveEntitlement − LeaveBalance.usedDays`

`LeaveBalance.totalDays` retains its meaning as the **original entitlement** (set at balance creation). Adjustments accumulate alongside. The approval flow (`usedDays` increment) is **completely unchanged**.

#### API Impact

New endpoints:

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | /leave-balances/:id/adjustments | SUPER_ADMIN, HR_ADMIN | Create adjustment (delta + reason) |
| GET | /leave-balances/:id/adjustments | owner / manager / admin | List adjustment history for a balance |

The `PATCH /leave-balances/:id` endpoint: restrict to `entitledDays` only for correcting the base quota (with audit), and disable `usedDays` override entirely.

Response shape for balance queries should include `effectiveEntitledDays` (computed) and `adjustmentTotal` alongside existing `totalDays`, `usedDays`, `remainingDays`.

#### UI Impact

Admin web:
- "Adjust Balance" action on each balance row replaces the current raw "Edit" modal.
- Modal inputs: `delta` (signed integer with +/− toggle), `reason` (required text).
- Balance detail shows adjustment history table: date / actor / delta / reason.

STEP Connect mobile:
- Balance card can optionally show an "ℹ" tap to reveal adjustment history (v2 scope).

#### Audit Impact

Two audit events:
- `LEAVE_BALANCE_ADJUSTED` (on POST /adjustments, SUCCESS or FAILURE)
- `LEAVE_BALANCE_ENTITLEMENT_CHANGED` (on PATCH /leave-balances/:id entitledDays change)

Metadata captured: `leaveBalanceId`, `employeeId`, `leaveType`, `year`, `delta`, `reason`, `entitlementBefore`, `entitlementAfter`, `effectiveRemainingAfter`.

#### Pros

- **Full traceability**: every adjustment is a permanent, actor-stamped, reasoned record.
- **Rollback-friendly**: reverse an erroneous adjustment by posting a compensating entry (no data deletion).
- **Non-destructive**: original entitlement and adjustment history are always visible.
- Aligns with standard HR ledger accounting practices.
- Delta UX is more intuitive: "add 2 days" is harder to miscalculate than "set total from 10 to 12".
- No disruption to the existing approval/`usedDays` accounting.

#### Cons

- Requires a new database table and Prisma migration at implementation time.
- Slightly more complex balance computation (must sum adjustments).
- Existing `PATCH /leave-balances/:id` must be refactored or restricted.
- `remainingDays` response shape must change to include the new effective computation.

#### Risk

**Low** — New table is additive. Existing approval flow is untouched. The most significant risk is a migration that requires `prisma migrate dev`, which is routine and reversible.

#### Recommendation

**Preferred approach for v1 implementation.** See Section 8.

---

### Option C — Annual Entitlement Policy

#### Summary

Introduce a global or per-employee-per-year `LeavePolicy` record that defines the standard vacation entitlement. `LeaveBalance.totalDays` is derived from the policy rather than set per-employee. Admin adjustments change the policy or add an override.

#### Data Model Impact

New `LeavePolicy` model:
```
LeavePolicy {
  id           UUID
  employeeId   String?   ← null = org-wide; non-null = per-employee override
  leaveType    LeaveType
  year         Int
  entitledDays Int
  effectiveFrom DateTime
  createdById  String → User
}
```

#### API Impact

New policy management endpoints; `LeaveBalance` creation changes from explicit to policy-driven (balance auto-created or updated on policy change).

#### UI Impact

Separate "Leave Policy" admin section. More complex than a balance adjustment.

#### Audit Impact

Policy changes are inherently versioned by `effectiveFrom`.

#### Pros

- Models the org's leave rules as data, not code.
- Enables consistent bulk updates (e.g., all employees get 15 vacation days in 2027).
- Supports future time-based policy shifts.

#### Cons

- **Over-engineered for the current need**: HR needs to correct individual balances, not redefine policy for all employees.
- Requires the largest schema change and the most API/UI work.
- Interaction with per-employee overrides adds complexity.
- Does not solve the immediate auditability gap for individual corrections.

#### Risk

**High** (scope risk, not security risk) — Significant effort for a feature that goes far beyond the stated requirement. Appropriate as a v3+ enhancement.

#### Recommendation

**Defer to future versions.** Implement after Option B is proven.

---

## 6. Recommended Approach

**Implement Option B — Adjustment Transaction Ledger.**

### Rationale

1. Option A is already deployed and is **completely unaudited** — every balance change leaves no actor trail. This is a production data-integrity risk.
2. Option B delivers the traceability, auditability, and rollback-friendliness explicitly required by the business.
3. Option B is minimal-disruption: the approval flow (`usedDays` increment) is unchanged.
4. Option C is correct conceptually but disproportionate to the immediate requirement.

### Scope boundary for implementation

**In scope for this requirement:**
- New `LeaveAdjustment` table (additive migration).
- `POST /leave-balances/:id/adjustments` — SUPER_ADMIN + HR_ADMIN only.
- `GET /leave-balances/:id/adjustments` — owner / manager / admin read-only.
- Restrict `PATCH /leave-balances/:id` to `entitledDays` only; remove `usedDays` override; add mandatory reason + audit logging.
- Admin web: replace "Edit Balance" modal with "Adjust Balance" modal + history table.
- Audit log events: `LEAVE_BALANCE_ADJUSTED`.

**Out of scope (deferred):**
- Adjustment of non-VACATION leave types (deferred; can be unlocked with a config flag later).
- Employee-facing adjustment history in STEP Connect mobile (display balance cards only, as today).
- Effective-date scheduling (all adjustments are immediate).
- Policy-level entitlement management (Option C).
- MANAGER adjustment capability.

---

## 7. API Design Proposal

### 7.1 POST /leave-balances/:id/adjustments

**Role guard:** SUPER_ADMIN, HR_ADMIN
**Body:**
```json
{
  "delta": -2,
  "reason": "Correcting data entry error from 2026-06-01"
}
```

**Validation:**
- `delta`: non-zero integer (positive or negative), required.
- `reason`: non-empty string, min 5 chars, required.
- `delta` that would make effective `remainingDays < 0` → 422 with detail.

**Success response (201):**
```json
{
  "id": "uuid",
  "leaveBalanceId": "uuid",
  "delta": -2,
  "reason": "Correcting data entry error from 2026-06-01",
  "adjustedBy": { "id": "...", "firstName": "...", "lastName": "..." },
  "createdAt": "2026-06-27T09:00:00.000Z",
  "effectiveEntitledDays": 8,
  "effectiveRemainingDays": 5
}
```

**Audit log entry on success:**
```
action: LEAVE_BALANCE_ADJUSTED
targetType: LEAVE_BALANCE
targetId: <leaveBalanceId>
result: SUCCESS
metadata: {
  leaveBalanceId, employeeId, leaveType, year,
  delta, reason,
  entitlementBefore, entitlementAfter,
  effectiveRemainingAfter,
  actorUserId, actorRole
}
```

### 7.2 GET /leave-balances/:id/adjustments

**Role guard:** Any authenticated (owner, manager, or admin)
**Query params:** `page`, `limit`
**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "delta": -2,
      "reason": "Correcting data entry error from 2026-06-01",
      "adjustedBy": { "firstName": "...", "lastName": "..." },
      "createdAt": "2026-06-27T09:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

### 7.3 GET /leave-balances/:id (Updated Response)

Include adjustment summary in the response:
```json
{
  "totalDays": 10,
  "adjustmentTotal": -2,
  "effectiveEntitledDays": 8,
  "usedDays": 3,
  "remainingDays": 5
}
```

---

## 8. Admin Web UI Proposal

### 8.1 Leave Balance Table

Replace the current "Edit" button with "Adjust" button on each balance row.

Show two new columns:
- **Adjustment** — total delta applied to date (e.g. `+2` or `−1`).
- **Effective** — effective entitled days = `totalDays + adjustmentTotal`.

### 8.2 Adjust Balance Modal

```
[ Employee: Somchai Jaidee (EMP-001) · VACATION · 2026 ]

Adjustment Delta *
  [ +  ]  [ input: number ]  [ -  ]
  "Enter positive to add days, negative to remove days."

Reason *
  [ _________________________________ ]
  Minimum 5 characters. Required.

Current entitlement: 10 days
Effective after adjustment: 8 days
Remaining after adjustment: 5 days  ← live preview

[ Cancel ]  [ Apply Adjustment ]
```

### 8.3 Adjustment History Panel

Below the modal header (or as a collapsible section on the balance detail page):

```
Adjustment History
────────────────────────────────────────────────
Date         Actor          Delta  Reason
2026-06-27   Ploy (HR)      −2     Correcting data entry error
2026-03-01   Ploy (HR)      +1     Performance bonus day (Q1)
────────────────────────────────────────────────
```

---

## 9. Audit Log Proposal

### Events

| Action | Trigger | Target Type | Result |
|--------|---------|-------------|--------|
| `LEAVE_BALANCE_ADJUSTED` | POST /leave-balances/:id/adjustments | `LEAVE_BALANCE` | SUCCESS / FAILURE |
| `LEAVE_BALANCE_ENTITLEMENT_CHANGED` | PATCH /leave-balances/:id (entitledDays only) | `LEAVE_BALANCE` | SUCCESS / FAILURE |

### Metadata Fields (both events)

```
leaveBalanceId, employeeId, leaveType, year,
delta (or entitledDaysBefore + entitledDaysAfter),
reason,
effectiveRemainingAfter
```

No sensitive fields are included. The existing `AUDIT_SENSITIVE_KEYS` set in `audit-log.types.ts` is respected.

---

## 10. Validation Rules

| Field | Rule |
|-------|------|
| `delta` | Non-zero integer; required |
| `reason` | Non-empty string, ≥ 5 characters; required |
| Effective remaining after adjustment | Must be ≥ 0; otherwise 422 |
| Leave type scope | VACATION only in v1; other types rejected with descriptive 400 |
| Actor role | SUPER_ADMIN or HR_ADMIN; otherwise 403 |

---

## 11. Edge Cases

### What happens if the employee already has approved leave?

`usedDays` reflects approved leave. Lowering the entitlement (negative delta) reduces effective remaining. If `effectiveEntitledDays − usedDays < 0`, the API returns 422 and does **not** apply the adjustment. No approved leave is revoked.

### What happens if the employee has pending leave requests?

Pending requests have **not** deducted `usedDays` yet. A negative adjustment could cause a later approval to fail (insufficient remaining days). This is intentional and expected — the pending request fails when HR tries to approve it, with a clear "insufficient balance" message. No retroactive revocation occurs.

### What if no balance record exists yet?

Adjustment endpoint requires the balance record to exist. HR must create the balance via `POST /leave-balances` first (current flow unchanged).

### What if HR posts an adjustment with delta = 0?

`delta = 0` is rejected with 400 (no-op adjustment is meaningless and generates unnecessary audit noise).

### What if the same HR officer makes an error in an adjustment?

Post a correcting adjustment with the opposite delta and a reason referencing the original: e.g., `+2` with reason "Reversal of 2026-06-27 adjustment — entered wrong value". The ledger preserves both entries.

---

## 12. Security / RBAC Considerations

- All adjustment endpoints require JWT (`JwtAuthGuard`) + role check (`RolesGuard`).
- Role whitelist: SUPER_ADMIN, HR_ADMIN only for POST.
- Audit log captures actor `userId`, `role`, `ipAddress`, `userAgent` on every adjustment.
- Reason field is stored as plain text; it must not be used to store employee PII beyond the employment context (name is acceptable; ID numbers or medical info are not).
- The delta value is an integer with no sensitive content; no sanitisation beyond type validation required.
- Adjustment history (`GET /adjustments`) is readable by the employee who owns the balance (via `findMy` pattern), matching existing balance visibility rules.

---

## 13. Production Safety Considerations

- **Schema migration** is required at implementation time (new `LeaveAdjustment` table). Standard `prisma migrate dev` → `prisma migrate deploy` in production; no destructive changes to existing tables.
- **Existing `PATCH /leave-balances/:id`**: if `usedDays` override is removed, no data loss — only the ability to set `usedDays` directly is removed. Existing data is unaffected.
- **Rollback**: remove the new table and restore `usedDays` to PATCH if needed. Zero impact on existing balance or leave request rows.
- **Zero-downtime**: new endpoints and new table; no existing column type changes.

---

## 14. Open Questions for User / Stakeholder Review

| # | Question | Recommendation |
|---|----------|----------------|
| Q1 | Should adjustment be limited to VACATION only, or also SICK and PERSONAL? | Start with VACATION only; unlock others with a config flag once proven stable. |
| Q2 | Should HR_ADMIN be able to adjust, or SUPER_ADMIN only? | Both SUPER_ADMIN and HR_ADMIN; HR_ADMIN is the day-to-day operator of balance corrections. |
| Q3 | Should there be a maximum single-adjustment delta (e.g., ±30 days)? | Recommend no hard cap in v1; instead rely on audit log for oversight. |
| Q4 | Should adjustment history be visible to employees in STEP Connect? | Deferred to v2. Currently STEP Connect shows balance summary only. |
| Q5 | Should the system send a notification (email or in-app) to the employee when their balance is adjusted? | Deferred — notification infrastructure is not yet present. |
| Q6 | Should the old `usedDays` override capability in `PATCH /leave-balances/:id` be removed immediately, or only after Option B is in production? | Remove at the same time as Option B is deployed. Keep it in place until then. |
| Q7 | Should MANAGER be able to view adjustment history for employees in their department? | Yes — view only, matches existing balance read access for MANAGER. |
| Q8 | Should adjustments be soft-deletable (with a `deletedAt` flag) or always permanent? | Permanent (immutable ledger). Compensation via reverse entry. |

---

## 15. Non-Goals (Out of Scope for REQ-001A)

- Adjusting SICK, PERSONAL, or OTHER leave types (deferred).
- Scheduling adjustments for a future effective date.
- Bulk adjustment of multiple employees in a single request.
- MANAGER-created adjustments.
- Annual entitlement policy management (Option C).
- Employee notification on adjustment.
- Adjustment approval workflow (a second HR officer must countersign).
- Integration with external payroll or HR information systems.
- Mobile (STEP Connect) adjustment creation UI.

---

## 16. Implementation Plan (Post-Approval)

> **Do not implement until stakeholder review and approval of this spec.**

1. **Step 1 — Schema**: Add `LeaveAdjustment` model to Prisma schema. Generate and apply migration (`prisma migrate dev`).
2. **Step 2 — Common enum guard**: Add `VACATION` scope check to adjustment service (leaveType validation).
3. **Step 3 — API**: `LeaveAdjustmentService` + `LeaveAdjustmentController` following the flat feature-module layout (`src/leave-adjustment/`).
4. **Step 4 — Restrict PATCH**: Remove `usedDays` from `UpdateLeaveBalanceDto`; add required `reason`; add `AuditLogService` injection to `LeaveBalanceService`.
5. **Step 5 — Balance query update**: Include `effectiveEntitledDays` and `adjustmentTotal` in balance responses.
6. **Step 6 — Admin Web UI**: Replace "Edit Balance" modal with "Adjust Balance" modal + adjustment history panel.
7. **Step 7 — Tests**: Unit tests for `LeaveAdjustmentService` (delta validation, 422 on negative remaining, audit event). E2E test for POST → GET history flow.
8. **Step 8 — Verification**: `./scripts/verify.sh`, `./scripts/docker-verify.sh`, `./scripts/api-smoke-test.sh`.
9. **Step 9 — Security review**: Run `./scripts/security-review.sh`.
