# CTO Summary

## Step
HOTFIX-ATTENDANCE-UI-001 — Disable Web Clock In/Out Actions

## Status
PASS

## Scope
The Web/Admin attendance page (`/attendance`) rendered active "เข้างาน" (Clock In) /
"ออกงาน" (Clock Out) buttons that let any authenticated user record attendance
directly from a desktop browser. This bypasses the GPS/geofence enforcement that
exists only in STEP Connect Mobile, allowing clock-in/out from home or any
unapproved location. This hotfix removes the Web clock-in/out action entirely and
replaces it with a bilingual informational notice directing users to the mobile
app, while preserving today's-summary, history, filters, and admin review pages.

## Root Cause / Policy Gap
The attendance page (`apps/web/app/(app)/attendance/page.tsx`) called the same
`clockIn()` / `clockOut()` REST endpoints used by the mobile PWA, but rendered
plain buttons with no location capture and no geofence check. Web policy requires
clock-in/out to happen only through the mobile app where GPS/geofence validation
is enforced; the web UI had no such control, so the buttons were a policy gap, not
a backend defect.

## Files Modified
- `apps/web/app/(app)/attendance/page.tsx` — removed `clockIn`/`clockOut` API
  calls, `handleClockIn`/`handleClockOut`, the `btn-clock-in`/`btn-clock-out`
  buttons, and the now-unused `Toast`/`clockLoading` state (dead code left behind
  by removing the only code paths that populated it). Replaced the action buttons
  with a `data-testid="mobile-only-notice"` panel showing the Thai/English
  mobile-only copy. Today's check-in/out summary, status badge, my-history table
  with date filters, and the admin "All Attendance Records" section (with the
  off-site review quick link) are unchanged.
- `apps/web/lib/i18n.ts` — removed unused `att_clock_in`, `att_clock_out`,
  `att_clocking_in`, `att_clocking_out` keys (en + th); added
  `att_mobile_only_notice_title` and `att_mobile_only_notice_gps` (en + th) with
  the copy specified in the task.
- `apps/web/e2e/leave-attendance.spec.ts` — updated/added Playwright coverage:
  - `web attendance page never shows clock-in/out action buttons` — asserts
    `btn-clock-in` / `btn-clock-out` have zero count regardless of profile state.
  - `web attendance page shows STEP Connect Mobile-only notice` — asserts the
    notice renders whenever the today's-attendance panel isn't in the
    no-employee-profile state.
  - Existing `admin without employee profile...` test's clock-button assertions
    still hold (now redundant with the always-true check, kept for regression
    clarity).

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_ATTENDANCE_UI_001.md` (this file)

## Before / After Behavior
**Before:** Web `/attendance` page showed enabled "เข้างาน" / "ออกงาน" buttons
that called `POST /attendance/clock-in` and `POST /attendance/clock-out` directly
from the browser, with no location/geofence check.

**After:** The same panel shows today's check-in/out summary (if a record
exists) or the "no record yet" message, followed by a static notice:
- TH: "การลงเวลาทำได้ผ่าน STEP Connect Mobile เท่านั้น" /
  "เพื่อความถูกต้องของตำแหน่ง GPS กรุณาลงเวลาผ่านมือถือ"
- EN: "Clock-in/out is available only through STEP Connect Mobile." /
  "For GPS accuracy, please use the mobile app."

No clock action is available from the Web/Admin dashboard for any role.
History, filters, dashboard summary, and admin/off-site review are unaffected.

## Web vs Mobile Attendance Policy
- **Web/Admin:** read-only for attendance — today's summary, history, filters,
  admin "All Records" view, and off-site review links only. No clock-in/out
  action for EMPLOYEE, MANAGER, HR_ADMIN, or SUPER_ADMIN.
- **Mobile (STEP Connect):** unchanged. Clock-in/out remains available through
  the mobile geofence flow (`apps/mobile`), which was not touched by this fix.

## Backend Changes
None. `clockIn()` / `clockOut()` remain exported from `apps/web/lib/api.ts` (the
shared HTTP client) and the API's `/attendance/clock-in` / `/attendance/clock-out`
endpoints, guards, and RBAC are untouched — mobile continues to use them
unmodified. No schema or migration changes.

## Verification Result
- `git diff --check` → PASS (no whitespace errors)
- `./scripts/verify.sh` (API build + Prisma validate + Web build) → PASS
- `./scripts/docker-verify.sh` (non-destructive build/start + health checks) →
  PASS — API, Web, Mobile all healthy/reachable; containers left running,
  no teardown performed
- `./scripts/api-smoke-test.sh` → PASS (login, `/employees`, `/attendance`, etc.
  all OK)
- `./scripts/security-review.sh` → PASS (dependency audit: only previously
  accepted-risk Multer HIGH findings; secret scan clean)
- Targeted Playwright (`e2e/leave-attendance.spec.ts`, chromium):
  - New/changed assertions for clock-button absence and mobile-only notice →
    **8/8 PASS** (including the two new tests and all previously-passing
    Attendance tests: heading, today's panel, history section, all-records
    section, Bangkok clock).
  - 4 pre-existing tests (2 in `Leave`, `admin without employee profile...`, and
    `attendance history table headers...`) fail in this environment. **Root
    cause confirmed, not just theorized:** a browser-level network trace
    (Chromium `console`/`requestfailed` events against the running `hr-web`
    container) shows every list-data fetch (`/attendance`, `/attendance/me`,
    `/leave`, `/auth/me`) is blocked with `Access to fetch at
    'https://hr.eds-center.com/api/...' from origin 'http://localhost:3002' has
    been blocked by CORS policy: ... No 'Access-Control-Allow-Origin' header`.
    The Docker `web` image was built with `NEXT_PUBLIC_API_URL` baked in at
    build time to that remote host (from the repo-root `.env`; `docker exec
    hr-web env` confirms it), and the remote host's CORS policy does not permit
    `localhost:3002` as an origin — so every data fetch fails client-side with a
    generic network error, independent of this change.
  - **Empirically re-verified against the real local API**, without touching
    any app/Docker/env file: using Playwright request interception (not a
    browser-security bypass) to redirect the same page's calls from
    `hr.eds-center.com` to `localhost:4002`, against the live running stack:
    - Clock-in/out buttons: absent (`count 0`) with real data flowing — confirms
      the removal holds under a real (non-erroring) response, not just the
      error path.
    - `attendance history table headers or empty state are visible`: the admin
      "All Attendance Records" table renders real historical rows (15+ dated
      entries) — **history rendering is confirmed working**, the earlier
      failure was purely the CORS/env artifact above.
    - `admin without employee profile...`: `no-profile-info` renders correctly
      for `admin@hr.local` (which has `employeeId: null`), and the mobile-only
      notice correctly does **not** show in that branch (no-profile message
      takes priority, matching the existing code structure).
    - With a mocked successful `/attendance/me` response (simulating a user who
      *does* have an employee profile), the `mobile-only-notice` renders with
      the exact expected bilingual copy, and clock buttons remain absent —
      confirms the notice's positive path, not just the no-profile path.
  - This is a pre-existing environment configuration issue (production API URL
    baked into a local Docker build), unrelated to and unmodified by this
    hotfix, and out of scope per the task's "no backend/env changes"
    constraint.

## Issues Found
- Removing the clock buttons also removed the only two call sites that used the
  `Toast` component and `clockLoading` state in this file; these were removed as
  dead code (Toast import, state, and render) rather than left unused.
- Root `.env` sets `NEXT_PUBLIC_API_URL=https://hr.eds-center.com/api`, causing
  the local Docker web build to talk to a remote API from the browser. This is a
  pre-existing local-environment condition, not a regression from this change,
  and was not modified (changing `.env` / rebuilding with a different API URL is
  outside this task's scope and would need explicit user approval).

## Risk
Low — Web-only UI change (button removal + static notice + i18n keys), backward
compatible, no schema/API/RBAC changes. Mobile clock-in/out and geofence
enforcement are untouched.

## Security Review

| Field | Answer |
|---|---|
| Auth impact | None — no endpoints added/changed |
| RBAC impact | None — no role checks added/changed |
| Data privacy impact | None — no new data exposed; attendance history/fields unchanged |
| Password/token/hash impact | None |
| Mobile security impact | None — mobile clock-in/out and geofence flow untouched |
| Dependency/advisory impact | None — no packages added; `security-audit.sh` shows only previously accepted-risk Multer HIGH findings (unrelated to this change) |
| Secrets/logging check | None found — `secret-scan.sh` clean |
| New endpoints protected | None — no new endpoints; this is a UI-only removal of client-side actions against existing, already-guarded endpoints |
| Risk level | LOW |
| Security decision | PASS |

## Decision
PASS

## Next Step
Awaiting user direction — no other outstanding task specified by this hotfix.
(Optional follow-ups, not implemented here per constraints: an admin manual
attendance-correction workflow, or a Manager Flexible Attendance Policy.)

## No Git Operations Performed
No `git add`, `commit`, `push`, `tag`, or `merge` was run. All git steps are left
to the user.

## Recommended Commit Message
```
fix(web): disable web attendance clock actions

Remove the Web/Admin clock-in and clock-out buttons from the attendance
page and replace them with a bilingual notice directing users to STEP
Connect Mobile, where GPS/geofence enforcement is already implemented.
Clocking in/out from an unverified desktop location is no longer
possible from the Web dashboard for any role. Mobile attendance and
backend endpoints/RBAC are unchanged.
```
