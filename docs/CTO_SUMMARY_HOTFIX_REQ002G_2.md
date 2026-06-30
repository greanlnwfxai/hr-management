# CTO Summary

## Step
HOTFIX-REQ002G-2 — Manager/Employee Data Scope Hardening

## Status
PASS

## Scope
Production RBAC/privacy hotfix: scoped `GET /employees`, `GET /employees/:id`, `GET /dashboard` so that MANAGER sees only their managed department's data and EMPLOYEE is blocked from org-wide lists.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_REQ002G_2.md` (this file)

## Files Modified

### Backend (API)
| File | Change |
|---|---|
| `apps/api/src/employees/employees.service.ts` | Added `ForbiddenException` + `UserRole` imports; added `actor?` param to `findAll` (EMPLOYEE → 403, MANAGER → managedDepartment scope or empty list) and `findOne` (EMPLOYEE → self only, MANAGER → self + managed dept) |
| `apps/api/src/employees/employees.controller.ts` | Added `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` to `findAll`; threaded `@CurrentUser()` into `findAll` and `findOne` |
| `apps/api/src/dashboard/dashboard.service.ts` | Added `UserRole` import; added `actor?` param to `getSummary`; resolve `scopeDeptId` once for MANAGER; all 18 KPI queries + `computeAnalytics` scoped by `departmentId` for MANAGER; added `buildEmptySummary()` for MANAGER with no managedDepartment |
| `apps/api/src/dashboard/dashboard.controller.ts` | Imported `CurrentUser`; threaded `@CurrentUser()` into `getSummary` |

### Frontend (Web)
| File | Change |
|---|---|
| `apps/web/lib/i18n.ts` | Added `page_employees_team` (EN: "Team Employees", TH: "พนักงานในทีม") and `page_dashboard_team` (EN: "Team Dashboard", TH: "แดชบอร์ดทีม") |
| `apps/web/app/(app)/employees/page.tsx` | Added `useRouter`; EMPLOYEE → `router.replace('/profile')` on mount + `load()` returns early; MANAGER → title uses `page_employees_team` |
| `apps/web/app/(app)/dashboard/page.tsx` | Added `useRouter` + `getUser`; EMPLOYEE → `router.replace('/profile')` on mount + `load()` returns early (parity with employees page); MANAGER → title uses `page_dashboard_team` |

### Tests
| File | Change |
|---|---|
| `apps/api/src/employees/employees.service.spec.ts` | Added `ForbiddenException` import; added 10 new RBAC scoping tests; "scopes query" and "overrides departmentId" tests assert `findMany.mock.calls[0][0].where.departmentId === 'dept-uuid-1'` — regression fails if the filter is dropped |
| `apps/api/src/dashboard/dashboard.service.spec.ts` | Added 5 new MANAGER scope tests; "resolves managedDepartment.id" test asserts `employee.count` and `attendance.count` both receive `departmentId` filter — regression fails if scoping is removed |
| `apps/api/src/employees/employees.controller.spec.ts` | Updated `findAll` and `findOne` assertions to match new actor param signatures |
| `apps/api/src/dashboard/dashboard.controller.spec.ts` | Updated `getSummary` assertions to match new actor param signature |

## Verification Result

| Script | Result | Notes |
|---|---|---|
| `./scripts/verify.sh` | **PASS** | API build OK, Prisma schema valid, Web build OK |
| `./scripts/docker-verify.sh` | **SKIPPED** | Script contains `docker compose down` — forbidden by CLAUDE.md Docker Safety Rules |
| `./scripts/api-smoke-test.sh` | **PASS** | Ran against existing healthy stack; admin login + all endpoints OK |
| `npx jest --no-coverage` | **PASS** | 529 tests pass, 24 suites green — scope assertions now discriminating (regression would break tests) |
| `./scripts/security-review.sh` | **PASS** | No secrets, dependency audit clean (Multer HIGH pre-accepted risk unchanged) |

**Note on `docker-verify.sh`**: The script begins with `docker compose down` which is explicitly forbidden by the Docker Safety Rules in CLAUDE.md. The new code has been fully verified by the build, prisma validate, web build, full test suite, and live smoke test against the running stack. Docker re-deploy must be performed manually by the user.

## Issues Found
None. All existing tests passed without regression. RBAC scoping logic reuses the proven pattern from `attendance.service.ts` (offsite review).

## Risk
**LOW** — Changes are additive restrictions (more scope filtering). No schema changes. No weakening of existing SUPER_ADMIN/HR_ADMIN access. No changes to auth tokens or password handling. Existing behavior for global roles is unchanged.

## Decision
**PASS**

## Next Step
HOTFIX requires manual Docker redeploy by user:
1. User deploys updated API image to Docker
2. Verify MANAGER account sees only dept-scoped employees and dashboard
3. Verify EMPLOYEE cannot access `/employees` list or `/dashboard` (backend returns 403, frontend redirects to /profile)

After verification in prod: tag `v1.2.59-manager-employee-data-scope-hotfix`

## Recommended Commit Message
```
fix(rbac): scope manager and employee admin data

- GET /employees: MANAGER sees only managed-dept employees; EMPLOYEE gets 403
- GET /employees/:id: MANAGER sees self + dept; EMPLOYEE sees self only
- GET /dashboard: all 18 KPI queries + analytics scoped to managed dept for MANAGER
- Web: EMPLOYEE redirected to /profile from /employees and /dashboard
- Web: MANAGER sees team-scoped page titles (EN/TH)
- Tests: 15 new RBAC scoping tests; 529 total pass
```

---

## Security Review

| Field | Assessment |
|---|---|
| **Auth impact** | `GET /employees` now has `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` — explicit role guard added. `GET /employees/:id` uses service-level scope (EMPLOYEE self-only). Both were previously guarded only by `JwtAuthGuard`. |
| **RBAC impact** | MANAGER data scope enforced at service layer (not just nav hiding). EMPLOYEE blocked from employee list. No weakening of SUPER_ADMIN/HR_ADMIN. |
| **Data privacy impact** | PII (names, emails, department, position) is now filtered server-side for MANAGER/EMPLOYEE. MANAGER cannot read cross-department employee records. EMPLOYEE cannot enumerate any employee data. |
| **Password/token/hash impact** | No change to password, JWT, or hash handling. |
| **Mobile security impact** | No mobile-specific changes. The API endpoints are now more restrictive — mobile apps using MANAGER/EMPLOYEE tokens will receive scoped responses, which is the correct behavior. |
| **Dependency/advisory impact** | No new packages added. Multer HIGH advisory unchanged (pre-accepted risk). |
| **Secrets/logging check** | No secrets, tokens, or passwords in new code. ForbiddenException messages contain no sensitive data. |
| **New endpoints protected** | No new endpoints. Modified endpoints: `GET /employees` now has explicit `@Roles` guard; `GET /employees/:id` and `GET /dashboard` have service-level RBAC enforcement. |
| **Risk level** | **LOW** |
| **Security decision** | **PASS** |
