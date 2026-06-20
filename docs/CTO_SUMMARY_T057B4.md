# CTO Summary

## Task
T-057B-4 — Audit Log Leave Approve/Reject Integration

## Status
PASS

## Scope Completed
- `LEAVE_APPROVED` recorded after the approval `$transaction` commits successfully (balance deduction + status update both succeed)
- `LEAVE_REJECTED` recorded after the rejection update succeeds
- Minimal request context (IP address, User-Agent) extracted from `@Req()` and passed from controller to service
- Actor context (actorUserId, actorRole) extracted from JWT-authenticated `@CurrentUser()` and passed to service
- `AuditLogModule` imported into `LeaveModule` for DI
- All audit writes are best-effort (`try/catch`) — leave approve/reject behavior never exposes audit failures
- 16 new audit-specific unit tests added in `leave.service.spec.ts`
- 2 existing controller delegation tests updated with 4th context argument in `leave.controller.spec.ts`
- No new Prisma migration required

## Files Changed

### Modified
- `apps/api/src/leave/leave.module.ts` — added `AuditLogModule` import
- `apps/api/src/leave/leave.service.ts` — exported `LeaveAuditContext` interface; imported `AuditLogService` and `AuditLogEvent`; injected `AuditLogService` in constructor; extended `approve()` and `reject()` with optional `ctx?` parameter; restructured `approve()` from `return this.prisma.$transaction(...)` to `const result = await this.prisma.$transaction(...); await recordBestEffort(...); return result;`; renamed `_dto` to `dto` in `reject()` to read `dto.rejectReason` for `hasRejectionReason`; added `recordBestEffort()` private helper
- `apps/api/src/leave/leave.controller.ts` — added `Req` to `@nestjs/common` imports; added `import type { Request } from 'express'`; extended `approve()` and `reject()` with `@CurrentUser() user: { id: string; role: string }` and `@Req() req: Request`; passed audit context to service
- `apps/api/src/leave/leave.service.spec.ts` — imported `AuditLogService`; added `mockAuditLog` to `beforeEach` setup and providers; added 16 new audit tests in two new `describe` blocks
- `apps/api/src/leave/leave.controller.spec.ts` — updated `approve` and `reject` delegation assertions to include 4th context argument

## Leave Events Added

| Action | Trigger | actorUserId | result |
|---|---|---|---|
| `LEAVE_APPROVED` | `$transaction` (balance deduction + approval) commits | JWT-authenticated admin/HR/manager id | `SUCCESS` |
| `LEAVE_REJECTED` | `leaveRequest.update` with `status: REJECTED` succeeds | JWT-authenticated admin/HR/manager id | `SUCCESS` |

### LEAVE_APPROVED payload
- `actorUserId`: authenticated approver user id from JWT
- `actorRole`: authenticated approver role from JWT
- `action`: `LEAVE_APPROVED`
- `targetType`: `LEAVE_REQUEST`
- `targetId`: leave request id
- `targetLabel`: leave request id
- `result`: `SUCCESS`
- `ipAddress`: from request if available
- `userAgent`: from request if available
- `metadata`: `{ leaveRequestId, employeeId, leaveType, startDate, endDate, totalDays, status: 'APPROVED' }`

### LEAVE_REJECTED payload
- `actorUserId`: authenticated approver user id from JWT
- `actorRole`: authenticated approver role from JWT
- `action`: `LEAVE_REJECTED`
- `targetType`: `LEAVE_REQUEST`
- `targetId`: leave request id
- `targetLabel`: leave request id
- `result`: `SUCCESS`
- `ipAddress`: from request if available
- `userAgent`: from request if available
- `metadata`: `{ leaveRequestId, employeeId, leaveType, startDate, endDate, totalDays, status: 'REJECTED', hasRejectionReason: boolean }`

## Metadata / Privacy Rules

- `reason` (employee's personal leave reason) — **never** included in audit metadata; `LEAVE_SELECT` includes this field on the result object but metadata is explicitly constructed, not spread from `record` or `result`
- `rejectReason` (free-form rejection reason, accepted by DTO but not persisted) — **never** stored; only the boolean `hasRejectionReason: !!dto.rejectReason` is recorded
- `record` from `findUnique({ where: { id } })` without select/include has no `employee` relation — `targetLabel` is set to `record.id` to avoid runtime `undefined` errors
- Metadata sanitizer in `AuditLogService` (`sanitizeMetadata`) provides a second layer of defence; `reason` is not in `AUDIT_SENSITIVE_KEYS`, making explicit exclusion the critical control here
- Audit occurs only after the DB operation succeeds — failed approvals/rejections are not audited (known limitation; out of scope for this task)

## Tests Added or Updated

### New (leave.service.spec.ts) — 16 tests

**audit: approve (8 tests):**
- `records LEAVE_APPROVED after successful approval`
- `sets actorUserId and actorRole from context on LEAVE_APPROVED`
- `sets targetType to LEAVE_REQUEST on LEAVE_APPROVED`
- `sets targetId to leave request id on LEAVE_APPROVED`
- `sets result to SUCCESS on LEAVE_APPROVED`
- `metadata contains safe scalar fields only — no reason field`
- `metadata does not contain the employee leave reason value even if reason is on the record`
- `still approves when audit write fails (best-effort)`

**audit: reject (8 tests):**
- `records LEAVE_REJECTED after successful rejection`
- `sets actorUserId and actorRole from context on LEAVE_REJECTED`
- `sets targetType to LEAVE_REQUEST on LEAVE_REJECTED`
- `sets targetId to leave request id on LEAVE_REJECTED`
- `sets result to SUCCESS on LEAVE_REJECTED`
- `metadata uses hasRejectionReason boolean instead of raw rejection reason`
- `metadata does not contain raw rejection reason string value`
- `still rejects when audit write fails (best-effort)`

### Updated (leave.controller.spec.ts) — 2 tests
- `approve delegates to service with id, user.id, dto, and audit context` (assertion extended to 4-arg)
- `reject delegates to service with id, user.id, dto, and audit context` (assertion extended to 4-arg)

### Unchanged (all pre-existing tests still pass)
- All 22 existing `leave.service.spec.ts` tests pass without modification (optional `ctx?` parameter ensures backward compatibility)
- All 4 non-updated `leave.controller.spec.ts` tests pass without modification
- All 259 prior tests (auth + audit-log + employees + leave) pass without modification

## Verification Results

```
=== git status --short ===
 M apps/api/src/leave/leave.controller.spec.ts
 M apps/api/src/leave/leave.controller.ts
 M apps/api/src/leave/leave.module.ts
 M apps/api/src/leave/leave.service.spec.ts
 M apps/api/src/leave/leave.service.ts

=== git diff --check ===
(clean)

=== prisma validate ===
Note: --schema flag used with apps/api/prisma/schema.prisma (full path from repo root)
— same intentional deviation as T-057B-1/B-2/B-3; relative path fails under npm --prefix.
The schema at apps/api/prisma/schema.prisma is valid 🚀

=== api tests ===
Test Suites: 18 passed, 18 total
Tests:       275 passed, 275 total

=== project verify ===
[PASS] API build
[PASS] Prisma schema valid
[PASS] Web build
[PASS] ALL CHECKS PASSED

=== secret scan ===
[PASS] Secret scan completed — no findings

=== security review ===
[PASS] SECURITY REVIEW PASSED — automated checks clear
(Multer and xmldom/node-tar accepted-risk advisories pre-existing — not introduced by this task)
```

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | `PATCH /leave/:id/approve` and `PATCH /leave/:id/reject` — both endpoints already guarded by `JwtAuthGuard + RolesGuard(SUPER_ADMIN, HR_ADMIN, MANAGER)`; no guard changes made |
| RBAC impact | None — no role checks added or changed; existing `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` guards preserved on both endpoints |
| Data privacy impact | Audit records written internally only; no new read endpoints; `reason` (employee leave reason) explicitly excluded from metadata; `rejectReason` stored only as boolean flag `hasRejectionReason`; privacy enforced by explicit construction, not sanitizer reliance |
| Password/token/hash impact | None — no password, token, or hash fields touched |
| Mobile security impact | None — no mobile-specific code touched |
| Dependency/advisory impact | No new packages added; pre-existing accepted-risk advisories unchanged |
| Secrets/logging check | Secret scan PASS; `recordBestEffort` catch block is empty — no logging of audit errors that could leak context |
| New endpoints protected | No new endpoints created |
| Risk level | LOW |
| Security decision | PASS |

**Privacy design note:** `record` (from `findUnique` without select) carries `reason` as a scalar field. The audit metadata is explicitly constructed with an allowlist — never spread from `record` or `result`. A dedicated test asserts that the string value of `reason: 'Unwell'` does not appear in any metadata value. A second test asserts that `metadata.rejectReason` does not exist and `'sensitive text'` does not appear in metadata values when `dto.rejectReason` is passed.

**Transaction ordering note:** The audit write happens after `$transaction` resolves. If the transaction fails (throws), the audit is never called. If the audit fails, the already-committed transaction result is still returned to the caller. This is the correct best-effort ordering.

## Docker Safety Compliance

- `docker compose down` — NOT run
- `docker compose down -v` — NOT run
- No volumes removed
- No containers stopped, removed, or reset
- No Prisma reset or DB reset
- No new migration required; schema unchanged in this task

## Out-of-Scope Confirmed

- No attendance integration
- No re-integration of employee account lifecycle
- No auth changes
- No `GET /audit-logs` or `GET /audit-logs/:id` endpoint
- No audit controller
- No Web or Mobile UI changes
- No new Prisma migration
- No leave balance rule changes
- No RBAC changes
- No package.json or lockfile changes

## Risks / Limitations

**Failed approve/reject is not audited (known limitation).** `NotFoundException`, `BadRequestException`, and `ConflictException` thrown before or inside the transaction are not recorded. A future task can add failure-event auditing if needed.

**IP address reliability.** `req.ip` reflects what Express reports. Production deployment should configure `trust proxy` for correct `X-Forwarded-For` handling.

**`import type { Request }` constraint.** TypeScript `isolatedModules` + `emitDecoratorMetadata` requires `import type` for `Request` when used in a decorated controller method signature. Same pattern as T-057B-2 and T-057B-3.

## Overall Decision

PASS

## Recommended Commit Message

```
feat(audit): record leave approval audit events

- Record LEAVE_APPROVED after the approval transaction commits (balance
  deduction + status update), with actorUserId, actorRole, leaveRequestId,
  employeeId, leaveType, startDate, endDate, totalDays — reason excluded
- Record LEAVE_REJECTED after rejection update succeeds; rejectReason stored
  only as hasRejectionReason boolean, never as raw text
- Pass actor context (id, role) from @CurrentUser() and request context
  (ipAddress, userAgent) from @Req() through controller to service
- All audit writes are best-effort; approve/reject behavior unaffected by
  audit failure
- 16 new audit-specific unit tests; 2 updated controller delegation tests
```

## Next Recommended Task

**T-057B-5 — Audit Log Auth Events** or **T-058 — Audit Log Read/Query Endpoint**

Options:
- Wire `AuditLogService.record()` into auth login for `LOGIN_SUCCESS` / `LOGIN_FAILURE` events
- Implement `GET /audit-logs` with pagination and filter support for authorized admin queries
