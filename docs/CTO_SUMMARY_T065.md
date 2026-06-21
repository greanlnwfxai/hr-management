# CTO Summary

## Task
T-065 — Failed Geofence Attempt Audit Implementation

## Status
PASS

## Scope
Backend-only. Privacy-safe audit logging for rejected mobile geofence attendance attempts. No schema changes, no migrations, no frontend changes, no new API routes.

## Files Created
- `docs/CTO_SUMMARY_T065.md` (this file)

## Files Modified
- `apps/api/src/audit-log/audit-log.types.ts`
- `apps/api/src/attendance/attendance.service.ts`
- `apps/api/src/attendance/attendance.service.spec.ts`
- `apps/api/src/audit-log/audit-log.service.spec.ts`

## Implementation Summary

### 1. Sanitizer denylist expansion (`audit-log.types.ts`)
Added four GPS-related keys to `AUDIT_SENSITIVE_KEYS`:
- `'latitude'`, `'longitude'`, `'accuracy'`, `'distance'`

The sanitizer already used exact case-insensitive key matching (`AUDIT_SENSITIVE_KEYS.has(key.toLowerCase())`), so `accuracyBucket` → normalized `accuracybucket` does NOT match `accuracy` — no logic change required, only the new entries.

### 2. Audit helper (`attendance.service.ts`)
Added private `recordGeofenceRejectedAuditBestEffort(args)`. It calls the existing `recordBestEffort` (which swallows errors) with a strictly typed metadata literal — no DTO spread, no GPS fields.

### 3. Geofence validation wired to emit audit events (`attendance.service.ts`)
`validateGeofence` signature extended to accept `attemptType: 'CLOCK_IN' | 'CLOCK_OUT'` and optional `AttendanceAuditContext`. Before each of the four `throw new UnprocessableEntityException(...)` calls, the helper is called with:
- Correct `reason`, `hasCoordinates`, `hasAccuracy`, `accuracyBucket` per rejection case
- `configSource` and `geofenceEnabled` from the effective config
- `actorUserId` and `actorRole` from the passed context (null-safe)

`clockIn` and `clockOut` updated to forward `attemptType` and `ctx` into `validateGeofence`.

`AttendanceModule` already imports `AuditLogModule`; no module change required.

## Event Schema Implemented

```
action:      ATTENDANCE_GEOFENCE_REJECTED
targetType:  ATTENDANCE
targetId:    null
targetLabel: clock-in-geofence-rejected | clock-out-geofence-rejected
result:      REJECTED

metadata:
  attemptType:     CLOCK_IN | CLOCK_OUT
  source:          mobile
  reason:          MISSING_LOCATION | POOR_ACCURACY | GEOFENCE_NOT_CONFIGURED | OUTSIDE_RADIUS
  hasCoordinates:  boolean
  hasAccuracy:     boolean
  accuracyBucket:  UNKNOWN | ACCEPTABLE | POOR
  configSource:    db | env
  geofenceEnabled: boolean
  result:          REJECTED
```

## Privacy Guarantees

Metadata literal in `recordGeofenceRejectedAuditBestEffort` contains only the ten allowed fields. Verified:
- No `latitude`, `longitude`, `accuracy`, `distance`, `companyLatitude`, `companyLongitude`, `note`, or any derived position field in the metadata object
- Defense-in-depth: these four keys also added to `AUDIT_SENSITIVE_KEYS` — if accidentally included in any future metadata, they are redacted before DB insert

Privacy grep matches in the diff are exclusively test DTOs (simulating mobile client input) and test assertions (confirming absence of forbidden keys) — not audit metadata construction.

## Sanitizer Change

`AUDIT_SENSITIVE_KEYS` in `audit-log.types.ts` extended with `'latitude'`, `'longitude'`, `'accuracy'`, `'distance'`. Exact-key matching already in place; `accuracyBucket` key normalizes to `accuracybucket` which does not match `accuracy` — confirmed by regression test.

## Test Coverage

### New tests in `attendance.service.spec.ts` (10 tests in `audit: geofence rejected` block)
1. Mobile clock-in missing GPS → 422 + audit event `reason: MISSING_LOCATION`, `attemptType: CLOCK_IN`, `accuracyBucket: UNKNOWN`
2. Mobile clock-in poor accuracy → 422 + audit event `reason: POOR_ACCURACY`, `accuracyBucket: POOR`
3. Mobile clock-in geofence not configured → 422 + audit event `reason: GEOFENCE_NOT_CONFIGURED`, `accuracyBucket: ACCEPTABLE`
4. Mobile clock-in outside radius → 422 + audit event `reason: OUTSIDE_RADIUS`, `accuracyBucket: ACCEPTABLE`
5. Mobile clock-out outside radius → 422 + audit event `attemptType: CLOCK_OUT`, `targetLabel: clock-out-geofence-rejected`
6. Audit write failure → 422 still returned, no uncaught exception
7. Metadata privacy: no `latitude`, `longitude`, `accuracy`, `distance`, `companyLatitude`, `companyLongitude`, `note`
8. Web source → no `ATTENDANCE_GEOFENCE_REJECTED` event emitted
9. Mobile inside radius success → no `ATTENDANCE_GEOFENCE_REJECTED` event emitted
10. `configSource` reflects effective config source (`'db'` vs `'env'`), `geofenceEnabled: true`

### New tests in `audit-log.service.spec.ts` (5 tests)
- `latitude` redacted
- `longitude` redacted
- `accuracy` redacted
- `distance` redacted
- `accuracyBucket` preserved while `accuracy` is redacted (exact-key regression)

## Verification Result

```
=== git status --short ===
 M apps/api/src/attendance/attendance.service.spec.ts
 M apps/api/src/attendance/attendance.service.ts
 M apps/api/src/audit-log/audit-log.service.spec.ts
 M apps/api/src/audit-log/audit-log.types.ts
?? docs/CTO_SUMMARY_T065.md

=== targeted tests ===
Test Suites: 3 passed, 3 total
Tests:       105 passed, 105 total

=== full API tests ===
Test Suites: 20 passed, 20 total
Tests:       351 passed, 351 total

=== verify.sh ===
[PASS] API build
[PASS] Prisma schema valid
[PASS] Web build
[PASS] ALL CHECKS PASSED

=== security-review.sh ===
[PASS] ALL DEPENDENCY AUDITS PASSED (accepted-risk entries unchanged)
[PASS] Secret scan — no findings
[PASS] SECURITY REVIEW PASSED
```

## Security Review

| Field | Value |
|---|---|
| Auth impact | No new endpoints. `validateGeofence` is called from guarded `clockIn`/`clockOut` paths only. |
| RBAC impact | No change. Rejected-attempt audit actor is the authenticated employee from JWT. |
| Data privacy impact | Privacy-safe by design. Raw GPS coordinates, exact distance, and raw accuracy values are excluded from metadata at the call site. Sanitizer denylist extended as defense-in-depth. |
| Password/token/hash impact | None. |
| Mobile security impact | No change to mobile API contract. 422 response message and status unchanged. |
| Dependency/advisory impact | No new packages. Accepted-risk advisories unchanged. |
| Secrets/logging check | No secrets, tokens, or GPS coordinates in logs or responses. |
| New endpoints protected | None added. |
| Risk level | LOW |
| Security decision | PASS |

## Docker Safety Compliance
- No `docker compose down` or `docker compose down -v` executed
- No `docker volume rm`, `docker volume prune`, or `docker system prune` executed
- No containers stopped, removed, or reset
- No `./scripts/docker-verify.sh` executed (per task instructions)

## Git Safety Compliance
- No `git add`, `git commit`, `git push`, or `git tag` executed
- All git steps to be performed manually by user

## Out-of-Scope Confirmed
- No schema changes or Prisma migrations
- No frontend/mobile UI changes
- No HR-Knowledge or ADR sync (deferred to T-066)
- No new API routes or controller changes
- No rate limiting implementation

## Risks / Limitations
- Audit log has no cleanup/retention policy. High rejection volumes generate unbounded records (known limitation, pre-existing).
- `actorUserId`/`actorRole` are null when `ctx` is not provided (matches existing success-path behavior for un-contexted calls).
- GPS spoofing is not detected; `OUTSIDE_RADIUS` fires only for coordinates that genuinely fail the radius check.

## Recommended Commit Message
```
feat(audit): log failed geofence attendance attempts
```

## Next Recommended Task
T-066 — Failed Geofence Audit Knowledge & ADR Sync
