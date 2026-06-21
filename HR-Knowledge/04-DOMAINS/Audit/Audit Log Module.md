# Audit Log Module

## Purpose

Provides a structured, queryable audit trail for security-sensitive operations across the HR Management System. Completed through the Audit Log Pack (T-057B-1 through T-057B-7); fully operational as of `v1.1.41-admin-audit-log-ui`.

## Module Path

`apps/api/src/audit-log/`

## Database Model

```prisma
model AuditLog {
  id           String   @id @default(uuid())
  actorUserId  String?
  actorRole    String?
  action       String
  targetType   String
  targetId     String?
  targetLabel  String?
  result       String
  ipAddress    String?
  userAgent    String?
  metadata     Json?
  createdAt    DateTime @default(now())
}
```

The table is **append-only** from the application perspective.

## Read Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /audit-logs | ✅ | SUPER_ADMIN, HR_ADMIN | Paginated, filterable list; default limit 20 |
| GET | /audit-logs/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Single audit log record |

No `POST`, `PATCH`, or `DELETE` audit log endpoints exist.

### Query Parameters for `GET /audit-logs`

| Parameter | Type | Description |
|---|---|---|
| page | number | Page number (default 1) |
| limit | number | Records per page (default 20) |
| action | string | Exact match on `action` field |
| targetType | string | Exact match on `targetType` field |
| targetId | string | Exact match on `targetId` field |
| actorUserId | string | Exact match on `actorUserId` field |
| actorRole | string | Exact match on `actorRole` field |
| result | string | Exact match on `result` field (SUCCESS / FAILURE) |
| dateFrom | date string | Lower bound: `createdAt >= dateFrom` (UTC midnight) |
| dateTo | date string | Upper bound: `createdAt <= dateTo` (UTC midnight) |

Results are always ordered by `createdAt DESC`.

## Audit Events

| Action String | Trigger | Target Type |
|---|---|---|
| `AUTH_LOGIN_SUCCESS` | Successful login | `USER` |
| `AUTH_LOGIN_FAILURE` | Failed login attempt | `USER` |
| `AUTH_PASSWORD_CHANGE` | Self-service password change | `USER` |
| `EMPLOYEE_ACCOUNT_PROVISIONED` | HR provisions a login account | `EMPLOYEE` |
| `EMPLOYEE_TEMP_PASSWORD_RESET` | HR resets temporary password | `EMPLOYEE` |
| `LEAVE_APPROVED` | Leave request approved | `LEAVE_REQUEST` |
| `LEAVE_REJECTED` | Leave request rejected | `LEAVE_REQUEST` |
| `ATTENDANCE_CLOCK_IN` | Employee clocks in | `ATTENDANCE` |
| `ATTENDANCE_CLOCK_OUT` | Employee clocks out | `ATTENDANCE` |
| `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` | Admin updates geofence config | `ATTENDANCE` |
| `ATTENDANCE_GEOFENCE_REJECTED` | Mobile clock-in/out rejected by geofence | `ATTENDANCE` |

### `ATTENDANCE_GEOFENCE_REJECTED`

Current implemented shape:

- `action`: `ATTENDANCE_GEOFENCE_REJECTED`
- `targetType`: `ATTENDANCE`
- `targetId`: `null`
- `targetLabel`: `clock-in-geofence-rejected` or `clock-out-geofence-rejected`
- `result`: `REJECTED`

Metadata summary:

| Field | Value |
|---|---|
| `attemptType` | `CLOCK_IN` or `CLOCK_OUT` |
| `source` | always `mobile` |
| `reason` | `MISSING_LOCATION`, `POOR_ACCURACY`, `GEOFENCE_NOT_CONFIGURED`, or `OUTSIDE_RADIUS` |
| `hasCoordinates` | boolean |
| `hasAccuracy` | boolean |
| `accuracyBucket` | `UNKNOWN`, `ACCEPTABLE`, or `POOR` |
| `configSource` | `db` or `env` |
| `geofenceEnabled` | boolean |
| `result` | `REJECTED` |

Privacy guarantees:

- No raw latitude or longitude
- No raw numeric accuracy
- No exact distance
- No company coordinates
- No free-form attendance note
- No derived location fields

This event is emitted only for failed mobile geofence checks. Web and legacy requests are unaffected, and successful inside-radius mobile attendance does not emit this rejection event.

## Write Pattern — Best-Effort

All services that emit audit events use a `recordBestEffort` helper:

```typescript
private async recordBestEffort(event: AuditLogEvent): Promise<void> {
  try {
    await this.auditLog.record(event);
  } catch {
    // audit failures must not affect the business operation
  }
}
```

A failed audit write does not roll back or block the user-facing flow.

## Metadata Sanitizer

`audit-log.sanitizer.ts` applies a **denylist** of sensitive key names before every insert. Keys in `AUDIT_SENSITIVE_KEYS` (password, token, hash, secret, apikey, etc.) have their values replaced with `'[REDACTED]'`; all other keys are stored as-is.

GPS-related defense-in-depth denylist entries now include:

- `latitude`
- `longitude`
- `accuracy`
- `distance`

`accuracyBucket` remains preserved because sanitizer matching is exact-key based rather than prefix based.

**Never stored in metadata:**
- passwords (plain, hashed, or temporary)
- JWT/access/refresh tokens
- `Authorization` header values
- secrets or API keys
- raw GPS latitude, longitude, or accuracy (excluded by caller, not sanitizer)
- free-form leave rejection reason text (excluded by caller)
- free-form attendance notes (excluded by caller)

## RBAC

| Role | `GET /audit-logs` | `GET /audit-logs/:id` |
|---|---|---|
| SUPER_ADMIN | ✅ | ✅ |
| HR_ADMIN | ✅ | ✅ |
| MANAGER | ❌ 403 | ❌ 403 |
| EMPLOYEE | ❌ 403 | ❌ 403 |

## Module Dependency Rule

`AuditLogModule` imports only `PrismaModule`. It must **not** import `AuthModule`. `AuthModule` depends on `AuditLogModule`; importing in the reverse direction creates a circular dependency that causes NestJS boot failure (confirmed in T-057B-6).

## Admin Web UI

Route: `apps/web/app/(app)/audit-logs/page.tsx`

- Visible in nav for SUPER_ADMIN / HR_ADMIN only
- Filter panel: action, targetType, actorRole (select), result (select), actorUserId, targetId, dateFrom, dateTo — Apply/Reset form pattern
- Table columns: timestamp, action, result (badge), actorRole, targetType, target (targetLabel ?? targetId), actorUserId, IP, Detail button
- Detail modal: shows all fields including `metadata` rendered as formatted JSON; modal only — metadata never in table
- Playwright e2e tests: `apps/web/e2e/audit-logs.spec.ts` (7 tests)
- UI role gating is UX-only; backend RBAC is authoritative

## Known Limitations

| # | Limitation |
|---|---|
| 1 | `dateTo` filter uses midnight UTC boundary; records after 00:00 UTC on `dateTo` may be excluded |
| 2 | No audit export or download |
| 3 | No retention or cleanup policy |
| 4 | No anomaly detection or alerting |
| 5 | `actorUserId` displayed as UUID; no inline actor name/email expansion in UI |
| 6 | Best-effort writes may lose records under extreme failure conditions |

## Related ADRs

- [[ADR-019 Audit Trail and Admin Review]]
- [[ADR-021 Failed Geofence Attempt Audit]]
- [[ADR-006 RBAC]]
- [[ADR-013 Identity and Account Lifecycle]]

## Related Notes

- [[Auth Module]]
- [[API Route Index]]
- [[RBAC Rules]]

#domain #audit-log #security #backend #web-admin #rag-ready
