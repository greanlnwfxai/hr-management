# CTO Summary

## Step
HOTFIX-REQ002G-3 — Manager Scope Department Fallback

## Status
PASS

## Scope
Follow-up production hotfix after `v1.2.59-manager-employee-data-scope-hotfix`. A MANAGER user (j.pichai, Service department) saw 0 employees on the `/employees` page despite having a correct MANAGER role, because the backend scope logic required an explicit `Department.managerId` link that was not yet wired up in production data.

## Root Cause

`HOTFIX-REQ002G-2` scoped MANAGER queries by `employee.managedDepartment.id`. The `managedDepartment` relation is populated **only** when `Department.managerId = Employee.id` for that manager's employee record. In the production database, the Service department's `managerId` was null (never wired via admin UI — Department module is STEP 16, not yet built). So:

1. `employee.findFirst({ where: { userId } })` returned `{ managedDepartment: null }`
2. `managedDepartment` null → code returned empty list / zeroed dashboard
3. No data leak, but behavior was too strict — manager saw 0 employees

## Why v1.2.59 Returned 0 Employees

The v1.2.59 code had a single-path scope:
```typescript
if (!managerEmp?.managedDepartment) {
  return { data: [], ... };  // too strict — no fallback
}
scopedDepartmentId = managerEmp.managedDepartment.id;
```

If the explicit `managedDepartment` link was absent, the only result was empty — regardless of whether the manager had a valid `departmentId` on their own employee record.

## Fallback Rule Implemented

```
managedDepartment?.id  →  use (explicit assignment, wins)
      ↓ null
employee.departmentId  →  use (own department fallback)
      ↓ null
return empty list / zeroed dashboard  (never fall back to global)
```

In code:
```typescript
const resolvedDeptId = managerEmp?.managedDepartment?.id ?? managerEmp?.departmentId ?? null;
```

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_REQ002G_3.md` (this file)

## Files Modified

### Backend (API)
| File | Change |
|---|---|
| `apps/api/src/employees/employees.service.ts` | `findAll`: added `departmentId: true` to manager's `findFirst` select; replaced empty-return branch with `resolvedDeptId = managedDepartment?.id ?? departmentId ?? null` fallback chain |
| `apps/api/src/employees/employees.service.ts` | `findOne`: same `departmentId: true` select addition; replaced `No managed department` throw with `resolvedDeptId` fallback chain for cross-employee access check |
| `apps/api/src/dashboard/dashboard.service.ts` | `getSummary`: added `departmentId: true` to manager's `findFirst` select; replaced `buildEmptySummary` branch with `resolvedDeptId` fallback chain |

### Tests
| File | Change |
|---|---|
| `apps/api/src/employees/employees.service.spec.ts` | Updated "no managedDepartment → empty" test to require both `managedDepartment: null` and `departmentId: null`; added "falls back to own departmentId" test asserting `findMany` where includes `departmentId: 'own-dept-id'`; added "managedDepartment wins over own departmentId" test; updated "overrides query param" test; added 2 new `findOne` fallback tests |
| `apps/api/src/dashboard/dashboard.service.spec.ts` | Updated zeroed-summary test to require `departmentId: null`; added "falls back to own departmentId" test asserting `employee.count` and `attendance.count` include `departmentId: 'own-dept-id'`; updated "resolves managedDepartment.id" test to also assert managedDepartment wins; added `departmentId` to all MANAGER `findFirst` mock returns |

## Verification Result

| Script | Result | Notes |
|---|---|---|
| `./scripts/verify.sh` | **PASS** | API build OK, Prisma schema valid, Web build OK |
| `./scripts/docker-verify.sh` | **SKIPPED** | Contains `docker compose down` — forbidden by CLAUDE.md Docker Safety Rules |
| `./scripts/api-smoke-test.sh` | **PASS** | Admin login + all endpoints OK against running stack |
| `npx jest --no-coverage` | **PASS** | 533 tests pass, 24 suites (4 new tests added) |
| `./scripts/security-review.sh` | **PASS** | No secrets; dependency audit clean |

## Issues Found
None. The 4 additional tests (2 `findAll`, 2 `findOne` for employees; 1 fallback + 1 updated for dashboard) all pass. No regressions in existing tests.

## Risk
**LOW** — The change only widens the fallback path for MANAGER when `managedDepartment` is null. It does not change SUPER_ADMIN / HR_ADMIN behavior. It does not allow MANAGER to access other departments. It does not expose global data. Explicit `managedDepartment` still wins when set. No schema changes.

## Decision
**PASS**

## Security Review

| Field | Assessment |
|---|---|
| **Auth impact** | No endpoint changes. JWT guards unchanged. |
| **RBAC impact** | MANAGER fallback now uses own `departmentId` instead of returning empty. Still cannot access other departments. Explicit `managedDepartment` still overrides. No weakening of HR_ADMIN / SUPER_ADMIN. |
| **Data privacy impact** | MANAGER now sees their own department's employees (previously saw 0 due to missing DB link). This is the intended behavior. No cross-department data exposure possible. |
| **Password/token/hash impact** | None. |
| **Mobile security impact** | None — API endpoints return more data for MANAGER (correct), not less. |
| **Dependency/advisory impact** | No new packages. Multer HIGH advisory unchanged (pre-accepted). |
| **Secrets/logging check** | No secrets or tokens in new code. `resolvedDeptId` contains only a UUID. |
| **New endpoints protected** | No new endpoints. |
| **No global fallback** | Confirmed: `resolvedDeptId = managedDepartment?.id ?? departmentId ?? null` — if both are null, returns empty. Never falls back to global. |
| **Caller-supplied departmentId** | Confirmed: `scopedDepartmentId` is always overridden by `resolvedDeptId` for MANAGER. The caller-supplied `departmentId` query param is ignored for MANAGER. |
| **Risk level** | **LOW** |
| **Security decision** | **PASS** |

## Next Step
User must manually:
1. Rebuild and redeploy Docker API image: `docker compose up -d --build api`
2. Verify j.pichai (MANAGER, Service) now sees service department employees in `/employees`
3. Verify `/dashboard` shows service department KPIs for j.pichai
4. Git commit + tag

## Recommended Commit Message
```
fix(rbac): fallback manager scope to own department

Without a Department.managerId link, MANAGER saw 0 employees.
New fallback: managedDepartment.id ?? employee.departmentId ?? empty.
Explicit managedDepartment still wins. No global fallback possible.

- employees.service: findAll + findOne use resolvedDeptId
- dashboard.service: getSummary uses resolvedDeptId
- Tests: 4 new RBAC fallback tests; 533 total pass
```

Recommended tag after PASS in production: `v1.2.60-manager-scope-department-fallback-hotfix`
