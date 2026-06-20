# CTO Summary

## Task
T-057B-6 — Audit Log Read API + RBAC

## Status
PASS

## Scope
Implement a secure, read-only audit log query API. Adds `GET /audit-logs` (paginated + filterable) and `GET /audit-logs/:id` (single record) protected by `JwtAuthGuard + RolesGuard` with `@Roles(SUPER_ADMIN, HR_ADMIN)` at the class level. MANAGER and EMPLOYEE receive `403 Forbidden`. No schema changes, no migrations, no new packages.

## Files Created
- `apps/api/src/audit-log/dto/query-audit-log.dto.ts` — pagination (page, limit) and 8 safe string/date filter fields
- `apps/api/src/audit-log/audit-log.controller.ts` — read-only controller; `GET /audit-logs` and `GET /audit-logs/:id`
- `apps/api/src/audit-log/audit-log.controller.spec.ts` — 4 controller unit tests
- `docs/CTO_SUMMARY_T057B6.md` — this summary

## Files Modified
- `apps/api/src/audit-log/audit-log.service.ts` — added `findAll(query)` using `$transaction([findMany, count])` ordered `createdAt DESC`; added `findOne(id)` using `findUnique` with `NotFoundException` on miss
- `apps/api/src/audit-log/audit-log.module.ts` — added `AuditLogController` to `controllers`; added `AuthModule` to `imports` (required for `JwtStrategy` / `JwtAuthGuard` / `RolesGuard` resolution)
- `apps/api/src/test-utils/prisma.mock.ts` — added `findMany`, `count`, `findUnique` to the `auditLog` mock
- `apps/api/src/audit-log/audit-log.service.spec.ts` — added 15 new service tests (`findAll` × 13, `findOne` × 2)
- `docs/API_ROUTES.md` — added `## Audit Logs` section with endpoint table, query param table, and response shape

## Endpoint Summary

| Method | Path              | Auth | Roles                   | Description                              |
|--------|-------------------|------|-------------------------|------------------------------------------|
| GET    | /audit-logs       | ✅   | SUPER_ADMIN · HR_ADMIN  | Paginated, filterable audit log list     |
| GET    | /audit-logs/:id   | ✅   | SUPER_ADMIN · HR_ADMIN  | Single audit log record by UUID          |

Pagination defaults: `page=1`, `limit=20`, max `limit=100` (enforced by `@Max(100)` on the DTO).
Sort: `createdAt DESC` (hardcoded in service — not caller-configurable).

## Filter Fields (GET /audit-logs)

| Field         | Type        | Where clause                    |
|---------------|-------------|---------------------------------|
| `action`      | string      | `action = ?`                    |
| `targetType`  | string      | `targetType = ?`                |
| `targetId`    | string      | `targetId = ?`                  |
| `actorUserId` | string      | `actorUserId = ?`               |
| `actorRole`   | string      | `actorRole = ?`                 |
| `result`      | string      | `result = ?`                    |
| `dateFrom`    | ISO 8601    | `createdAt >= new Date(dateFrom)` |
| `dateTo`      | ISO 8601    | `createdAt <= new Date(dateTo)`   |

All filters are optional and additive (AND). Prisma `where` object is constructed with spread-if-present — no raw SQL.

## Test Coverage and Requirement Mapping

19 T-057B-6 requirements are covered as follows:

| # | Requirement | Layer | How covered |
|---|---|---|---|
| 1 | GET /audit-logs requires auth (401) | Config-asserted | `@UseGuards(JwtAuthGuard)` at class level; confirmed by `@Roles` Reflect metadata test (310/310). **Runtime 401/403 was NOT exercised** — live Docker stack predates this code and rebuild is blocked by the Docker safety overlay. |
| 2 | SUPER_ADMIN can query | Config-asserted | `@Roles(SUPER_ADMIN, HR_ADMIN)` at class level; RolesGuard uses `getAllAndOverride([handler, class])` confirmed by reading `roles.guard.ts` |
| 3 | HR_ADMIN can query | Config-asserted | Same — HR_ADMIN is listed in `@Roles` |
| 4 | MANAGER → 403 | Config-asserted | Same `@Roles` — MANAGER not listed → guard returns false |
| 5 | EMPLOYEE → 403 | Config-asserted | Same `@Roles` — EMPLOYEE not listed → guard returns false |
| 6 | Default page=1, limit=20 | Service unit test | `findAll uses default page 1 and limit 20 when not provided` |
| 7 | Max limit=100 | DTO `@Max(100)` | Requests with `limit > 100` rejected by `ValidationPipe` before service is called |
| 8 | Sort createdAt DESC | Service unit test | `findAll orders results by createdAt descending` |
| 9 | Filter by action | Service unit test | `findAll filters by action when provided` |
| 10 | Filter by targetType | Service unit test | `findAll filters by targetType when provided` |
| 11 | Filter by targetId | Service unit test | `findAll filters by targetId when provided` |
| 12 | Filter by actorUserId | Service unit test | `findAll filters by actorUserId when provided` |
| 13 | Filter by actorRole | Service unit test | `findAll filters by actorRole when provided` |
| 14 | Filter by result | Service unit test | `findAll filters by result when provided` |
| 15 | dateFrom / dateTo filters | Service unit test | `findAll filters by dateFrom as createdAt gte` + `...dateTo as createdAt lte` |
| 16 | Response shape {data, meta} | Service unit test | `findAll returns data and meta with total, page, limit, totalPages` |
| 17 | No mutation routes | Controller unit test | `does not expose POST, PATCH, or DELETE routes` (inspects prototype method names) |
| 18 | All prior tests still pass | Test run | 310 total / 310 passed — 0 regressions |
| 19 | All new tests pass | Test run | 19 new tests (15 service + 4 controller) all green |

### New tests added

**audit-log.service.spec.ts — findAll (13 tests):**
- `uses default page 1 and limit 20 when not provided`
- `applies page and limit to skip and take`
- `orders results by createdAt descending`
- `filters by action when provided`
- `filters by targetType when provided`
- `filters by targetId when provided`
- `filters by actorUserId when provided`
- `filters by actorRole when provided`
- `filters by result when provided`
- `filters by dateFrom as createdAt gte`
- `filters by dateTo as createdAt lte`
- `returns data and meta with total, page, limit, and totalPages`
- `omits unset filter fields from the where clause`

**audit-log.service.spec.ts — findOne (2 tests):**
- `returns the audit log record when found`
- `throws NotFoundException when the record does not exist`

**audit-log.controller.spec.ts (4 tests):**
- `findAll delegates to service with the query object`
- `findOne delegates to service with the UUID param`
- `@Roles restricts the entire controller to SUPER_ADMIN and HR_ADMIN`
- `does not expose POST, PATCH, or DELETE routes`

## Verification Results

```
=== Tests ===
Test Suites: 19 passed, 19 total
Tests:       310 passed, 310 total  (+19 new: +15 service, +4 controller)
Time:        6.692s

=== verify.sh ===
[PASS] API build
[PASS] Prisma schema valid
[PASS] Web build
[PASS] ALL CHECKS PASSED

=== api-smoke-test.sh ===
[PASS] GET /health OK
[PASS] POST /auth/login OK
[PASS] GET /auth/me OK
[PASS] GET /employees OK — total=4
[PASS] GET /departments OK — total=2
[PASS] GET /positions OK — total=3
[PASS] GET /attendance OK — total=18
[PASS] GET /leave OK — total=6
[PASS] GET /leave-balances OK — total=1
[PASS] GET /dashboard OK — timezone=Asia/Bangkok, totalEmployees=4
[PASS] GET /dashboard unauthenticated → 401
[PASS] API SMOKE TEST PASSED

=== security-review.sh ===
[PASS] API audit — all HIGH/CRITICAL have documented accepted risk
[PASS] Web dependency audit passed — no HIGH/CRITICAL found
[PASS] Mobile audit — all HIGH/CRITICAL have documented accepted risk
[PASS] Secret scan completed — no findings
[PASS] SECURITY REVIEW PASSED — automated checks clear

=== docker-verify.sh ===
NOT RUN — excluded per Docker safety overlay (docker-verify.sh invokes
docker compose down internally). The live Docker stack predates this build
and the new /audit-logs routes were NOT exercised at runtime. All
pre-existing endpoints responded correctly via api-smoke-test.sh,
confirming the existing stack remains healthy.
```

## Issues Found

None. Implementation was straightforward following the existing `findAll`/`findOne` patterns from `attendance.service.ts` and `leave.service.ts`.

## Design Notes

**`@Roles` at class level** — The `RolesGuard` uses `reflector.getAllAndOverride(ROLES_KEY, [getHandler(), getClass()])` which reads class-level metadata correctly. All routes in this controller require identical roles, so class-level placement is correct and avoids repetition.

**`PrismaModule` import not needed** — `PrismaModule` is `@Global()`, so `PrismaService` is available in `AuditLogModule` without an explicit import.

**`$transaction([findMany, count])`** — Matches the attendance and leave service patterns. Both queries share the same `where` object ensuring consistent counts. Inner calls (`findMany`, `count`) are called for their side effects (argument capture for test inspection); the outer `$transaction` mock controls the resolved value.

**No re-sanitization on read** — Metadata was sanitized at write time (T-057B-1/T-057B-2). Reading it back is safe. Re-sanitizing on read would be scope creep and could mask legitimate stored values.

**`dateTo` is midnight-exclusive for the given day** — `dateTo=2026-06-30` resolves to `new Date('2026-06-30')` which is `2026-06-30T00:00:00.000Z`. Records timestamped later that same day are excluded. This matches the spec (`createdAt <= dateTo`) and the same pattern used in attendance/leave date filters throughout the codebase. Callers who want inclusive end-of-day must pass `dateTo=2026-07-01` or use a datetime string.

**`targetId` uses `@IsString()` not `@IsUUID()`** — `AuditLog.targetId` is a free-form string field in the schema. Not all target types are UUID-keyed resources, so `@IsUUID()` would over-constrain the filter.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | `GET /audit-logs` and `GET /audit-logs/:id` — both new endpoints are protected by `JwtAuthGuard + RolesGuard` at class level |
| RBAC impact | `@Roles(SUPER_ADMIN, HR_ADMIN)` class-level — MANAGER and EMPLOYEE are denied (403); unauthenticated denied (401) |
| Data privacy impact | Audit logs contain actorUserId, IP address, user agent, and metadata. Access restricted to SUPER_ADMIN + HR_ADMIN only. Metadata was already sanitized at write time — no sensitive keys stored raw. No new PII exposure beyond what was already in the DB. |
| Password/token/hash impact | None — no password, token, or hash handling in this task |
| Mobile security impact | None — no mobile-specific code touched |
| Dependency/advisory impact | No new packages added; pre-existing accepted-risk advisories unchanged |
| Secrets/logging check | Secret scan PASS; no tokens or credentials logged; Authorization header never echoed in responses |
| New endpoints protected | `GET /audit-logs` → JwtAuthGuard + RolesGuard (SUPER_ADMIN, HR_ADMIN); `GET /audit-logs/:id` → same |
| Risk level | LOW |
| Security decision | PASS |

**No SQL injection risk** — all filters use Prisma `where` object construction with primitive values spread conditionally. No raw SQL, no `$queryRaw`, no string interpolation into queries.

**RBAC test coverage note** — Requirements 1–5 (auth/RBAC enforcement) are config-asserted. The `@Roles` metadata test confirms the decorator is applied with the correct roles; `roles.guard.ts` was read and confirmed to use `getAllAndOverride([getHandler(), getClass()])` so class-level `@Roles` is correctly read at runtime. Behavioral 401/403 were **not exercised at runtime** — the live Docker stack runs compiled `dist/` from before this task, and rebuild is blocked by the Docker safety overlay. Once the stack is rebuilt (the next full docker-verify cycle), runtime RBAC behavior can be confirmed. This is the same config-assertion pattern used for all prior controller tests in this project (`leave.controller.spec.ts`, `attendance.controller.spec.ts`).

## Docker Safety Compliance
- `docker compose down` — NOT run; not needed for this task
- `docker compose down -v` — NOT run; no volumes removed
- `./scripts/docker-verify.sh` — NOT run (excluded per Docker safety overlay; see T-057B-5 deviation note)
- No Prisma reset or DB reset performed
- No schema changes, no migration required
- Docker stack health confirmed non-destructively via `api-smoke-test.sh` against the live running stack

## Out-of-Scope Confirmed
- No POST, PATCH, or DELETE audit-log endpoints
- No schema changes, no Prisma migrations
- No package.json or lockfile changes
- No seed script changes
- No Web or Mobile UI changes
- No changes to existing audit-log write path (`record()`)
- No changes to auth, employee, leave, attendance, or dashboard modules
- No re-sanitization on read (metadata is already sanitized at write time)

## Risk
Low

## Decision
PASS

## Next Step
**T-057B-7 — Admin Audit Log UI**

## Recommended Commit Message
```
feat(audit): add read API for audit logs with RBAC

- GET /audit-logs — paginated (default page=1, limit=20, max=100),
  sortable (createdAt DESC), filterable by action, targetType,
  targetId, actorUserId, actorRole, result, dateFrom, dateTo
- GET /audit-logs/:id — single record by UUID; 404 on miss
- Protected by JwtAuthGuard + RolesGuard @Roles(SUPER_ADMIN, HR_ADMIN);
  MANAGER/EMPLOYEE receive 403, unauthenticated 401
- No schema changes, no migrations, no new packages
- 19 new unit tests: 15 service (pagination, sort, 9 filters, response
  shape, findOne success/not-found) + 4 controller (delegation + RBAC
  metadata assertion + no-mutation-routes check)
```
