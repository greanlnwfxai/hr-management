# ADR-026 — Vacation Leave Entitlement, Manual Setup, and Adjustment Ledger

**Status:** Accepted
**Date:** 2026-06-28 (post-implementation per ADR-004)
**Deciders:** HR, Tech Lead
**Related:** ADR-011 (Leave Workflow and Balance Integration), ADR-006 (RBAC), ADR-019 (Audit Trail)

---

## Context

The original `LeaveBalance` model (ADR-011) tracks `totalDays` (entitled quota), `usedDays`, and computes `remainingDays = totalDays − usedDays`. HR Admins could create balances using `POST /leave-balances` and correct them via `PATCH /leave-balances/:id`.

Two gaps were identified as the system moved toward production use:

1. **Untracked corrections.** `PATCH /leave-balances/:id` overwrites `totalDays` with no record of what changed, when, or why. For VACATION leave — a legally and contractually significant entitlement — post-hoc corrections have no audit trail.

2. **No policy-aware initial setup.** The generic `POST /leave-balances` accepts any `totalDays` value. There is no mechanism to look up the policy-based suggested entitlement from years-of-service tiers, derive the correct `usedDays` from days already taken in the year, or prevent subsequent unaudited PATCH overrides once the balance is created.

---

## Problem Statement

- How do we allow HR Admins to correct VACATION entitlement post-setup without losing auditability?
- How do we provide a policy-driven first-time setup flow that accounts for tenure tiers and existing usage?
- How do we prevent VACATION balances from being silently overwritten via the generic PATCH endpoint?

---

## Decision

Two independent sub-problems were solved separately:

### 1. Immutable Adjustment Ledger (REQ-001A / REQ-001B)

**What was built:**

- New Prisma model `LeaveAdjustment`:
  - `leaveBalanceId` — FK to `LeaveBalance`
  - `deltaDays` — `Float`, signed, non-zero (supports half-day corrections like `−0.5`)
  - `reason` — `String`, minimum 5 characters after trim
  - `actorUserId` — `String` (JWT user UUID, always stored)
  - `adjustedById` — nullable FK to `Employee` (the actor's employee record; null if actor has no employee record)
  - `createdAt` — immutable timestamp; no `updatedAt`, no `deletedAt`

- Two new endpoints:
  - `POST /leave-balances/:id/adjustments` — append a signed-delta correction
  - `GET /leave-balances/:id/adjustments` — list all adjustments, newest-first

- Both endpoints are restricted to `SUPER_ADMIN` and `HR_ADMIN`. MANAGER excluded in v1.

- **VACATION-only in v1.** The `POST` endpoint rejects non-VACATION balance IDs with 400. Other leave types can still use `PATCH /leave-balances/:id` normally.

- **Effective entitlement** at read time:
  `effectiveTotalDays = totalDays + SUM(LeaveAdjustment.deltaDays)`

- **Guard:** an adjustment that would produce negative remaining days is rejected with 422:
  `newRemainingDays = (totalDays + currentAdjSum + deltaDays) − usedDays`

- **`PATCH /leave-balances/:id` blocked for VACATION type (400).** This prevents HR from accidentally bypassing the ledger for VACATION balances. Non-VACATION types are unaffected.

- **Why a ledger over a direct update?** Each adjustment entry is permanent: its `deltaDays`, `reason`, and `actorUserId` cannot be changed. The full history is always reconstructible. This matches ADR-019's audit philosophy and satisfies the auditability requirement for a legally significant field.

- **Why `Float` for `deltaDays`?** Half-day corrections (`0.5`, `−0.5`) are valid HR operations. Using `Int` would require two separate adjustments or a policy change.

- **Why not allow MANAGER to POST adjustments?** Entitlement decisions are HR-level operations. MANAGER scope (ADR-023) covers approval/rejection within a department. Entitlement management is not a department-level decision.

---

### 2. Policy-Aware Vacation Setup (REQ-001C / REQ-001D)

**What was built:**

- New NestJS module `vacation-setup` at `apps/api/src/vacation-setup/`.

- Two new endpoints:
  - `GET /leave-balances/vacation-setup/suggest` — returns tenure data and policy-based entitlement suggestion
  - `POST /leave-balances/vacation-setup` — creates a VACATION `LeaveBalance` with correct field values

- Both restricted to `SUPER_ADMIN` and `HR_ADMIN`.

**Entitlement tiers (v1.2.35):**

| Completed years of service | Entitled days |
|---|---|
| < 1 year | 0 (ineligible — no balance record created) |
| ≥ 1 and < 3 years | 7 |
| ≥ 3 and < 5 years | 10 |
| ≥ 5 and < 7 years | 12 |
| ≥ 7 years | 15 |

**Tenure source: `Employee.hireDate` (not `Employee.createdAt`)**
`createdAt` is the system row insertion time; hire dates can be set to a past date (backdated hiring). Using `createdAt` would produce incorrect tenure for any employee whose hire date differs from their account creation date.

**Tenure method: calendar-based year subtraction using UTC components**
`completedYears()` uses `getUTCFullYear`, `getUTCMonth`, `getUTCDate` to compute calendar years elapsed. Division by `365.25` was rejected: an employee hired exactly 365 days ago has `0.9997…` fractional years — this would incorrectly trigger the "< 1 year ineligible" path on their exact first anniversary.

**No proration in v1.**
An employee who crosses a tenure tier mid-year receives the full higher-tier entitlement for that year when setup is run. Proration logic deferred to v1.1.

**`usedDays` derivation at setup:**
`POST /leave-balances/vacation-setup` accepts `entitledDays` and `remainingDays`. It derives:
`usedDays = entitledDays − remainingDays`
This allows HR to record the correct used-day count when setting up balances mid-year for employees who have already taken vacation.

**Error conditions for POST:**

| Condition | HTTP |
|---|---|
| Employee not found | 400 |
| Employee has no `hireDate` | 400 |
| Tenure < 1 year | 422 |
| `remainingDays > entitledDays` | 422 |
| Future year requested | 422 |
| VACATION balance already exists for (employeeId, year) | 409 |

**Why initial setup is separate from the adjustment ledger:**
The setup operation has fundamentally different concerns: it derives `usedDays` from HR-supplied remaining days, validates tenure eligibility, enforces the no-future-year rule, and is a create operation (not a delta). Merging it into the adjustment endpoint would require conditional branching on "is this a setup or a correction?" — two distinct operations sharing one endpoint with incompatible validation paths.

**Why < 1 year employees don't appear to have VACATION leave:**
The setup endpoint rejects them with 422. No `LeaveBalance` record of type VACATION is ever created. The web/mobile client renders balance cards only for types that have a balance record — so VACATION simply does not appear for ineligible employees. This is an implicit consequence of the data model, not an enforced frontend filter.

**Override detection:**
If HR sets `entitledDays` to a value different from `suggestedEntitledDays`, the response and audit metadata include `entitlementOverridden: true`. This makes non-policy setups visible without blocking them — HR may have legitimate reasons to deviate.

---

### Audit Events

| Event | Trigger | Key metadata |
|---|---|---|
| `LEAVE_BALANCE_ADJUSTED` | Successful `POST /leave-balances/:id/adjustments` | `deltaDays`, `reason`, `employeeId`, `leaveType`, `year`, `previousEffectiveTotalDays`, `newEffectiveTotalDays`, `previousRemainingDays`, `newRemainingDays` |
| `LEAVE_BALANCE_VACATION_SETUP` | Successful `POST /leave-balances/vacation-setup` | `employeeId`, `employeeCode`, `year`, `hireDate`, `completedYears`, `entitledDays`, `remainingDays`, `usedDays`, `suggestedEntitledDays`, `entitlementOverridden`, `setupNote` |

Both follow the best-effort pattern (ADR-019): audit failure never blocks the business operation.

`setupNote` (optional, max 500 chars) is stored in audit metadata only — no DB column. This avoids a schema migration for a rarely-used free-text field.

---

## Consequences

**Positive:**
- Full, immutable audit trail for all VACATION entitlement changes — each correction is permanently attributable
- Policy-driven initial setup prevents arbitrary entitlement values with no policy basis
- `Float` `deltaDays` supports half-day corrections without schema changes
- `entitlementOverridden` flag makes non-policy setups visible without blocking them
- VACATION PATCH block prevents accidental bypass of the ledger after setup

**Negative / Trade-offs:**
- Effective entitlement requires aggregation (`SUM(deltaDays)`) at read time — acceptable at current scale; indexes on `leaveBalanceId` keep this fast
- MANAGER cannot inspect adjustment history (`GET /adjustments` is SUPER_ADMIN/HR_ADMIN only)
- `totalDays` DB column name still mismatches the API `entitledDays` parameter name (pre-existing gap from ADR-011; column rename deferred to v1.1)
- Adjustment ledger scoped to VACATION only — other types still use PATCH with no ledger; extending requires per-type policy decisions

---

## Follow-up Tasks

- Column rename `totalDays` → `entitledDays` in Prisma schema + migration (v1.1)
- Extend adjustment ledger to non-VACATION types when demand exists
- MANAGER read access to `GET /leave-balances/:id/adjustments` if department-scoped audit access becomes a requirement
- Proration policy: if HR requires mid-year partial entitlement, a proration calculation must be added to `entitledDaysFor()`
- ANNUAL leave type: when `LeaveType.ANNUAL` is added to the Prisma enum (deferred from ADR-011), the vacation setup and adjustment ledger should evaluate whether to support it or keep VACATION as the canonical annual-leave type

---

## Implementation Reference

| Item | Location |
|---|---|
| `LeaveAdjustment` model | `prisma/schema.prisma` |
| Adjustment service | `apps/api/src/leave-adjustment/leave-adjustment.service.ts` |
| Adjustment controller | `apps/api/src/leave-adjustment/leave-adjustment.controller.ts` |
| Vacation setup service | `apps/api/src/vacation-setup/vacation-setup.service.ts` |
| Vacation setup controller | `apps/api/src/vacation-setup/vacation-setup.controller.ts` |
| Specs | `REQ_001A_VACATION_LEAVE_BALANCE_ADJUSTMENT_SPEC.md`, `REQ_001C_VACATION_ENTITLEMENT_POLICY_AND_MANUAL_SETUP_SPEC.md` |
| CTO Summaries | `docs/CTO_SUMMARY_REQ_001B.md`, `docs/CTO_SUMMARY_REQ_001D.md` |
