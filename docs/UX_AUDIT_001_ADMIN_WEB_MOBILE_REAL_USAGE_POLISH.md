# UX Audit 001 — Admin Web + Mobile/PWA Real-Usage Polish

**Audit-only. No runtime, API, mobile, or migration code was modified to produce this report.**

Scope: Admin Web (`apps/web`) and Mobile/PWA "STEP Connect" (`apps/mobile`) post-`v1.2.97-access-denied-ux`. Method: static code inspection (own reads + three parallel code-search passes), cross-checked against `docs/QA_T098_*`, `docs/QA_T089_*`, `docs/QA_T086_*`, recent CTO summaries, and `HR-Knowledge/01-START-HERE/Current Status.md`. No live environment was driven (see Section H).

> **Status update:** `UX-POLISH-001` (Mobile Home silent error state — Section F, and the table row in Section D) is **RESOLVED**. See `docs/CTO_SUMMARY_UX_POLISH_001_MOBILE_HOME_ERROR_STATE.md`.
>
> **Status update:** `UX-POLISH-002` (Admin Web access-denied consolidation — the "4 incompatible implementations" finding under Section B, and the table row in Section D) is **RESOLVED**. All four variants (`AccessDeniedCard` on departments/positions/employees; the hand-duplicated inline JSX on `attendance/offsite-review`; the hardcoded-English `ErrorState status={403}` gate on `risk-reviews`/`audit-logs`; the bare testid-less `<div>` on `attendance/geofence-settings`) now render through the shared, localized `AccessDeniedCard`, which gained optional `title`/`description`/`backLabel` overrides so `offsite-review`'s distinct copy and `/attendance` back-link were preserved rather than genericized. `ErrorState`'s 403 branch (still used for inline, non-route-level 403s) is also now localized instead of hardcoded English. See `docs/CTO_SUMMARY_UX_POLISH_002_ACCESS_DENIED_CONSOLIDATION.md`.
>
> All other findings in this audit remain open/unaddressed as of this update.

---

## A. Executive Summary

**Current UX maturity:** Functionally solid, unevenly polished. Every screen reviewed has working core functionality, correct role gating at the data layer (backend `@Roles` guards are consistently present and correct), and reasonable loading/empty states on the *better-built* pages (Attendance tab, off-site-review, risk-reviews, Approvals). But polish quality varies sharply page-to-page: i18n coverage, date-formatting convention, and access-denied presentation are each implemented at least three different, incompatible ways across the app — a sign of organic, page-by-page feature delivery without a shared UX pattern being enforced. Test coverage is concentrated on the newest/most-scrutinized flows (departments, access-denied, off-site-review, risk-reviews) and near-absent on older or "obviously working" screens (positions, `/offsite`, geofence-settings, and almost all of Mobile).

**Main conclusion:** The highest-value polish opportunity is not any single broken feature — it's **inconsistency**: the same *kind* of UI state (access-denied, date formatting, error handling) is solved differently on different pages, which is exactly the kind of thing real users notice even when they can't articulate it, and exactly the kind of thing that causes future hotfixes (as already happened twice with the Mobile leave-overlay logic). Fixing the newest/most-visible inconsistencies (access-denied UX, Mobile Home's silent error state) is higher leverage than any deep feature build right now.

**Top recommended next task:** Surface the existing but currently-swallowed error state on Mobile Home (`apps/mobile/app/home.tsx`) so a failed data fetch shows an error+retry banner instead of silently rendering a fully-populated-looking dashboard with fabricated zeros. This is the single screen every employee, manager, and admin sees first, every day. See Section F.

**Separately — a live, unfixed RBAC/data-exposure issue was found and must not be read as a polish item.** See the boxed **SECURITY FINDING** immediately below. It is real, reachable in production today, and already tracked (but under-prioritized) as an open "Known Limitation." Finding it is a successful audit outcome, not an audit failure, and this audit does not change or fix it — the task is audit-only.

---

## ⚠ SECURITY FINDING (not a polish item — do not fold into the backlog below)

> **RESOLVED by `SEC-OFFSITE-001`** — see [docs/CTO_SUMMARY_SEC_OFFSITE_001_MANAGER_SCOPE.md](CTO_SUMMARY_SEC_OFFSITE_001_MANAGER_SCOPE.md). `findAll()`/`findOne()` in `off-site.service.ts` now intersect the MANAGER's managed department (mirroring `leave.service.ts`), and `approve()`/`reject()` now also block self-review. The finding below is left as-written for audit-trail accuracy; it describes the pre-fix state.

**`GET /off-site` (list) and `GET /off-site/:id` (detail) are not department-scoped for the MANAGER role**, unlike the equivalent `GET /leave` / `GET /leave/:id` endpoints, which were scoped in `HOTFIX-T089A` (`v1.2.96`).

- **Verified in code:** `apps/api/src/off-site/off-site.service.ts` — `findAll()` (lines 98–118) builds its Prisma `where` clause from query params only (`employeeId`, `status`, `date`); it never intersects the caller's managed department. `findOne()` (lines 121–140) returns any record to `SUPER_ADMIN`, `HR_ADMIN`, **or `MANAGER`** with no department comparison at all (contrast `apps/api/src/leave/leave.service.ts:163–174`, which explicitly checks `managerEmp.managedDepartment.id !== record.employee.department?.id` for MANAGER).
- **Reachable today:** `apps/web/app/(app)/offsite/page.tsx:32,46` — the Admin Web `/offsite` page treats MANAGER as `canApprove` and calls `getOffSiteRequests()` (`apps/web/lib/api.ts:852–860`, `GET /off-site`, no `employeeId` filter) with no department narrowing. Any MANAGER visiting `/offsite` sees **every** off-site request org-wide — work location, reason text, and employee identity — for departments they do not manage.
- **Impact:** Data privacy / RBAC scope leak. Same class of bug HOTFIX-T089A fixed for leave; not yet applied to off-site.
- **Already tracked, but under-flagged:** `HR-Knowledge/01-START-HERE/Current Status.md` line 210 (Known Limitation #4) documents this exact gap ("`GET /off-site` list access remain[s] org-wide") with a soft "Future: ... if needed" plan. Given the identical pattern was treated as a same-day hotfix once found for `/leave`, this recommendation is to re-prioritize it the same way, not leave it as an indefinite "if needed."
- **One doc-accuracy note surfaced along the way (not a security issue):** the same Known Limitation #4 also still lists `GET /leave/:id` as unscoped. That is now stale — commit `1be3fb9` (`HOTFIX-T089A`, tagged `v1.2.96`) added MANAGER department scoping to `leave.service.ts`'s `findOne()` in the same commit that introduced the "HOTFIX-T089A-FOLLOWUP" comment implying it was still pending. The code is safe; only the tracking doc/CTO summary text is out of date. Worth a one-line doc correction whenever `Current Status.md` is next touched.
- **Recommendation:** Track as its own small, backend-touching fix (`SEC-OFFSITE-001` below), scoped and tested the same way as `HOTFIX-T089A` — mirror the `findAll`/`findOne` department-intersection logic from `leave.service.ts` into `off-site.service.ts`. This is **not** part of the polish backlog in Section D and should not be scheduled as frontend-only work.

---

## B. Admin Web Findings

Shared components first, then per-page.

### Shared: Navigation / Sidebar (`apps/web/components/AppLayout.tsx`)
- **Behavior:** `navForRole()` correctly varies nav items by role (11 for SUPER_ADMIN/HR_ADMIN, 6 for MANAGER, 3 for EMPLOYEE).
- **Friction:** Four attendance-family routes (`/attendance`, `/attendance/offsite-review`, `/attendance/risk-reviews`, `/attendance/geofence-settings`) render as flat, equal-weight sibling nav items with no visual grouping despite being logically nested. Label collision between `nav_offsite` ("Off-Site") and `nav_offsite_review` ("Off-site Review") — two near-identical labels for two different features (self-service request vs. admin review queue).
- **Role:** All. **Risk:** Low (presentational). **Type:** Frontend-only. **Tests:** `navigation.spec.ts`.

### Shared: Access-Denied UX — 4 incompatible implementations
This directly undercuts the intent of the just-shipped `ACCESS-UX-001` (`v1.2.97`) work.
1. `AccessDeniedCard.tsx` — used by `/employees`, `/departments`, `/positions`. Localized, has icon + back-link.
2. Hand-duplicated inline JSX — `attendance/offsite-review/page.tsx:182–192`, own near-duplicate i18n keys (`offsite_review_access_denied_*` vs. the shared `access_denied_*` keys).
3. `ErrorState status={403}` — used by `risk-reviews` and `audit-logs`. **Verified:** `apps/web/components/ErrorState.tsx:15–17` hardcodes `"Access Denied"` / `"You don't have permission to view this resource."` in English with no `t()` call — the one access-denied variant guaranteed to ignore the language toggle.
4. Bare centered `<div>`, no icon/back-link — `attendance/geofence-settings/page.tsx:57–63`.
- **Role:** MANAGER/EMPLOYEE hitting admin-only routes. **Risk:** Medium (touches recently-hardened RBAC UX; easy to regress). **Type:** Frontend-only. **Tests:** `access-denied.spec.ts` covers variant 1 only.

### dashboard
- Good empty/loading/error coverage. Friction: several `statusBadge()` calls (lines ~1006–1066) omit the `label` arg and render raw enum strings ("ACTIVE", "PRESENT") instead of localized labels used elsewhere on the same page. `formatTimestamp` hardcodes `'th-TH'`/Asia-Bangkok regardless of language toggle; line ~822 hardcodes a Thai unit string outside `t()`.
- **Role:** All. **Risk:** Low. **Type:** Frontend-only. **Tests:** `dashboard.spec.ts`.

### employees
- Admin-only CRUD, good `t()` coverage. Friction: native `window.confirm` for deactivate vs. custom `Modal` used elsewhere (inconsistent confirmation pattern); several hardcoded English validation/toast strings bypass `t()`.
- **Role:** HR_ADMIN/SUPER_ADMIN (write), MANAGER (read). **Risk:** Medium (CRUD+RBAC). **Type:** Frontend-only. **Tests:** `employees.spec.ts`.

### employees/[id]
- **Biggest single-page i18n gap in Admin Web:** the entire page except the embedded `AccountCard` subcomponent is hardcoded English — section headers, `InfoRow` labels, table columns — while the rest of the app is bilingual. Dates use `'en-US'` (a third locale convention vs. dashboard's `'th-TH'`). `AccountCard` itself mixes hardcoded Thai strings with `t()` calls, so Thai text shows even in English mode. No explicit page-level role gate for EMPLOYEE — falls through to the hardcoded-English `ErrorState` on a 403 rather than a proper access-denied screen.
- **Role:** HR_ADMIN/SUPER_ADMIN (full), MANAGER/EMPLOYEE (degraded). **Risk:** Medium (account provisioning/password-reset logic lives here). **Type:** Frontend-only. **Tests:** `employee-account.spec.ts`.

### departments
- One of the better-localized pages — consistent `t()`, locale-aware `formatDate(iso, lang)` helper. Minor: delete-blocked tooltip and confirm dialogs hardcoded English.
- **Role:** HR_ADMIN/SUPER_ADMIN. **Risk:** Low-Medium. **Type:** Frontend-only. **Tests:** `departments.spec.ts`.

### positions
- Structurally near-identical to departments but its date column uses raw `new Date(...).toLocaleDateString()` with no `lang` param — inconsistent with departments' shared helper despite being a near-duplicate page. Same hardcoded validation/toast pattern.
- **Role:** HR_ADMIN/SUPER_ADMIN. **Risk:** Low. **Type:** Frontend-only. **Tests:** none dedicated — only incidental coverage via `access-denied.spec.ts`/`navigation.spec.ts`.

### leave (923 lines — list, approval, self-request, balance CRUD, adjustments, vacation setup)
- Careful, well-commented RBAC (`canManageLeave` vs. stricter `admin`-only balance panel); client-side self-approval block as defense-in-depth matching the server guard. Friction: the "Adjust Vacation Balance" modal is entirely un-translated while every other modal on the same page uses `t()` — reads like a later addition that missed i18n. Status/leave-type values render as raw enums in places instead of the `leaveTypeLabel`/`leaveStatusLabel` helpers used elsewhere. Toast messages hardcoded English throughout.
- **Role:** EMPLOYEE (self-request), MANAGER+ (approve), HR_ADMIN/SUPER_ADMIN (balances). **Risk:** High (approval + balance-adjustment logic — most complex page in the app). **Type:** Frontend-only. **Tests:** `leave-attendance.spec.ts`, `leave-balance-modals.spec.ts`.

### attendance
- Friction: the "no employee profile" state stacks a Thai sentence *and* an English sentence together, always both shown regardless of language toggle. The offsite-review promo box is 100% hardcoded Thai, ignoring `t()` entirely. Status filter dropdown and a table header show raw/unlocalized text. `formatTime`/`formatDate` use `'en-US'` — a third date-locale convention in the app.
- **Role:** All (self) + admin (all-records). **Risk:** Medium. **Type:** Frontend-only. **Tests:** `leave-attendance.spec.ts` (attendance portion).

### attendance/offsite-review
- **Best-built page in the audit.** Full language-aware date/time/distance formatters, all copy through `t()`, correct department-scoped RBAC gate matching the backend, and GPS metrics show only distance/accuracy — never raw coordinates (deliberate privacy choice, matches ADR-033). Only gap: its access-denied block duplicates markup instead of reusing `AccessDeniedCard`.
- **Role:** MANAGER (team-scoped)/HR_ADMIN/SUPER_ADMIN. **Risk:** Medium. **Type:** Frontend-only. **Tests:** `attendance-offsite-review.spec.ts` (9 tests).

### attendance/risk-reviews
- Also well-localized; includes a thoughtful client-side `redactSensitive()` defense-in-depth pass with a comment noting the server already sanitizes. Admin-only, gated via `ErrorState status={403}` (the hardcoded-English variant — see shared finding above).
- **Role:** HR_ADMIN/SUPER_ADMIN only. **Risk:** High (security-relevant workflow). **Type:** Frontend-only. **Tests:** `attendance-risk-reviews.spec.ts`.

### attendance/geofence-settings
- Simple config form, good `t()` coverage, clear production-notice warning banner. Access-denied is the weakest of the four variants (bare text div).
- **Role:** HR_ADMIN/SUPER_ADMIN. **Risk:** Medium (misconfiguration affects downstream offsite/risk logic). **Type:** Frontend-only. **Tests:** none found.

### offsite
- **Second-worst i18n gap in Admin Web, and zero test coverage.** Verified: page subtitle, status filter options, table headers, action buttons, confirm/prompt dialogs, and toasts are almost entirely hardcoded Thai (`'ทุกสถานะ'`, `'รอการอนุมัติ'`, `'อนุมัติ'`/`'ปฏิเสธ'`, `'อนุมัติคำขอสำเร็จ'`, etc.) — only `t('nav_offsite')` and pagination prev/next are actually localized. Raw ISO date rendering (`req.date.split('T')[0]`) shows literal `"2026-07-16"` instead of any formatter. No visual cue distinguishing whether a MANAGER is seeing company-wide or department-scoped data — which directly intersects the SECURITY FINDING above (this page is the one that surfaces the unscoped data). **Verified: no e2e spec navigates to `/offsite`** (`grep` across `apps/web/e2e/*.spec.ts` found only `/attendance/offsite-review` references).
- **Role:** MANAGER/HR_ADMIN/SUPER_ADMIN only — **verified** `apps/web/components/AppLayout.tsx:41-49` does not give EMPLOYEE an `/offsite` nav entry at all (EMPLOYEE gets only dashboard/attendance/leave); self-service off-site requests for EMPLOYEE happen on Mobile only, not Admin Web. **Risk:** Medium-High (approval action, zero tests; the RBAC-scope issue is tracked separately as the SECURITY FINDING). **Type:** Frontend-only for the i18n/date/test-coverage gaps; the RBAC data issue is backend (tracked separately, not here).

### audit-logs
- Structurally near-identical to risk-reviews but far behind on i18n — filter labels, buttons, table headers, and the entire detail-modal's `DetailRow` labels are hardcoded English, despite page title/loading/empty/error strings correctly using `t()`. Reads like an i18n pass done for risk-reviews that was never back-ported here.
- **Role:** HR_ADMIN/SUPER_ADMIN only. **Risk:** Medium (compliance/security surface, read-only). **Type:** Frontend-only. **Tests:** `audit-logs.spec.ts`.

### profile / login
- Both fully localized, clean states, no significant friction. Minor: login's demo-hint placeholder hardcodes the Thai word "หรือ" directly in JSX instead of via `t()`.
- **Role:** All / unauthenticated. **Risk:** Low. **Type:** Frontend-only. **Tests:** `profile.spec.ts`, `force-password.spec.ts`, `login.spec.ts`.

---

## C. Mobile/PWA Findings

**Tech stack (verified):** Expo SDK 54 / React Native 0.81 via `expo-router`, exported to web with Metro/`react-native-web` (`"output": "single"`), *not* Next.js/next-pwa. "PWA" = the Expo web export installed via iOS "Add to Home Screen." **No service worker exists anywhere in the repo** (confirmed by grep and by `docs/QA_T086_MOBILE_PWA_REAL_USAGE.md` L4). Production: `https://mobilehr.eds-center.com`, iOS-primary; Android/Chrome PWA out of documented QA scope.

### Login / Route Guard
- Solid; no inline "why is the button disabled" feedback on empty fields. Token-expiry check is local JWT decode only, no server round-trip on boot — a server-revoked (not just expired) token looks valid until the first API call 401s (documented limitation).
- **Role:** All. **Risk:** Low. **Tests:** none.

### Home / Dashboard — highest-priority Mobile finding
- **Verified: silent data-load failure.** `apps/mobile/app/home.tsx:251,257` destructures `loadState: summaryLoadState` from `useHomeSummaries()` but only ever uses it to compute `isRefreshing` (line 314) — `error` is never read, and there is no `summaryLoadState === 'error'` branch anywhere in the file. A failed fetch renders a fully-populated-looking dashboard with zeroed stat cards (0 hours worked, 0 leave balance) and **no error banner or retry**, unlike Attendance/Leave/Approvals, which all have explicit error+retry UI.
- **Verified: discarded fetch.** `useDashboard()`'s role-gated `/dashboard` call runs on every mount/refresh for SUPER_ADMIN/HR_ADMIN/MANAGER, but `home.tsx` never renders its result — a wasted authenticated round-trip on every screen visit.
- Hardcoded placeholder: "รายการคำขอ" section always shows "ไม่มีรายการคำขอ" regardless of actual pending requests (documented, deliberately deferred). "ลางาน" stat card hardcoded to `valueMinutes={0}`, never wired to real data.
- The hero region has 5–6 mutually exclusive conditional blocks (off-site checkout, off-site pre-check-in, pending-review banner, normal clock in/out, outside-geofence CTA) in one 1087-line file — high maintenance risk.
- **Role:** All (dashboard fetch specifically wasted for SUPER_ADMIN/HR_ADMIN/MANAGER). **Risk:** Medium if touched (large file, many interacting conditionals; but the specific error-surfacing fix is small and additive). **PWA/cache concern:** none specific. **Tests:** none for the screen; indirectly via `leaveOverlay.test.ts` (pure functions only).

### Calendar
- Same hardcoded "ไม่มีรายการคำขอ" placeholder as Home. A "ปฏิหันทีม" (team calendar) tab exists in the header UI but is **non-functional** — no `onPress`, a visible dead affordance. No explicit error banner for fetch failure (relies on pull-to-refresh spinner alone).
- **Role:** All. **Risk:** Medium (shares `leaveOverlay.ts`, a 3-screen blast radius already responsible for two prior hotfixes). **Tests:** indirect only.

### Attendance tab (normal check-in/out)
- **Best-built mobile screen reviewed** — proper `loading|error|success` handling with Thai retry button. Note: the actual clock-in/out buttons live only on Home (via `GeofenceMapModal`), not here — `docs/MOBILE_ATTENDANCE_FOUNDATION.md` is stale on this point.
- **Role:** All. **Risk:** Medium (shares `leaveOverlay`). **Tests:** none direct.

### Off-site check-in / check-out
- Solid loading/error/disabled-state coverage, GPS status pill states all Thai-labeled, re-acquires GPS at submit time (not just on mount). No major gaps found in the portion read.
- **Role:** Employees who can work off-site. **Risk:** Medium (writes `workMode`/`reviewStatus` attendance records). **Tests:** `offsiteAttendance.test.ts` covers validators/payload builders only.

### Mixed checkout exception
- Fallback for checking out outside the geofence after an on-site clock-in. Not fully read; GPS-pill pattern consistent with off-site screens.
- **Role:** All employees. **Risk:** High (attendance-integrity exception path, payroll-adjacent). **Tests:** none found.

### Manager Approval
- **Most thoroughly built screen reviewed** — RBAC-gated, proper loading/error/empty states, good access-denied state for EMPLOYEE hitting the route directly.
- **Verified discoverability regression:** `docs/MOBILE_MANAGER_APPROVAL.md` describes a dedicated "อนุมัติคำขอลา" card on Home under a "สำหรับผู้จัดการ" section. **Grep confirms no such text exists in `home.tsx`.** The only entry point today is a small header pill button inside the Leave screen. No pending-count badge anywhere. The doc's own "Future Improvements" section flags this exact gap ("Approval notification badge on Home card") as still open.
- **Role:** MANAGER/HR_ADMIN/SUPER_ADMIN. **Risk:** High if touched (mutates leave balances/status, RBAC-adjacent) — but the *discoverability* fix (an entry point/badge) is low-risk, additive UI. **Tests:** none found.

### Leave Request
- Real native/web date picker (contradicts a stale "Known Limitation" in `MOBILE_LEAVE_REQUEST.md` claiming plain-text entry — that gap has since been closed but the doc wasn't updated). Good loading/error/empty coverage.
- **Role:** All (submit); MANAGER+ (approve shortcut). **Risk:** Medium. **Tests:** none direct.

### Approved-leave overlay (shared logic, `leaveOverlay.ts`)
- Powers Home, Calendar, and Attendance's day-type labeling. Subject of two consecutive hotfixes already (leave-calendar, then leave-attendance) because the three call sites kept silently diverging. Best-tested logic in the app (9 unit tests) but **no test wires it into an actual screen render** — the gap that let the divergence happen twice is not closed by the existing tests.
- **Role:** All. **Risk:** Medium (3-screen blast radius, proven history of regressions).

### Profile & Password Change
- `mustChangePassword` is enforced as a hard-redirect gate on Attendance, Leave, and Approvals, but Home only shows a dismissible banner — **inconsistent enforcement across screens** (a stale doc claim that "no forced redirect exists" has been partially, not fully, superseded by code).
- **Role:** All. **Risk:** Medium (gate logic spans 4 screens; an error could lock users out of or into the wrong screens). **Tests:** none.

### Geofence Map Modal (web variant read in full)
- Well-built: Leaflet map, real-time inside/outside-radius banner, error boundary around the map with a text fallback, distinct loading/ready/no-config/error states. Native variant (`react-native-maps`) not inspected — parity unverified.
- **Role:** All. **Risk:** High (gatekeeps actual clock-in/out submission — attendance-integrity logic). **Tests:** none.

### Thai date formatting
- Two competing conventions coexist: manual Buddhist-Era arrays (`calendar.tsx`, `attendance.tsx`, `home.tsx`) vs. `Intl`-based `toLocaleDateString('th-TH', …)` (`approvals.tsx`, `leave.tsx`). Both render correctly on the web export today, but Hermes (RN's native JS engine) has historically had thin `Intl` locale support — the `Intl`-based screens are a portability risk if/when a native build ships. Standardizing on the manual-array approach is the safer long-term choice.

### PWA/cache-staleness
- No service worker → no offline support (documented, out of scope) and **no update-prompt flow** for an already-open session when a new build ships. The concrete residual risk is a pinned stale `index.html` on an iOS home-screen install referencing old content-hashed chunk filenames — distinct from, and unrelated to, the separate `HOTFIX-MOBILE-REACT-MISMATCH-001` incident (a build-time dependency-pinning bug, not a caching bug). Given how frequently this app ships hotfixes, an update-prompt mechanism (`"a new version is available, tap to reload"`) is worth reconsidering even though full offline support stays out of scope.

### Test coverage (Mobile overall)
Only two test files exist in `apps/mobile`, both pure-function/utility level (`leaveOverlay.test.ts`, `offsiteAttendance.test.ts`). **Zero component/screen-level tests** exist for any screen, including the highest-risk ones (geofence-gated clock-in/out, Manager Approval). This is a direct contributor to the pattern already seen twice in the hotfix history.

---

## D. Prioritized Polish Backlog

Security item (`SEC-OFFSITE-001`) is listed for completeness but is **not** a polish task — see the boxed finding above. **Status: RESOLVED** — see [docs/CTO_SUMMARY_SEC_OFFSITE_001_MANAGER_SCOPE.md](CTO_SUMMARY_SEC_OFFSITE_001_MANAGER_SCOPE.md).

| ID | Title | App | Value | Risk | Type | Redeploy? | Suggested verification |
|---|---|---|---|---|---|---|---|
| SEC-OFFSITE-001 | ~~Department-scope~~ **DONE** — `GET /off-site` list + detail scoped to MANAGER's managed department, mirroring `HOTFIX-T089A`; approve/reject self-review also blocked | API | — (security, not polish) | Medium | API+frontend (backend fix; frontend already correct once scoped) | Yes | New Jest unit tests mirroring `leave.service.spec.ts`'s MANAGER-scoping cases; `./scripts/security-review.sh` |
| UX-POLISH-001 | Mobile Home: surface `useHomeSummaries` error state (error+retry banner instead of silent zeros); remove or wire the currently-discarded `useDashboard()` fetch | Mobile | High | Low | frontend-only | Yes (mobile bundle) | Manual QA on real device/PWA; consider a minimal RTL/Jest render test if component testing is introduced |
| UX-POLISH-002 | ~~Admin Web: consolidate the 4 access-denied variants into `AccessDeniedCard`; fix `ErrorState`'s hardcoded-English 403 branch to route through `t()`~~ **DONE** | Admin Web | Medium | Low | frontend-only | Yes (web bundle) | Extended `access-denied.spec.ts` to cover `/attendance/offsite-review`, `/audit-logs`, `/attendance/risk-reviews`, `/attendance/geofence-settings`, plus a live language-toggle test |
| UX-POLISH-003 | Admin Web: i18n retrofit of `/offsite` page (route hardcoded Thai through `t()`, use `formatDate(iso, lang)` instead of raw ISO split) + add `offsite.spec.ts` e2e coverage | Admin Web | Medium | Low | frontend-only | Yes (web bundle) | New e2e spec, both languages; visual check against the already-done `offsite-review` pattern |
| UX-POLISH-004 | Mobile: restore Manager Approval discoverability — entry point/badge on Home for MANAGER/HR_ADMIN/SUPER_ADMIN, not just the Leave-screen header pill | Mobile | Medium | Low-Medium (UI-only addition, no logic change) | frontend-only | Yes | Manual QA as MANAGER; confirm no change to `useApprovals.ts` RBAC logic |
| UX-POLISH-005 | Admin Web: back-port the risk-reviews i18n pass to `audit-logs` (filter labels, table headers, detail-modal `DetailRow` labels) | Admin Web | Low-Medium | Low | frontend-only | Yes | Extend `audit-logs.spec.ts` for both languages |
| UX-POLISH-006 | Admin Web: standardize date formatting — replace `en-US`/raw-Thai-hardcoded date renders (attendance, employees/[id], leave, audit-logs, offsite) with the existing `formatDate(iso, lang)` helper already used by departments/offsite-review/risk-reviews | Admin Web | Medium | Low | frontend-only | Yes | Spot-check via existing e2e specs' date assertions; add if missing |
| UX-POLISH-007 | Admin Web: add e2e coverage for `positions` and `attendance/geofence-settings` (currently zero/incidental) | Admin Web | Low-Medium | Low | docs/test-only | No | New `positions.spec.ts`, `geofence-settings.spec.ts` |
| UX-POLISH-008 | Mobile: fix the non-functional "ปฏิทินทีม" (team calendar) tab on Calendar — either wire it or remove the dead affordance | Mobile | Low-Medium | Low | frontend-only | Yes | Manual QA |
| UX-POLISH-009 | Admin Web: replace `window.confirm`/`window.prompt` on `employees`/`offsite` with the existing custom `Modal` pattern used elsewhere | Admin Web | Low | Low | frontend-only | Yes | Existing e2e specs should still pass; add modal-interaction assertions |
| UX-POLISH-010 | Mobile: standardize on manual Buddhist-Era date arrays over `Intl`-based `toLocaleDateString('th-TH', …)` in `approvals.tsx`/`leave.tsx`, ahead of any native build | Mobile | Low (no visible defect on web today) | Low | frontend-only | Yes | Visual check on web export; flag for re-check if/when a native build is evaluated |
| UX-POLISH-011 | Mobile: reconcile `mustChangePassword` gate — Home only shows a banner while Attendance/Leave/Approvals hard-redirect; pick one consistent behavior | Mobile | Low-Medium | Medium (touches an auth/session gate, not just presentation) | frontend-only, but review carefully | Yes | Manual QA across all 4 screens with a `mustChangePassword=true` account |
| DOC-FIX-001 | Correct `Current Status.md` Known Limitation #4: `GET /leave/:id` is already scoped (closed in the same `HOTFIX-T089A` commit); only `GET /off-site` remains open | Docs | Low | None | docs-only | No | None — doc edit only |

---

## E. Recommended Next 3 Tasks

1. **UX-POLISH-001 — Mobile Home error-state fix.** Highest real-user value: the one screen every role sees every day currently fails silently. Small, additive, frontend-only, no RBAC/backend touch.
2. **UX-POLISH-002 — Consolidate Admin Web access-denied UX.** Directly finishes what `ACCESS-UX-001` started; low risk, quick, and closes the one variant (`ErrorState` 403) that's guaranteed to ignore the language toggle.
3. **UX-POLISH-003 — i18n retrofit of `/offsite`.** Closes the largest remaining i18n gap in Admin Web using a pattern (`offsite-review`) that's already proven in this exact codebase, and adds test coverage where there currently is none.

*(Not counted among these 3, but recommended for equal or higher scheduling priority: `SEC-OFFSITE-001`, since it is a live data-exposure issue, not a UX preference.)*

## F. Recommended First Implementation Task

**UX-POLISH-001 — Mobile Home: surface the silently-swallowed error state.**

Why this one first, over the other strong candidates:
- **Reach:** Home is the landing screen for every employee, manager, and admin, every session — higher traffic than any single Admin Web page.
- **Severity of the current behavior:** it doesn't just look unpolished, it actively misrepresents data (a failed fetch shows confident zeros — 0 hours, 0 leave balance — with no indication anything went wrong), which is a trust problem, not just a cosmetic one.
- **Size and risk:** the fix is additive (render an existing, already-captured `error`/`loadState` value that's simply never read today) — no new state, no RBAC/backend change, matches a pattern (error+retry) already implemented correctly on 3 other screens in the same app.
- **No conflict with the security finding:** unlike `SEC-OFFSITE-001`, this requires no backend change and no redeploy coordination beyond the normal mobile bundle release.

If the user wants to prioritize the security gap instead, `SEC-OFFSITE-001` is the alternative first pick — it is higher severity, but it is explicitly out of this audit's polish framing and needs its own scoped task (mirroring `HOTFIX-T089A`'s process) rather than being folded in here.

## G. Do-Not-Do-Now List

- **Native attestation (SEC-ATT-005/006)** — remains correctly deferred pending a native-app decision. Not revisited by this audit.
- **Broad dashboard redesign** — both Admin Web dashboard and Mobile Home have real issues, but a full redesign is too large and unnecessary; the Home fix above is deliberately scoped to the error-state gap only, not a rebuild of the 1087-line hero region.
- **Any other backend/RBAC refactor** beyond `SEC-OFFSITE-001` — no other RBAC issue was found in this pass; do not preemptively touch `@Roles` guards elsewhere.
- **Large Mobile redesign** — the Home hero region's 5–6 conditional blocks, the `mustChangePassword` gate inconsistency, and the two competing date-formatting conventions are all real but should be split into small, independent tasks (as listed in Section D), never bundled into one big mobile rework.
- **PWA service worker / offline support / update-prompt build-out** — real gap, explicitly out of scope per `docs/QA_T086_MOBILE_PWA_REAL_USAGE.md`; worth a future dedicated spec, not an incidental add-on to a polish task.
- **Standardizing all Admin Web date formatting in one sweep** — listed as `UX-POLISH-006` but should be done incrementally page-by-page (it touches 5 separate files), not as one large cross-cutting change.

## H. Verification / Confidence

- **What was inspected:** Admin Web page source under `apps/web/app/(app)/` and shared components; Mobile source under `apps/mobile/app/` and `apps/mobile/src/`; all listed `docs/QA_*`, `docs/CTO_SUMMARY_*` (recent releases), `HR-Knowledge/01-START-HERE/Current Status.md`, `HR-Knowledge/08-SOP/Verification Workflow.md`, and `docs/SECURITY_REVIEW_LOG.md`; e2e spec files under `apps/web/e2e/`; backend `apps/api/src/leave/` and `apps/api/src/off-site/` controller/service source (read directly, not via summary, to verify the SECURITY FINDING); relevant git history (`git log`, `git show 1be3fb9`) to confirm when the `/leave/:id` scoping fix actually landed.
- **What was not tested live:** No browser was driven, no Docker stack was started or exercised, no Playwright/Jest suite was run, no mobile device or simulator was used. This is **code-inspection-only**, consistent with `QA_T089`'s and `QA_T086`'s own stated methodology (both of those manual-QA passes were also never confirmed executed against a live environment). "Real-usage" in the task title refers to auditing for real-usage friction, not to live usage testing performed in this pass.
- **Audit-only confirmation:** no files under `apps/api/`, `apps/web/app`, `apps/mobile`, or `prisma/` were modified to produce this report — see `git diff --stat` in the accompanying CTO Summary.
- **No production redeploy is required for this audit itself.**
