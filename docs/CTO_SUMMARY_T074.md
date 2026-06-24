# CTO Summary

## Step
T-074R — Dashboard Match Approved Reference Layout

## Status
PASS

## Scope
Realign the Web Admin Dashboard with the approved visual reference: remove redundant secondary summary strips, restructure the analytics chart grid to a 12-column layout, retain 6 KPI cards, add per-chart range badges, apply accent-colored KPI icon tiles, and ensure full dark-mode readability across all SVG charts and text elements. No backend schema or API contract changes; only the dashboard page and its E2E test spec were modified.

## Files Created
- `docs/CTO_SUMMARY_T074.md` — this document

## Files Modified
- `apps/web/app/(app)/dashboard/page.tsx` — primary change: removed secondary summary strips, restructured chart grid to `grid-cols-12` (row 1: Attendance 4 / Leave Donut 3 / Leave by Dept 5; row 2: Off-site Donut 3 / OT Trend 5 / Top Requesters 4), accent-colored KPI icon tiles, `badge` prop on `ChartCard`, donut legend with percentages, `IconTrendUp` added, `RankingBarChart` row-number prefix added
- `apps/web/e2e/dashboard.spec.ts` — updated testid assertions to match removed summary strips; replaced `stat-section-employees` / `stat-departments` / `stat-positions` / `stat-present` / `stat-late` / `stat-approved` checks with the 6 KPI card testids that remain in the new layout

## Verification Result

```
./scripts/verify.sh          → PASS  (API build, Prisma schema, Next.js production build — TypeScript clean)
./scripts/api-smoke-test.sh  → not re-run (no API changes in this task)
./scripts/security-review.sh → PASS  (secret scan clean; manual checklist items noted below)
cd apps/api && npm test       → PASS  (363 tests, 20 suites)
```

`./scripts/docker-verify.sh` — not run; Docker containers unchanged. Production web container at port 3002 continues to serve the previous build. New code verified via the pre-existing Next.js dev server (port 3003) with Playwright visual capture.

**Runtime visual verification (Playwright, 1440×900):**
- Light mode: header row compact (title · timestamp · range buttons · refresh), 6 KPI cards in one row, chart row 1 and chart row 2 both visible without excessive scrolling, 4 operational panels at bottom.
- Dark mode: identical layout on dark surfaces; `rgb(0,0,0)` DOM scan returned 0 elements — no black text on dark backgrounds.
- Range filter ("เดือนนี้"): triggered `GET /dashboard?range=thisMonth` immediately; no console errors.
- Refresh button: re-triggered API call on current range; no console errors.
- Old summary strip testid `stat-section-employees`: count = 0 (confirmed removed).
- All 6 KPI testids visible: `stat-total`, `stat-active`, `stat-att-rate`, `stat-pending`, `stat-pending-offsite`, `stat-low-balance`.

## What Changed vs Previous T-074 Attempt

| Area | Before | After |
|---|---|---|
| Secondary summary strips | 3 cards repeating KPI data (employees / attendance / leave) | Removed entirely |
| Analytics label row | Separate "วิเคราะห์ข้อมูล · from — to" text row | Removed; range shown as per-chart badge |
| Chart grid | 2-column `lg:grid-cols-2` (all charts equal width) | 12-column grid, 2 rows: 4/3/5 and 3/5/4 spans |
| KPI icon tiles | Uniform zinc/gray background | Accent-colored (blue/green/indigo/amber/zinc/red) |
| Donut legend | Value only | Value + percentage (e.g., `2 (100%)`) |
| Chart header | Title only | Title + right-aligned range badge |
| Ranking list | No row numbers | 1-indexed rank number prefix |
| E2E spec | Checked removed-strip testids | Updated to check 6 KPI card testids |

## Issues Found

1. **Dev server CORS restriction** — The Next.js dev server runs on port 3003; the Docker API (`localhost:4002`) allows only `localhost:3002` as CORS origin. Runtime visual verification required Playwright `page.route()` proxy (Node.js side) to bypass this. Production at port 3002 is unaffected. This is an environment limitation, not a code defect.

2. **Latent base text-color gap** — If the root `<body>` or a layout wrapper has no explicit dark-mode text color set, SVG `fill="currentColor"` falls back to the CSS cascade value rather than an explicit Tailwind class. All SVG chart elements in this file already use `fill="currentColor"` inside a `text-zinc-700 dark:text-zinc-300` wrapper (`ChartCard`), and the `rgb(0,0,0)` DOM scan came back clean. However, if a future layout-level change removes that inherited color, SVG text could regress to black on dark surfaces. Mitigation: the ChartCard wrapper class carries explicit dark/light text color and acts as the inherited-color anchor for all nested SVGs.

3. **E2e spec testid alignment** — Six testids referenced in `apps/web/e2e/dashboard.spec.ts` pointed to now-removed summary strip elements. Spec updated to check the 6 remaining KPI card testids. No other test files reference those testids.

## Security Review

| Field | Detail |
|---|---|
| Auth impact | None — no new or changed endpoints |
| RBAC impact | None |
| Data privacy impact | None — dashboard reads existing aggregated data |
| Password/token/hash impact | None |
| Mobile security impact | None — mobile app not touched |
| Dependency/advisory impact | No new packages added |
| Secrets/logging check | No tokens or secrets in code; no new logging |
| New endpoints protected | None added |
| Risk level | LOW |
| Security decision | PASS |

`./scripts/security-review.sh` automated scan: **PASS** (no findings).

## Safety Confirmations

- No destructive Docker commands (`down`, `down -v`, `system prune`, `volume rm`) executed.
- No direct SQL executed.
- No `git add`, `git commit`, `git push`, or `git tag` performed.
- No Prisma schema or migrations changed.
- No package files changed.
- No mobile app, auth, RBAC, payroll, or seed script files changed.

## Risk
Low

## Decision
PASS

## Next Step
STEP 17 — to be determined by the user (department module or subsequent task).

## Recommended Commit Message
```
fix(dashboard): align analytics layout with approved reference

- Remove secondary summary strips (employee/attendance/leave mini-grids)
  that repeated KPI data and made the page read like a long report
- Restructure chart grid to grid-cols-12 with two rows:
    row 1: Attendance Trend (4) · Leave Status Donut (3) · Leave by Dept (5)
    row 2: Off-site Donut (3) · OT Trend (5) · Top Leave Requesters (4)
- Add accent-colored icon tiles to KPI cards (blue/green/indigo/amber/red)
- Add per-chart range badge (ChartCard badge prop)
- Show percentage alongside value in donut chart legend
- Add rank-number prefix to RankingBarChart rows
- Update e2e spec testids to match new layout (remove strip refs,
  assert 6 KPI card testids)
- All SVG chart text uses currentColor via ChartCard wrapper;
  dark-mode rgb(0,0,0) scan clean
```
