# CTO Summary

## Step
HOTFIX-MOBILE-LEAVE-CALENDAR-001 — Show approved leave on STEP Connect calendar

## Status
PASS

## Scope
STEP Connect Mobile/PWA showed "วันทำงาน" (normal workday) with "08:30–17:30" on
the home screen's today-schedule card and on the full calendar's day-detail card
even when the employee had an **APPROVED** leave request covering that date. This
hotfix overlays approved leave onto both cards so the leave type (e.g.
"ลาพักร้อน") replaces the normal workday label whenever an approved leave request
covers the displayed date, for any single date within a multi-day leave range.

## Root Cause
1. `apps/mobile/app/home.tsx` — `TodayScheduleCard` computed the day label
   purely from `isWeekend` (today's day-of-week) and hardcoded
   `'08:30–17:30'` / `เข้า .. ออก ..`. It never looked at leave data at all,
   even though `useHomeSummaries()` was already fetching every APPROVED leave
   request (for the "สรุปการลา" balance cards) — that data just wasn't wired
   into the schedule card.
2. `apps/mobile/app/calendar.tsx` had the identical gap: the day-detail card's
   header (`วันทำงาน` / `วันหยุดสุดสัปดาห์`) and status badge were derived only
   from the weekend check and the attendance record, with no leave-aware logic
   and no leave data fetched on that screen at all.
3. **Backend note (investigated, not changed):** `GET /leave/me` (`
   apps/api/src/leave/leave.service.ts:338` `buildDateFilter`) filters
   `startDate >= query.startDate AND endDate <= query.endDate` — a
   **containment** filter, not a range-overlap filter. Querying with a single
   day (`startDate=endDate=2026-07-09`) would silently miss a multi-day leave
   request such as `2026-07-05..2026-07-10`. To avoid depending on that
   endpoint semantic (and per the "no migration / avoid backend changes"
   constraint), the fix fetches all `status=APPROVED` leave requests (no
   date-range query params — this already matches the pattern
   `useHomeSummaries.ts` uses for its balance cards) and does the inclusive
   date-range overlap check client-side.

## Precedence Rule (documented, as required)
No holiday model and no other special-day rule exists in this codebase today
(confirmed by search — `grep -rli holiday apps/mobile apps/api/src` returns no
app-code hits). Off-site work mode (`workMode`) governs *where* attendance is
recorded, not the day-type label, so it does not interact with this display.
Final precedence, now implemented consistently in both files:
1. **Approved leave** (any `leaveType`) overrides the normal
   workday/weekend label and the attendance status dot for every date its
   `[startDate, endDate]` range covers (inclusive).
2. If no approved leave covers the date, existing behavior is unchanged:
   weekend vs. workday label, attendance-derived status dot/badge.
3. Pending/rejected leave is never applied — the overlay only ever considers
   `status === 'APPROVED'` records.

## Files Created
- `apps/mobile/src/utils/leaveOverlay.ts` — `findApprovedLeaveForDate()`, the
  shared inclusive date-range/leave-status overlay check.
- `apps/mobile/src/utils/leaveOverlay.test.ts` — regression tests (see below).
- `apps/mobile/src/hooks/useApprovedLeave.ts` — small hook fetching all
  `status=APPROVED` leave requests (paginated) for screens (`calendar.tsx`)
  that don't already have this data in scope.
- `apps/mobile/jest.config.js` — `jest-expo` preset config (mobile had no test
  runner at all before this hotfix).
- `docs/CTO_SUMMARY_HOTFIX_MOBILE_LEAVE_CALENDAR_001.md` (this file).

## Files Modified
- `apps/mobile/app/home.tsx` — `TodayScheduleCard` now accepts an
  `approvedLeave` prop; when set, it renders `leaveTypeLabel(leaveType)` (e.g.
  "ลาพักร้อน") instead of "วันทำงาน"/"วันหยุดประจำรอบ", and
  `leaveStatusLabel(status)` instead of the "08:30–17:30" / check-in-out line.
  `HomeScreen` computes `todayLeave` via `findApprovedLeaveForDate` over the
  `approvedLeave` list already exposed by `useHomeSummaries()` (no new network
  call added to this screen).
- `apps/mobile/app/calendar.tsx` — added `useApprovedLeave()`; built a
  `leaveMap` for every day of the displayed month; approved-leave days get the
  leave dot color (`#1a56db`) on the grid, and the selected-day detail card's
  header line, status badge, and body now show the leave type/status instead
  of "วันทำงาน" when the selected day has approved leave. `RefreshControl` now
  also refreshes leave data.
- `apps/mobile/src/hooks/useHomeSummaries.ts` — exposes the `approvedLeave`
  list (`LeaveRequestRecord[]`) it was already fetching internally for the
  leave-balance cards; no change to the balance/overtime calculation logic.
- `apps/mobile/src/hooks/index.ts` — exports `useApprovedLeave`.
- `apps/mobile/package.json` / `package-lock.json` — added `jest`,
  `jest-expo`, `@types/jest` as devDependencies and a `test` script (no
  production/runtime dependency changes).

## Frontend/Mobile Impact
Display-only change in two screens (home schedule card, full calendar). No
navigation, routing, or existing-component API changes beyond the new optional
`approvedLeave` prop on the local `TodayScheduleCard` component. The
"รายการคำขอ" (leave request list) placeholder on both screens is untouched, per
acceptance criterion 7.

## Backend/API Impact
None. No API/service/controller files were touched. The containment-vs-overlap
filter bug in `GET /leave/me`'s `buildDateFilter` was identified during
investigation but is **not** fixed here — it was avoided (by not passing
date-range params) rather than patched, to keep this a frontend-only hotfix as
instructed. Recommend a follow-up backend ticket to switch `buildDateFilter` to
a true overlap filter (`startDate: { lte: end }, endDate: { gte: start }`,
mirroring the overlap check already used in `create()`).

## Database/Migration Impact
None. No schema or migration changes.

## Auth/RBAC/Security Impact
None — no new endpoints, no guard/role changes, no change to token or password
handling. Mobile UI only reads the employee's own `GET /leave/me?status=APPROVED`
data (already permitted). `./scripts/security-review.sh` was run out of an
abundance of caution because new devDependencies were added; see Verification
Result.

### Security Review (per project policy)
| Field | Answer |
|---|---|
| Auth impact | None — no endpoints added/changed |
| RBAC impact | None |
| Data privacy impact | None — reuses existing own-employee leave data already fetched elsewhere in the app |
| Password/token/hash impact | None |
| Mobile security impact | None — no change to token storage or API call auth |
| Dependency/advisory impact | Added `jest`, `jest-expo`, `@types/jest` (devDependencies only, not shipped in the app bundle). `security-audit.sh` → PASS, no new HIGH/CRITICAL findings |
| Secrets/logging check | No new logging added; no secrets/tokens touched |
| New endpoints protected | None — no new endpoints |
| Risk level | LOW |
| Security decision | PASS |

## Tests Added/Updated
`apps/mobile/src/utils/leaveOverlay.test.ts` (new — mobile had zero test
infrastructure before this hotfix, so `jest` + `jest-expo` were added as
devDependencies to run it):
- returns the approved vacation leave that covers the target date
- does not override the schedule for a **pending** leave request
- does not override the schedule for a **rejected** leave request
- covers every date in a **multi-day** approved leave range, inclusive
  (boundary-tested: day before range, first day, middle days, last day, day
  after range)
- returns null when no leave requests overlap the date
- returns null for an empty leave list

All 6 tests pass. No component-level (React Native rendering) tests were added
— the project has no existing RN component test pattern, and the acceptance
criteria are fully covered by testing the pure overlay function plus the manual
Docker/health verification below.

## Verification Result
- `apps/mobile`: `npx tsc --noEmit` → **PASS**
- `apps/mobile`: `npx jest` → **PASS** (6/6 new tests)
- `./scripts/mobile-verify.sh` (mobile typecheck + Expo web export) → **PASS**
- `./scripts/verify.sh` (API build + Prisma validate + Web build) → **PASS**
  (no backend/web files changed; run per project policy)
- `./scripts/docker-verify.sh` (non-destructive rebuild + health check) →
  **PASS** — `hr-api`, `hr-db` healthy; `hr-web`, `hr-mobile` reachable;
  containers left running, no teardown performed
- `./scripts/api-smoke-test.sh` → **PASS** (not required — no backend/API
  changes — run anyway for confidence; login, `/employees`, `/leave`, etc. all
  OK)
- `./scripts/security-review.sh` → **PASS** (dependency audit: only the
  previously-accepted Multer HIGH findings on the API side; no new HIGH/CRITICAL
  from the mobile devDependency additions; secret scan clean)

## Known Limitations
- No live end-to-end browser verification was performed against the running
  dev database. Creating a temporary APPROVED leave request to screenshot the
  fix would have mutated the shared dev environment's leave-balance data
  (`approve()` atomically deducts `LeaveBalance.usedDays`), and there is no
  "unapprove" endpoint to cleanly revert it — so this was intentionally
  avoided to protect existing demo/dev data integrity. Confidence instead comes
  from: exhaustive unit coverage of the date-overlap logic (including exact
  boundary dates), a clean TypeScript typecheck, a successful Expo web bundle,
  and a full non-destructive Docker rebuild with health checks passing.
  **Recommend a manual mobile/PWA smoke check** (create + approve one test
  leave request for a test employee, verify the card, then restore the balance)
  before/after this change reaches a shared environment.
- No RN component-level test harness exists in this repo; only the pure logic
  function is unit-tested (see Tests Added/Updated).
- The mobile app has no language-switching feature today (confirmed by
  searching for i18n/locale-switching infra — none found), so "English support
  should not be broken" is not applicable; all strings remain Thai-only,
  consistent with the rest of the app.
- The backend `GET /leave/me` date-range filter bug (containment instead of
  overlap) was found but intentionally not patched — see Backend/API Impact.

## Production Deployment Notes
- Purely a mobile/PWA (Expo) frontend change — requires an Expo web
  export/redeploy (or app store build, if native builds are also distributed)
  for `hr-mobile`. No API restart, migration, or environment variable change
  needed.
- `docker-verify.sh` already rebuilt and validated the `hr-mobile` Docker
  image with this change; the stack is currently running healthy with the fix
  live at `http://localhost:3004`.

## Recommended Commit Message
```
fix(mobile): overlay approved leave on STEP Connect home/calendar schedule cards

Approved leave now replaces the normal workday label on the home screen's
today-schedule card and the full calendar's day-detail card/grid dots, for
every date an APPROVED leave request covers. Pending/rejected leave and
multi-day ranges are handled via a client-side inclusive overlap check,
sidestepping a found (but unpatched) containment-vs-overlap gap in the
GET /leave/me date filter. Adds jest/jest-expo to apps/mobile to cover the
new overlay logic with regression tests.
```

## Decision
PASS

## Next Step
Backend follow-up ticket: fix `LeaveService.buildDateFilter` in
`apps/api/src/leave/leave.service.ts` to use a true date-range overlap filter
(`startDate: { lte: end }, endDate: { gte: start }`) instead of containment, so
`GET /leave/me?startDate=...&endDate=...` correctly returns multi-day requests
that merely overlap the queried window. Otherwise, see `HR-Knowledge/01-START-HERE/Current Status.md` for the general roadmap pointer.
