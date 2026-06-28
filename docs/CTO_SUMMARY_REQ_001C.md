# CTO Summary

## Step
REQ-001C — Vacation Entitlement Policy & Manual Balance Setup Specification

## Status
PASS

## Scope

Product and technical specification for: (1) the approved vacation leave entitlement policy by service length, (2) a guided HR workflow for manually entering each employee's vacation balance, and (3) system design for a new `POST /leave-balances/vacation-setup` endpoint that accepts `entitledDays + remainingDays` and derives `usedDays`. No code was written, no schema was migrated, and no data was mutated.

## Files Created

| File | Description |
|------|-------------|
| `docs/REQ_001C_VACATION_ENTITLEMENT_POLICY_AND_MANUAL_SETUP_SPEC.md` | Full product/technical spec |
| `docs/CTO_SUMMARY_REQ_001C.md` | This document |

## Files Modified

None.

## Existing Modules Inspected

| File | What Was Checked |
|------|-----------------|
| `apps/api/prisma/schema.prisma` | Employee.hireDate, LeaveBalance fields, LeaveAdjustment model |
| `apps/api/src/leave-balance/leave-balance.service.ts` | Create flow (usedDays hardcoded to 0), withRemaining computation, VACATION PATCH block |
| `apps/api/src/leave-balance/leave-balance.controller.ts` | Existing endpoint roles and paths |
| `apps/api/src/leave-balance/dto/create-leave-balance.dto.ts` | Existing DTO — entitledDays only, no remainingDays |
| `apps/api/src/leave-adjustment/leave-adjustment.service.ts` | Adjustment ledger behavior (adjusts effectiveTotalDays, not usedDays) |
| `apps/api/src/leave-adjustment/leave-adjustment.controller.ts` | Adjustment endpoint RBAC |
| `apps/web/app/(app)/leave/page.tsx` | Existing Add Balance modal, Adjust modal, admin balance table |
| `apps/mobile/app/leave.tsx` | BalanceCard rendering behavior (all balances, no tenure filter) |
| `docs/REQ_001A_VACATION_LEAVE_BALANCE_ADJUSTMENT_SPEC.md` | Background: original adjustment spec |
| `docs/CTO_SUMMARY_REQ_001B.md` | Background: adjustment ledger implementation summary |

## Recommended Approach

**Option B1 — Policy-Assisted Manual Setup** (one employee at a time).

Key design decisions:
- **Tenure field**: `hireDate` (only meaningful date on Employee; `createdAt` must not be used)
- **Tenure as-of**: Today's date (pending business confirmation — open question 13.1)
- **HR entry model**: `entitledDays + remainingDays`; system derives `usedDays = entitledDays − remainingDays`
- **New API endpoints**:
  - `GET /leave-balances/vacation-setup/suggest?employeeId&year` — returns tenure, suggested entitlement, eligibility, hasExistingBalance
  - `POST /leave-balances/vacation-setup` — creates balance with correct `usedDays`; writes audit `VACATION_BALANCE_SETUP`
- **Eligibility guard**: 422 if `completedYears < 1` (< 1 year service)
- **Duplicate guard**: 409 if VACATION balance already exists for employee/year
- **No schema migration required**: Existing `LeaveBalance.usedDays` is used directly
- **Audit from day one**: `entitlementOverridden` flag captures HR deviations from system policy

## Pros / Cons Summary

### Option A — Existing Flow (Not Recommended for Initial Setup)

| | |
|-|-|
| Pro | Zero backend changes |
| Con | Cannot set initial `usedDays > 0`; must use adjustment ledger as a workaround, polluting the audit trail; no tenure guidance |

### Option B1 — Policy-Assisted Setup (Recommended)

| | |
|-|-|
| Pro | Single atomic operation; correct `usedDays` on creation; tenure-guided suggestion; clean audit separation; ineligibility guard |
| Con | Requires new endpoint and new UI section; more work than Option A |

### Option C — Bulk CSV Import (Deferred)

| | |
|-|-|
| Pro | HR sets up 65 employees at once |
| Con | Higher implementation complexity, higher risk of bulk mistakes; defer until v1 flow is verified |

## Open Questions for the User

| # | Question | Default in Spec |
|---|----------|----------------|
| 13.1 | Should tenure tier be assessed as of today, January 1 of the year, or the employee's anniversary? | **Today** |
| 13.2 | Should entitlement be prorated for mid-year joiners or tier-crossing employees? | **No proration** |
| 13.3 | Should HR be required to provide a reason when overriding the suggested entitlement? | **No (audit-flagged but not blocked)** |
| 13.4 | If HR enters wrong `remainingDays`, what is the correction path (no current API for `usedDays` correction)? | **Engineering-level correction; v1 known limitation** |
| 13.5 | Should vacation setup be allowed for past years (e.g., 2025)? | **Yes, with UI warning** |
| 13.6 | Should vacation setup be allowed for RESIGNED/INACTIVE employees? | **Yes, with UI warning** |
| 13.7 | If `hireDate` is wrong in the system, who corrects it? | **HR corrects via employee PATCH first** |

## Verification Performed

```
git status --short    → clean (no uncommitted changes)
git diff --stat       → no changes to source files
```

Read-only source inspection of all files listed under "Existing Modules Inspected". No builds, no tests, no Docker commands, no data queries were run.

## Explicit Statements

| Statement | Value |
|-----------|-------|
| Runtime code changed | **No** |
| Database schema changed | **No** |
| Data mutation | **No** |
| Prisma migration generated | **No** |
| Docker destructive commands run | **No** |
| Git operations performed | **No** |
| `docker compose down` / volume removal | **No** |

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | Two new endpoints proposed; both must be behind JwtAuthGuard + RolesGuard. No existing endpoints changed. |
| RBAC impact | New endpoints restricted to SUPER_ADMIN + HR_ADMIN. MANAGER and EMPLOYEE must receive 403. |
| Data privacy impact | Suggest endpoint returns `hireDate` and tenure — internal HR data only; restricted to admin roles. No PII exposed. |
| Password/token/hash impact | None |
| Mobile security impact | No mobile changes. STEP Connect displays balance cards for existing records only; no new mobile endpoints. |
| Dependency/advisory impact | No new packages proposed |
| Secrets/logging check | `hireDate`, `entitledDays`, `remainingDays`, `usedDays` are non-sensitive operational values. Safe in audit metadata. |
| New endpoints protected | Both proposed endpoints require JwtAuthGuard + RolesGuard (SUPER_ADMIN, HR_ADMIN). |
| Risk level | **LOW** — spec only; no runtime code changed |
| Security decision | **PASS** |

## Risk

**Low.** This is a documentation-only deliverable. No code is changed, no migrations generated, no data mutated. Implementation risk is assessed at the implementation task level (REQ-001C-impl).

## Decision
PASS

## Next Step

User reviews spec and answers open questions (Section 13 / Section 17 in the spec). Once the business confirms the tenure assessment date and proration policy, implementation can proceed as REQ-001C-impl.

## Recommended Commit Message
```
docs(req): add vacation entitlement manual setup spec REQ-001C

Documents the vacation entitlement policy by service length tier,
compares Option A/B/C setup approaches, and designs the
POST /leave-balances/vacation-setup endpoint with tenure-guided
entitlement suggestion and remainingDays-based usedDays derivation.
No code changed. No migrations. No data mutated.
```
