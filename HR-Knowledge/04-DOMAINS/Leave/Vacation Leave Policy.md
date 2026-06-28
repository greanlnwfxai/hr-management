# Vacation Leave Policy

## Overview

Vacation leave (type `VACATION`) entitlement is based on completed years of service from `Employee.hireDate`. HR Admins and Super Admins manually set up each employee's VACATION balance for a given year using the dedicated vacation setup endpoints. Subsequent corrections are made via an immutable adjustment ledger.

This document covers the entitlement policy, tenure calculation, setup workflow, and ledger correction workflow. For leave request submission and approval rules, see [[Leave Rules]] and [[Leave Request Module]].

---

## Entitlement Policy

### Tenure Tiers

| Completed years of service | Entitled days |
|---|---|
| < 1 year | 0 (ineligible — no balance record created) |
| ≥ 1 and < 3 years | 7 |
| ≥ 3 and < 5 years | 10 |
| ≥ 5 and < 7 years | 12 |
| ≥ 7 years | 15 |

### Key Policy Decisions

- **No proration in v1.** An employee who crosses a tier boundary mid-year receives the full higher-tier entitlement for that year when their balance is set up. Proration is deferred.
- **Tenure source: `Employee.hireDate`.** The system does not use `Employee.createdAt` (the DB row creation timestamp); hire dates may be backdated when onboarding an employee with prior service.
- **Tenure method: calendar-based (UTC).** Completed years are computed using UTC date components — not `days/365.25`. The division approach would incorrectly mark an employee ineligible on their exact first-anniversary date.
- **Ineligible employees (< 1 year):** The setup endpoint returns 422. No VACATION `LeaveBalance` is created. The employee's leave interface shows no VACATION entry because balance cards render only for existing records.

---

## Tenure Calculation

The `completedYears(hireDate, asOf)` function computes calendar years elapsed:

```
completedYears = asOf.year - hire.year
if (asOf.month < hire.month) completedYears -= 1
if (asOf.month === hire.month && asOf.day < hire.day) completedYears -= 1
```

All comparisons use UTC date components (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`) to prevent DST drift.

`asOf` defaults to today (UTC). HR can override it when running the suggest endpoint.

---

## Setup Workflow

### Roles

| Action | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| GET suggest | ✅ | ✅ | ❌ 403 | ❌ 403 |
| POST setup | ✅ | ✅ | ❌ 403 | ❌ 403 |

### Step 1 — GET suggest

```
GET /leave-balances/vacation-setup/suggest?employeeId=<uuid>&year=<int>
```

Returns tenure data and the policy-based suggested entitlement:

```json
{
  "employeeId": "...",
  "employeeName": "Alice Smith",
  "employeeCode": "EMP003",
  "year": 2026,
  "hireDate": "2023-06-28",
  "completedYears": 3,
  "completedMonths": 36,
  "isEligible": true,
  "suggestedEntitledDays": 10,
  "tierLabel": ">= 3 years and < 5 years",
  "hasExistingBalance": false,
  "existingBalance": null
}
```

- Returns 200 (not 422) for ineligible employees — `isEligible: false`, `suggestedEntitledDays: 0`.
- Returns 404 if employee not found, 400 if no `hireDate`, 422 if future year.

### Step 2 — POST setup

```
POST /leave-balances/vacation-setup
Body: { employeeId, year, entitledDays, remainingDays, setupNote? }
```

- `totalDays = entitledDays` (stored in `LeaveBalance.totalDays`)
- `usedDays = entitledDays − remainingDays` (derived server-side)
- `setupNote` (optional, max 500 chars) stored in audit metadata only — not persisted to DB

Response (201) includes:

```json
{
  "id": "...",
  "totalDays": 10,
  "usedDays": 2,
  "remainingDays": 8,
  "completedYears": 3,
  "suggestedEntitledDays": 10,
  "entitlementOverridden": false
}
```

If `entitledDays` differs from `suggestedEntitledDays`, `entitlementOverridden: true` is returned and logged in the audit event.

### Error Conditions

| Condition | HTTP |
|---|---|
| Employee not found | 400 |
| Employee has no `hireDate` | 400 |
| `year` is in the future | 422 |
| Tenure < 1 completed year | 422 |
| `remainingDays > entitledDays` | 422 |
| VACATION balance already exists for (employeeId, year) | 409 |

### Audit Event

`LEAVE_BALANCE_VACATION_SETUP` fires on successful POST. Metadata:

```json
{
  "leaveBalanceId": "...",
  "employeeId": "...",
  "employeeCode": "EMP003",
  "year": 2026,
  "hireDate": "2023-06-28",
  "completedYears": 3,
  "entitledDays": 10,
  "remainingDays": 8,
  "usedDays": 2,
  "suggestedEntitledDays": 10,
  "entitlementOverridden": false,
  "setupNote": null
}
```

Best-effort: audit failure never blocks balance creation.

---

## Correction Workflow — Adjustment Ledger

After initial setup, VACATION entitlement corrections are made via the immutable adjustment ledger. Direct `PATCH /leave-balances/:id` is **blocked (400)** for VACATION balances.

### Roles

| Action | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| POST adjustment | ✅ | ✅ | ❌ 403 | ❌ 403 |
| GET adjustments | ✅ | ✅ | ❌ 403 | ❌ 403 |

### POST Adjustment

```
POST /leave-balances/:id/adjustments
Body: { deltaDays, reason }
```

- `deltaDays` — `Float`, signed, non-zero. Positive to add entitlement, negative to reduce it.
  - Supports half-day values (e.g., `0.5`, `−0.5`).
- `reason` — string, minimum 5 characters after trimming whitespace.
- Returns 422 if the adjustment would produce negative remaining days.

The effective entitlement after adjustment:
```
effectiveTotalDays = LeaveBalance.totalDays + SUM(LeaveAdjustment.deltaDays)
```

### GET Adjustments

```
GET /leave-balances/:id/adjustments?page=1&limit=20
```

Returns paginated list of all adjustments, newest first. Each record includes:
- `id`, `leaveBalanceId`, `deltaDays`, `reason`, `actorUserId`, `createdAt`
- `adjustedBy` — `{ id, firstName, lastName, employeeCode }` (the actor's employee record, if found)

### Audit Event

`LEAVE_BALANCE_ADJUSTED` fires on successful POST. Metadata:

```json
{
  "leaveBalanceId": "...",
  "employeeId": "...",
  "leaveType": "VACATION",
  "year": 2026,
  "deltaDays": 3,
  "reason": "Annual policy correction approved 2026-06",
  "previousEffectiveTotalDays": 10,
  "newEffectiveTotalDays": 13,
  "previousRemainingDays": 8,
  "newRemainingDays": 11
}
```

Best-effort: audit failure never blocks the adjustment.

---

## Effective Entitlement (Balance Response)

All `LeaveBalance` responses include computed adjustment fields. For non-VACATION types, `adjustmentDays` is always `0`:

| Field | Source |
|---|---|
| `totalDays` | `LeaveBalance.totalDays` (set at setup) |
| `adjustmentDays` | `SUM(LeaveAdjustment.deltaDays)` — aggregated per balance; 0 for non-VACATION |
| `effectiveTotalDays` | `totalDays + adjustmentDays` |
| `usedDays` | `LeaveBalance.usedDays` (incremented on leave approval) |
| `remainingDays` | `effectiveTotalDays − usedDays` |

Leave approval checks `effectiveTotalDays` (not raw `totalDays`) when verifying sufficient balance for VACATION leaves.

---

## Admin Web UI

- **Vacation Setup button** — in the Leave Balance admin section header (emerald color)
- **Vacation Balance Setup modal:**
  - Employee selector, year input
  - Suggestion panel: auto-fetches on employee + year; shows tier label, hire date, completed years, suggested entitlement
  - Amber warning if employee is ineligible; red warning if balance already exists
  - Entitled days input: pre-populated with suggestion; shows override notice if changed
  - Remaining days input; live `usedDays = entitledDays − remainingDays` preview
  - Optional setup note (max 500 chars)
  - Submit disabled for ineligible employees

---

## Related ADRs

- [[ADR-026 Vacation Leave Entitlement and Adjustment Ledger]]
- [[ADR-011 Leave Workflow]]
- [[ADR-006 RBAC]]
- [[ADR-019 Audit Trail and Admin Review]]

## Related Notes

- [[Leave Balance Module]]
- [[Leave Rules]]
- [[Leave Request Module]]
- [[API Route Index]]

#domain #leave #vacation #business-rules #rag-ready
