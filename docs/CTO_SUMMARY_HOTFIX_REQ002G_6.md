# CTO Summary

## Step
HOTFIX-REQ002G-6 — Fix Manager Personal Summary Attendance Mapping

## Status
PASS

## Root Cause
`apps/web/app/(app)/dashboard/page.tsx` computed "today" as a plain `YYYY-MM-DD` string:

```ts
const todayBangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const todayRecord = data.attendance.find((r) => r.date === todayBangkok);
```

But `GET /attendance/me` returns `date` as a full ISO timestamp — `"2026-07-01T00:00:00.000Z"` — because the backend (`apps/api/src/attendance/attendance.service.ts`, `todayBangkok()`) encodes the business date as a UTC-midnight `Date` of the Bangkok calendar day, and JSON-serializes every `Date` field as a full ISO string. The comparison `"2026-07-01T00:00:00.000Z" === "2026-07-01"` is always `false`, so `todayRecord` was always `undefined` even though the correct row was present in `data.attendance` — exactly matching the production symptom (today's row visible in the recent-attendance list, but the "today" KPI card stuck on `—`).

The recent-attendance list had a second, separate bug: it rendered `{a.date}` directly, printing the raw ISO string instead of a formatted date.

Both bugs were in the same shared component (`PersonalSummaryBody`), so they affected MANAGER's embedded "My Summary" section and EMPLOYEE's self-dashboard identically.

## Summary of Fix
Added four small, local date helpers in `dashboard/page.tsx` (no shared/global date utility existed to reuse):

- `normalizeAttendanceBusinessDate(raw)` — extracts the `YYYY-MM-DD` business-date key from either a plain date string or a full ISO timestamp, without reinterpreting it through any timezone (the UTC digits already *are* the Bangkok business date by backend convention).
- `bangkokTodayKey()` — today's `YYYY-MM-DD` in Asia/Bangkok (same as before, just renamed/extracted).
- `isSameBangkokDate(raw, todayKey)` — compares normalized keys instead of raw strings.
- `formatAttendanceDate(raw)` — renders the normalized business-date key as `DD/MM/YYYY` (e.g. `01/07/2026`) for display, parsed via `Date.UTC` and formatted with `timeZone: 'UTC'` so the already-correct digits are never shifted by the browser's local timezone.
- `formatAttendanceTime(iso)` — small extraction of the existing check-in/out time formatting (`Asia/Bangkok`, `th-TH` time-of-day only — unaffected by the Buddhist-calendar year quirk since no year is rendered).

`PersonalSummaryBody` now:
1. Finds `todayRecord` via `isSameBangkokDate(r.date, todayKey)` instead of raw string equality.
2. Shows a `sub` line on the "Today's Attendance" KPI card with check-in (and check-out, if present) time when a record is found — addressing requirement 2 (check-in/out display), which was previously not surfaced on that card at all.
3. Renders each recent-attendance row's date through `formatAttendanceDate()` instead of the raw ISO string, and now also shows check-out time (previously only check-in was shown).

Status badges (`PRESENT`/`LATE`/`ABSENT`/etc.) were untouched — `statusBadge()` was not part of the bug and still renders from `a.status` unchanged.

## Files Changed

| File | Change |
|------|--------|
| `apps/web/app/(app)/dashboard/page.tsx` | Added `normalizeAttendanceBusinessDate`, `bangkokTodayKey`, `isSameBangkokDate`, `formatAttendanceDate`, `formatAttendanceTime` helpers. Fixed `todayRecord` lookup in `PersonalSummaryBody` to use normalized date comparison. Added check-in/out `sub` text to the today KPI card. Fixed recent-attendance list to render formatted dates and check-out time. |
| `apps/web/lib/i18n.ts` | Added `emp_dash_check_in` ("In" / "เข้า") and `emp_dash_check_out` ("Out" / "ออก") keys in `en` and `th`. |

No files created, no backend/schema/migration changes.

## Before / After Behavior

| | Before | After |
|---|---|---|
| Today attendance KPI (MANAGER "My Summary" and EMPLOYEE self-dashboard) | Always `—`, even with a real today record | Correctly shows today's status (e.g. `LATE`, `PRESENT`) plus check-in/out time sub-line |
| Recent attendance list dates | Raw ISO, e.g. `2026-07-01T00:00:00.000Z` | Formatted `DD/MM/YYYY`, e.g. `01/07/2026` |
| Recent attendance list times | Check-in only | Check-in – check-out (when both present) |
| Status badges | Unchanged | Unchanged |
| MANAGER team overview | Unchanged | Unchanged |
| EMPLOYEE dashboard scope | Self-only, no `GET /dashboard` call | Unchanged — still self-only, still no `GET /dashboard` call |

## Date/Time Handling Notes
- The backend's `date` field is a **business-date marker**, not a real instant: it is always UTC-midnight of the Y/M/D digits that represent the Asia/Bangkok calendar day (see `attendance.service.ts` `todayBangkok()` comment). The fix treats it accordingly — by reading the UTC digits directly (`slice(0, 10)`) rather than re-projecting the instant through `Asia/Bangkok` (which happens to still work today only because UTC-midnight + 7h never crosses a day boundary backward, but reading the encoded digits directly is the more correct and robust approach and matches how the backend itself documents the convention).
- `formatAttendanceDate` deliberately uses locale `en-GB` (not `th-TH`) for the numeric date, matching the existing pattern used elsewhere in the app (`attendance/page.tsx`, `leave/page.tsx`, `employees/[id]/page.tsx`) — `th-TH` with a numeric year defaults to the Buddhist Era calendar in the JS `Intl` implementation (verified: `th-TH` renders `2026` as `2569`), which would be a new, worse bug. Time-of-day formatting still uses `th-TH` since no year is involved there.
- This fix is scoped to the personal-summary component only. The same raw-ISO-comparison risk was not found elsewhere in this component; other pages' own `formatDate` helpers (e.g. `attendance/page.tsx`) use `toLocaleDateString` without an explicit `timeZone`, which has a latent, separate risk of shifting dates near midnight depending on the browser's local timezone — out of scope for this hotfix and not touched, per the instruction to keep the fix focused.

## RBAC / Privacy Notes
- No backend changes, no new endpoints, no role checks touched.
- The fix only changes how already-fetched self-scoped data (`/attendance/me`) is matched and displayed. No additional data is fetched, and no team/global data is introduced into the personal-summary section for either MANAGER or EMPLOYEE.
- EMPLOYEE still never calls `GET /dashboard` — confirmed unchanged in `DashboardPage`'s early-return branch.

## Verification Results

| Check | Result |
|---|---|
| `git diff --check` | PASS — no whitespace errors |
| `next build` (web) | PASS — no type errors |
| `./scripts/verify.sh` | PASS — Prisma schema valid, web build clean |
| `./scripts/api-smoke-test.sh` | PASS — all endpoints OK (`/dashboard` 401-unauthenticated guard intact) |
| Helper unit logic (standalone Node script, not committed — no test framework exists for `apps/web`) | PASS — `isSameBangkokDate("2026-07-01T00:00:00.000Z", "2026-07-01")` → `true`; `isSameBangkokDate("2026-06-30T00:00:00.000Z", "2026-07-01")` → `false`; `formatAttendanceDate("2026-07-01T00:00:00.000Z")` → `"01/07/2026"` |
| `npx playwright test e2e/dashboard.spec.ts` (SUPER_ADMIN, existing) | PASS — 5/5 |
| `npx playwright test e2e/login,navigation,theme-toggle,profile,force-password.spec.ts` | PASS — 38/38 (two transient 429s from the login-rate-limiter during heavy manual verification traffic; confirmed non-regression by re-running `login.spec.ts` alone after the throttle window cleared — 5/5 clean) |
| Manual reproduction + fix verification (local Docker sandbox, headless Playwright with `localStorage` token injection, same technique as `e2e/helpers/auth.ts`) | Reproduced the exact production bug shape by clocking in as the local `pichai.manager` (MANAGER) and `j.kasi` (EMPLOYEE) test accounts, producing `date: "2026-07-01T00:00:00.000Z"` records identical in shape to the reported bug. Confirmed: MANAGER "My Summary" today card now shows `LATE` with `เข้า 11:32` sub-line (previously `—`); recent attendance list shows `01/07/2026`, `22/06/2026`, etc. (previously raw ISO). Same fix confirmed independently for EMPLOYEE's "My Dashboard". MANAGER team overview and title unchanged; EMPLOYEE self-only scope unchanged. |

No new automated Playwright spec file was added (same test-infrastructure limitation noted in REQ002G-5: only a SUPER_ADMIN token is cached by `e2e/global-setup.ts`; no MANAGER/EMPLOYEE fixture exists). The logic was validated via a standalone Node script against the exact production data shape from the bug report, plus full manual browser reproduction of the original bug and confirmation of the fix on both affected roles, as detailed above.

`docker-verify.sh` was not run — per this task's explicit instruction and the still-unresolved conflict with the Docker Safety Rule (`docker compose down`) flagged in the REQ002G-5 CTO summary. `docker compose up -d --build web` was used instead (allowed, non-destructive) — once with a temporary local-only `NEXT_PUBLIC_API_URL` override for browser verification, then rebuilt again to restore the original `.env`-configured (production-API-pointed) build. No `.env` file changes were made.

## Issues Found
None beyond the root cause described above. No regressions found in existing dashboard, login, navigation, theme-toggle, profile, or force-password e2e coverage.

## Risk
Low

## Decision
PASS

## Next Step
Tag this commit as `v1.2.63-personal-attendance-summary-date-fix` after user review.

## Recommended Commit Message
```
fix(web): normalize personal attendance summary dates

- Fixed today-attendance detection in the Manager "My Summary" and
  Employee self-dashboard: /attendance/me returns date as a full ISO
  timestamp (e.g. 2026-07-01T00:00:00.000Z), but the code compared it
  against a plain YYYY-MM-DD "today" string, so today's own record
  was never matched even when present in the recent-attendance list
- Added normalizeAttendanceBusinessDate/isSameBangkokDate/
  formatAttendanceDate/formatAttendanceTime helpers in dashboard/page.tsx
- Recent attendance list now shows formatted dates (DD/MM/YYYY)
  instead of raw ISO strings, and check-out time alongside check-in
- Today's-attendance KPI card now shows check-in/out time when available
- Fix applies to both MANAGER (embedded section) and EMPLOYEE (full
  page) via the shared PersonalSummaryBody component
- No backend/schema changes; added emp_dash_check_in/check_out i18n keys
```
