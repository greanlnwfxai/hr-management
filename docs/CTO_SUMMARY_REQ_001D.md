# CTO Summary

## Step
REQ-001D — Vacation Entitlement Manual Setup Implementation

## Status
PASS

## Scope
Implement Option B1 from REQ-001C: a dedicated `vacation-setup` module providing two new endpoints — `GET /leave-balances/vacation-setup/suggest` and `POST /leave-balances/vacation-setup` — for HR Admins and Super Admins to look up policy-based suggested entitlement and manually create a VACATION `LeaveBalance` with correct `usedDays` derivation, full audit logging, and an Admin Web UI modal with live preview, ineligibility warnings, and entitlement override detection.

## Files Created

| File | Description |
|------|-------------|
| `apps/api/src/vacation-setup/dto/create-vacation-setup.dto.ts` | POST DTO: `employeeId` (UUID), `year` (Int ≥2020), `entitledDays` (Int ≥0), `remainingDays` (Int ≥0), `setupNote` (optional, max 500 chars) |
| `apps/api/src/vacation-setup/dto/query-vacation-setup.dto.ts` | GET query DTO: `employeeId` (UUID), `year` (Int ≥2020) |
| `apps/api/src/vacation-setup/vacation-setup.service.ts` | Service: `suggest()` + `setup()` with calendar-based tenure math, eligibility guard (≥1 yr), duplicate guard (409), usedDays derivation, best-effort audit logging; exports `completedYears()` + `entitledDaysFor()` pure functions for direct unit tests |
| `apps/api/src/vacation-setup/vacation-setup.controller.ts` | Controller: `GET /leave-balances/vacation-setup/suggest` + `POST /leave-balances/vacation-setup`; RBAC: SUPER_ADMIN + HR_ADMIN; JWT + Roles guards |
| `apps/api/src/vacation-setup/vacation-setup.module.ts` | Module: imports AuditLogModule + AuthModule |
| `apps/api/src/vacation-setup/vacation-setup.service.spec.ts` | 42 service tests: 8 tenure boundary tests, 9 entitlement tier tests, 8 suggest tests, 17 setup tests (RBAC, CRUD, audit, DTO edge cases) |
| `apps/api/src/vacation-setup/vacation-setup.controller.spec.ts` | 4 controller tests: suggest/setup delegation + RBAC metadata assertions |
| `docs/CTO_SUMMARY_REQ_001D.md` | This document |

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/app.module.ts` | Imported `VacationSetupModule` |
| `apps/web/lib/api.ts` | Added `VacationSetupSuggest` + `VacationSetupResult` types; added `getVacationSetupSuggest()` + `createVacationSetup()` functions |
| `apps/web/app/(app)/leave/page.tsx` | Added `'vacation-setup'` modal variant; added "Vacation Setup" button in admin header; added vacation setup state + handlers; added full-featured modal with suggest fetch, ineligibility warning, existing-balance warning, override detection, live usedDays preview |

## Database / Schema Changes

None. `LeaveBalance.usedDays` already supports initial values > 0 (Prisma `Int @default(0)`). The new `POST` endpoint sets `usedDays = entitledDays - remainingDays` at create time. No migration required.

## API Changes

### New endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/leave-balances/vacation-setup/suggest` | SUPER_ADMIN, HR_ADMIN | Get policy suggestion from hireDate |
| `POST` | `/leave-balances/vacation-setup` | SUPER_ADMIN, HR_ADMIN | Create VACATION balance with manual usedDays |

### GET /leave-balances/vacation-setup/suggest

Query params: `employeeId` (UUID), `year` (Int ≥2020).

Response (200):
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

Does NOT throw for ineligible employees — returns `isEligible: false` and `suggestedEntitledDays: 0`. Only rejects on: employee not found (404), missing hireDate (400), future year (422).

### POST /leave-balances/vacation-setup

Body: `{ employeeId, year, entitledDays, remainingDays, setupNote? }`

Response (201): created balance with `totalDays = entitledDays`, `usedDays = entitledDays - remainingDays`, `remainingDays`, `completedYears`, `suggestedEntitledDays`, `entitlementOverridden`.

Error responses:
- 400 — employee not found or no hireDate
- 409 — VACATION balance already exists for employee/year
- 422 — tenure < 1 year, `remainingDays > entitledDays`, or future year

### Existing endpoints

`PATCH /leave-balances/:id` VACATION block from REQ-001B is fully preserved. The new setup endpoint is additive and does not modify existing balances.

## Vacation Entitlement Policy

| Completed years of service | Entitled days |
|---------------------------|---------------|
| < 1 year | 0 (ineligible) |
| ≥ 1 and < 3 years | 7 |
| ≥ 3 and < 5 years | 10 |
| ≥ 5 and < 7 years | 12 |
| ≥ 7 years | 15 |

Tenure calculation: calendar-based year subtraction using UTC date components to avoid DST drift. `asOf` defaults to today. No proration in v1.

## Audit Behavior

Event `LEAVE_BALANCE_VACATION_SETUP` fired on successful POST:

```json
{
  "action": "LEAVE_BALANCE_VACATION_SETUP",
  "targetType": "LEAVE_BALANCE",
  "targetId": "<leaveBalanceId>",
  "targetLabel": "EMP003 VACATION 2026",
  "result": "SUCCESS",
  "actorUserId": "<jwt-user-id>",
  "actorRole": "HR_ADMIN",
  "ipAddress": "<request-ip>",
  "metadata": {
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
}
```

Best-effort pattern: audit failure never blocks balance creation.

## RBAC Behavior

| Action | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|--------|-------------|----------|---------|----------|
| GET suggest | ✅ | ✅ | ❌ 403 | ❌ 403 |
| POST setup | ✅ | ✅ | ❌ 403 | ❌ 403 |
| Vacation Setup button (Web) | ✅ | ✅ | ❌ | ❌ |

## Admin Web Changes

- **"Vacation Setup" button** added to the Leave Balance Admin section header (emerald color to distinguish from general balance creation).
- **Vacation Balance Setup modal** with:
  - Employee dropdown (populated from existing `employees` state — no extra fetch)
  - Year input (≥2020)
  - Suggestion panel: auto-fetches on employee+year selection; shows tier label, hire date, completed years, suggested entitlement; amber warning for ineligible employees; red warning if balance already exists
  - Entitled days input: pre-populated with policy suggestion; shows override notice if changed
  - Remaining days input
  - Live usedDays preview (derived = entitledDays − remainingDays)
  - Optional setup note (max 500 chars)
  - Submit disabled for ineligible employees
  - Refreshes both admin balance table and user's own balance cards on success

## Tests Added

### New (46 tests)

**`vacation-setup.service.spec.ts`** (42 tests):
- 8 `completedYears` boundary tests — exact 1/3/5/7-year boundaries, one-day-before variants
- 9 `entitledDaysFor` tier tests — all policy tiers + edge cases
- 8 `suggest` tests — eligibility true/false (no throw for ineligible), existing balance detection, not-found, no-hireDate, future year, tier correctness at 5yr and 7yr
- 17 `setup` tests — SUPER_ADMIN/HR_ADMIN create, usedDays derivation, ineligibility 422, duplicate 409, remainingDays>entitledDays 422, not-found 404, no-hireDate 400, future year 422, audit event name, entitlementOverridden flag (true + false), audit failure is non-blocking, DTO validations (negatives, year <2020, setupNote max length, remainingDays=entitledDays boundary)

**`vacation-setup.controller.spec.ts`** (4 tests):
- suggest/setup delegation
- RBAC metadata assertions excluding MANAGER and EMPLOYEE from both handlers

Total backend tests: **431 passing** (up from 385)

## Verification Performed

```
npx jest --no-coverage          → 431 passed, 0 failed
./scripts/verify.sh             → PASS (API build + prisma validate + web build)
./scripts/security-review.sh    → PASS (automated checks clear)
git diff --check                → clean (no whitespace errors)
```

> **Note — docker-verify.sh and api-smoke-test.sh not run here.** These two scripts require the full Docker stack to be running and cannot execute in a cold CI context. Same precedent as REQ-001A and REQ-001B: skipping is deliberate and consistent. The user can run them against the running stack after commit; there are no schema migrations and no new environment variables, so the stack does not require rebuild.


## Issues Found

None. One pre-implementation design decision recorded: `completedYears()` uses calendar-based subtraction (not `days/365.25`) to correctly handle exact anniversary boundaries — the division approach would return `0` for an employee hired exactly 365 days ago, incorrectly marking them ineligible.

## Explicit Statements

| Statement | Value |
|-----------|-------|
| Runtime code changed | **Yes** |
| Database schema changed | **No** |
| Prisma migration generated | **No** |
| Data mutation | **No** (no rows inserted by migration; endpoint only creates on HR Admin request) |
| Docker destructive commands run | **No** |
| Git operations performed | **No** |
| `docker compose down` / volume removal | **No** |

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | Two new endpoints added; both guarded by `JwtAuthGuard` + `RolesGuard` at class level |
| RBAC impact | Both endpoints restricted to SUPER_ADMIN + HR_ADMIN via `@Roles` decorator; MANAGER and EMPLOYEE receive 403 — verified by `Reflect.getMetadata` assertions in controller spec |
| Data privacy impact | `suggest` response includes `hireDate` and tenure data — HR-sensitive but already visible to HR_ADMIN. No PII beyond what HR role already accesses. GET response restricted to SUPER_ADMIN/HR_ADMIN only. |
| Password/token/hash impact | None |
| Mobile security impact | None — mobile app unchanged; new endpoints not included in mobile API surface in v1 |
| Dependency/advisory impact | No new packages added. Existing accepted-risk advisories (Multer GHSA-72gw, GHSA-3p4h) unchanged |
| Secrets/logging check | Audit metadata contains `employeeCode`, `hireDate`, `year`, `entitledDays` — no passwords, tokens, or cryptographic material |
| New endpoints protected | `GET /leave-balances/vacation-setup/suggest` — JwtAuthGuard + RolesGuard (SUPER_ADMIN, HR_ADMIN); `POST /leave-balances/vacation-setup` — JwtAuthGuard + RolesGuard (SUPER_ADMIN, HR_ADMIN) |
| Risk level | **LOW** — no schema changes, no existing data touched, VACATION PATCH block from REQ-001B fully preserved, new endpoints are additive |
| Security decision | **PASS** |

## Risk
Low — new module is purely additive. No existing schema, endpoints, or balance records are modified. The REQ-001B VACATION PATCH hardening remains intact. The new setup endpoint creates records only when explicitly invoked by SUPER_ADMIN or HR_ADMIN with valid inputs.

## Decision
PASS

## Next Step
User git commit. Remaining work queue: HOTFIX-T089A, HOTFIX-T089B (paused).

## Recommended Commit Message
```
feat(leave): add vacation entitlement manual setup

Implements REQ-001D — Option B1 vacation setup endpoint:
- GET /leave-balances/vacation-setup/suggest (SUPER_ADMIN, HR_ADMIN)
  Returns tenure calculation and policy suggestion from hireDate
- POST /leave-balances/vacation-setup (SUPER_ADMIN, HR_ADMIN)
  Creates VACATION LeaveBalance with totalDays=entitledDays,
  usedDays=entitledDays-remainingDays; guards: tenure<1yr (422),
  duplicate (409), remainingDays>entitledDays (422)
- Calendar-based tenure math (completedYears) with UTC extraction
  to correctly handle exact anniversary boundaries
- Audit event LEAVE_BALANCE_VACATION_SETUP with entitlementOverridden flag
- Admin Web: Vacation Setup modal with suggest fetch, ineligibility
  warning, existing-balance warning, override notice, live usedDays preview
- 431 backend tests passing (46 new)
- No schema migration — usedDays field already supports initial value > 0
```
