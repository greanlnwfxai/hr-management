# ADR-019: Audit Trail and Admin Audit Log Review

**Status:** Accepted | **Date:** 2026-06-21 | **Supersedes:** [[ADR-018 Audit Log Status]]

## Decision

Implement an append-only audit trail for security-sensitive operations, with best-effort writes, a metadata denylist sanitizer, RBAC-restricted read API, and a read-only admin review UI.

## Key Points

- Audit writes use `try { await record(event); } catch { }` — awaited but errors are swallowed (best-effort); a failed audit write never blocks the business operation
- Metadata sanitizer (`audit-log.sanitizer.ts`) uses a **denylist** of sensitive keys (`password`, `token`, `hash`, `secret`, etc.) — those values become `[REDACTED]`; other keys pass through
- Raw GPS coordinates and free-form text (rejection reasons, attendance notes) are excluded by callers, not the sanitizer
- Read API (`GET /audit-logs`, `GET /audit-logs/:id`) is protected: SUPER_ADMIN/HR_ADMIN only; MANAGER/EMPLOYEE get 403
- No `POST`/`PATCH`/`DELETE` audit endpoints exist
- Admin web UI at `/audit-logs` is read-only; detail modal uses row data — does not call `GET /audit-logs/:id` separately
- `AuditLogModule` must not import `AuthModule` — circular dependency; fix confirmed in T-057B-6

## Audit Events

`AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_PASSWORD_CHANGE`, `EMPLOYEE_ACCOUNT_PROVISIONED`, `EMPLOYEE_TEMP_PASSWORD_RESET`, `LEAVE_APPROVED`, `LEAVE_REJECTED`, `ATTENDANCE_CLOCK_IN`, `ATTENDANCE_CLOCK_OUT`

## Source

`docs/adr/ADR-019-audit-trail-and-admin-review.md`

#adr #audit-log #security #rbac
