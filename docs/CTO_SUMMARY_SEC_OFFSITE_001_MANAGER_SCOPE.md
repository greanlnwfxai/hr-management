# CTO Summary

## Step
SEC-OFFSITE-001 — Scope Manager Off-site List/Detail Access

## Status
PASS

## Scope
`UX-AUDIT-001` flagged (but explicitly did not fix, per its audit-only scope) a live RBAC/data-exposure finding: `GET /off-site` (list) and `GET /off-site/:id` (detail) were not department-scoped for the MANAGER role, unlike the equivalent `GET /leave`/`GET /leave/:id` endpoints already fixed in `HOTFIX-T089A`. This task closes that gap by mirroring `HOTFIX-T089A`'s exact `leave.service.ts` pattern into `off-site.service.ts`, and additionally adds a self-review guard to `approve()`/`reject()` that the pre-fix code was missing.

## Problem Summary
Any authenticated MANAGER could call `GET /off-site` and see off-site work requests — employee identity, department, date, and reason text — for **every** department, not just the one they manage. `GET /off-site/:id` had the same gap: it returned any record to MANAGER with no department comparison at all, treating MANAGER identically to SUPER_ADMIN/HR_ADMIN. This was reachable in production today via the Admin Web `/offsite` page (`apps/web/app/(app)/offsite/page.tsx`), which calls `GET /off-site` with no department narrowing and shows Approve/Reject controls to any MANAGER (`canApprove` includes `MANAGER`).

## Root Cause
`off-site.service.ts`'s `findAll()` never took a `currentUser` parameter — it built its Prisma `where` clause from query params only (`employeeId`, `status`, `date`) and never intersected the caller's managed department, unlike `approve()`/`reject()`, which already had (correct) department-mismatch checks. `findOne()` had an unconditional early return for `SUPER_ADMIN || HR_ADMIN || MANAGER` with no department check for the MANAGER case. Separately, `approve()`/`reject()`'s existing department check verified `approverEmp.managedDepartment.id === requestEmployee.departmentId` but never checked whether the approver *was* the request's own employee — so a manager whose own off-site request happened to be in their own managed department could approve/reject it themselves.

## Backend Changes

**`apps/api/src/off-site/off-site.controller.ts`**
- `GET /off-site` (`findAll`) now takes `@CurrentUser() user` and passes it through to the service, exactly as `leave.controller.ts` does. Client-supplied query params (including `employeeId`) were never trusted as the security boundary and still aren't — the boundary is the caller's own role/employee record, resolved server-side.

**`apps/api/src/off-site/off-site.service.ts`**
- `findAll(query, currentUser?)`: when `currentUser.role === MANAGER`, resolves the caller's `Employee.managedDepartment` server-side and intersects `where.employee = { departmentId: managerDept.id }` into the existing Prisma `where` clause (still includes `status`/`date`/`employeeId` filters as before). Because the department filter is ANDed in, a client-supplied `employeeId` for an outside-department employee narrows the result to zero rows rather than widening scope. If the manager has no managed department, the method short-circuits to an empty page without hitting the database. SUPER_ADMIN and HR_ADMIN are completely unaffected (no extra `employee.findFirst` call, no `where.employee`). `findMy()` (backing `/off-site/me`) still calls `findAll({ ...query, employeeId })` **without** `currentUser`, so the EMPLOYEE self-view is untouched.
- `findOne()` (`GET /off-site/:id`): split the previous single `SUPER_ADMIN || HR_ADMIN || MANAGER` early-return branch into two. SUPER_ADMIN/HR_ADMIN keep the unconditional early return. MANAGER now gets its own branch that resolves the caller's `Employee.managedDepartment` server-side (same lookup pattern as `approve`/`reject`) and throws `ForbiddenException('Access denied')` unless **all** of: the manager has a `managedDepartment`, that department id equals `record.employee.department.id`, and the manager's own employee id does not equal `record.employee.id` (self-detail must go through `/off-site/me`, matching leave's `findOne` policy). The EMPLOYEE self-ownership branch below it is unchanged.
- `approve()` / `reject()`: added a self-review guard inside the existing `MANAGER` branch, placed after the department check: `if (approverEmp.id === record.employeeId) throw new ForbiddenException(...)`. Thai messages match the existing service style: `ไม่สามารถอนุมัติคำขอทำงานนอกสถานที่ของตัวเองได้` (approve) / `ไม่สามารถปฏิเสธคำขอทำงานนอกสถานที่ของตัวเองได้` (reject).

**Not changed:** `create()`, `findMy()`, and EMPLOYEE self-service behavior. No residual RBAC gap remains in this module for the MANAGER role — `findAll`/`findOne`/`approve`/`reject` are all now department-scoped and self-action-guarded where applicable.

## Admin Web Impact
None required. `apps/web/app/(app)/offsite/page.tsx` is a thin pass-through to `GET /off-site` / `PATCH /off-site/:id/approve` / `PATCH /off-site/:id/reject` with no client-side department logic — it inherits the corrected backend scoping automatically. One behavioral note (not a bug, matches leave's existing pattern): the list still doesn't exclude the manager's own row, so a MANAGER may still see their own PENDING off-site request in the table with Approve/Reject buttons rendered; clicking either now correctly returns 403 (surfaced as an error toast) instead of silently succeeding, identical to how `HOTFIX-T089A` left the `/leave` list/self-approval interaction. No frontend files were modified.

## Mobile Impact
None. Mobile only calls `POST /off-site/request` and `GET /off-site/me` (self-service), both unaffected by this change — confirmed via `apps/mobile/src/api/client.ts`.

## Files Changed
- `apps/api/src/off-site/off-site.controller.ts` (modified — `findAll` now takes `@CurrentUser()`)
- `apps/api/src/off-site/off-site.service.ts` (modified — MANAGER department scoping on `findAll`/`findOne`; self-review guard on `approve`/`reject`)
- `apps/api/src/test-utils/prisma.mock.ts` (modified — added missing `offSiteRequest.findUnique`/`create`/`update`/`count` mock methods, needed for the new spec file)
- `docs/UX_AUDIT_001_ADMIN_WEB_MOBILE_REAL_USAGE_POLISH.md` (modified — marked the boxed security finding and backlog row as RESOLVED)
- `docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md` (modified — added MANAGER department-scope regression checklist items to Section F)
- `HR-Knowledge/01-START-HERE/Current Status.md` (modified — closed limitation #4's off-site half, updated Next Recommended Task, added a documenting paragraph)
- `docs/CTO_SUMMARY_SEC_OFFSITE_001_MANAGER_SCOPE.md` (created — this file)

## Files Created
- `apps/api/src/off-site/off-site.service.spec.ts` (created — this module had zero prior test coverage)
- `apps/api/src/off-site/off-site.controller.spec.ts` (created — this module had zero prior test coverage)

No Prisma schema/migration files touched (confirmed via `git diff --stat -- prisma/`, empty output).

## Tests Added/Updated
**`apps/api/src/off-site/off-site.service.spec.ts`** (new file, 39 tests), mirroring `leave.service.spec.ts`'s structure:
- `create` (4 tests) / `findMy` (2 tests) baseline coverage.
- `findAll` baseline pagination (1 test).
- `findAll: MANAGER department scoping` (6 tests): scopes to managed department; keeps existing `status` filter alongside the department filter; client-supplied `employeeId` for an outside-department employee does not widen scope (AND semantics verified against the constructed `where`); returns an empty page with zero DB calls when the manager has no managed department; SUPER_ADMIN and HR_ADMIN remain fully unscoped (no `employee.findFirst` call, no `where.employee`).
- `findOne` (9 tests): SUPER_ADMIN/HR_ADMIN unscoped (2); MANAGER reads a same-department subordinate's detail (succeeds); MANAGER reading an outside-department detail throws `ForbiddenException`; MANAGER reading their **own** detail through this route throws `ForbiddenException`; MANAGER with no managed department cannot read any detail; EMPLOYEE self-view succeeds/fails correctly (2); missing record throws `NotFoundException`.
- `approve` (7 tests): baseline approve/not-found/not-pending (3); MANAGER approves a same-department subordinate's request (succeeds); MANAGER approving an outside-department request throws `ForbiddenException`; MANAGER approving their **own** request throws `ForbiddenException`; MANAGER with no managed department cannot approve.
- `reject` (7 tests, mirrors `approve` exactly: 3 baseline + 4 MANAGER-scope cases).
- Audit logging (3 tests): `OFFSITE_APPROVED` recorded on success; approval still succeeds when the audit write fails (best-effort); audit metadata never contains the raw `reason` text.

**`apps/api/src/off-site/off-site.controller.spec.ts`** (new file, 6 tests): `create`/`findMy`/`findOne`/`approve`/`reject` delegate correctly, and `findAll` now asserts `service.findAll` is called with `(query, user)` — the new `@CurrentUser()` parameter.

39 + 6 = **45 new tests total**, matching the targeted `npx jest off-site` run below exactly (this module had zero prior test coverage, so all 45 are new).

**`apps/api/src/test-utils/prisma.mock.ts`**: added `findUnique`, `create`, `update`, `count` to the `offSiteRequest` mock (previously only had `findMany`/`findFirst`, insufficient for the service's actual Prisma call surface). Purely additive — no existing spec that used `mockPrisma()` broke.

**Admin Web:** No new Playwright test added, per the task's instruction not to start the `/offsite` i18n retrofit (`UX-POLISH-003`) here. Manual QA recommended (see checklist below).

## Verification Commands and Results
- Targeted backend off-site tests: `npx jest off-site` → **2 suites, 45 tests (all new), all PASS**
- Full backend suite: `npx jest` (apps/api) → **30 suites, 771 tests, all PASS** (726 pre-existing + 45 new from this task)
- `./scripts/verify.sh` → **PASS** (Prisma schema valid, Web `next build` succeeded with TypeScript checks passing, all 17 routes including `/offsite` compiled)
- `./scripts/docker-verify.sh` → **PASS** — non-destructive; `docker compose up -d --build` rebuilt `hr-management-api`/`hr-management-web`/`hr-management-mobile` images (Docker Desktop needed a cold start first — unrelated environment hiccup, not a code issue), recreated `hr-api`/`hr-web`/`hr-mobile` containers, all reported healthy/Up; `GET /health`, web (`:3002`), and mobile (`:3004`) reachability all OK. Containers left running per policy (no teardown performed).
- `./scripts/api-smoke-test.sh` → **PASS** — including `GET /employees OK — total=67` and all other smoke checks against the rebuilt API image.
- `./scripts/security-review.sh` → **PASS** — dependency audit clean except pre-existing accepted-risk Multer HIGH findings (unrelated to this change, documented in `.security-accepted-risks`); secret scan clean (no committed `.env`, no PEM blocks, no suspicious patterns).
- `git status` → 3 files modified + 2 new spec files untracked (plus doc files), working tree otherwise clean.
- `git diff --stat` → 51 insertions / 5 deletions across 3 tracked source files (controller, service, prisma mock).
- `git diff --check` → exit 0, no whitespace errors.
- `git diff --stat -- prisma/` → empty output, confirming **no Prisma/schema/migration changes**.

## Runtime Impact
This changes the API runtime only (`off-site.controller.ts`/`off-site.service.ts` — compiled into `dist/` for `start:prod`). **Production redeploy of `api` is required** for this fix to take effect; no changes are live until redeployed. Web/mobile runtime is unaffected (no source changes) but redeploying `web` alongside is harmless if the standard release process bundles both.

## API Impact
Yes — `GET /off-site`'s behavior for MANAGER callers changes from org-wide to department-scoped; `GET /off-site/:id` for MANAGER changes from unconditional access to department-scoped with a self-read block; `PATCH /off-site/:id/approve`/`reject` for MANAGER gain a self-review block. No endpoint signatures, routes, or request/response shapes changed — only server-side authorization logic. SUPER_ADMIN/HR_ADMIN/EMPLOYEE behavior is unchanged.

## Migration Impact
None. No Prisma schema, migration, or database changes — confirmed by the empty `git diff --stat -- prisma/` output. The fix is entirely application-logic (Prisma `where`-clause construction and added `ForbiddenException` guards).

## Security/RBAC/Privacy Impact
This is a **positive** RBAC change — it closes an org-wide data-exposure gap (MANAGER could previously list/read any employee's off-site request, including reason text and identity, via `GET /off-site`/`GET /off-site/:id`) and closes a self-approval integrity gap (MANAGER could previously approve/reject their own off-site request within their own managed department). No new endpoints were added; no existing auth/JWT guards were touched or weakened. See Security Review table below for full detail.

## Security Review

| Field | Detail |
|---|---|
| Auth impact | None — no new endpoints added; existing `JwtAuthGuard`/`RolesGuard` on `GET /off-site`, `GET /off-site/:id`, `PATCH /off-site/:id/approve`, `PATCH /off-site/:id/reject` unchanged |
| RBAC impact | **Yes, tightened.** `GET /off-site` and `GET /off-site/:id` are now department-scoped for MANAGER (both were previously effectively org-wide despite the role gate). `approve()`/`reject()` now additionally block MANAGER self-approval/self-rejection, and `findOne()` now blocks MANAGER from reading their own request through this route (self access stays on `/off-site/me`). SUPER_ADMIN/HR_ADMIN/EMPLOYEE behavior is unchanged and covered by regression tests. |
| Data privacy impact | **Yes, reduced exposure.** MANAGER can no longer enumerate or directly fetch off-site requests (including `reason`/location-context text, employee name/code, department, position) for employees outside their managed department via `GET /off-site` or `GET /off-site/:id`. |
| Password/token/hash impact | None |
| Mobile security impact | None — no mobile code changed; mobile only calls self-service `/off-site/request` and `/off-site/me`, both unaffected. |
| Dependency/advisory impact | No new packages or dependencies added |
| Secrets/logging check | No secrets, tokens, or password values touched, logged, or exposed by this change. Verified via `./scripts/security-review.sh` secret scan (clean) and a dedicated new test confirming audit metadata for `OFFSITE_APPROVED` never contains the raw `reason` text. |
| New endpoints protected | N/A — no new endpoints added |
| Risk level | LOW |
| Security decision | PASS |

## Production Redeploy Requirement
Required. The API runtime change does not take effect until `api` is rebuilt and redeployed to production (mirrors `HOTFIX-T089A`'s redeploy requirement for the equivalent leave fix).

## Manual QA Checklist
1. Log in as a MANAGER account with a `managedDepartment` that has at least one subordinate off-site request and at least one other department's off-site request in the system.
2. `GET /off-site` (or the Admin Web `/offsite` page) shows only same-department requests — confirm the other department's request does not appear.
3. `GET /off-site/:id` on an outside-department request's UUID returns 403.
4. `GET /off-site/:id` on the manager's own request (if the manager has submitted one) returns 403 — confirm `/off-site/me` still shows it correctly.
5. Approve/Reject on a same-department subordinate's PENDING request succeeds.
6. Approve/Reject on an outside-department request (e.g. via a crafted UUID) returns 403.
7. Approve/Reject on the manager's own PENDING request returns 403, surfaced as an error toast on the Admin Web page.
8. Confirm SUPER_ADMIN/HR_ADMIN still see and can act on all off-site requests org-wide, unaffected.

## Remaining Risks / Deferred Work
No residual RBAC risk remains for MANAGER in this module: `findAll`/`findOne`/`approve`/`reject` are all now department-scoped, and `approve`/`reject`/`findOne` all block self-action/self-read — identical coverage to what `HOTFIX-T089A` achieved for leave. 45 new tests cover this, and the full suite (771 tests, including the 726 pre-existing) all pass.

1. **Admin Web MANAGER flow relies on manual QA**, not an automated Playwright test — `apps/web/e2e/` has no `offsite.spec.ts`, and adding one plus the i18n retrofit is explicitly deferred to `UX-POLISH-003` per the task's instructions.
2. **List-level self-exclusion is not implemented** — a manager's own PENDING request may still appear as a row in their own `/offsite` list view with Approve/Reject buttons rendered, though the server now correctly rejects the action with 403. This matches `HOTFIX-T089A`'s accepted behavior for `/leave` and was not flagged as a requirement to change here.

## Recommended Commit Message
```
fix(offsite): enforce manager department scope

GET /off-site was role-gated to MANAGER but off-site.service.ts's
findAll() applied no department scoping, letting a manager list
org-wide off-site requests (reachable in production via the Admin Web
/offsite page). findOne() (GET /off-site/:id) had no department check
at all for MANAGER, treating it identically to SUPER_ADMIN/HR_ADMIN.
approve()/reject() already blocked out-of-department action but not
self-approval.

Scope findAll() and findOne() to the caller's managedDepartment for
MANAGER (SUPER_ADMIN/HR_ADMIN/EMPLOYEE unaffected), mirroring
HOTFIX-T089A's leave.service.ts pattern exactly, and add a
self-approval/self-rejection/self-read guard to approve()/reject()/
findOne() — a manager can act on or read subordinate off-site requests
within their own department only, and must use /off-site/me for their
own. No Admin Web/Mobile code change needed (both are thin API
pass-throughs); no schema/migration change.
```

## Decision
PASS
