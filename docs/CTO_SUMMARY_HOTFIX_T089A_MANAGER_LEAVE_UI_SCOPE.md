# CTO Summary

## Step
HOTFIX-T089A — Manager Leave UI Scope

## Status
PASS

## Scope
An audit of the queued `HOTFIX-T089A` (originally scoped as a frontend-only UI gap: MANAGER has no Approve/Reject entry point on Admin Web `/leave`) found the real issue was a backend RBAC/data-access gap, not just a missing UI. This hotfix closes all of:

1. **Backend:** `GET /leave` was role-gated to SUPER_ADMIN/HR_ADMIN/MANAGER, but `leave.service.ts`'s `findAll()` applied no department scoping — any MANAGER could list org-wide leave. This was reachable in production today via Mobile Manager Approval's `GET /leave?status=PENDING` call.
2. **Backend:** `approve()`/`reject()` already blocked a MANAGER acting outside their managed department, but did not block a MANAGER approving/rejecting their **own** leave request (self-approval/self-rejection).
3. **Admin Web:** `/leave` used `isAdmin(user)` for the list fetch and Approve/Reject controls, so MANAGER always fell back to `getMyLeave` with no approval UI at all.
4. **Backend (follow-up, closed in this same hotfix before commit):** `GET /leave/:id` (`findOne()`) returned any leave record to any MANAGER with no department check at all, and did not stop a MANAGER from reading their own leave through this admin/approval detail route. Both are now scoped identically to `findAll`/`approve`/`reject`.

## Problem Summary
Same as Scope above — org-wide list *and* detail-read leakage to MANAGER via the API (not just the UI), plus a self-approval/self-read hole in the RBAC checks that existed for department scope but not for self-action.

## Root Cause
`leave.service.ts`'s `findAll()` was written generically (no `currentUser` parameter at all) and never grew the same department-scoping logic that `approve()`/`reject()` already had. `findOne()` had the same gap: it treated MANAGER identically to SUPER_ADMIN/HR_ADMIN with an unconditional early return, never applying a department check or a self-read guard. The self-approval gap in `approve()`/`reject()` was a straightforward omission — the department-mismatch check was written but a same-department-different-person assumption was never explicitly verified against `record.employeeId === approverEmp.id`. The Admin Web page was never updated to use `isAdminOrManager()` (which already existed and was already correctly used on the off-site review page) when the leave feature shipped.

## Backend Changes
**`apps/api/src/leave/leave.controller.ts`**
- `GET /leave` (`findAll`) now takes `@CurrentUser() user` and passes it through to the service. Client-supplied `employeeId`/query params were never trusted as the security boundary before, and still aren't — the boundary is now the caller's own role/employee record, resolved server-side.

**`apps/api/src/leave/leave.service.ts`**
- `findAll(query, currentUser?)`: when `currentUser.role === MANAGER`, resolves the caller's `Employee.managedDepartment` server-side and intersects `where.employee = { departmentId: managerDept.id }` into the existing Prisma `where` clause (which still includes `status`/`leaveType`/date-range/`employeeId` filters as before). Because the department filter is ANDed in, a client-supplied `employeeId` for an outside-department employee narrows the result to zero rows rather than widening scope. If the manager has no managed department, the method short-circuits to an empty page (`{ data: [], meta: { total: 0, ... } }`) without hitting the database. SUPER_ADMIN and HR_ADMIN are completely unaffected (no `currentUser` branch taken, no extra `employee.findFirst` call). `findMy()` (backing `/leave/me`) still calls `findAll({ ...query, employeeId })` **without** `currentUser`, so the EMPLOYEE self-view is untouched by this branch — it was already scoped correctly by `employeeId`.
- `approve()` / `reject()`: added a self-approval/self-rejection guard inside the existing `MANAGER` branch, placed after the department check (mirroring the exact pattern already used in `attendance.service.ts`'s off-site review self-review guard): `if (approverEmp.id === record.employeeId) throw new ForbiddenException(...)`. Thai messages match the existing service style: `ไม่สามารถอนุมัติคำขอลาของตัวเองได้` (approve) / `ไม่สามารถปฏิเสธคำขอลาของตัวเองได้` (reject). The existing department-mismatch check was also split from a combined `||` condition into two sequential checks so TypeScript can narrow `approverEmp` safely once the "no managed department" case is ruled out — behavior for that case is unchanged (same Thai message, same `ForbiddenException`).
- `findOne()` (`GET /leave/:id`, HOTFIX-T089A-FOLLOWUP): split the previous single `SUPER_ADMIN || HR_ADMIN || MANAGER` early-return branch into two. SUPER_ADMIN/HR_ADMIN keep the unconditional early return (unchanged). MANAGER now gets its own branch that resolves the caller's `Employee.managedDepartment` server-side (same lookup pattern as `approve`/`reject`) and throws `ForbiddenException('Access denied')` unless **all** of: the manager has a `managedDepartment`, that department id equals `record.employee.department.id`, and the manager's own employee id does not equal `record.employee.id` (blocks reading own leave through this route — self access stays on `/leave/me`). Client-supplied data is never trusted: the manager's own employee/department is always resolved server-side from `userId`, never taken from the request. The EMPLOYEE self-ownership branch below it is unchanged.

**Not changed:** none — `findAll`, `findOne`, `approve`, and `reject` are all now department-scoped (and self-action-guarded where applicable) for MANAGER. No residual RBAC gap remains in this module for the MANAGER role.

## Admin Web Changes
**`apps/web/app/(app)/leave/page.tsx`**
- Added `canManageLeave = isAdminOrManager(user)` (imported from the existing `apps/web/lib/auth.ts`, already used correctly on `/attendance/offsite-review`). Used for: the list fetcher (`getLeave` vs `getMyLeave`), the `leave_col_actions` table header, and the Approve/Reject button cell.
- `admin = isAdmin(user)` is unchanged and still gates the Leave Balance Admin panel (`section-balance-admin`, create/edit/adjust balance modals, Vacation Setup) — MANAGER access to that panel was **not** widened.
- Defense-in-depth only: Approve/Reject buttons are additionally hidden on the caller's own row when `user.employeeId` (populated on login) matches the row's `employee.id`. This is UI polish, not the security boundary — the server enforces the self-approval guard regardless via the new `ForbiddenException` check above.

## Mobile Impact
None. Mobile Manager Approval already calls the same `GET /leave?status=PENDING` and `PATCH /leave/:id/approve|reject` endpoints, so it inherits the backend department-scoping and self-approval fixes automatically. No mobile files were changed, per the task's "do not change mobile unless implementation proves it necessary" instruction — it did not.

## Files Changed
- `apps/api/src/leave/leave.controller.ts` (modified)
- `apps/api/src/leave/leave.service.ts` (modified)
- `apps/api/src/leave/leave.controller.spec.ts` (modified — updated assertion for new `findAll` signature)
- `apps/api/src/leave/leave.service.spec.ts` (modified — 18 new tests, including 4 for the `findOne` MANAGER scoping follow-up)
- `apps/web/app/(app)/leave/page.tsx` (modified)
- `docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md` (modified — closed the known-gap note)
- `HR-Knowledge/01-START-HERE/Current Status.md` (modified — roadmap pointer + limitation #4 update)
- `docs/CTO_SUMMARY_HOTFIX_T089A_MANAGER_LEAVE_UI_SCOPE.md` (created — this file)

No files created under `apps/`. No Prisma schema/migration files touched (confirmed via `git diff --stat -- prisma/`, empty output).

## Tests Added/Updated
**`apps/api/src/leave/leave.service.spec.ts`** (18 new tests total across the hotfix and this follow-up):
- `findAll: MANAGER department scoping` (6 tests): scopes to managed department; keeps existing `status` filter alongside the department filter; client-supplied `employeeId` for an outside-department employee does not widen scope (AND semantics verified against the constructed `where`); returns an empty page with zero DB calls when the manager has no managed department; SUPER_ADMIN and HR_ADMIN remain fully unscoped (no `employee.findFirst` call, no `where.employee`).
- `findOne` MANAGER scoping (4 new tests, HOTFIX-T089A-FOLLOWUP, replacing the old "MANAGER reads without ownership check" test): MANAGER reads a same-department subordinate's leave detail (succeeds); MANAGER reading an outside-department leave detail throws `ForbiddenException`; MANAGER reading their **own** leave detail through this route throws `ForbiddenException` (must use `/leave/me` instead); MANAGER with no managed department cannot read any leave detail. Existing SUPER_ADMIN/HR_ADMIN (unscoped, no `employee.findFirst` call) and EMPLOYEE self-ownership `findOne` tests are unchanged and still pass.
- `approve` (4 new tests, added to existing describe block): MANAGER approves a same-department subordinate's leave (succeeds); MANAGER approving an outside-department employee's leave throws `ForbiddenException`; MANAGER approving their own leave throws `ForbiddenException` (same department, same person); MANAGER with no managed department cannot approve.
- `reject` (4 new tests, mirroring approve): same-department subordinate succeeds; outside-department throws `ForbiddenException`; own leave throws `ForbiddenException`; no managed department throws `ForbiddenException`.
- Existing SUPER_ADMIN/HR_ADMIN `approve`/`reject` tests, existing `findMy` auth-isolation test (`employeeId` in query is always overridden by the caller's own), and existing audit-log tests all still pass unmodified — confirming unchanged behavior for those roles/paths.

**`apps/api/src/leave/leave.controller.spec.ts`** (1 test updated): `findAll delegates to service with query and current user` now asserts `service.findAll` is called with `(query, mockUser)` instead of `(query)`, matching the new `@CurrentUser()` parameter.

**Admin Web:** No new Playwright test was added. `apps/web/e2e/` currently has no `leave.spec.ts`, and the local Playwright harness has a documented pre-existing `.env`/`NEXT_PUBLIC_API_URL` CORS limitation (see Known Limitations #20 in Current Status.md) that would need `./scripts/e2e-local.sh`'s local-safe env overrides to exercise a real authenticated MANAGER session against a rebuilt Docker web image — out of scope for this hotfix's verification budget. **Manual QA recommended:** log in as a MANAGER account with a `managedDepartment`, confirm (a) `/leave` shows only that department's requests, (b) Approve/Reject buttons appear for PENDING rows and work, (c) the manager's own row (if any is in the same department list) has no Approve/Reject buttons and a direct API call to approve/reject it returns 403, (d) Leave Balance Admin panel is not visible.

## Verification Commands and Results
- Targeted backend leave tests: `npx jest leave` → **6 suites, 117 tests, all PASS**
- Full backend suite: `npm test` (apps/api) → **28 suites, 726 tests, all PASS**
- `./scripts/verify.sh` → **PASS** (API build via `nest build`, Prisma schema valid, Web `next build` succeeded with TypeScript checks passing, all 17 routes including `/leave` compiled)
- `./scripts/docker-verify.sh` → **PASS** — non-destructive; `docker compose up -d --build` rebuilt `hr-management-api`/`hr-management-web`/`hr-management-mobile` images, recreated `hr-api`/`hr-web`/`hr-mobile` containers, all reported healthy/Up; `GET /health`, web (`:3002`), and mobile (`:3004`) reachability all OK. Containers left running per policy (no teardown performed).
- `./scripts/api-smoke-test.sh` → **PASS** — including `GET /leave OK — total=8` against the rebuilt API image (SUPER_ADMIN token, correctly unscoped/org-wide as expected).
- `./scripts/security-review.sh` → **PASS** — dependency audit clean except pre-existing accepted-risk Multer HIGH findings (unrelated to this change, documented in `.security-accepted-risks`); secret scan clean (no committed `.env`, no PEM blocks, no suspicious patterns).
- `git status` → 7 files modified, working tree otherwise clean, no untracked files (this CTO summary file itself is untracked/new).
- `git diff --stat` → 274 insertions / 28 deletions across 7 tracked files.
- `git diff --check` → exit 0, no whitespace errors.
- `git diff --stat -- prisma/` → empty output, confirming **no Prisma/schema/migration changes**.

## Runtime Impact
This changes both the API runtime (`leave.controller.ts`/`leave.service.ts` — compiled into `dist/` for `start:prod`) and the Admin Web runtime (`leave/page.tsx` — compiled into the Next.js production build). **Production redeploy of both `api` and `web` is required** for this fix to take effect; no changes are live until redeployed.

## Migration Impact
None. No Prisma schema, migration, or database changes. The fix is entirely application-logic (Prisma `where`-clause construction and an added `ForbiddenException` guard) plus a React gating condition — confirmed by the empty `git diff --stat -- prisma/` output.

## Security/RBAC/Privacy Impact
See Security Review table below. In summary: this is a **positive** RBAC change — it closes an org-wide data-exposure gap (MANAGER could previously list any employee's leave via `GET /leave`) and closes a self-approval integrity gap (MANAGER could previously approve/reject their own leave request within their own department). No new endpoints were added; no existing auth/JWT guards were touched or weakened.

## Security Review

| Field | Detail |
|---|---|
| Auth impact | None — no new endpoints added; existing `JwtAuthGuard`/`RolesGuard` on `GET /leave`, `PATCH /leave/:id/approve`, `PATCH /leave/:id/reject` unchanged |
| RBAC impact | **Yes, tightened.** `GET /leave` and `GET /leave/:id` are now department-scoped for MANAGER (both were previously effectively org-wide despite the role gate). `approve()`/`reject()` now additionally block MANAGER self-approval/self-rejection, and `findOne()` now additionally blocks MANAGER from reading their own leave through this route (self access stays on `/leave/me`). SUPER_ADMIN/HR_ADMIN/EMPLOYEE behavior is unchanged and covered by regression tests. |
| Data privacy impact | **Yes, reduced exposure.** MANAGER can no longer enumerate or directly fetch leave requests (including `reason`, employee name/code, department, position) for employees outside their managed department via `GET /leave` or `GET /leave/:id`. `GET /leave/:id` is now department-scoped identically to `findAll`/`approve`/`reject`, closing the previously-noted residual risk. |
| Password/token/hash impact | None |
| Mobile security impact | None — no mobile code changed; Mobile Manager Approval inherits the backend fix automatically through the same endpoints, which is a security improvement (previously it could display/act on org-wide leave data). |
| Dependency/advisory impact | No new packages or dependencies added |
| Secrets/logging check | No secrets, tokens, or password values touched, logged, or exposed by this change. Verified via `./scripts/security-review.sh` secret scan (clean) and manual review of the diff — audit log metadata for `LEAVE_APPROVED`/`LEAVE_REJECTED` events is unchanged (still scalar-only, no `reason` field, per existing tests). |
| New endpoints protected | N/A — no new endpoints added |
| Risk level | LOW |
| Security decision | PASS |

## Remaining Risks / Manual QA Needed
No residual RBAC risk remains for MANAGER in this module: `findAll`/`findOne`/`approve`/`reject` are all now department-scoped, and `approve`/`reject`/`findOne` all block self-action/self-read.

1. **Admin Web MANAGER flow relies on manual QA**, not an automated Playwright test (see Tests section above) — recommend a manual pass against a MANAGER test account per the checklist given there before/shortly after deploy.
2. **Defense-in-depth own-row hiding** on the Admin Web table depends on `user.employeeId` being populated in the stored `AuthUser` from login (confirmed present in the login response type as of this audit) — if that ever regresses, the buttons would show on the manager's own row again, but the server-side `ForbiddenException` guard still blocks the action regardless.

## Recommended Commit Message
```
fix(leave): enforce manager approval and detail-read scope

GET /leave was role-gated to MANAGER but leave.service.ts's findAll()
applied no department scoping, letting a manager list org-wide leave
(reachable in production via Mobile Manager Approval's GET
/leave?status=PENDING). approve()/reject() already blocked
out-of-department action but not self-approval, and GET /leave/:id
(findOne()) had no department scoping or self-read guard at all.

Scope findAll() and findOne() to the caller's managedDepartment for
MANAGER (SUPER_ADMIN/HR_ADMIN/EMPLOYEE unaffected), and add a
self-approval/self-rejection/self-read guard to approve()/reject()/
findOne() mirroring the existing attendance off-site self-review
pattern — a manager can act on or read subordinate leave within their
own department only, and must use /leave/me for their own. Admin Web
/leave now uses isAdminOrManager() for the list and approve/reject
controls instead of isAdmin-only, giving MANAGER a working entry
point; Leave Balance Admin stays isAdmin-only. No schema/migration
change.
```

## Decision
PASS
