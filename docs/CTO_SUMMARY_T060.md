# CTO Summary

## Step
T-060 — Admin UI for Company Geofence Configuration

## Status
PASS

## Scope
Add a persistent singleton geofence configuration model to the database, expose admin-only REST endpoints (`GET`/`PATCH /attendance/geofence-config`) with RBAC (SUPER_ADMIN/HR_ADMIN), update `GeofenceConfigService` to read DB-first with env-var fallback, add a safe audit event for config changes, and deliver an admin web UI page at `/attendance/geofence-settings`.

## Files Created
- `apps/api/prisma/migrations/20260621000000_add_company_geofence_config/migration.sql`
- `apps/api/src/attendance/dto/patch-geofence-config.dto.ts`
- `apps/api/src/attendance/geofence-config.service.spec.ts`
- `apps/web/app/(app)/attendance/geofence-settings/page.tsx`
- `docs/CTO_SUMMARY_T060.md`

## Files Modified
- `apps/api/prisma/schema.prisma` — Added `GeofenceConfig` singleton model
- `apps/api/src/attendance/geofence-config.service.ts` — Replaced 4 sync env getters with async `getEffectiveConfig()` (DB-first, env fallback)
- `apps/api/src/attendance/attendance.service.ts` — Updated `validateGeofence()` to use `getEffectiveConfig()`; added `getGeofenceConfig()` and `updateGeofenceConfig()` methods with safe audit event
- `apps/api/src/attendance/attendance.controller.ts` — Added `GET /attendance/geofence-config` and `PATCH /attendance/geofence-config` (declared before `:id` to avoid UUID pipe collision)
- `apps/api/src/test-utils/prisma.mock.ts` — Added `geofenceConfig.findUnique` and `geofenceConfig.upsert` mocks
- `apps/api/src/attendance/attendance.service.spec.ts` — Rewrote geofence tests to use `getEffectiveConfig` mock; added `getGeofenceConfig` and `updateGeofenceConfig` test suites
- `apps/api/src/attendance/attendance.controller.spec.ts` — Added `getGeofenceConfig` and `updateGeofenceConfig` delegation tests; added RBAC metadata assertions via `Reflect.getMetadata`
- `apps/web/lib/api.ts` — Added `GeofenceConfig` type, `getGeofenceConfig()`, `updateGeofenceConfig()`
- `apps/web/lib/i18n.ts` — Added 18 en + 18 th translation keys for geofence settings UI
- `apps/web/components/AppLayout.tsx` — Added geofence settings nav item for SUPER_ADMIN/HR_ADMIN
- `docs/ATTENDANCE_GEOFENCE_BACKEND.md` — Added T-060 DB-backed config section, updated related files table, corrected known limitations
- `docs/API_ROUTES.md` — Added `GET`/`PATCH /attendance/geofence-config` rows

## Verification Result
- `./scripts/verify.sh` → **PASS** (API build, Prisma schema validate, web build — all clean)
- `./scripts/docker-verify.sh` → **NOT RUN** (excluded per task instructions)
- `./scripts/api-smoke-test.sh` → **NOT RUN** (excluded per task instructions)
- `npm --prefix apps/api test` → **PASS** (336 tests, 20 suites)
- `./scripts/security-review.sh` → **PASS** (no secrets, no new HIGH/CRITICAL dependencies, existing accepted risks unchanged)

## Issues Found
- Existing geofence service tests used four individual sync mocks (`isEnabled`, `getCompanyLocation`, `getRadiusMeters`, `getMaxAccuracyMeters`). Collapsing to a single async `getEffectiveConfig()` required rewriting all 15+ geofence test cases — handled cleanly.
- Route ordering: `GET /attendance/geofence-config` must be declared before `GET /attendance/:id` to prevent NestJS routing the literal path segment through `ParseUUIDPipe`. Resolved by placement in controller.
- Initial test pass lacked two required coverage areas: (a) `GeofenceConfigService` DB-vs-env fallback branches had no direct tests (only mocked in callers); (b) RBAC `@Roles` metadata on new endpoints had no negative-path/decorator assertions. Both gaps resolved: new `geofence-config.service.spec.ts` (11 tests covering DB row present, env fallback, null coords, defaults) and RBAC metadata assertions added to `attendance.controller.spec.ts` using `Reflect.getMetadata(ROLES_KEY, ...)` against the prototype.

## Risk
Low

## Security Review

| Field | Finding |
|---|---|
| Auth impact | Two new endpoints added: both protected by `JwtAuthGuard` + `RolesGuard` |
| RBAC impact | `GET`/`PATCH /attendance/geofence-config` restricted to SUPER_ADMIN/HR_ADMIN via `@Roles()` decorator — authoritative backend enforcement |
| Data privacy impact | Admin-configured company coordinates are returned to authorized admins only. Employee GPS coordinates never stored, logged, or exposed at any point |
| Password/token/hash impact | None |
| Mobile security impact | Config source change (DB vs env) is transparent to mobile; mobile still only sends clock events and receives 422/200 |
| Dependency/advisory impact | No new packages added |
| Secrets/logging check | Audit event metadata contains only boolean flags and integer values — no raw coordinates (lat/lon) at any point. Company coordinates visible only in `GET /attendance/geofence-config` response to authorized admins |
| New endpoints protected | `GET /attendance/geofence-config` → JwtAuthGuard + SUPER_ADMIN/HR_ADMIN; `PATCH /attendance/geofence-config` → JwtAuthGuard + SUPER_ADMIN/HR_ADMIN |
| Risk level | LOW |
| Security decision | PASS |

## Decision
PASS

## Next Step
T-061 (or next scheduled task per project roadmap)

## Recommended Commit Message
```
feat(attendance): add admin DB-backed geofence config with web UI

- Add GeofenceConfig singleton model (Prisma migration 20260621000000)
- GeofenceConfigService now async, DB-first with env fallback
- GET/PATCH /attendance/geofence-config endpoints (SUPER_ADMIN/HR_ADMIN)
- Audit event ATTENDANCE_GEOFENCE_CONFIG_UPDATED (safe metadata, no coords)
- Admin web UI at /attendance/geofence-settings
- 336 backend tests pass (20 suites); verify.sh PASS
```
