# CTO Summary

## Step
T-095 — Personal Summary Ring Size and Leave Date Format Polish

## Status
PASS

## Root Cause / UI Issue
1. **Ring too small**: `LeaveBalanceRing` (introduced in T-094) defaulted to `size=64,
   strokeWidth=7`, and the empty-state instance was rendered even smaller
   (`size=56, strokeWidth=6`). At that size the ring read as a minor decorative element
   rather than the card's primary visualization, and the list-item column width (`80px`)
   left little breathing room around it.
2. **Raw ISO dates in "My Leave Requests"**: the list rendered `{l.startDate} – {l.endDate}`
   directly — `LeaveRequest.startDate`/`endDate` are ISO business-date timestamps (e.g.
   `2026-07-27T00:00:00.000Z`), and nothing formatted them, unlike the adjacent "Recent
   Attendance" panel which already used a `formatAttendanceDate()` helper.

## Scope
Frontend-only. No backend, schema, migration, or RBAC changes. Team dashboard's own
"Recent Leave" widget (`dash_recent_leave`, which shows employee name + status, no date
range) was confirmed untouched — it doesn't share code paths with this change beyond the
generic `statusBadge()` function, which was not modified in this task.

## Files Modified
- `apps/web/app/(app)/dashboard/page.tsx`

(`apps/web/lib/i18n.ts` was not touched — no new translation keys were needed since the
task specifies DD/MM/YYYY for both TH and EN, so the formatter is locale-independent.)

## Summary of Changes

**1. Larger, rebalanced ring**
- `LeaveBalanceRing` default size: `64→96`, stroke width: `7→10`; center text scaled up to
  match (`text-sm`→`text-xl` for the remaining-days number, `text-[9px]`→`text-[11px]` for
  the `/ total` line) so the larger ring doesn't look sparse.
- Empty-state ring: `56/6` → `80/8` (kept intentionally smaller than the populated-state
  default, since it's a placeholder, but still a proportional increase in line with the
  main ring).
- List-item column width bumped `80px → 112px` and gaps loosened slightly
  (`gap-x-2 gap-y-3` → `gap-x-3 gap-y-4`, plus vertical breathing room `py-1`/`py-3`) so
  the enlarged ring has balanced padding within the card rather than crowding its neighbors
  when multiple leave types are present.
- No chart dependency added — same hand-rolled SVG `stroke-dasharray`/`stroke-dashoffset`
  technique from T-094, just larger prop values.

**2. Formatted leave dates**
- Added `formatLeaveDateRange(startDate, endDate)`, reusing the existing
  `formatAttendanceDate()` helper (already timezone-safe — it extracts the calendar-date
  digits from the ISO string directly rather than reinterpreting through the browser's
  local timezone, then formats via `en-GB` locale for `DD/MM/YYYY`). Collapses to a single
  formatted date when `startDate === endDate`, otherwise renders
  `DD/MM/YYYY – DD/MM/YYYY`. Same output for TH and EN, per spec.
- Replaced the raw `{l.startDate} – {l.endDate}` interpolation in the "My Leave Requests"
  list with `{formatLeaveDateRange(l.startDate, l.endDate)}`.

**3. T-094 regressions checked, none found**
- Thai/EN attendance and leave-status labels (`มาทำงาน`/`สาย`/`ขาดงาน`,
  `รออนุมัติ`/`อนุมัติแล้ว`/`ปฏิเสธ`) — untouched code paths, confirmed still correct in
  manual verification (see below).
- Pending-requests KPI label (`คำขอรออนุมัติ` / `Pending Requests`, key
  `emp_dash_pending_leave`) — untouched, confirmed still correct.

## Verification Result
```
git diff --check                → PASS (no whitespace/EOL issues)
npx tsc --noEmit (apps/web)     → PASS (no type errors)
./scripts/verify.sh             → PASS (API build, Prisma schema validate, Web build)
```

## Manual/Browser Verification
Logged in as the same local dev-only MANAGER test account used in T-094
(`pichai.manager`), via a temporary local Next.js dev server + temporary local NestJS dev
instance pointed at the same already-running dev Postgres container — identical setup
pattern to T-094. **No Docker containers were stopped, restarted, rebuilt, or otherwise
modified.**

**Credential handling (local dev only, approved by user before each step):**
- The account's local password was reset to a temporary dev-only value for this session
  (as it was left in a `mustChangePassword=true` state at the end of T-094). After
  verification, `mustChangePassword` was set back to `true`. As noted in the T-094 summary,
  the account's true original password cannot be restored (it was a one-time-shown
  provisioning password, never stored in plaintext) — this remains a local-only
  MANAGER test account, not a production credential, and no password/token value was
  printed to any log or file.
- This employee (`4de6189a-…`) had **zero** `leave_requests` rows in the local dev
  database, so the date-formatting behavior (same-day collapse, date-range display) could
  not be observed without real data. With explicit user approval, two temporary,
  clearly-labeled local-only rows were inserted directly into the local dev
  `leave_requests` table (reason field prefixed `T-095 temp verification:`) — one same-day
  request and one multi-day request — screenshotted, then **deleted immediately after**
  verification. Row count for this employee was confirmed back to `0` after cleanup. No
  `leave_balances` rows were added or modified (out of the scope the user approved), so the
  main (non-empty) ring's populated state was not separately screenshotted — the enlarged
  ring component itself was visually confirmed via the empty-state instance (`80px`, same
  code path, same center-text scaling logic as the `96px` default), which is a lower-risk
  extrapolation than an untested code path.

**Confirmed via screenshots (TH and EN, both locales, no console errors in either):**
- Leave balance card ring is visibly larger and better proportioned within the card
  (empty-state ring grew from 56px to 80px on screen).
- "My Leave Requests" list:
  - Same-day request → single date, e.g. `27/07/2026`.
  - Multi-day request → clean range, e.g. `03/08/2026 – 05/08/2026`.
  - No raw ISO timestamps anywhere in the list.
- Leave status badges render correctly on real data for the first time this cycle:
  TH `รออนุมัติ` (PENDING, blue) and `อนุมัติแล้ว` (APPROVED, green); EN `Pending` /
  `Approved`. This also closes a verification gap noted in the T-094 CTO summary, where
  leave-status badges had only been code-reviewed, not screenshotted.
- Pending-requests KPI correctly counted `1` (the temporary PENDING row) and displayed
  `คำขอรออนุมัติ` (TH) / `Pending Requests` (EN) — T-094 label unchanged.
- Attendance history badges (`สาย`/`มาทำงาน`, `Late`/`Present`) unchanged from T-094,
  confirming no regression.
- "Today's Attendance" still shows `—` (no attendance record for the current business
  date) — pre-existing behavior, unrelated to this change.

**Not separately verified**: EMPLOYEE-role self-dashboard (full-page variant) — the same
`PersonalSummaryBody` component is shared between the MANAGER (embedded section) and
EMPLOYEE (full-page) views, and the changes in this task are entirely within
`PersonalSummaryBody`/`LeaveBalanceRing`, so the MANAGER-view verification exercises the
same code. Not independently screenshotted to avoid a third local-account credential
reset for a component-identical code path.

## Issues Found
None in the implementation. See "Manual/Browser Verification" above for full disclosure of
the local-dev-only credential and temporary test-data handling used to perform verification
— all actions were explicitly approved by the user beforehand, confined to the local
Docker Postgres container, fully cleaned up (temporary rows deleted, row count confirmed
back to zero, account re-flagged for password rotation), and no production system or data
was touched at any point.

## Confirmations
- No backend, API, schema, or migration changes — confirmed via `git status --short`
  (only `apps/web/app/(app)/dashboard/page.tsx` modified).
- No RBAC changes — no role checks added, changed, or removed.
- No git operations performed — no `add`/`commit`/`push`/`tag`/`merge` run.
- No destructive Docker commands run — `docker compose ps` confirms all 4 containers
  (`hr-api`, `hr-db`, `hr-mobile`, `hr-web`) still `Up`/`healthy`, unchanged, throughout.
- No secrets, tokens, or passwords appear in this document or were printed to any log/
  console output during verification.
- Production was not touched at any point.

## Risk
Low — purely visual (size/formatting) changes to a component and list already introduced
in T-094; no new state, no new API calls, no changed data shape.

## Decision
PASS

## Next Step
Awaiting user direction. Also still outstanding: the production hotfix for the missing
`leave_adjustments` table migration, pending the user's `npx prisma migrate status`
output via Portainer.

## Recommended Commit Message
```
fix(web): polish personal summary ring and leave dates
```
