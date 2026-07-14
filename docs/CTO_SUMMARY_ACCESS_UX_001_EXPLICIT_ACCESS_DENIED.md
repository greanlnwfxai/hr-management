# CTO Summary

## Step
ACCESS-UX-001 — Explicit Access Denied UX for Non-admin Routes (closes `HOTFIX-T089B`)

## Status
PASS

## Scope
Add a consistent, localized (Thai/English) explicit "access denied" UX on Admin Web's admin-only management pages — `/departments`, `/positions`, and `/employees` (EMPLOYEE role only) — for MANAGER/EMPLOYEE users who navigate to them directly. Frontend-only; no backend RBAC or route protection changed.

## Problem Summary
Two known, pre-documented gaps (`QA_T089`, tracked as `BUG-003`/`BUG-004`, queued as `HOTFIX-T089B`):
- **BUG-003:** `/departments` and `/positions` rendered their full read-only table (rows, columns, totals) to *any* authenticated non-admin role — only the CRUD buttons were hidden via `admin && (...)`. A MANAGER or EMPLOYEE hitting either URL directly saw a working page with no indication it wasn't meant for them.
- **BUG-004:** `/employees` gave EMPLOYEE no explicit message at all — a `useEffect` silently `router.replace('/profile')`'d them away before any content rendered, with zero explanation.

Neither backend endpoint had a matching gap: `GET /departments` and `GET /positions` have no `@Roles` decorator by design (intentionally open, read-only company-directory data for any authenticated role); `GET /employees` is `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` and already excludes EMPLOYEE server-side. **No backend RBAC bug was found** — this was purely an Admin Web UX gap, confirmed via `git diff --stat -- apps/api/ prisma/` showing zero backend/schema changes.

## Root Cause / Current UX Behavior (before this change)
The codebase already had three different ad-hoc "access denied" patterns on other pages (`/attendance/offsite-review`'s inline card, `/audit-logs`'s `ErrorState status=403` — hardcoded English only, `/attendance/geofence-settings`'s plain centered text) but none were shared, and none were applied to Departments/Positions/Employees at all. Those three pages were left untouched in this change (out of primary scope, and `offsite-review` is explicitly protected from behavior changes by this task's instructions).

## Routes Covered
| Route | SUPER_ADMIN / HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|
| `/departments` | Full page (unchanged) | **Now: explicit access denied** (was: read-only table) | **Now: explicit access denied** (was: read-only table) |
| `/positions` | Full page (unchanged) | **Now: explicit access denied** (was: read-only table) | **Now: explicit access denied** (was: read-only table) |
| `/employees` | Full page (unchanged) | Team-scoped view (unchanged — MANAGER is authorized by policy and backend RBAC) | **Now: explicit access denied** (was: silent redirect to `/profile`) |

MANAGER's `/employees` "My Team" view (department-scoped by the backend, `@Roles(..., MANAGER)`) was deliberately left as-is per the task's guidance to keep `isAdmin`-only gating "unless the route truly supports MANAGER by policy" — it does here, both by backend `@Roles` and by the existing `page_employees_team` UI.

## UX Changes
- New shared component `apps/web/components/AccessDeniedCard.tsx` — a centered card with a title, detail line, and a safe "back to dashboard" link (`/dashboard` by default), fully localized via the existing `useLanguage()`/`t()` hook.
- New i18n keys in `apps/web/lib/i18n.ts` (English + Thai): `access_denied_title`, `access_denied_detail`, `access_denied_back_link`.
  - Thai title matches the exact wording already used on `offsite-review` ("ไม่มีสิทธิ์เข้าถึงหน้านี้") for consistency.
- `/departments` and `/positions`: added `if (!admin) return <AccessDeniedCard .../>;` right before the main render (after all hooks, following the existing `offsite-review` pattern). Also guarded each page's `load()` and any admin-only supporting fetch (e.g. the manager-dropdown employee list on Departments, the department-filter list on Positions) with `if (!admin) return;` so no data fetch fires at all for a denied role — nothing loads into state that could ever reach the DOM.
- `/employees`: replaced the silent `router.replace('/profile')` for EMPLOYEE with `if (isEmployee) return <AccessDeniedCard .../>;`. Removed the now-unused `useRouter` import/call. MANAGER and admin paths are untouched.
- No CSS-only hiding is used anywhere — the denied roles never reach the render branch that contains admin-only markup or data, so nothing sensitive is ever mounted into the DOM to hide.

## Files Created
- `apps/web/components/AccessDeniedCard.tsx`
- `apps/web/e2e/access-denied.spec.ts`

## Files Modified
- `apps/web/app/(app)/departments/page.tsx`
- `apps/web/app/(app)/positions/page.tsx`
- `apps/web/app/(app)/employees/page.tsx`
- `apps/web/lib/i18n.ts`
- `apps/web/e2e/helpers/auth.ts` (new `injectRoleAuth()` test helper — see Tests below)
- `docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md` (BUG-003/BUG-004 rows marked fixed)
- `HR-Knowledge/01-START-HERE/Current Status.md` (`HOTFIX-T089B` marked closed via `ACCESS-UX-001`)

No files under `apps/api/` or `prisma/` were touched (verified via `git diff --stat -- apps/api/ prisma/` — empty output).

## Tests Added/Updated
New `apps/web/e2e/access-denied.spec.ts` (11 tests, all passing):
- SUPER_ADMIN sees the full page (not denied) on `/departments`, `/positions`, `/employees`.
- MANAGER and EMPLOYEE see the explicit access-denied card on `/departments` and `/positions`, with zero `<table>` in the DOM.
- MANAGER is **not** denied on `/employees` (team-view policy preserved) and the admin-only "Add Employee" button stays hidden.
- EMPLOYEE is denied on `/employees`.
- The access-denied card's back-link points to `/dashboard` (checked on both Departments and Employees).
- Each "denied" assertion also checks the card's rendered text (`toHaveText(/ไม่มีสิทธิ์|do not have permission/i)`), not just element visibility — matching this repo's existing localization-verification convention (`DEPT-POLISH-001`'s `toHaveText(/ทั้งหมด|total/i)`) so a raw/unresolved i18n key would fail the test, not just an empty card.

**Test technique note:** MANAGER/EMPLOYEE cases use a synthetic `localStorage` role (`injectRoleAuth()`, new helper) rather than a real backend login, since this repo has no seeded non-admin test accounts and no unit-test framework for `apps/web` (Playwright e2e only). The synthetic token isn't backend-signed, so any real API call made with it would 401 — and `AppLayout` unconditionally calls `GET /auth/me` on every authenticated page for the header display name, which would otherwise trip the app's global 401 handler (`clearAuth()` + hard-redirect to `/login`) before the page's own access-denied gate ever rendered. `injectRoleAuth()` stubs `GET /auth/me` via Playwright route interception (mocked-network technique already established in this repo, e.g. `REQ-002F`'s off-site-review verification) to a 200 matching the synthetic user, purely so the layout mounts — it does not fake authorization for any other endpoint. The one page where an allowed non-admin role does make a real list call (MANAGER on `/employees`) also stubs that specific `GET /employees` request to an empty page for the same reason. No real employee/account records were created or mutated by these tests.

Full Playwright suite re-run to confirm zero regressions across the whole app (not just the touched pages): **122 passed, 2 skipped (pre-existing, unrelated to this change), 0 failed.**

## Verification Commands and Results
- `npx tsc --noEmit` (apps/web) → PASS
- `./scripts/verify.sh` (API build + Prisma validate + Web build) → **PASS**
- `./scripts/e2e-local.sh` (full Playwright suite, local-safe env per `LOCAL-E2E-ENV-001`) → **PASS — 122 passed, 2 skipped** (pre-existing, unrelated), 0 failed. No dedicated `positions.spec.ts` exists in this repo; Positions coverage (admin-allow + non-admin-deny) is in the new `access-denied.spec.ts`.
- `./scripts/docker-verify.sh` → **PASS** (API health, Web reachable, Mobile reachable; all containers healthy; left running, not torn down)
- `./scripts/api-smoke-test.sh` → **PASS** (login, `/auth/me`, `/employees`, `/departments`, `/positions`, `/attendance`, `/leave`, `/leave-balances`, `/dashboard`, unauthenticated 401 check)
- `./scripts/security-review.sh` → **PASS** (dependency audit: only the two pre-existing, already-accepted Multer HIGH findings; no new advisories; secret scan clean)
- `git status` → 7 modified, 2 untracked (listed above), working tree otherwise clean
- `git diff --stat` → 7 files changed, 78 insertions, 21 deletions
- `git diff --check` → exit 0, no whitespace errors
- `git diff --stat -- apps/api/ prisma/` → **empty** (zero backend/schema changes)

## Runtime Impact
Admin Web only. Requires a production Admin Web redeploy to take effect (no API/mobile redeploy needed).

## API Impact
None. No API route, controller, guard, or DTO was touched.

## Migration Impact
None. No Prisma schema or migration change.

## Security / RBAC / Privacy Impact
- **Auth impact:** None — no new/changed guarded endpoints (frontend-only change).
- **RBAC impact:** None at the backend. At the frontend, access was *tightened*, never widened: `/departments` and `/positions` now refuse to render their table for non-admin roles that could previously view it (a UX restriction, not a data-access restriction — those `GET` endpoints remain intentionally open by backend design). `/employees` for EMPLOYEE goes from "silently redirected, no page rendered" to "denied card rendered, no page content rendered" — functionally equivalent access, more informative UX.
- **Data privacy impact:** Reduced exposure surface, not increased — non-admin roles now see *less* rendered content on Departments/Positions than before (the read-only table is gone for them), and no admin-only fetch fires at all for a denied role. Nothing new is exposed.
- **Password/token/hash impact:** None.
- **Mobile security impact:** None — mobile app untouched.
- **Dependency/advisory impact:** No new packages added. `security-review.sh` dependency audit clean (only pre-existing accepted-risk Multer findings).
- **Secrets/logging check:** No secrets, tokens, or passwords added to any file, log, or test. The e2e test helper's synthetic token/user is a fixed placeholder string (`e2e-synthetic-token-access-denied-test`), never a real credential, and is never sent to a real protected endpoint (the one endpoint it could reach, `/auth/me`, is intercepted and never leaves the browser).
- **New endpoints protected:** None — no new endpoints were added.
- **Risk level:** LOW.
- **Security decision:** PASS.

## Production Redeploy Requirement
Yes — Admin Web (`apps/web`) must be rebuilt and redeployed for this to take effect in production. API and Mobile do not need to be redeployed.

## Manual QA Checklist
1. Log in as SUPER_ADMIN or HR_ADMIN → `/departments`, `/positions`, `/employees` all render normally with full CRUD, exactly as before.
2. Log in as MANAGER → `/departments` and `/positions` show the access-denied card (Thai: "ไม่มีสิทธิ์เข้าถึงหน้านี้") with a working "back to dashboard" link; `/employees` still shows the team-scoped view with no Add/Edit/Delete controls, unchanged from before.
3. Log in as EMPLOYEE → `/departments`, `/positions`, and `/employees` all show the access-denied card; the link returns to `/dashboard`.
4. Toggle the language switch on the access-denied card and confirm both Thai and English render correctly (no hardcoded fallback string).
5. Confirm no admin-only element (table rows, "Add" buttons, employee/department names) ever flashes on screen before the denied card appears, on a slow network throttle.
6. Confirm `/attendance/offsite-review`, `/audit-logs`, and `/attendance/geofence-settings` behave exactly as before this change (out of scope, not touched).

## Remaining Risks / Deferred Work
- The three pre-existing, differently-styled access-denied patterns on `/attendance/offsite-review`, `/audit-logs`, and `/attendance/geofence-settings` were **not** consolidated onto the new shared `AccessDeniedCard` component, per this task's explicit scope (and the explicit instruction not to change Off-site Review behavior). A future low-risk polish task could unify all four onto the shared component and fix `/audit-logs`'s hardcoded-English `ErrorState status=403` branch, which still ignores the language toggle.
- `apps/web` has no unit/component test framework (Playwright e2e only) — see the Tests section above for how non-admin coverage was achieved without one.
- Department pagination i18n (limitation #22, pre-existing, unrelated) remains open.

## Recommended Commit Message
```
fix(web): show explicit access denied for admin routes

Add a shared AccessDeniedCard component and gate /departments, /positions
(admin-only) and /employees (EMPLOYEE role) behind it, replacing the
previous degraded read-only view and silent redirect. Frontend-only;
no backend RBAC or schema change. Closes HOTFIX-T089B (BUG-003/BUG-004).
```

## PASS/FAIL Recommendation
**PASS.**
