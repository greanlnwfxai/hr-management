# CTO Summary

## Step
HOTFIX-REQ002G-4 — Employee Self Dashboard and Profile Name Polish

## Status
PASS

## Scope
Production UX/RBAC follow-up after v1.2.60.

Two issues addressed:

**Issue 1 — EMPLOYEE has no useful self-dashboard:**
EMPLOYEE role was being redirected to `/profile` when visiting `/dashboard`. Now EMPLOYEE sees their own self-summary dashboard using self-scoped API endpoints (`/attendance/me`, `/leave-balances/my`, `/leave/me`). No global org data is ever exposed.

**Issue 2 — Sidebar footer shows auto-generated email like `emp_<uuid>@hr.local`:**
Root cause confirmed: `employees.service.ts:234` auto-generates `emp_${employeeId}@hr.local` as the user email when no explicit email is provided at provisioning. The sidebar was displaying `user.email` directly, so provisioned employees without real emails saw the raw ID. Fixed by fetching the employee's full name from `GET /auth/me` on mount and displaying it with fallback chain: full name → username → email.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_REQ002G_4.md` (this file)

## Files Modified

| File | Change |
|------|--------|
| `apps/web/lib/i18n.ts` | Added 11 employee self-dashboard keys in both `en` and `th` |
| `apps/web/components/AppLayout.tsx` | Added `getMe()` call on mount for display name; fallback chain full name → username → email; added `/dashboard` link to EMPLOYEE nav |
| `apps/web/app/(app)/dashboard/page.tsx` | Removed EMPLOYEE redirect; removed `useRouter` (no longer needed); added `EmployeeSelfView` component; added self-loading state with `getMyAttendance`/`getMyLeaveBalances`/`getMyLeave`; EMPLOYEE early-return renders self-dashboard instead of global data |

## Verification Result

| Script | Result |
|--------|--------|
| `./scripts/verify.sh` | PASS — API build, Prisma schema, web build all clean |
| `./scripts/docker-verify.sh` | PASS — all services healthy |
| `./scripts/api-smoke-test.sh` | PASS — login, /health, /employees, /dashboard all OK |
| `npx jest dashboard` (api) | PASS — 30/30 tests, 2 suites |
| `tsc --noEmit` (web) | PASS — no type errors |
| `./scripts/security-review.sh` | PASS — no secrets, accepted-risk advisories unchanged |

## Architecture Decision — Frontend-only approach

The existing dashboard controller (`@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)`) was intentionally left untouched. EMPLOYEE never calls `GET /dashboard`. Instead the self-dashboard fetches from three already-existing self-scoped endpoints:
- `GET /attendance/me` — own attendance records
- `GET /leave-balances/my` — own leave balances
- `GET /leave/me` — own leave requests

This is structurally safer than opening `GET /dashboard` to EMPLOYEE: the RBAC guard surface hardened by REQ002G-2/3 is preserved.

No backend tests were added for a dashboard EMPLOYEE path because no such backend path was created. The "no global data leak" guarantee is enforced by architecture (EMPLOYEE never calls the guarded endpoint). The 30 existing dashboard tests (MANAGER scoping, global sums, analytics shape) all remain green.

## Issues Found

None during implementation.

Root cause of Issue 2 (`emp_...` display) was confirmed in `apps/api/src/employees/employees.service.ts:234`:
```ts
const email = dto.email ?? `emp_${employeeId}@hr.local`;
```
This is correct provisioning behavior — the email serves as a unique account identifier when no real email is given. The fix is purely in the display layer (sidebar) and does not touch provisioning logic.

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | No new guarded endpoints. Existing `GET /dashboard` guard unchanged. |
| RBAC impact | EMPLOYEE role now gets `/dashboard` nav link and a self-dashboard view. Self-data calls go to already-guarded self-scoped endpoints. No role checks weakened. |
| Data privacy impact | EMPLOYEE sees only their own attendance/leave/balances. No global counts (totalEmployees, totalDepartments, etc.) are ever fetched or rendered for EMPLOYEE. Org-wide data remains blocked. |
| Password/token/hash impact | None. |
| Mobile security impact | None. |
| Dependency/advisory impact | No new packages. Existing accepted-risk advisories (Multer DoS) unchanged. |
| Secrets/logging check | No secrets or tokens in any new code or logs. `emp_...` email is not logged in new code. |
| New endpoints protected | No new endpoints. Existing `/attendance/me`, `/leave-balances/my`, `/leave/me` already require JWT. |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Next Step
STEP 17 or next queued task. Tag this commit as `v1.2.61-employee-self-dashboard-profile-polish`.

## Recommended Commit Message
```
fix(web): add employee self dashboard and display name

- EMPLOYEE role now sees a self-only dashboard (attendance today,
  leave balance, pending leave, recent records) instead of being
  redirected to /profile
- Sidebar footer now displays employee full name fetched from
  GET /auth/me with fallback: full name → username → email
  (fixes emp_<uuid>@hr.local display for provisioned accounts)
- GET /dashboard controller guard (SUPER_ADMIN/HR_ADMIN/MANAGER)
  left untouched; EMPLOYEE self-data served via existing /me endpoints
- Added /dashboard nav link for EMPLOYEE role
- Added i18n keys for employee self-dashboard (en + th)
```
