# CTO Summary

## Step
REQ-001A — Vacation Leave Balance Adjustment Specification

## Status
PASS

## Scope
Design and document a safe, auditable, rollback-friendly mechanism for HR/Admin to adjust employee vacation leave balances. This task is documentation only — no runtime code was changed, no database schema was modified, and no data was mutated.

## Files Created
- `docs/REQ_001A_VACATION_LEAVE_BALANCE_ADJUSTMENT_SPEC.md` — Full product/technical specification

## Files Modified
None.

## Existing Modules Inspected

| File | Finding |
|------|---------|
| `apps/api/prisma/schema.prisma` | `LeaveBalance`, `LeaveRequest`, `AuditLog` model definitions |
| `apps/api/src/leave-balance/leave-balance.service.ts` | PATCH already overwrites balance directly; zero audit integration |
| `apps/api/src/leave-balance/leave-balance.controller.ts` | PATCH roles: SUPER_ADMIN, HR_ADMIN |
| `apps/api/src/leave-balance/dto/update-leave-balance.dto.ts` | `entitledDays` and `usedDays` both patchable — risk |
| `apps/api/src/leave/leave.service.ts` | `AuditLogService` injected; LEAVE_APPROVED/REJECTED audited properly |
| `apps/api/src/audit-log/audit-log.types.ts` | `AuditLogEvent` interface structure |
| `apps/api/src/common/enums.ts` | `LeaveType`, `UserRole` runtime-safe enums |
| `apps/web/app/(app)/leave/page.tsx` | Exposes raw `entitledDays`/`usedDays` edit modal with no reason/history |
| `apps/mobile/src/hooks/useLeave.ts` | Shows balance summary cards only — no adjustment history display |
| `HR-Knowledge/07-BUSINESS-RULES/Leave Rules.md` | Leave lifecycle, approval rules, known limitations |
| `HR-Knowledge/04-DOMAINS/Leave/Leave Balance Module.md` | Module documentation |
| `docs/adr/ADR-011-leave-workflow-and-balance-integration.md` | Atomic approval/deduction design |

## Recommended Approach

**Option B — Adjustment Transaction Ledger**

Add a new immutable `LeaveAdjustment` table. Each adjustment is a delta (`+N` or `−N`) with mandatory reason, actor, and timestamp. Effective entitlement = `LeaveBalance.totalDays + SUM(adjustment.delta)`. The existing `usedDays` auto-increment on approval is completely unchanged.

## Pros / Cons Summary

| Option | Verdict | Key Reason |
|--------|---------|-----------|
| **A — Direct edit (current state)** | Replace / harden | No audit trail; silent destructive overwrite; `usedDays` override is unsafe |
| **B — Adjustment ledger** | **Recommended** | Full traceability; rollback via compensating entry; non-destructive; additive migration only |
| **C — Annual policy** | Defer to v3+ | Over-engineered for individual corrections; high scope risk |

## Key Finding

`PATCH /leave-balances/:id` already implements direct balance overwrite (Option A) and is **completely unaudited**. HR can silently change any employee's vacation balance with no actor record, no reason, and no rollback trail. This is the primary production data-integrity risk this requirement addresses. By contrast, `leave.service.ts` already uses `AuditLogService` for every approval/rejection event — leave balance adjustments should receive the same treatment.

## Open Questions

| # | Question |
|---|----------|
| Q1 | Should adjustment scope cover VACATION only, or also SICK and PERSONAL? |
| Q2 | Should HR_ADMIN create adjustments, or SUPER_ADMIN only? |
| Q3 | Should there be a maximum single-adjustment delta cap? |
| Q4 | Should adjustment history be visible to employees in STEP Connect (v2)? |
| Q5 | Should the employee receive a notification when their balance is adjusted? |
| Q6 | Should `usedDays` override in existing PATCH be removed at same deploy as Option B? |
| Q7 | Should MANAGER see adjustment history read-only for their department? |
| Q8 | Should adjustments be soft-deletable or always permanent (immutable ledger)? |

## Verification Performed

```
git status --short   → (empty — no uncommitted changes)
git diff --check     → (empty — no conflicts or whitespace errors)
git diff --stat      → (empty — no staged changes)
```

Source code inspection: read-only.
Build scripts: N/A (documentation-only task; no runtime code changed).

## Explicit Statements

| Statement | Value |
|-----------|-------|
| Runtime code changed | **No** |
| Database schema changed | **No** |
| Data mutation | **No** |
| Prisma migration generated | **No** |
| Git operations performed | **No** |

## Issues Found

None. The working tree was clean throughout. No runtime errors encountered (no code executed).

## Risk

Low — This task produces documentation only. Implementation risk (new migration, endpoint changes) is assessed as Low in the spec and will be evaluated when a follow-up implementation task is approved.

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | No endpoints added or changed in this task |
| RBAC impact | Spec proposes SUPER_ADMIN + HR_ADMIN for adjustment creation; MANAGER excluded (documented and justified) |
| Data privacy impact | No new PII exposure; reason field guidance included in spec (Section 12) |
| Password/token/hash impact | None |
| Mobile security impact | None — mobile displays balance summary only; no adjustment creation in scope |
| Dependency/advisory impact | No new packages added |
| Secrets/logging check | No secrets or tokens in this document |
| New endpoints protected | N/A (spec only — no endpoints created) |
| Risk level | **LOW** |
| Security decision | **PASS** |

## Decision
PASS

## Next Step
Stakeholder review and approval of `REQ_001A_VACATION_LEAVE_BALANCE_ADJUSTMENT_SPEC.md`. Upon approval, begin implementation with Step 1 (Prisma schema migration for `LeaveAdjustment` table).

## Recommended Commit Message
```
docs(req): add vacation leave balance adjustment spec REQ-001A

Design specification for HR/Admin vacation leave balance adjustments.
Recommends Option B (adjustment ledger) over Option A (direct overwrite)
for traceability and auditability. No runtime code changed.
```
