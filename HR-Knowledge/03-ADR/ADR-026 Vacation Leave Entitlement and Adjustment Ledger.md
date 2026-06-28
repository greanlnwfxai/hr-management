# ADR-026 — Vacation Leave Entitlement, Manual Setup, and Adjustment Ledger

**Status:** Accepted
**Date:** 2026-06-28 (post-implementation per ADR-004)
**Deciders:** HR, Tech Lead
**Related:** [[ADR-011 Leave Workflow]], [[ADR-006 RBAC]], [[ADR-019 Audit Trail and Admin Review]]
**Source:** `docs/adr/ADR-026-vacation-leave-entitlement-adjustment-ledger.md`

---

## Context

The original `LeaveBalance` model (ADR-011) provided `POST /leave-balances` to create balances and `PATCH /leave-balances/:id` to update them. Two gaps were identified for production:

1. **Untracked corrections.** `PATCH` overwrites `totalDays` with no record of what changed, when, or why. VACATION is a legally significant entitlement — this is unacceptable.

2. **No policy-aware initial setup.** The generic POST accepts any `totalDays` value. There was no mechanism to look up policy-based suggested entitlement (from years-of-service tiers), derive `usedDays` from actual days already taken, or prevent unaudited PATCH overrides after creation.

---

## Decision

Two sub-problems solved independently:

### 1. Immutable Adjustment Ledger (REQ-001B)

New `LeaveAdjustment` model:
- `deltaDays` — `Float`, signed, non-zero (supports half-day values)
- `reason` — min 5 chars after trim
- `actorUserId` — JWT user UUID
- `adjustedById` — nullable FK to `Employee`
- `createdAt` — immutable; no update or delete

New endpoints:
- `POST /leave-balances/:id/adjustments` — append signed-delta correction
- `GET /leave-balances/:id/adjustments` — list adjustments, newest-first

VACATION-only in v1. Non-VACATION balance IDs are rejected (400).

Effective entitlement: `effectiveTotalDays = totalDays + SUM(deltaDays)`

Guard: adjustment that would produce negative remaining days → 422.

**`PATCH /leave-balances/:id` blocked for VACATION type (400)** to prevent bypass of the ledger.

Both endpoints: SUPER_ADMIN + HR_ADMIN only. MANAGER excluded.

### 2. Policy-Aware Vacation Setup (REQ-001D)

New `vacation-setup` module. Two endpoints:
- `GET /leave-balances/vacation-setup/suggest` — tenure data and policy suggestion
- `POST /leave-balances/vacation-setup` — create VACATION balance

Both: SUPER_ADMIN + HR_ADMIN only.

**Entitlement tiers:**

| Completed years of service | Entitled days |
|---|---|
| < 1 year | 0 (ineligible — no balance created) |
| ≥ 1 and < 3 years | 7 |
| ≥ 3 and < 5 years | 10 |
| ≥ 5 and < 7 years | 12 |
| ≥ 7 years | 15 |

**Tenure source:** `Employee.hireDate` (not `createdAt` — hire dates can be backdated)

**Tenure method:** Calendar-based UTC year subtraction. Division by `365.25` was rejected: an employee hired exactly 365 days ago has `0.9997…` fractional years — incorrectly marking them ineligible on their exact anniversary.

**No proration in v1.** Full tier entitlement is granted if setup is run after the tier threshold is crossed.

**`usedDays` derivation at setup:** `usedDays = entitledDays − remainingDays` — allows HR to record actual usage when setting up mid-year.

**Override detection:** `entitlementOverridden: true` when HR sets a value differing from policy suggestion. Visible in audit; not a block.

**`setupNote`:** optional free-text note stored in audit metadata only — no DB column.

### Audit Events

| Event | Trigger |
|---|---|
| `LEAVE_BALANCE_ADJUSTED` | Successful `POST /leave-balances/:id/adjustments` |
| `LEAVE_BALANCE_VACATION_SETUP` | Successful `POST /leave-balances/vacation-setup` |

Both follow best-effort pattern (ADR-019): audit failure never blocks the business operation.

---

## Consequences

- Full, immutable audit trail for VACATION entitlement changes
- Policy-driven setup prevents arbitrary entitlement
- VACATION PATCH block prevents accidental ledger bypass
- Effective entitlement requires `SUM(deltaDays)` aggregation at read time (acceptable at current scale)
- MANAGER cannot inspect adjustment history
- `totalDays` vs `entitledDays` naming inconsistency still present (pre-existing from ADR-011; column rename deferred to v1.1)

## Follow-up Tasks

- Column rename `totalDays` → `entitledDays` (v1.1)
- Extend ledger to non-VACATION types when needed
- Proration policy if HR requires mid-year partial entitlement
- MANAGER read access to adjustments (if department-scoped requirement emerges)

---

## Related Notes

- [[Vacation Leave Policy]]
- [[Leave Balance Module]]
- [[Leave Rules]]
- [[API Route Index]]

#adr #leave #vacation #security #audit
