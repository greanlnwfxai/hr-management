# CTO Summary

## Step
UX-POLISH-002 — Consolidate Admin Web Access Denied UX

## Status
PASS

## Scope
Consolidate all Admin Web access-denied/forbidden UX onto the shared, localized `AccessDeniedCard` component introduced by `ACCESS-UX-001`, and fix the one variant guaranteed to ignore the language toggle (`ErrorState`'s hardcoded-English 403 branch). Admin Web (`apps/web`) frontend only — no backend/API, Prisma, or Mobile/PWA changes. No access policy, RBAC, or permission changes.

## Investigation Findings

`UX-AUDIT-001` (Section B) had already identified "4 incompatible implementations" of access-denied UX. Re-verified against current code, all four confirmed present:

1. **`AccessDeniedCard`** — used correctly by `/departments`, `/positions`, `/employees` (from `ACCESS-UX-001`). Baseline pattern, left unchanged.
2. **Hand-duplicated inline JSX** — `attendance/offsite-review/page.tsx` had its own copy of the card markup with its own i18n keys (`offsite_review_access_denied_*`), functionally correct and localized, but structurally divergent from the shared component (double maintenance surface).
3. **`ErrorState status={403}`** — `attendance/risk-reviews/page.tsx` and `audit-logs/page.tsx` used the generic inline-error component as a full-page route gate. `ErrorState.tsx`'s 403 branch hardcoded `"Access Denied"` / `"You don't have permission to view this resource."` in English with no `t()` call — the one variant that ignores the language toggle entirely, as UX-AUDIT-001 flagged.
4. **Bare `<div>`, no testid/back-link** — `attendance/geofence-settings/page.tsx` rendered only `{t('error_access_denied')}` centered in a plain div. Localized text but no icon, no title/detail split, no safe navigation link, and not testable by a stable selector.

## Admin Web Changes

- **`AccessDeniedCard.tsx`**: added optional `title`, `description`, `backLabel` props (all fall back to the existing default localized copy) so route-specific messaging can be preserved without forking the component.
- **`ErrorState.tsx`**: the 403 branch now calls `useLanguage()`/`t('error_access_denied')` / `t('error_access_denied_detail')` instead of hardcoded English strings. This component is still used for genuine inline (non-route-level) 403s — e.g. a sub-resource fetch failing inside an otherwise-authorized page — so it was fixed in place rather than removed.
- **`attendance/offsite-review/page.tsx`**: inline duplicate block replaced with `<AccessDeniedCard backHref="/attendance" title={...} description={...} backLabel={...} />`, reusing its existing `offsite_review_access_denied_*` i18n keys so the route-specific copy and `/attendance` back-link (not the default `/dashboard`) are unchanged.
- **`attendance/risk-reviews/page.tsx`** and **`audit-logs/page.tsx`**: full-page `<ErrorState status={403} />` gate (with a leading `<h1>` page title still rendered above it) replaced with `<AccessDeniedCard testid="access-denied-risk-reviews" />` / `<AccessDeniedCard testid="access-denied-audit-logs" />`, matching the departments/positions/employees pattern (no page title shown before the gate).
- **`attendance/geofence-settings/page.tsx`**: bare div replaced with `<AccessDeniedCard testid="access-denied-geofence-settings" />`.

No route's admin/manager/employee eligibility logic (`isAdmin`, `isAdminOrManager`) was touched — only the JSX rendered when that check fails.

## Routes/Components Consolidated

| Route | Before | After |
|---|---|---|
| `/departments`, `/positions`, `/employees` | `AccessDeniedCard` | unchanged |
| `/attendance/offsite-review` | inline duplicate JSX | `AccessDeniedCard` (route-specific copy override) |
| `/attendance/risk-reviews` | `ErrorState status={403}` (hardcoded English) | `AccessDeniedCard` (default copy) |
| `/audit-logs` | `ErrorState status={403}` (hardcoded English) | `AccessDeniedCard` (default copy) |
| `/attendance/geofence-settings` | bare `<div>` | `AccessDeniedCard` (default copy) |

`ErrorState`'s 403 branch remains in use for inline API-error cases (e.g. `/leave`'s admin-only balance panel fetch failing) — now localized, not replaced, per the task's instruction to keep unauthenticated/session-expired and generic-error handling separate from the route-level access-denied pattern.

## Files Modified
- `apps/web/components/AccessDeniedCard.tsx`
- `apps/web/components/ErrorState.tsx`
- `apps/web/app/(app)/attendance/offsite-review/page.tsx`
- `apps/web/app/(app)/attendance/risk-reviews/page.tsx`
- `apps/web/app/(app)/audit-logs/page.tsx`
- `apps/web/app/(app)/attendance/geofence-settings/page.tsx`
- `apps/web/e2e/access-denied.spec.ts`
- `docs/UX_AUDIT_001_ADMIN_WEB_MOBILE_REAL_USAGE_POLISH.md`
- `docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md`
- `HR-Knowledge/01-START-HERE/Current Status.md`

## Files Created
- `docs/CTO_SUMMARY_UX_POLISH_002_ACCESS_DENIED_CONSOLIDATION.md` (this file)

## Tests Added/Updated
Extended `apps/web/e2e/access-denied.spec.ts` (existing file from `ACCESS-UX-001`) with 13 new tests, no new test framework:
- **Audit Logs**: SUPER_ADMIN sees the page (not denied); EMPLOYEE sees the shared card with localized text; card has a safe back-to-dashboard link.
- **Risk Reviews**: SUPER_ADMIN sees the page (not denied); EMPLOYEE sees the shared card, admin-only filter (`filter-status`) not rendered.
- **Off-site Review**: EMPLOYEE sees the shared card with route-specific copy; card links back to `/attendance` (not `/dashboard`); **MANAGER is NOT denied** (regression check for `SEC-OFFSITE-001` policy).
- **Geofence Settings**: EMPLOYEE sees the shared card with a safe back link (previously untestable — no testid existed).
- **Language toggle**: switching EN ⇄ TH while an access-denied card is visible updates its copy live, without reload.

All new tests use the existing `injectRoleAuth`/`injectAuth` helpers (synthetic non-backend-signed tokens for MANAGER/EMPLOYEE, real cached JWT for admin) already established by `ACCESS-UX-001` — no new test infrastructure.

**One pre-existing app behavior found and worked around in tests, not fixed:** unlike `/departments`, `/audit-logs`, and `/attendance/risk-reviews`, the `/attendance/offsite-review` page's data-fetch effect does not internally gate on `isAdminOrManager` before firing — it always calls `GET /attendance/offsite-review` on mount, relying only on the render-time check to hide the result. **Verified this is not a data-privacy issue**: `apps/api/src/attendance/attendance.controller.ts:210-211` guards `GET /attendance/offsite-review` with `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` under `@UseGuards(JwtAuthGuard, RolesGuard)`, so a real EMPLOYEE JWT gets a genuine 403 from the backend and the page's early-return still hides the (empty/error) result — no data reaches the DOM. With this test suite's synthetic (unsigned) role tokens the request instead 401s (invalid signature, not a role check) and trips the app's global-401 redirect-to-login handler, which stomped the access-denied assertion before route stubbing was added; test routes now stub the endpoint to observe the real production behavior. Not fixed because it's out of scope for a UX-consolidation task (no policy/behavior change) and confirmed not a security issue — the backend already denies the request correctly regardless of the frontend gate.

## Consolidated vs. Left Route-Specific

- **`employees/[id]`** — `UX-AUDIT-001` named this page's fallthrough to `ErrorState` on a 403 as a gap. Left as `ErrorState` deliberately, not consolidated onto `AccessDeniedCard`: it's a catch-all inline error handler on that page (also used for 404s/500s from the employee-detail fetch), not a dedicated full-page route gate like the other five routes in this task. It does benefit from this task's `ErrorState` i18n fix (the 403 case there is no longer hardcoded English), which resolves the language-toggle part of the original finding without repurposing a generic error component into a route gate.
- **`/leave` manager approval entry point** — the task's test list named this as a regression check. No new test was added because `/leave` has no full-page access-denied gate to regress: it renders for all authenticated roles and only conditionally shows admin/manager controls (`canManageLeave`/`admin` flags), which this task did not touch. Existing coverage (`leave-attendance.spec.ts`) already exercises the page load; manager-scoped approval behavior itself is `HOTFIX-T089A`'s concern, unaffected here.

## Verification Result
- `./scripts/verify.sh` → **PASS** (API build, Prisma schema validate, Web build all green)
- `./scripts/docker-verify.sh` → **PASS** (stack healthy, non-destructive, containers left running)
- `./scripts/api-smoke-test.sh` → **PASS**
- `npx tsc --noEmit` (apps/web) → clean, no errors
- Full Admin Web Playwright suite via `./scripts/e2e-local.sh` (local-safe API URL override, avoids the known prod-URL-baked-into-bundle CORS issue — see `Current Status.md` limitation #20): **131 passed, 2 intentionally skipped, 1 failed**. The 1 failure (`employee-account.spec.ts:65`, "no-account state shows create account form when no account linked") is unrelated to this change — a pre-existing, data-state-dependent test — and passes cleanly (3/3, 0 failed) when re-run in isolation against the same stack, confirming it's cross-test seed-data flakiness, not a regression from this task.
- `git diff --stat -- apps/api/ apps/mobile prisma/` → empty (no backend/mobile/schema files touched)
- `git diff --check` → clean

## Runtime Impact
Admin Web only. `AccessDeniedCard` gained optional props (backward-compatible — existing 3 call sites pass no new props and render identically). Four routes now render a different (but equivalent-or-better) component when access is denied; no change to when access is denied.

## API Impact
None. No `apps/api` files touched.

## Mobile Impact
None. No `apps/mobile` files touched.

## Migration Impact
None. No Prisma schema/migration files touched.

## Security Review

| Field | Answer |
|---|---|
| Auth impact | None — no guarded endpoint added/changed |
| RBAC impact | None — `isAdmin`/`isAdminOrManager` checks unchanged; only the JSX rendered on denial changed |
| Data privacy impact | None — no new data exposed; verified no admin-only table/filter/action renders in the DOM before or after the gate (checked via Playwright, not just CSS) |
| Password/token/hash impact | None |
| Mobile security impact | None — Mobile untouched |
| Dependency/advisory impact | None — no `package.json` changes |
| Secrets/logging check | None — no secrets touched; verified no tokens/credentials appear in any changed file or in this summary |
| New endpoints protected | None — no new endpoints created |
| Risk level | LOW |
| Security decision | PASS |

`./scripts/security-review.sh` was **not run** — per `CLAUDE.md`, it's required only when auth/RBAC/security/API/dependency files are touched. This task touched only Admin Web presentational components and a corresponding e2e spec; no role-check, guard, or policy code was modified (confirmed via `git diff --stat -- apps/api/`, empty).

## Production Redeploy Requirement
Yes — Admin Web bundle changed, requires redeploy for the fix to reach production. No API/Mobile redeploy needed.

## Manual QA Checklist
- [ ] As EMPLOYEE, visit `/departments`, `/positions`, `/employees`, `/attendance/risk-reviews`, `/audit-logs`, `/attendance/geofence-settings` — confirm identical card styling/back-link on all six
- [ ] As EMPLOYEE, visit `/attendance/offsite-review` — confirm the shared card renders with its distinct copy and a link back to `/attendance`
- [ ] As MANAGER, visit `/attendance/offsite-review` and `/employees` — confirm both remain fully accessible (not denied)
- [ ] Toggle EN ⇄ TH while any access-denied card is visible — confirm copy updates live
- [ ] Inspect DOM (not just visual) while denied — confirm no admin table/filter/button markup is present
- [ ] As SUPER_ADMIN/HR_ADMIN, confirm all six routes still load their full content normally

## Remaining Risks / Deferred Work
- `attendance/offsite-review`'s unconditional data fetch on mount (regardless of role) is pre-existing and out of scope — noted above, not a security issue, not fixed here.
- `UX-POLISH-003` (`/offsite` i18n retrofit) remains open, explicitly out of scope per task instructions.
- `UX-POLISH-004` through `011` (Mobile discoverability, date-format standardization, etc.) remain open per `UX-AUDIT-001`'s backlog, unaffected by this task.

## Recommended Commit Message
```
fix(web): consolidate access denied UX

Replace the 4 incompatible access-denied implementations (inline
duplicate JSX on offsite-review, hardcoded-English ErrorState 403 on
risk-reviews/audit-logs, bare div on geofence-settings) with the
shared AccessDeniedCard from ACCESS-UX-001. AccessDeniedCard gains
optional title/description/backLabel overrides so offsite-review's
distinct copy and back-link are preserved. ErrorState's 403 branch
is localized instead of hardcoded English. No RBAC/policy change.
```

## Decision
PASS
