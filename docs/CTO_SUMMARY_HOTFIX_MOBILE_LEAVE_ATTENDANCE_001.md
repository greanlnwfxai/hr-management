# CTO Summary

## Step
HOTFIX-MOBILE-LEAVE-ATTENDANCE-001 — Show approved leave on STEP Connect attendance tab

## Status
PASS

## Scope
HOTFIX-MOBILE-LEAVE-CALENDAR-001 added an approved-leave overlay to the STEP Connect home screen and calendar day-detail card, but a production visual check found the attendance ("ลงเวลา") tab still showed "วันทำงาน" for 9 ก.ค. 2569 even though the same date correctly showed "ลาพักร้อน" on the home screen. This hotfix wires the attendance tab's day-type header into the same shared overlay logic used by the other two screens, so all three stay consistent.

## Root Cause
`apps/mobile/app/attendance.tsx`'s `AttendanceHeader` component computed its `dayType` label purely from `isWeekend` (today's day-of-week), with no reference to the employee's approved leave at all — it never called `useApprovedLeave()` or `findApprovedLeaveForDate()`. This was a separate code path from `home.tsx`'s `TodayScheduleCard`, which the previous hotfix updated but the attendance tab was out of scope for at the time, so the two screens silently diverged.

## Files Changed
- `apps/mobile/app/attendance.tsx` — added `useApprovedLeave()` and `findApprovedLeaveForDate()` (both reused unchanged from the previous hotfix); `AttendanceHeader` now accepts an `approvedLeave` prop and uses the new shared `resolveDayTypeLabel()` helper to compute `dayType`; added a secondary status line (`leaveStatusLabel(approvedLeave.status)`, e.g. "อนุมัติแล้ว") shown only when leave is present; wired `refreshLeave` into the tab's pull-to-refresh, matching `calendar.tsx`'s existing pattern
- `apps/mobile/src/utils/leaveOverlay.ts` — added `resolveDayTypeLabel(approvedLeave, fallbackLabel)`, a small shared helper extracted from the day-type ternary that was duplicated between `home.tsx` and (now) `attendance.tsx`; it returns the leave type label when approved leave covers the date, otherwise the caller's fallback label — so each screen still controls its own weekend/workday wording (e.g. home's "วันหยุดประจำรอบ" vs attendance's "วันหยุด") without duplicating the leave-precedence logic
- `apps/mobile/app/home.tsx` — refactored `TodayScheduleCard` to call the new shared `resolveDayTypeLabel()` instead of its own inline ternary; **behavior-preserving, not a functional change** — produces the identical label in every case, now just via the shared helper instead of a duplicated inline expression
- `apps/mobile/src/utils/leaveOverlay.test.ts` — added unit tests for `resolveDayTypeLabel` (leave overrides fallback; falls back to the caller-provided label when no approved leave; different screens can supply different fallback labels)

No files outside `apps/mobile` were touched.

## Frontend/Mobile Impact
The attendance tab's header now shows the approved leave type (e.g. "ลาพักร้อน") and a secondary "อนุมัติแล้ว" status line for any date covered by APPROVED leave, instead of "วันทำงาน"/"วันหยุด". Home screen and calendar behavior is unchanged (home.tsx's refactor is a pure code-reuse change with identical output). Existing attendance history/timeline rendering, check-in/check-out buttons, and off-site flows are untouched.

## Backend/API Impact
None. No API client calls, endpoints, or request/response shapes changed. `useApprovedLeave()` was already fetching `GET /leave` with `status=APPROVED` for the calendar screen; the attendance tab now performs its own independent call to the same existing endpoint (same pattern `calendar.tsx` already uses) — no new backend surface.

## Database/Migration Impact
None. No schema or migration changes.

## Auth/Security Impact
None. No change to authentication, RBAC, token handling, or check-in/check-out validation/security logic. `useApprovedLeave()` reuses the existing authenticated `getMyLeaveRequests` client call (own-employee data only, same as the calendar screen already fetches).

## Tests and Verification Results

```
cd apps/mobile && npx jest
  → PASS — 9/9 tests (6 pre-existing findApprovedLeaveForDate + 3 new resolveDayTypeLabel)

cd apps/mobile && npx tsc --noEmit
  → PASS — no type errors

npm ls react react-dom --prefix apps/mobile
  → react@19.1.0 / react-dom@19.1.0 consistent everywhere (no regression from
    HOTFIX-MOBILE-REACT-MISMATCH-001)

./scripts/mobile-verify.sh
  → PASS — typecheck PASS, Expo web export PASS (796 modules)

./scripts/verify.sh
  → PASS — API build PASS, Prisma schema valid PASS, Web build PASS

./scripts/docker-verify.sh   (non-destructive; run twice — the second run is
  authoritative, rebuilding after a late addition wiring refreshLeave into
  pull-to-refresh; stack left running)
  → PASS — hr-management-api/mobile/web images rebuilt; hr-db/hr-api/hr-mobile/hr-web
    all healthy/Up; API health check OK, Web reachable (3002), Mobile reachable (3004)

./scripts/api-smoke-test.sh
  → PASS — all 10 checks pass (health, login, /auth/me, /employees, /departments,
    /positions, /attendance, /leave, /leave-balances, /dashboard, 401 guard).
    Run to confirm the backend is unaffected, since this task is frontend-only.

Direct inspection of the rebuilt hr-mobile container's served bundle
  → the new `resolveDayTypeLabel` symbol is present in the built JS, confirming the
    fix shipped into the actual production bundle; only "19.1.0" appears as a React
    version string (no regression of the prior react/react-dom mismatch)

Headless Playwright render check (http://localhost:3004, the rebuilt production
container)
  → PASS — #root mounts real content (not blank), Thai login screen renders
    correctly, zero console/page errors (confirms React error #527 does not
    recur; no build-breaking regression)
```

### Verification level — read before relying on this for the exact acceptance text
The above verifies: (1) the label-resolution logic itself via unit tests, (2) that the
fix is present in the rebuilt production bundle, and (3) that the app mounts without
error. It does **not** include an authenticated end-to-end check of logging in as an
employee with approved leave on 2026-07-09 and visually confirming the `ลงเวลา` header
shows "ลาพักร้อน" — that is a production/manual visual check, same limitation as the
prior HOTFIX-MOBILE-LEAVE-CALENDAR-001 summary documented. All render checks in this
session hit the unauthenticated login screen (this sandbox's data-fetching pages are
also affected by the pre-existing, unrelated `.env`/CORS note in Current Status.md).
Recommend the user re-run the same production visual check described in this task
(9 ก.ค. 2569 on the attendance tab) after deploying this hotfix.

## Production Deployment Notes
- Only `apps/mobile` files changed — no new dependencies, environment variables, or migrations. Redeploying the rebuilt `hr-mobile` image is sufficient.
- No `.env` changes were made.
- Safe to deploy independently of, or together with, HOTFIX-MOBILE-REACT-MISMATCH-001.

## Known Limitations
- The new `resolveDayTypeLabel` unit tests cover the label-resolution logic in isolation; they do not exercise `attendance.tsx`'s actual call site (the `useApprovedLeave()` hook call and the `approvedLeave={todayLeave}` prop wiring). This repo has deliberately not added component-level React Native rendering tests (per the prior hotfix's documented decision), so there is no automated test that would catch a future regression where the attendance screen stops calling the overlay — only typecheck plus this manual/CTO verification would catch that today. If component-render test infra is added later, wiring-level coverage for all three screens (home/calendar/attendance) would be worth adding then.
- As noted above, the exact acceptance criterion ("attendance tab for 9 ก.ค. 2569 shows ลาพักร้อน") was verified at the logic/bundle level, not via an authenticated live render, due to this sandbox's pre-existing `.env`/CORS limitation on data-fetching pages (documented in `HR-Knowledge/01-START-HERE/Current Status.md`).

## Risk
Low — small, contained diff (4 files, 67 insertions / 11 deletions), reuses existing shared helpers exactly as instructed, no backend/schema/auth changes, and full non-destructive Docker verification confirms the rebuilt production bundle contains the fix and mounts cleanly.

## Recommended Commit Message
```
fix(mobile): show approved leave on attendance tab

The attendance ("ลงเวลา") tab computed its day-type header from
weekday/weekend only, never checking approved leave — so it still showed
"วันทำงาน" for a date the home screen correctly showed as "ลาพักร้อน" for.

Wire attendance.tsx into the same useApprovedLeave()/findApprovedLeaveForDate()
overlay the home and calendar screens already use, and extract the shared
day-type-label ternary (previously duplicated in home.tsx) into a new
resolveDayTypeLabel() helper in leaveOverlay.ts so all three screens can't
diverge again. Also show the leave's approval status as a secondary line,
and refresh approved leave on pull-to-refresh, matching calendar.tsx.
```

## Decision
PASS
