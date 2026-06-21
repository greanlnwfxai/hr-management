# ADR-019: Audit Trail and Admin Audit Log Review

## Status
Accepted

## Date
2026-06-21

## Supersedes
ADR-018 (Audit Log Foundation Specification Status) — that ADR documented the specification-only state prior to implementation. All audit log work is now implemented and deployed through `v1.1.41-admin-audit-log-ui`.

## Context

The HR Management System handles security-sensitive operations: login events, HR account provisioning, temporary password resets, leave approval/rejection, and attendance clock-in/out. Stakeholders require post-incident traceability, compliance auditability, and visibility into these events without impacting the reliability or performance of primary business flows.

The Audit Log Pack (T-057B-1 through T-057B-7) implemented a full end-to-end audit capability:

| Task | Stable Tag | Scope |
|---|---|---|
| T-057B-1 | `v1.1.34-audit-log-foundation` | AuditLog Prisma model, migration, AuditLogService, metadata sanitizer, tests |
| T-057B-2 | `v1.1.35-auth-audit-events` | Auth audit events: login success/failure, password change |
| T-057B-3 | `v1.1.36-employee-account-audit-events` | Employee account provisioned, temp password reset |
| T-057B-4 | `v1.1.37-leave-audit-events` | Leave approved, leave rejected |
| T-058A | `v1.1.38-sandbox-attendance-seed` | Sandbox attendance seed data for mobile testing |
| T-057B-5 | `v1.1.39-attendance-clock-audit-events` | Attendance clock-in and clock-out audit events |
| T-057B-6 | `v1.1.40-audit-log-read-api` | Read API: `GET /audit-logs`, `GET /audit-logs/:id`; RBAC enforcement |
| T-057B-7 | `v1.1.41-admin-audit-log-ui` | Admin web UI at `/audit-logs`; Playwright e2e tests |

## Decision

### 1. Append-only audit log

The `AuditLog` table is append-only from the application perspective. No `PATCH`, `PUT`, or `DELETE` endpoints exist for audit log records. Records are created by `AuditLogService.record()` and can only be read via the RBAC-restricted admin API.

### 2. Best-effort audit writes: awaited inside a caught exception block

Audit writes must not block or break the primary user-facing business flow. Every service that writes an audit event wraps the call in a private `recordBestEffort` method:

```typescript
private async recordBestEffort(event: AuditLogEvent): Promise<void> {
  try {
    await this.auditLog.record(event);
  } catch {
    // best-effort: audit failures must not affect [business] behavior
  }
}
```

The call is `await`-ed (so it does not run unobserved), but the exception is caught and silently discarded. If an audit write fails, the business operation is not rolled back.

### 3. Metadata denylist: sensitive keys are redacted

All event metadata passes through `audit-log.sanitizer.ts` before storage. The sanitizer uses a **denylist** approach: keys named in `AUDIT_SENSITIVE_KEYS` have their values replaced with `'[REDACTED]'`; all other keys are stored as-is. The sensitive key set covers:

```
password, currentpassword, newpassword, confirmpassword, passwordhash, hash,
token, accesstoken, refreshtoken, authorization, temporarypassword, temppassword,
secret, apikey
```

Raw GPS coordinates (latitude, longitude, accuracy) and free-form text fields (leave rejection reasons, attendance notes) are excluded by callers **not including them in the metadata payload**, not by the denylist.

### 4. Read API restricted to SUPER_ADMIN and HR_ADMIN

`GET /audit-logs` and `GET /audit-logs/:id` are protected by `JwtAuthGuard` + `RolesGuard(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)`. MANAGER and EMPLOYEE roles receive HTTP 403.

### 5. Admin UI is read-only

The Next.js web route `/audit-logs` renders a paginated, filterable table with a detail modal. No write, update, or delete operations are exposed. The detail modal populates from selected row data in the list response; it does not call `GET /audit-logs/:id` separately (all fields including `metadata` are present in the list response).

### 6. UI role gating is UX-only; backend RBAC is authoritative

The `AppLayout` nav item for Audit Logs is only rendered for `SUPER_ADMIN`/`HR_ADMIN`. The page-level component renders `ErrorState 403` for other roles. These are frontend UX gates only — the backend RBAC is the authoritative enforcement.

### 7. AuditLogModule must not import AuthModule (circular dependency)

`AuthModule` imports `AuditLogModule` to record auth events. `AuditLogModule` must not import `AuthModule` in return. This circular dependency was encountered in T-057B-6: the import caused a NestJS boot failure. Resolution: remove the `AuthModule` import from `AuditLogModule`. `AuditLogModule` must depend only on `PrismaModule`.

## Audit Events Covered

| Action String | Trigger |
|---|---|
| `AUTH_LOGIN_SUCCESS` | `POST /auth/login` — valid credentials |
| `AUTH_LOGIN_FAILURE` | `POST /auth/login` — invalid credentials |
| `AUTH_PASSWORD_CHANGE` | `POST /auth/change-password` |
| `EMPLOYEE_ACCOUNT_PROVISIONED` | `POST /employees/:id/account` |
| `EMPLOYEE_TEMP_PASSWORD_RESET` | `POST /employees/:id/account/reset-password` |
| `LEAVE_APPROVED` | `PATCH /leave/:id/approve` |
| `LEAVE_REJECTED` | `PATCH /leave/:id/reject` |
| `ATTENDANCE_CLOCK_IN` | `POST /attendance/clock-in` |
| `ATTENDANCE_CLOCK_OUT` | `POST /attendance/clock-out` |

## Consequences

### Positive

- Security-relevant actions now have a structured, queryable audit trail.
- Post-incident investigation does not depend solely on application logs.
- Best-effort writes decouple audit reliability from business transaction success.
- RBAC restriction keeps audit data limited to administrators.
- Denylist sanitizer provides a clear, documented policy for sensitive-key redaction.

### Negative

- Best-effort writes may lose records if both the audit write and the exception handler fail (extreme conditions: OOM, database down).
- No audit log export or download feature.
- No retention or cleanup policy.
- No anomaly detection or alerting on audit events.
- The admin UI shows `actorUserId` as a UUID; no inline actor name or email expansion.
- The `dateTo` filter uses midnight UTC as its upper boundary (`lte: new Date(dateTo)`); records created after 00:00 UTC on the specified date may be excluded.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Transaction-bound audit writes | A failing audit write would roll back the business operation — worse for users |
| Application-log-only (no DB table) | Unstructured; no pagination, filtering, or admin review UI possible |
| Expose audit logs to MANAGER role | Audit records contain actorUserId, targetId, and metadata; admin-only minimizes blast radius |
| Allowlist metadata storage | Would require enumeration of every safe key; denylist of sensitive keys is simpler and equally protective given that callers control the payload |
| Audit export/download | Deferred; retention policy should precede export tooling |

## Process Deviation Documented

During T-057B-5, `./scripts/docker-verify.sh` was run as part of verification. This script internally invokes `docker compose down`, which the project's Docker Safety Rules restrict. This was documented as a process deviation. Future verification must not call `docker-verify.sh` unless the user explicitly approves a container restart.

## Security Notes

- `audit-log.sanitizer.ts` applies the denylist before every `INSERT`.
- No mutation endpoints exist for audit log records.
- `AuditLogModule` must not import `AuthModule` (prevents circular dependency and is unnecessary — the audit service needs only `PrismaService`).
- The `Authorization: Bearer <token>` header is attached by `apiFetch()` internally; the token value is never logged, printed to console, or rendered in the admin UI.
- Audit metadata is rendered in the detail modal only; it is never displayed in the main list table.

## Related ADRs

- ADR-005: JWT Authentication
- ADR-006: Role-Based Access Control
- ADR-013: Identity and Employee Account Lifecycle
- ADR-014: Password Change and mustChangePassword Policy
- ADR-015: Security Harness and Review Policy
- ADR-016: Agent Workflow and Docker Safety Policy
