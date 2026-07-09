# Current Status

Last updated: 2026-07-03

## Current Product State — v1.2.71 ✅

The platform is now beyond the original backend v1.0-only foundation. Through `v1.2.71-personal-summary-ring-date-polish`, it includes everything from `v1.2.35` (below) plus the v1.2.61–v1.2.71 release set documented in **Release Timeline: v1.2.61 – v1.2.71** further down this page — employee self-dashboard, manager personal summary, web clock-in/out disabled (mobile-only policy), leave employee dropdown/localization fixes, non-destructive Docker verification, production `SUPER_ADMIN` password rotation with seed hardening, legacy credential-example sanitization, and personal-summary Thai localization + leave balance ring UI polish.

> Note: the section below (originally written at `v1.2.35`) has not been fully backfilled for every release between `v1.2.36` and `v1.2.60` — for that range, treat [[ADR Index]] and individual `docs/CTO_SUMMARY_*.md` files as authoritative. This page is current and accurate for `v1.2.61` through `v1.2.71`.

> **Production migration-drift recovery (out-of-band, prior to this sync):** the
> Manager Dashboard's "My Summary" (v1.2.62/ADR-032) briefly returned an
> Internal Server Error in production due to a pending `leave_adjustments`
> migration never having been deployed (Prisma `P2021`), plus a second
> migration whose target schema objects already existed in production ahead of
> being recorded as applied. Both were resolved without data loss or schema
> change beyond the originally-intended migration; see
> [docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md](../../docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md)
> for the full incident record and the reusable recovery procedure.

Through `v1.2.35-vacation-entitlement-manual-setup` (commit `e2872b6`), the platform includes:

- Stable NestJS API with username/email login
- Web admin: profile/password change, employee account management, audit log review, off-site request management, department manager assignment, vacation balance setup
- Mobile: attendance, leave, calendar, profile/password change, manager approval, off-site request, and fully refreshed v1.2.0 UI with summary cards
- Forced `mustChangePassword` flow on web and mobile
- Security harness scripts, security CI, Dependabot, and accepted-risk policy
- **Full Audit Log Pack — complete**: append-only audit trail, 10+ event types, RBAC-restricted read API, admin web UI, failed geofence rejection audit
- **Full Attendance Geofence Pack — complete**: backend-enforced mobile geofence, DB-backed admin config, admin web UI, rejected-attempt audit logging
- **Off-site Work Request Workflow — complete**: employee self-service off-site request, admin/manager approval, OFFSITE clock-in bypass for approved dates
- **Department Manager Scoping — complete**: MANAGER approve/reject scoped to managed department via `Department.managerId`
- **STEP Connect PWA — complete**: Standalone PWA navigation, STEP Connect branding, icon cache-busting. Production-verified on iPhone.
- **Vacation Leave Entitlement — complete**: Immutable adjustment ledger for VACATION balance corrections, policy-aware manual setup with tenure tiers, Admin Web UI modal

## ADR Pack

32 Architecture Decision Records. See [[ADR Index]].

ADR-018 (specification-only audit log state) is superseded by ADR-019 (Audit Trail and Admin Audit Log Review).
ADR-020 added: Attendance Geofence and Admin Configuration.
ADR-021 added: Failed Geofence Attempt Audit.
ADR-022 added: Off-site Work Request Workflow.
ADR-023 added: Department Manager Leave Approval Scope.
ADR-024 added: Mobile Employee Self-Service v1.2.0 UI Refresh.
ADR-025 added: STEP Connect PWA Branding and Standalone Delivery.
ADR-026 added: Vacation Leave Entitlement, Manual Setup, and Adjustment Ledger.
ADR-027 added: Mixed Attendance Checkout Exception Workflow.
ADR-028 added: Fresh GPS Requirement for Attendance Actions.
ADR-029 added: Web vs. Mobile Attendance Clock Policy.
ADR-030 added: Non-Destructive Docker Verification.
ADR-031 added: SUPER_ADMIN Password Rotation and Seed Hardening.
ADR-032 added: Manager/Employee Dashboard Scope and Personal Summary.

## Major Delivered Areas

| Area | Scope | Milestones | Status |
|---|---|---|---|
| Core backend | Auth, employee, department, position, attendance, leave, leave balance, dashboard | T-005–T-023 | ✅ Done |
| Username/account management | Username/email login, HR account provisioning, password reset, `GET /employees/:id/account` | T-050, T-055 | ✅ Done |
| Mobile | Dashboard, attendance, leave request, manager approval, profile/password change, calendar, off-site request, v1.2.0 UI refresh | T-044–T-056A, T-071 | ✅ Done |
| Web admin | Profile/password change, forced password change flow, employee detail account management, audit log review, vacation balance setup modal | T-053–T-055, T-057B-7, REQ-001D | ✅ Done |
| Security process | Security harness, accepted-risk policy, CI security job, Dependabot, agent workflow docs | T-052A.1, T-052A.3, T-052A.4 | ✅ Done |
| Audit Log Pack | Prisma model, audit service, 10+ event types, read API, admin web UI, Playwright e2e, rejected geofence audit | T-057B-1 through T-057B-7, T-065 | ✅ Done |
| Attendance Geofence Pack | Backend geofence engine, mobile GPS wiring, gap closure, DB-backed admin config UI | T-046, T-047, T-059, T-060 | ✅ Done |
| Vacation Leave Entitlement | Adjustment ledger, VACATION PATCH block, policy-aware setup endpoint, Admin Web UI modal | REQ-001A through REQ-001D | ✅ Done |

Current documented API surface: **53 endpoints including `GET /health`** (v1.2.35 added 4 vacation/adjustment endpoints; no endpoints added or removed through v1.2.71 — all v1.2.61–v1.2.71 work below is frontend/harness/seed-safety/docs only).

## Release Timeline: v1.2.61 – v1.2.71

Frontend UX/RBAC polish, one localization/pagination fix, one harness safety fix, one production security hardening, two knowledge/docs syncs, and one round of Thai localization + leave balance ring UI polish — no backend endpoint or schema changes in this range.

| Version | Tag | Task | Scope |
|---|---|---|---|
| v1.2.61 | `v1.2.61-employee-self-dashboard-profile-polish` | HOTFIX-REQ002G-4 | EMPLOYEE self-dashboard (was redirected to `/profile`); sidebar display name now uses real employee name from `GET /auth/me` (fallback: full name → username → email); EMPLOYEE nav gains Dashboard/Attendance/Leave/Profile; EMPLOYEE still never calls `GET /dashboard` and has no access to the global Employees list |
| v1.2.62 | `v1.2.62-manager-personal-dashboard-summary` | HOTFIX-REQ002G-5 | MANAGER dashboard gains an embedded "My Summary" section below the existing department-scoped Team Overview, using self-scoped endpoints (`/attendance/me`, `/leave-balances/my`, `/leave/me`); shared `PersonalSummaryBody` component introduced |
| v1.2.63 | `v1.2.63-personal-attendance-summary-date-fix` | HOTFIX-REQ002G-6 | Fixed today-attendance detection: `attendance.date` arrives as a full ISO timestamp encoding a Bangkok business date, but was compared against a plain `YYYY-MM-DD` string; added normalization helpers; recent-attendance dates now render `DD/MM/YYYY` instead of raw ISO. Applies to both MANAGER "My Summary" and EMPLOYEE self-dashboard |
| v1.2.64 | `v1.2.64-leave-employee-dropdown-thai-localization` | HOTFIX-LEAVE-UI-001 | Fixed `GET /employees?limit=200` silently failing backend's `@Max(100)` cap (error was swallowed by an empty `.catch`), which left the Vacation Balance Setup and Add Balance employee dropdowns empty; replaced with a paginated loader (`limit: 100`, `status: 'ACTIVE'`) with inline error/retry; fully localized the Vacation Balance Setup modal to Thai/English; added Playwright coverage. Admin-only leave setup RBAC unchanged |
| v1.2.65 | `v1.2.65-docker-verify-non-destructive` | T-091 | Removed `docker compose down` from `scripts/docker-verify.sh` — script is now build/start + health/reachability checks only, leaves containers running on pass or fail; added a self-check guard against forbidden commands being reintroduced; see ADR-030 |
| v1.2.66 | `v1.2.66-disable-web-clock-actions` | HOTFIX-ATTENDANCE-UI-001 | Removed clock-in/out buttons from the Web/Admin `/attendance` page (replaced with a bilingual "use STEP Connect Mobile" notice); Web `/attendance` is now view/review/history only; backend clock endpoints unchanged (still used by mobile); mobile geofence flow unchanged; see ADR-029 |
| v1.2.67 | `v1.2.67-rotate-default-super-admin-password` | HOTFIX-SEC-002 | Production `SUPER_ADMIN` password rotated via the existing self-service Profile → Change Password UI (data-only; no credential seen/stored/logged by Claude/Codex); `apps/api/prisma/seed.ts` hardened so re-running the seed never overwrites an existing admin's password/`mustChangePassword`; see ADR-031 |
| v1.2.68 | `v1.2.68-knowledge-adr-sync-through-v1.2.67` | T-092 | HR-Knowledge/ADR sync through v1.2.67: ADR-029–032 added, release timeline backfilled, stale `docker-verify.sh` teardown claims corrected — docs-only |
| v1.2.69 | `v1.2.69-sanitize-legacy-default-credential-docs` | T-093 | Replaced literal dev/CI seed-password examples and unsafe `jq .accessToken`-printing commands across `docs/` and `HR-Knowledge/` with placeholders and in-memory-only token capture — docs-only, no new secrets introduced |
| v1.2.70 | `v1.2.70-personal-summary-thai-status-ring-ui` | T-094 | Personal-summary (Manager "My Summary" / Employee self-dashboard) attendance and leave-request status labels localized to Thai; pending-requests KPI renamed (`emp_dash_pending_leave`); leave-balance progress bar replaced with a hand-rolled SVG `LeaveBalanceRing` (no chart library added) |
| v1.2.71 | `v1.2.71-personal-summary-ring-date-polish` | T-095 | `LeaveBalanceRing` enlarged (64→96, empty-state 56→80) and list column widened (80px→112px); "My Leave Requests" raw ISO dates replaced with `formatLeaveDateRange()` (reuses the timezone-safe `formatAttendanceDate()` helper) — same-day requests show one date, ranges show a clean `DD/MM/YYYY – DD/MM/YYYY` |

See [[Attendance Module]], [[Dashboard Module]], [[Leave Balance Module]], [[RBAC Rules]], and [[ADR Index]] for the full domain/architecture detail behind each release. See
[docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md](../../docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md)
for the out-of-band production migration-drift recovery noted above, and
[docs/SEC_ATT_ROADMAP.md](../../docs/SEC_ATT_ROADMAP.md) for the SEC-ATT-001
through SEC-ATT-007 sequencing referenced under Next Recommended Task below.

## Vacation Leave Entitlement Release Summary

| Task | Tag | Commit | Scope |
|---|---|---|---|
| REQ-001A | `v1.2.32-vacation-balance-adjustment-spec` | — | Adjustment ledger specification |
| REQ-001B | `v1.2.33-vacation-balance-adjustment-ledger` | — | LeaveAdjustment model, POST/GET /adjustments, VACATION PATCH block |
| REQ-001C | `v1.2.34-vacation-entitlement-manual-setup-spec` | — | Vacation entitlement policy and manual setup specification |
| REQ-001D | `v1.2.35-vacation-entitlement-manual-setup` | `e2872b6` | vacation-setup module, GET suggest, POST setup, Admin Web modal, 431 backend tests |

## STEP Connect PWA Release Summary

| Task | Tag | Commit | Scope |
|---|---|---|---|
| T-084A | `v1.2.23-...` | `9a3d52a` | Keep geofence modal action buttons visible |
| T-084A | `v1.2.23-step-connect-rename` | `0ef65ad` | Rename mobile Home header to STEP Connect |
| HOTFIX-010 | `v1.2.24-standalone-pwa-navigation-hotfix` | `7c51fe2` | Add manifest.json; fix standalone PWA tab navigation |
| T-084 | `v1.2.25-step-connect-icon-rebrand` | `3731f01` | Rebrand icon and metadata to STEP Connect |
| HOTFIX-011 | `v1.2.26-step-connect-icon-cache-bust` | `c51ec4e` | Cache-bust icon links with `?v=1.2.25` |

Production verified (iPhone): STEP Connect name, STEP Connect icon, standalone navigation across all tabs.

## v1.2.0 Release Summary

| Task | Tag | Scope |
|---|---|---|
| T-071 | `v1.2.0-employee-self-service-offsite` | Off-site request module, manager dept-scoping, mobile v1.2.0 UI refresh, department manager UI |

Commit: `b611f95`
Verification: verify.sh PASS, 351/351 tests PASS, mobile-verify.sh PASS, security-review.sh PASS, CI green.

## Audit Log Pack Summary

| Task | Tag | Scope |
|---|---|---|
| T-057B-1 | `v1.1.34-audit-log-foundation` | AuditLog model, migration, service, sanitizer |
| T-057B-2 | `v1.1.35-auth-audit-events` | AUTH_LOGIN_SUCCESS/FAILURE, AUTH_PASSWORD_CHANGE |
| T-057B-3 | `v1.1.36-employee-account-audit-events` | EMPLOYEE_ACCOUNT_PROVISIONED, EMPLOYEE_TEMP_PASSWORD_RESET |
| T-057B-4 | `v1.1.37-leave-audit-events` | LEAVE_APPROVED, LEAVE_REJECTED |
| T-058A | `v1.1.38-sandbox-attendance-seed` | Sandbox attendance data for mobile testing |
| T-057B-5 | `v1.1.39-attendance-clock-audit-events` | ATTENDANCE_CLOCK_IN, ATTENDANCE_CLOCK_OUT |
| T-057B-6 | `v1.1.40-audit-log-read-api` | GET /audit-logs, GET /audit-logs/:id; RBAC |
| T-057B-7 | `v1.1.41-admin-audit-log-ui` | Web route /audit-logs; Playwright e2e |

See [[Audit Log Module]] for full architecture details.

## Attendance Geofence Pack Summary

| Task | Tag | Scope |
|---|---|---|
| T-046 | (within geofence milestone) | Backend Haversine engine, env-var geofence config, validation sequence |
| T-047 | (within geofence milestone) | Mobile GPS UI, `expo-location` permission, `source: "mobile"` clock-in/out |
| T-059 | `v1.1.43-mobile-attendance-geofence` | Gap closure: backend-authoritative enforcement confirmed, web preserved |
| T-060 | `v1.1.44-admin-geofence-settings` | GeofenceConfig DB singleton, `GET/PATCH /attendance/geofence-config`, admin web UI at `/attendance/geofence-settings` |
| T-061 | `v1.1.45-geofence-knowledge-sync` | HR-Knowledge and ADR sync for full geofence pack |
| T-062 | `v1.1.46-geofence-runtime-verification` | Full runtime verification: API, RBAC, mobile enforcement, audit privacy, web UI |
| T-063 | (docs only) | Production geofence readiness checklist and SOP |
| T-064 | (docs only) | Failed geofence attempt audit specification (`ATTENDANCE_GEOFENCE_REJECTED`) |
| T-065 | `v1.1.49-failed-geofence-audit-implementation` | Failed mobile geofence attempt audit logging with privacy-safe metadata and sanitizer GPS denylist |
| T-066 | (docs only) | Failed geofence audit knowledge and ADR sync |

See [[Attendance Geofence]] for full architecture details.

## Current Operational Rules

- Work schedule: `08:30–17:30`
- LATE threshold: strictly after `08:30` Asia/Bangkok
- Backend RBAC remains the source of truth; UI role gating is UX-only
- `mustChangePassword` is enforced in current web/mobile UX flows
- Audit writes are best-effort (try/catch); a failed audit write does not affect the business operation
- Mobile geofence enforcement is backend-authoritative for ONSITE mode; the mobile app never decides attendance eligibility
- OFFSITE clock-in bypasses the geofence radius check if an approved `OffSiteRequest` exists for the employee and today
- MANAGER approve/reject (leave and off-site) is scoped to the department they manage via `Department.managerId`
- VACATION leave balances must be created via `POST /leave-balances/vacation-setup`; direct `PATCH /leave-balances/:id` is blocked (400) for VACATION type
- Post-setup corrections to VACATION entitlement must use the adjustment ledger (`POST /leave-balances/:id/adjustments`)

## Current Known Limitations

| # | Area | Limitation | Plan |
|---|---|---|---|
| 1 | LeaveType enum | ANNUAL and UNPAID not in schema | Enum migration in v1.1 |
| 2 | Leave approval | UNPAID balance bypass not implemented | After UNPAID enum added |
| 3 | LeaveRequest | `rejectReason` accepted in DTO but not persisted | Schema migration v1.1 |
| 4 | RBAC | MANAGER approve/reject is now department-scoped (v1.2.0); list access (GET /leave, GET /off-site) remains org-wide | Future: scope list access by department |
| 5 | Attendance | No auto-absent marking job | Future scheduled task |
| 6 | Dashboard | `todayAbsentCount` counts only explicit ABSENT records | Acceptable current limitation |
| 7 | Attendance/dashboard | Some older docs still referenced the old `09:00` rule; current source uses `08:30` | Continue doc hygiene |
| 8 | LeaveBalance | DB column `totalDays` vs API field `entitledDays` | Column rename in v1.1 |
| 9 | Security | Monthly full security review is policy-driven; not every routine task should run the full security workflow | Continue scoped verification discipline |
| 10 | Audit Log | No export/download, no retention/cleanup policy, no anomaly detection; actorUserId shown as UUID in UI | Future work |
| 11 | Audit Log | `dateTo` filter uses UTC midnight boundary; may exclude records created after 00:00 UTC on that date | Future fix if needed |
| 12 | Geofence | Single office location only; multi-office requires schema redesign | Future work |
| 13 | Geofence | GPS spoofing undetectable without device integrity APIs (SafetyNet / DeviceCheck) | Future work |
| 14 | Geofence | Rejected clock-in/out audit logging implemented in T-065; runtime verification and operational observation still recommended | Follow-up verification in T-067 |
| 15 | Vacation | Adjustment ledger is VACATION-only in v1; other leave types still use PATCH | Extend ledger to other types when needed |
| 16 | Vacation | No proration — employees crossing a tier mid-year receive full higher-tier entitlement | Proration policy deferred to v1.1 |
| 17 | Vacation | MANAGER cannot read adjustment history (`GET /adjustments` restricted to SUPER_ADMIN/HR_ADMIN) | Future: department-scoped read access if required |
| 18 | Leave API | `GET /leave/me`'s `buildDateFilter` (`apps/api/src/leave/leave.service.ts`) filters by containment (`startDate >= query.startDate AND endDate <= query.endDate`), not range-overlap, so a date-range query can miss a multi-day request that merely overlaps the window | Switch to an overlap filter (`startDate: { lte: end }, endDate: { gte: start }`), mirroring `create()`'s existing overlap check |

## Next Recommended Task

**SEC-ATT-007A and SEC-ATT-007B are both now complete.** SEC-ATT-007A added a privacy-safe `AttendanceRiskReview` table that records a LOW/MEDIUM/HIGH/CRITICAL risk row (categorical reason codes only — never raw GPS, nonce, or attestation tokens) whenever an existing SEC-ATT-002/003/004 check flags or rejects a clock-in/out, with SUPER_ADMIN/HR_ADMIN-only list/read/review APIs (`GET/PATCH /attendance/risk-reviews`) — see [docs/CTO_SUMMARY_SEC_ATT_007A.md](../../docs/CTO_SUMMARY_SEC_ATT_007A.md). SEC-ATT-007B added the Admin Web UI for that queue — a SUPER_ADMIN/HR_ADMIN-only page at `/attendance/risk-reviews` (filterable queue table + detail/review modal), consuming only the existing SEC-ATT-007A APIs with zero backend/schema change — see [docs/CTO_SUMMARY_SEC_ATT_007B.md](../../docs/CTO_SUMMARY_SEC_ATT_007B.md). SEC-ATT-001 through SEC-ATT-004 are complete (payload hardening, stale/mock rejection, server nonce/replay protection — the last production-verified). With 007A and 007B both done, **there is no further executable SEC-ATT-007 item**. **SEC-ATT-005 (Android Play Integrity) and SEC-ATT-006 (iOS App Attest/DeviceCheck) remain the only open SEC-ATT items, both DEFERRED**: their feasibility was assessed in [docs/SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md](../../docs/SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md) (with [docs/CTO_SUMMARY_SEC_ATT_005A.md](../../docs/CTO_SUMMARY_SEC_ATT_005A.md)) and [docs/SEC_ATT_006A_IOS_APP_ATTEST_DEVICECHECK_FEASIBILITY.md](../../docs/SEC_ATT_006A_IOS_APP_ATTEST_DEVICECHECK_FEASIBILITY.md) (with [docs/CTO_SUMMARY_SEC_ATT_006A.md](../../docs/CTO_SUMMARY_SEC_ATT_006A.md)), both of which recommend DEFER — Play Integrity and App Attest/DeviceCheck are native attestation APIs with no PWA/WebKit entry point, so they require an approved native build (a single shared decision, §15 Open Question #3) and must not block the PWA attendance flow. See [docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md](../../docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md) for the threat model and [docs/SEC_ATT_ROADMAP.md](../../docs/SEC_ATT_ROADMAP.md) for full sequencing. **HOTFIX-T089A** — Manager leave UI scope hotfix (paused), or **HOTFIX-T089B** — Admin access denied gates hotfix (paused), remain queued if reprioritized.

**Environment note (found during SEC-ATT-007B, not fixed — see CTO summary §8/9):** the local, git-ignored root `.env` has `NEXT_PUBLIC_API_URL=https://hr.eds-center.com/api` instead of `http://localhost:4002`. This bakes a non-localhost API host into the Dockerized web build, so browser-level (Playwright) tests of *any* data-fetching admin page fail with a CORS error in this sandbox — confirmed unrelated to any specific task by reproducing it against the pre-existing, unmodified `audit-logs` page and dashboard. Left untouched per explicit user instruction; a future task should confirm with the user whether `.env`'s `NEXT_PUBLIC_API_URL` should point at `http://localhost:4002` for local Docker verification.

**HOTFIX-SEC-ATT-007B-I18N** (Admin Web only, no backend/schema change): the SEC-ATT-007B Risk Review Queue page (`/attendance/risk-reviews`) shipped with several labels, filter options, table headers, badge values, and modal/review-form text still hardcoded in English even when Thai is selected. Fully localized to `apps/web/lib/i18n.ts` (`risk_reviews_*` keys plus `riskLevelLabel`/`riskReviewStatusLabel`/`riskReviewResultLabel`/`riskReviewActionLabel` enum-label helpers); English remains fully available via the existing language switch. No raw GPS/nonce/token/password values are displayed (unchanged from SEC-ATT-007B). See [docs/CTO_SUMMARY_HOTFIX_SEC_ATT_007B_I18N.md](../../docs/CTO_SUMMARY_HOTFIX_SEC_ATT_007B_I18N.md).

**STEP-16A / STEP-16B — Department Module audit and test/i18n closure:** STEP-16A (audit-only) found the Department Module (originally STEP 16 on the old roadmap, shipped since `aed7c60`/v1.2.0) was already fully implemented — CRUD API, manager assignment, and department-scoped approval RBAC (ADR-023) all in production — but the `CLAUDE.md` roadmap text still called it a pending next step, the `departments` admin page had three hardcoded Thai strings bypassing `apps/web/lib/i18n.ts` (manager column/label/placeholder), and the module had zero unit/e2e test coverage. STEP-16B closed both gaps: added `departments.service.spec.ts`/`departments.controller.spec.ts` (32 tests, including RBAC metadata assertions) and a Playwright `departments.spec.ts` e2e suite, and routed the three hardcoded strings through new `dept_col_manager`/`dept_field_manager`/`dept_manager_none` i18n keys (both `en` and `th`). No schema, migration, or RBAC behavior changed. See [docs/CTO_SUMMARY_STEP_16A_DEPARTMENT_AUDIT.md](../../docs/CTO_SUMMARY_STEP_16A_DEPARTMENT_AUDIT.md) and [docs/CTO_SUMMARY_STEP_16B_DEPARTMENT_TESTS_I18N.md](../../docs/CTO_SUMMARY_STEP_16B_DEPARTMENT_TESTS_I18N.md).

**HOTFIX-MOBILE-LEAVE-CALENDAR-001 — Approved leave overlay on STEP Connect calendar:** STEP Connect Mobile/PWA showed "วันทำงาน" (normal workday, 08:30–17:30) on the home screen's today-schedule card and the full calendar's day-detail card even for dates covered by an **APPROVED** leave request. Fixed by adding a shared, unit-tested `findApprovedLeaveForDate()` overlay (`apps/mobile/src/utils/leaveOverlay.ts`) that does an inclusive client-side date-range check against the employee's approved leave requests, wired into both `home.tsx`'s `TodayScheduleCard` and `calendar.tsx`'s grid dots/day-detail card. Approved leave now overrides the normal workday/weekend label and shows the leave type (e.g. "ลาพักร้อน") and status; pending/rejected leave never overrides, and multi-day ranges are covered per-date. Frontend-only — no backend/schema change. Found (but did not patch, to stay frontend-only) a related backend gap: see Known Limitations row #18. Added `jest`/`jest-expo` to `apps/mobile` (previously had zero test infra) to cover the new overlay logic. See [docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_CALENDAR_001.md](../../docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_CALENDAR_001.md).

**HOTFIX-MOBILE-REACT-MISMATCH-001 — Fix production Mobile/PWA blank page (React error #527):** After HOTFIX-MOBILE-LEAVE-CALENDAR-001 (`bee4478`) shipped, STEP Connect Mobile/PWA went blank in production with minified React error #527 (`react`/`react-dom` version mismatch: `19.2.7` vs `19.1.0`). Root cause: that hotfix added `jest-expo@^57.0.1`, a version meant for a later Expo SDK than this project's `~54.0.0`; its `@react-native/jest-preset@^0.86.0` peer forced the shared, deduped `react` resolution up to `19.2.7` on `npm install`, while `react-dom` stayed at `19.1.0` (the version Expo SDK 54 actually bundles — confirmed via `expo/bundledNativeModules.json`). Since `react` is a production dependency, the drift shipped in the real app bundle. Fixed by exact-pinning `react`/`react-dom` to `19.1.0` and changing `jest-expo` to `~54.0.17` (the SDK-54-matching line, which has no such peer conflict). `apps/mobile/package.json`/`package-lock.json` only — leave-calendar overlay logic, tests, backend, and schema untouched. Verified the actual rebuilt `hr-mobile` Docker image's served bundle contains only `19.1.0` as a React version string. See [docs/CTO_SUMMARY_HOTFIX_MOBILE_REACT_MISMATCH_001.md](../../docs/CTO_SUMMARY_HOTFIX_MOBILE_REACT_MISMATCH_001.md).

**HOTFIX-MOBILE-LEAVE-ATTENDANCE-001 — Show approved leave on STEP Connect attendance tab:** A follow-up production visual check after HOTFIX-MOBILE-LEAVE-CALENDAR-001 found the attendance ("ลงเวลา") tab still showed "วันทำงาน" for a date the home screen correctly showed as "ลาพักร้อน" for — the attendance tab's `AttendanceHeader` computed its day-type label from weekday/weekend only and never consulted the approved-leave overlay at all. Fixed by wiring `attendance.tsx` into the same `useApprovedLeave()`/`findApprovedLeaveForDate()` helpers the home/calendar screens already use (no duplicated overlay logic), and extracting the day-type ternary that was duplicated in `home.tsx` into a new shared `resolveDayTypeLabel()` in `leaveOverlay.ts` so the three screens can't diverge again; also added a secondary approved-status line (e.g. "อนุมัติแล้ว") and wired leave refresh into pull-to-refresh, matching `calendar.tsx`. `apps/mobile` only — no backend/schema/auth change. 3 new unit tests for `resolveDayTypeLabel`; verified the fix is present in the rebuilt `hr-mobile` Docker image's bundle and that `react`/`react-dom` remain aligned at `19.1.0` (no regression of HOTFIX-MOBILE-REACT-MISMATCH-001). The exact authenticated-user visual check (attendance tab shows "ลาพักร้อน" for 9 ก.ค. 2569) was verified at the logic/bundle level, not via an authenticated live render, due to this sandbox's pre-existing `.env`/CORS limitation noted below — recommend the user confirm visually after deploying. See [docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_ATTENDANCE_001.md](../../docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_ATTENDANCE_001.md).

## Security / Process Notes

- Full security review is not required for every task.
- `./scripts/security-audit.sh` is especially relevant when dependency manifests or lockfiles change.
- `./scripts/secret-scan.sh` is available locally and enforced in CI through `Security — Audit & Secret Scan`.
- User handles `git add`, `git commit`, `git push`, and tagging manually.
- Agent tools must not run destructive Docker commands like `docker compose down`.
- `./scripts/docker-verify.sh` is confirmed **non-destructive as of v1.2.65** (see ADR-030): it no longer runs `docker compose down`, only builds/starts the stack and checks health, and leaves containers running. It can be run as a normal verification step; it no longer requires special approval before running. Stopping/resetting containers remains a separate, manual, user-approved action.
- Production `SUPER_ADMIN` password was rotated as of v1.2.67 (ADR-031, HOTFIX-SEC-002); `admin1234` is the dev/CI/local seed default only and no longer works against production.
- Legacy docs with literal dev/CI seed-password examples and unsafe token-printing commands were sanitized to placeholders as of v1.2.69 (T-093); use placeholders in all new documentation.
- A production migration-drift incident (missing `leave_adjustments` table; a second migration whose enum already existed in production) was recovered without data loss — see [docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md](../../docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md) for the incident record and the reusable recovery procedure for future drift.

## Related Notes

- [[Project Overview]]
- [[Platform State v1.2.0]]
- [[Platform State v1.1.31]]
- [[Audit Log Module]]
- [[Attendance Geofence]]
- [[Off-site Work Mode]]
- [[Vacation Leave Policy]]
- [[ADR Index]]
- [[API Route Index]]
- [[RBAC Rules]]
- [[Production Geofence Readiness]]
- [[Dashboard Module]]
- [docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md](../../docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md)
- [docs/SEC_ATT_ROADMAP.md](../../docs/SEC_ATT_ROADMAP.md)

#hr-management #status #v1-2-35
