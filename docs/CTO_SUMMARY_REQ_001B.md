# CTO Summary

## Step
REQ-001B — Vacation Leave Adjustment Ledger Implementation

## Status
PASS

## Scope
Implement the approved Option B (adjustment transaction ledger) from REQ-001A. Adds an immutable `LeaveAdjustment` table, new API endpoints for SUPER_ADMIN/HR_ADMIN to create/list vacation balance adjustments, hardening of `PATCH /leave-balances/:id` for VACATION type, audit logging of every adjustment, leave approval check updated to use effective entitlement, and Admin Web UI with adjustment modal + history panel.

## Files Created

| File | Description |
|------|-------------|
| `apps/api/prisma/migrations/20260627151952_add_leave_adjustment_ledger/migration.sql` | Prisma migration — creates `leave_adjustments` table |
| `apps/api/src/leave-adjustment/dto/create-leave-adjustment.dto.ts` | DTO: deltaDays (Float, non-zero), reason (min 5 chars) |
| `apps/api/src/leave-adjustment/dto/query-leave-adjustment.dto.ts` | DTO: page/limit for adjustment list |
| `apps/api/src/leave-adjustment/leave-adjustment.service.ts` | Service: create + findAll + best-effort audit logging |
| `apps/api/src/leave-adjustment/leave-adjustment.controller.ts` | Controller: POST + GET at `/leave-balances/:id/adjustments` |
| `apps/api/src/leave-adjustment/leave-adjustment.module.ts` | Module: imports AuditLogModule + AuthModule |
| `apps/api/src/leave-adjustment/leave-adjustment.service.spec.ts` | Service unit tests (13 cases) |
| `apps/api/src/leave-adjustment/leave-adjustment.controller.spec.ts` | Controller unit tests (2 cases) |
| `docs/CTO_SUMMARY_REQ_001B.md` | This document |

## Files Modified

| File | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Added `LeaveAdjustment` model; added `adjustments` relation to `LeaveBalance`; added `leaveAdjustments` back-relation to `Employee` |
| `apps/api/src/app.module.ts` | Imported `LeaveAdjustmentModule` |
| `apps/api/src/leave-balance/leave-balance.service.ts` | `withRemaining` extended with `adjustmentDays` + `effectiveTotalDays`; `findAll` batches adjustment sums via `groupBy`; `findOne` aggregates per-balance; `update` blocks VACATION overwrite |
| `apps/api/src/leave-balance/leave-balance.service.spec.ts` | Updated for new response fields; added VACATION-hardening tests |
| `apps/api/src/leave/leave.service.ts` | Approval check now uses effective entitlement (totalDays + adjustmentSum) |
| `apps/api/src/test-utils/prisma.mock.ts` | Added `leaveAdjustment` mock with safe defaults |
| `apps/web/lib/api.ts` | Added `LeaveAdjustment` type; extended `LeaveBalance` type; added `createLeaveAdjustment` + `getLeaveAdjustments` |
| `apps/web/app/(app)/leave/page.tsx` | Added Adjust modal for VACATION; Adjustment + Effective columns; history panel; live preview |

## Database / Schema Changes

New table `leave_adjustments`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (UUID) | PK |
| `leaveBalanceId` | TEXT (FK → `leave_balances.id`) | Index |
| `deltaDays` | DOUBLE PRECISION | Signed float (supports half-days e.g. -0.5) |
| `reason` | TEXT | Mandatory |
| `actorUserId` | TEXT | The JWT user who created the adjustment |
| `adjustedById` | TEXT? (FK → `employees.id`) | Actor's employee record (nullable) |
| `createdAt` | TIMESTAMP | Immutable — no update/delete endpoints |

Indexes: `leaveBalanceId`, `createdAt`, `actorUserId`.

`LeaveBalance.totalDays` is never mutated by adjustments — it retains the original quota. Effective entitlement = `totalDays + SUM(deltaDays)`.

Migration name: `20260627151952_add_leave_adjustment_ledger`

## API Changes

### New endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/leave-balances/:id/adjustments` | SUPER_ADMIN, HR_ADMIN | Create vacation balance adjustment |
| `GET` | `/leave-balances/:id/adjustments` | SUPER_ADMIN, HR_ADMIN | List adjustment history (paginated) |

### POST /leave-balances/:id/adjustments

Validation:
- Balance must exist → 404 otherwise
- `leaveType` must be VACATION → 400 otherwise
- `deltaDays` must be non-zero float → DTO validation
- `reason` must be trimmed, min 5 chars → DTO validation
- `effectiveRemainingDays = (totalDays + currentAdjSum + deltaDays) - usedDays` must be ≥ 0 → 422 otherwise

Response (201): adjustment record + `effectiveTotalDays` + `effectiveRemainingDays`

### Hardened PATCH /leave-balances/:id

For VACATION type: if `entitledDays` or `usedDays` is provided → 400 with message instructing caller to use adjustment endpoint.
For non-VACATION: existing behavior preserved (entitledDays + usedDays patchable).

### Updated balance response shape

`GET /leave-balances`, `GET /leave-balances/:id`, `GET /leave-balances/my` now return:

```json
{
  "totalDays": 10,
  "adjustmentDays": 2,
  "effectiveTotalDays": 12,
  "usedDays": 3,
  "remainingDays": 9
}
```

Backward-compatible — `adjustmentDays` and `effectiveTotalDays` are additive fields. When no adjustments exist, `adjustmentDays = 0` and `effectiveTotalDays = totalDays`.

### Updated leave approval check

`leave.service.ts:approve()` now computes effective remaining:
```
effectiveTotal = balance.totalDays + SUM(leaveAdjustment.deltaDays)
remaining = effectiveTotal - balance.usedDays
```
The atomic `usedDays` increment on approval is unchanged.

## Admin Web Changes

- **Balance table**: Added "Adjustment" and "Effective" columns. VACATION rows show colored `+N` / `−N` adjustment badge.
- **Action buttons**: VACATION rows show blue "Adjust" button; non-VACATION rows keep "Edit" button.
- **Adjust Modal**: Signed delta input (step 0.5), required reason field, live preview of new effective total + remaining (with red indicator if negative), adjustment history list at bottom.
- **Balance cards** (all users): Shows `effectiveTotalDays` instead of `totalDays` as denominator.
- **MANAGER + EMPLOYEE**: Never see adjustment controls (`isAdmin()` guard on all adjustment UI).

## Audit Behavior

Event `LEAVE_BALANCE_ADJUSTED` fired on successful POST:

```json
{
  "action": "LEAVE_BALANCE_ADJUSTED",
  "targetType": "LEAVE_BALANCE",
  "targetId": "<leaveBalanceId>",
  "result": "SUCCESS",
  "actorUserId": "<jwt-user-id>",
  "actorRole": "HR_ADMIN",
  "ipAddress": "<request-ip>",
  "metadata": {
    "leaveBalanceId": "...",
    "employeeId": "...",
    "leaveType": "VACATION",
    "year": 2026,
    "deltaDays": -2,
    "reason": "Correcting data entry error",
    "previousEffectiveTotalDays": 10,
    "newEffectiveTotalDays": 8,
    "previousRemainingDays": 7,
    "newRemainingDays": 5
  }
}
```

No sensitive fields stored. Best-effort pattern (audit failure never blocks adjustment).

## RBAC Behavior

| Action | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|--------|-------------|----------|---------|----------|
| Create adjustment (POST) | ✅ | ✅ | ❌ 403 | ❌ 403 |
| List adjustments (GET) | ✅ | ✅ | ❌ 403 | ❌ 403 |
| PATCH VACATION balance | ❌ 400 | ❌ 400 | ❌ 403 | ❌ 403 |
| PATCH non-VACATION | ✅ | ✅ | ❌ 403 | ❌ 403 |
| View Adjust button (Web) | ✅ | ✅ | ❌ | ❌ |

## Tests Added / Updated

### Updated
- `leave-balance.service.spec.ts`: updated `create`/`findAll`/`findMy`/`findOne` for new response fields; added 2 new `update` tests for VACATION block behavior (total: existing 220 → updated + 2 new)

### New
- `leave-adjustment.service.spec.ts`: 15 test cases — SUPER_ADMIN/HR_ADMIN create, non-vacation rejection, DTO `deltaDays=0` validation, DTO whitespace-only reason rejection, DTO short-after-trim reason rejection, negative-remaining 422, NotFoundException, reason trim, audit log call, cumulative adjustment edge case, findAll, findAll 404
- `leave-adjustment.controller.spec.ts`: 4 test cases — create/findAll delegation + RBAC metadata assertions for both handlers (Reflect.getMetadata confirms exact role sets; MANAGER and EMPLOYEE excluded from both handlers)
- `leave.service.spec.ts`: 1 new case — positive adjustment makes otherwise-insufficient vacation balance approvable

Total backend tests: **385 passing** (up from 350)

## Verification Performed

```
npx jest                     → 385 passed, 0 failed
./scripts/verify.sh          → PASS (API build + prisma validate + web build)
./scripts/security-review.sh → PASS (automated checks clear)
git diff --check             → clean (no whitespace errors)
```

`./scripts/docker-verify.sh` and `./scripts/api-smoke-test.sh` require Docker (full-stack) which is not requested in this task's scope per CLAUDE.md rules. Docker was started only for the Prisma migration (`docker compose up -d db`), then left running for the user to manage.

## Issues Found

One defect discovered and fixed during post-implementation review:

**DTO reason trim-before-validate bug** — `@IsNotEmpty` and `@MinLength(5)` on `reason` ran before trimming, so `"     "` (5 spaces) passed validation but was stored as `""` in the audit ledger. Fixed by adding `@Transform(({value}) => value.trim())` before the validators in `CreateLeaveAdjustmentDto`. Three new DTO-level tests now cover: `deltaDays=0`, whitespace-only reason, and short-after-trim reason.

One access-control gap discovered and fixed:

**GET /adjustments too open** — the endpoint initially had only `JwtAuthGuard` (any authenticated user could read any balance's adjustment history). Restricted to `SUPER_ADMIN, HR_ADMIN` via `@Roles`. MANAGER is excluded because adjustment history contains sensitive HR audit data (deltaDays, reason, actor, balance state) and MANAGER team-scoping is not yet fixed (HOTFIX-T089A paused). EMPLOYEE access is excluded in v1 (consistent with STEP Connect exclusion stated in spec).

Both fixes covered by new tests (Reflect.getMetadata assertions on both handlers).

## Explicit Statements

| Statement | Value |
|-----------|-------|
| Runtime code changed | **Yes** |
| Database schema changed | **Yes** (additive — new `leave_adjustments` table only) |
| Data mutation | **No** (migration creates table only, no row inserts) |
| Prisma migration generated | **Yes** — `20260627151952_add_leave_adjustment_ledger` |
| Docker destructive commands run | **No** |
| Git operations performed | **No** |
| `docker compose down` / volume removal | **No** |

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | Two new endpoints added; both guarded by `JwtAuthGuard` + `RolesGuard` |
| RBAC impact | POST restricted to SUPER_ADMIN + HR_ADMIN via `@Roles` decorator; MANAGER and EMPLOYEE receive 403 |
| Data privacy impact | Adjustment reason stored as plain text; no PII fields required beyond actor name for `adjustedBy`; GET history restricted to SUPER_ADMIN/HR_ADMIN only — MANAGER and EMPLOYEE cannot read adjustment audit trails. Manager team-scoped read access deferred to post-HOTFIX-T089A scope fix. |
| Password/token/hash impact | None |
| Mobile security impact | None — mobile app unchanged; adjustment endpoints not exposed to STEP Connect in v1 |
| Dependency/advisory impact | No new packages added |
| Secrets/logging check | `actorUserId` (UUID) captured in audit; no passwords/tokens in audit metadata |
| New endpoints protected | `POST /leave-balances/:id/adjustments` — JwtAuthGuard + RolesGuard (SUPER_ADMIN, HR_ADMIN); `GET /leave-balances/:id/adjustments` — JwtAuthGuard + RolesGuard (SUPER_ADMIN, HR_ADMIN) |
| Risk level | **LOW** — additive migration, no existing data touched, approval flow atomic behavior preserved |
| Security decision | **PASS** |

## Risk
Low — New table is purely additive. Existing leave balance and request rows are untouched. The approval flow `usedDays` atomic increment is unchanged. The VACATION PATCH hardening only adds a 400 guard; existing non-vacation behavior is fully preserved.

## Decision
PASS

## Next Step
User git commit + tag. HOTFIX-T089A and HOTFIX-T089B can resume from their paused state.

## Recommended Commit Message
```
feat(leave): add vacation balance adjustment ledger

Implements REQ-001B — Option B adjustment transaction ledger:
- New LeaveAdjustment model/table (immutable, Float deltaDays)
- POST /leave-balances/:id/adjustments (SUPER_ADMIN + HR_ADMIN)
- GET /leave-balances/:id/adjustments (SUPER_ADMIN + HR_ADMIN only)
- VACATION PATCH /leave-balances/:id hardened to reject direct overwrite
- Leave approval check updated to use effective entitlement
- Audit event LEAVE_BALANCE_ADJUSTED on every adjustment
- Admin Web: Adjust modal + history panel + Effective/Adjustment columns
- Fix: DTO reason trimmed before validation (empty-after-trim rejected)
- 385 backend tests passing
```
