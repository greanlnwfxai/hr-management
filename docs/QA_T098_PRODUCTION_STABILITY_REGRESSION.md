# T-098 — Production Stability / Regression Checklist

**Purpose:** A practical, copy/paste-ready checklist to run manually before and after future production releases, covering the areas stabilized across `v1.2.89`–`v1.2.94` (off-site review, leave overlap hotfix, department i18n polish, local e2e runner).

**Scope:** Docs-only reference checklist. Not a test script — a human runbook.

**How to use:** Work top to bottom. Sections A–B are pre-flight, C–F are functional regression (Admin Web / Mobile / Leave / Attendance), G is the local tooling note, H is post-release, I is deferred work. Mark each `[ ]` as `[x]` pass or `[!]` defect found; note the defect and stop that section if a `[!]` is security-sensitive (RBAC bypass, secret exposure, raw GPS).

**Baseline at time of writing:**
- Tag: `v1.2.94-local-e2e-env-runner`
- Branch: `main`, CI green, working tree clean
- Production (as of this checklist's creation): API `/health` = 200, Admin `/dashboard` = 200, Mobile/PWA = 200

---

## A. Pre-release checks

- [ ] `git status` — working tree clean, no unexpected untracked files
- [ ] Note current tag/commit: `git describe --tags --always` and `git log -1 --oneline`
- [ ] CI is green on the branch being released (GitHub Actions)
- [ ] `git diff --stat` against the previous release tag reviewed — confirm no unexpected files touched
- [ ] No unexpected Prisma migrations: `git diff --stat -- apps/api/prisma/migrations` (empty unless a schema change is intentionally part of this release)
- [ ] No `.env` changes: `git diff --stat -- .env .env.* docker-compose*.yml` (should be empty for app-only releases)
- [ ] **Production DB backup** — required **only if** this release includes a Prisma migration. See [PRODUCTION_BACKUP_RESTORE_T079.md](PRODUCTION_BACKUP_RESTORE_T079.md). Skip for docs/UI-only releases.
- [ ] **`./scripts/security-review.sh`** — required **only if** this release touches auth, RBAC, tokens/passwords/hashes, dependencies, or CI security config, or the user explicitly requests it. Otherwise skip and note why (e.g. "docs-only, no runtime files touched").

---

## B. Production health checks

Internal production IPs (LAN-only — see note below):

```bash
# API health
curl -sf http://172.16.2.31:4002/health && echo " -> API OK"

# Admin Web dashboard (expect 200/302 to /login if unauthenticated)
curl -sI http://172.16.2.31:3002/dashboard | head -1

# Mobile/PWA root
curl -sI http://172.16.2.31:3004/ | head -1

# Admin routes (expect 200 or a redirect to /login — not 5xx)
curl -sI http://172.16.2.31:3002/departments | head -1
curl -sI http://172.16.2.31:3002/attendance/offsite-review | head -1
curl -sI http://172.16.2.31:3002/attendance/risk-reviews | head -1
curl -sI http://172.16.2.31:3002/leave | head -1
curl -sI http://172.16.2.31:3002/offsite | head -1
```

> **Note:** `172.16.2.31:*` are internal LAN addresses and may be unreachable from outside the office network or from this sandbox (confirmed unreachable, `curl` exit 28, during `QA_T089`). If unreachable, use the public equivalents instead:
> - API: `https://hr.eds-center.com/api/health`
> - Admin Web: `https://hr.eds-center.com/dashboard`
> - Mobile/PWA: `https://mobilehr.eds-center.com`
>
> Confirm which host is correct for the current deployment before relying on either — do not assume.

All Next.js pages above are client-rendered behind a login gate; a `200` (page shell loads, then client-side auth redirect) is normal. Treat `5xx` or connection failure as a FAIL.

---

## C. Admin Web regression checklist

Login as SUPER_ADMIN or HR_ADMIN unless noted.

**Login / Dashboard**
- [ ] `/login` loads, form renders, invalid credentials show a friendly error (no stack trace)
- [ ] Valid login redirects to `/dashboard`
- [ ] Dashboard KPI cards load without error

**Access-denied consistency** (`UX-POLISH-002`, consolidated onto the shared `AccessDeniedCard`)
- [ ] EMPLOYEE hitting any of `/departments`, `/positions`, `/employees`, `/attendance/risk-reviews`, `/audit-logs`, `/attendance/geofence-settings` sees the same shared card UI (icon-free, title + detail + "back to dashboard" link), not a bare div, a raw `ErrorState` 403 box, or a route-specific hand-rolled block
- [ ] Card copy is localized and follows the language toggle live — switch EN/TH while the card is visible and confirm the text updates without a reload
- [ ] `/attendance/offsite-review` denial (EMPLOYEE only; MANAGER is authorized — SEC-OFFSITE-001) uses the shared card with its route-specific copy and links back to `/attendance`, not `/dashboard`
- [ ] No admin-only table, filter, or action button is present in the DOM (inspect, don't just eyeball) while any of the above cards is shown
- [ ] `/attendance/risk-reviews` and `/audit-logs` no longer render `ErrorState`'s 403 branch for a non-admin route visit — that variant is now inline-error-only (e.g. a sub-fetch failing inside an otherwise-authorized page), and even there its copy is localized, not hardcoded English

**Employees**
- [ ] `/employees` list loads and search/filter returns results
- [ ] Fixed by `ACCESS-UX-001` (was BUG-004, QA_T089): EMPLOYEE role hitting `/employees` directly now sees an explicit "access denied" card (Thai/English, `access_denied_title`/`access_denied_detail` i18n keys) with a safe link back to `/dashboard`, instead of an empty/loading state or a silent redirect. `GET /employees` backend RBAC unchanged — it was already role-gated to SUPER_ADMIN/HR_ADMIN/MANAGER; MANAGER's team-scoped view is unaffected.

**Departments** (DEPT-POLISH-001, v1.2.93) / **Positions**
- [ ] `/departments` and `/positions` list load for SUPER_ADMIN/HR_ADMIN
- [ ] Fixed by `ACCESS-UX-001` (was BUG-003, QA_T089): MANAGER/EMPLOYEE hitting `/departments` or `/positions` directly now see the same explicit "access denied" card instead of a read-only table with hidden CRUD buttons. Both routes' `GET` endpoints remain backend-unrestricted by design (any authenticated role could already read this data server-side); this change only tightens the Admin Web page gate, it does not change backend RBAC.
- [ ] Total count text is localized (Thai: "ทั้งหมด N รายการ" style, not raw "8 total")
- [ ] `Created` date column renders as a formatted date; in Thai mode the year is Buddhist-era (+543), not the raw Gregorian ISO string
- [ ] Manager column/label shows a resolved manager name or the "none assigned" fallback (STEP-16B `dept_manager_none`), never a raw ID or blank
- [ ] Known limitation (#22): pagination text ("Page X of Y") is still hardcoded English even in Thai mode — expected, not a regression

**Leave admin**
- [ ] `/leave` list loads for SUPER_ADMIN/HR_ADMIN with all-employee records visible
- [ ] Leave balance / adjustment ledger UI is visible and usable for SUPER_ADMIN/HR_ADMIN (Vacation Balance Setup modal, `POST /leave-balances/:id/adjustments`)
- [ ] `/leave` now loads for MANAGER too (`HOTFIX-T089A`, shipped): the list and Approve/Reject controls are visible, scoped server-side to the manager's own managed department. MANAGER cannot approve/reject their own leave request (self-approval is blocked with a 403). Leave Balance Admin panel stays SUPER_ADMIN/HR_ADMIN-only and must remain hidden for MANAGER — this did not change.
- [ ] BUG-001/BUG-002 from QA_T089 are fixed by `HOTFIX-T089A` — do not re-report "MANAGER sees no team leave / no Approve-Reject buttons on `/leave`" as a bug going forward.

**Off-site review** (`/attendance/offsite-review`, REQ-002F, closed v1.2.89; reviewer-name polish v1.2.92)
- [ ] Route loads for SUPER_ADMIN/HR_ADMIN/MANAGER (department-scoped for MANAGER, no self-review — this is the one MANAGER RBAC path that IS fully shipped)
- [ ] Status/employee-ID filters are visible and functional
- [ ] Approve/Reject controls appear only for SUPER_ADMIN/HR_ADMIN/MANAGER, never EMPLOYEE
- [ ] Reviewed rows show a resolved reviewer name (`reviewedBy`), not a raw UUID (OFFSITE-POLISH-REVIEWEDBY-001, v1.2.92)
- [ ] **Privacy check:** no raw latitude/longitude is displayed anywhere on the page — only distance/accuracy fields

**Off-site requests** (`/offsite` — pre-approval workflow, distinct page from the review queue above)
- [ ] Route loads; PENDING/APPROVED/REJECTED badges render correctly
- [ ] Approve/Reject visible only to SUPER_ADMIN/HR_ADMIN/MANAGER, not EMPLOYEE

**Attendance risk review** (`/attendance/risk-reviews`, SEC-ATT-007A/B)
- [ ] Route loads for SUPER_ADMIN/HR_ADMIN only (not MANAGER, not EMPLOYEE — stricter than off-site review)
- [ ] Thai labels and date formatting render correctly (risk level, review status/result/action)
- [ ] Review controls (approve/dismiss) work if risk-review test data exists in the environment
- [ ] **Privacy check:** no raw GPS, nonce, or attestation token values displayed — only categorical reason codes

---

## D. Mobile/PWA regression checklist

Test on the deployed mobile build (`https://mobilehr.eds-center.com` or LAN `172.16.2.31:3004`), ideally from the Home Screen PWA shortcut.

- [ ] App opens from Home Screen icon / browser without a blank page
- [ ] Login succeeds with valid employee credentials
- [ ] Home tab loads: greeting, today's schedule card
- [ ] Calendar tab loads: month grid renders, no blank white screen
- [ ] Attendance tab loads: history list or empty state, no blank white screen

**Approved leave overlay** (HOTFIX-MOBILE-LEAVE-CALENDAR-001 v1.2.85, HOTFIX-MOBILE-LEAVE-ATTENDANCE-001 v1.2.87 — must stay consistent across all three surfaces)
- [ ] Home: a date covered by an APPROVED leave request shows the leave type/status, not "วันทำงาน" (normal workday)
- [ ] Calendar: same date shows the same leave overlay in the day-detail card
- [ ] Attendance tab: same date shows the same leave overlay in `AttendanceHeader` (this was the one screen missed initially — check it specifically)
- [ ] PENDING or REJECTED leave does **not** override the normal workday/weekend label on any of the three screens

**Normal check-in/check-out** (only if safe to test against real data)
- [ ] Geofence modal opens, shows map + in/out-of-radius indicator
- [ ] Confirm completes clock-in/out with success feedback

**Off-site check-in/check-out** (REQ-002E-F1, v1.2.88 — only when a real approved off-site situation exists; do not fabricate one against production)
- [ ] Off-site check-in requires a note/reason (non-empty, Thai-validated)
- [ ] Off-site check-out requires a note (≥3 chars) — this became required in v1.2.88, was previously optional
- [ ] Submission goes through without error (confirms `timezoneOffsetMinutes`/nonce are included — a prior bug silently omitted these when screens bypassed the shared hook)

**Home summary error/retry state** (UX-POLISH-001 — must show an explicit error, never silent zeros)
- [ ] Normal condition: Home's แดชบอร์ด/สรุปการลา/สรุปการทำงานล่วงเวลา stat cards load with real data (no error card shown)
- [ ] Simulate a failed summary fetch (e.g. disconnect network/airplane mode right after login, or briefly stop the `api` container) then open/refresh Home: a Thai error card ("ไม่สามารถโหลดข้อมูลสรุปได้" / "กรุณาลองใหม่อีกครั้ง") appears in place of the stat cards — **not** zeroed-looking stat cards presented as real data
- [ ] The error card's "ลองใหม่" button, tapped after restoring connectivity, successfully reloads real data and the error card disappears
- [ ] No stack trace, raw HTTP status/URL, or token ever appears in the error card text

**General**
- [ ] No blank white screen at any point during normal navigation
- [ ] No visible React error overlay / minified error number (React error #527 was a real prior production incident — HOTFIX-MOBILE-REACT-MISMATCH-001, v1.2.86 — caused by a `react`/`react-dom` version mismatch)

---

## E. Leave regression checklist

- [ ] Single-day leave request displays correctly wherever leave is shown
- [ ] Multi-day leave is visible on the **middle** day of the range, not just first/last (this was the specific gap closed by HOTFIX-LEAVE-ME-OVERLAP-001, v1.2.91)
- [ ] Approved leave displays consistently on Mobile Home, Calendar, and Attendance tab (see Section D)
- [ ] PENDING/REJECTED leave never overrides the normal workday display
- [ ] `GET /leave/me` (and `GET /leave`) date-range filter uses **overlap** semantics, not containment:
  `leave.startDate <= queryEnd AND leave.endDate >= queryStart`
  (Verify: a leave request that starts before a query window and ends inside it, or vice versa, is still returned.)

---

## F. Attendance/off-site regression checklist

- [ ] Normal geofence attendance (inside radius) succeeds; outside-radius attempt is rejected with a clear message
- [ ] Mock/stale/invalid location payloads are rejected (SEC-ATT-003) — only test if a safe mock-location scenario is available; do not attempt against a real production account without a controlled test device
- [ ] Nonce/replay protection remains intact — a captured/replayed clock-in payload is rejected (SEC-ATT-004); do not actually attempt a replay against production, just confirm `POST /attendance/nonce` still issues a fresh nonce per request
- [ ] Off-site submit payloads include `nonce` and `timezoneOffsetMinutes` at the implementation level (`apps/mobile/src/utils/offsiteAttendance.ts` / `useOffsiteAttendance` hook — confirm both offsite-checkin/checkout screens still route through the shared hook, not a direct API call)
- [ ] Admin off-site review workflow: approve/reject from `/attendance/offsite-review` updates status and is reflected on next list load
- [ ] `reviewedBy` displays a resolved name after review, not a raw UUID
- [ ] **Privacy rule, both off-site review and risk review:** no raw GPS coordinates are ever rendered in the Admin Web UI — only distance/accuracy or categorical risk reason codes
- [ ] **MANAGER department scope (SEC-OFFSITE-001, this task):** a MANAGER account visiting `/offsite` (`GET /off-site`) sees only off-site requests from employees in their own managed department, never other departments' requests
- [ ] MANAGER `GET /off-site/:id` on an outside-department record returns 403, not the record
- [ ] MANAGER cannot approve/reject their own off-site request (self-review is blocked, same as leave `HOTFIX-T089A`)
- [ ] MANAGER cannot approve/reject an outside-department off-site request
- [ ] SUPER_ADMIN/HR_ADMIN off-site list/detail/approve/reject remain org-wide and unaffected by the MANAGER scoping change

---

## G. Local regression tooling

- [ ] Use `./scripts/e2e-local.sh` for local Playwright runs — **not** a plain `docker compose up -d --build`
- [ ] Do not run a plain `docker compose up -d --build` for local admin-web testing while the root `.env` bakes a production `NEXT_PUBLIC_API_URL` — this produces a web bundle that CORS-fails against `localhost` (known limitation #20, `LOCAL-E2E-ENV-001`)
- [ ] `.env` must not be edited casually — `e2e-local.sh` overrides `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `TRUST_PROXY`, and throttle limits as **shell-only** env vars for the `docker compose` invocation, leaving `.env` untouched
- [ ] The local e2e runner mirrors the same env overrides CI's `e2e-ci` job already uses, preventing a production-baked frontend bundle from being tested locally

---

## H. Post-release checks

Re-run the Section B health commands after deploy:

```bash
curl -sf http://172.16.2.31:4002/health && echo " -> API OK"
curl -sI http://172.16.2.31:3002/dashboard | head -1
curl -sI http://172.16.2.31:3004/ | head -1
```

- [ ] All three return `200`/expected redirect, not `5xx` or connection failure
- [ ] Spot-check 2–3 key routes from Section C (e.g. `/departments`, `/attendance/offsite-review`) after deploy
- [ ] **Mobile/PWA cache caveat:** iOS Home Screen PWA shortcuts can serve a stale cached bundle after a deploy. If Mobile/PWA shows old behavior or a blank page post-deploy, remove and re-add the Home Screen shortcut (Safari → Share → Remove, then Add to Home Screen again) before concluding there's a real regression
- [ ] Final git/tag verification: `git log -1 --oneline` and `git describe --tags` match the intended release commit

---

## I. Known deferred work

- **Native attestation (SEC-ATT-005/006) — deferred.** Android Play Integrity and iOS App Attest/DeviceCheck both require a native app build (no PWA/WebKit entry point exists for either API). Both feasibility assessments recommend DEFER until a native-app decision is made. Do not treat their absence as a regression. See [SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md](SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md) and [SEC_ATT_006A_IOS_APP_ATTEST_DEVICECHECK_FEASIBILITY.md](SEC_ATT_006A_IOS_APP_ATTEST_DEVICECHECK_FEASIBILITY.md).
- **BUG-001/BUG-002 (MANAGER `/leave` UI scope) — fixed by `HOTFIX-T089A`.** MANAGER can now view and approve/reject department-scoped leave via the `/leave` UI. The audit that preceded the fix also found the backend `GET /leave` was not actually department-scoping MANAGER results (it was reachable org-wide, including via the mobile Manager Approval screen) and that `approve()`/`reject()` didn't block a manager approving/rejecting their own leave request — both are now fixed at the API layer (`leave.service.ts`), not just hidden in the UI. See [CTO_SUMMARY_HOTFIX_T089A_MANAGER_LEAVE_UI_SCOPE.md](CTO_SUMMARY_HOTFIX_T089A_MANAGER_LEAVE_UI_SCOPE.md). `GET /leave/:id` (single-record lookup) was **not** in scope for this hotfix and still returns any record to MANAGER without a department check — tracked as a follow-up, see that CTO Summary's "Remaining risks" section.
- **BUG-003/BUG-004 (RBAC UI gaps from QA_T089, `HOTFIX-T089B`) — fixed by `ACCESS-UX-001`.** `/departments`, `/positions`, and `/employees` (EMPLOYEE role only) now show an explicit, localized "access denied" card instead of a degraded read-only page or a silent redirect. This was a frontend-only UX change — no backend RBAC or route protection changed; MANAGER's existing team-scoped `/employees` view and the intentionally-open `GET /departments`/`GET /positions` read endpoints are unaffected. See [CTO_SUMMARY_ACCESS_UX_001_EXPLICIT_ACCESS_DENIED.md](CTO_SUMMARY_ACCESS_UX_001_EXPLICIT_ACCESS_DENIED.md).
- **Department pagination i18n** (limitation #22) — "Page X of Y" text on `/departments` is still hardcoded English. Low priority, no functional impact.
- **Local `.env` `NEXT_PUBLIC_API_URL` question** (limitation #20) — still open whether the sandbox's local `.env` should point at `localhost:4002`. `e2e-local.sh` is a working non-destructive workaround; no `.env` change has been made.

---

## Related documents

- [QA_T088_ADMIN_WEB_PRODUCTION_QA.md](QA_T088_ADMIN_WEB_PRODUCTION_QA.md) — original Admin Web QA checklist (broader, ~190 items)
- [QA_T089_ADMIN_WEB_REAL_USAGE_RESULTS.md](QA_T089_ADMIN_WEB_REAL_USAGE_RESULTS.md) — source of the known RBAC UI gaps referenced in Section I
- [QA_T086_MOBILE_PWA_REAL_USAGE.md](QA_T086_MOBILE_PWA_REAL_USAGE.md) — original Mobile/PWA real-device QA checklist
- [HR-Knowledge/08-SOP/Verification Workflow.md](../HR-Knowledge/08-SOP/Verification%20Workflow.md)
- [HR-Knowledge/08-SOP/Mobile PWA Production Verification.md](../HR-Knowledge/08-SOP/Mobile%20PWA%20Production%20Verification.md)
- [HR-Knowledge/08-SOP/Production Geofence Readiness.md](../HR-Knowledge/08-SOP/Production%20Geofence%20Readiness.md)
- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)
- [SECURITY_HARNESS.md](SECURITY_HARNESS.md)

#qa #production #regression #t-098
