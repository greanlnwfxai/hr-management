# CTO Summary

## Step
UX-POLISH-001 — Mobile Home Error-State Fix

## Status
PASS

## Scope
`apps/mobile/app/home.tsx` destructured `loadState`/`error` from `useHomeSummaries()` but only ever used `loadState` to compute the pull-to-refresh spinner (`isRefreshing`) — `error` was never read, and there was no `summaryLoadState === 'error'` branch anywhere in the screen. A failed summary fetch (attendance history, leave balances, leave requests) silently rendered a fully-populated-looking dashboard with zeroed/fabricated stats (0 hours worked, 0 leave balance) and no indication anything went wrong. This was `UX-AUDIT-001`'s top recommended next task (Section F). Scope: Mobile/PWA "STEP Connect" frontend only — no backend/API/schema change, no attendance/leave/off-site/manager-approval business logic touched.

## Files Created
- `apps/mobile/src/hooks/useHomeSummaries.test.tsx` — first hook-level test in this app (3 tests)
- `apps/mobile/src/types/react-test-renderer.d.ts` — local ambient module declaration (no `@types/react-test-renderer` package exists on npm; `react-test-renderer` itself is already present transitively via `jest-expo`, so this avoids adding a new dependency)
- `docs/CTO_SUMMARY_UX_POLISH_001_MOBILE_HOME_ERROR_STATE.md` — this document

## Files Modified
- `apps/mobile/app/home.tsx` — read `error` from `useHomeSummaries()`; added a Thai error+retry card, rendered when `summaryLoadState === 'error'`, in place of the แดชบอร์ด (dashboard stat cards) / สรุปการลา (leave summary) / สรุปการทำงานล่วงเวลา (overtime summary) sections; added matching styles (`summaryErrorBox`/`summaryErrorText`/`summaryErrorSubText`/`summaryRetryBtn`/`summaryRetryBtnText`)
- `docs/UX_AUDIT_001_ADMIN_WEB_MOBILE_REAL_USAGE_POLISH.md` — added a status-update note marking `UX-POLISH-001` RESOLVED, pointing at this summary
- `HR-Knowledge/01-START-HERE/Current Status.md` — added a "Status as of `UX-POLISH-001`" paragraph under **Next Recommended Task**, and a full milestone entry in the changelog
- `docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md` — added a "Home summary error/retry state" manual QA block to Section D (Mobile/PWA regression checklist)

No `apps/api/` or `prisma/` files touched — confirmed via `git diff --stat -- apps/api/ prisma/` (empty output).

## Root Cause / Prior UX Behavior
`useHomeSummaries()` (`apps/mobile/src/hooks/useHomeSummaries.ts`) already correctly tracked a `loadState: 'idle' | 'loading' | 'success' | 'error'` and a curated, user-safe Thai `error` message (e.g. `ไม่สามารถโหลดข้อมูลได้: HTTP 500`, `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้` — see `apps/mobile/src/api/client.ts`'s `authGet`/`normalizeApiMessage`, which never surface raw stack traces, tokens, or URLs), and already exposed a working `refresh()` re-fetch function. On a fetch failure, the hook's `catch` block resets `leaveCards`/`overtime`/`monthAttendance`/`approvedLeave` to their zero/default values and sets `loadState: 'error'`. `home.tsx` consumed the zeroed defaults for rendering but never consumed `loadState`'s `'error'` value or the `error` message — so the screen looked identical whether the fetch succeeded with genuinely-zero stats or failed outright. This was purely a missing render branch; no new state or retry plumbing was needed.

## Mobile Changes
- Destructured `error: summaryError` from `useHomeSummaries()` in `home.tsx`.
- Wrapped the แดชบอร์ด/สรุปการลา/สรุปการทำงานล่วงเวลา sections in a `summaryLoadState === 'error' ? (...) : (...)` conditional:
  - **Error branch:** a card (`summaryErrorBox`, red/pink theme matching the existing `attendance.tsx` error-box pattern) showing `summaryError ?? 'ไม่สามารถโหลดข้อมูลสรุปได้'`, a "กรุณาลองใหม่อีกครั้ง" subtext, and a "ลองใหม่" retry button that calls `summaryRefresh` (the hook's existing `refresh`).
  - **Success/default branch:** unchanged — the original dashboard stat cards, leave summary cards, and overtime card.
- The แดชบอร์ด section header itself is always shown (so the section doesn't disappear entirely, it clearly communicates "this data failed, here's why, here's how to fix it").
- Loading state is unchanged: the existing `RefreshControl` spinner (`isRefreshing = loadState === 'loading' || summaryLoadState === 'loading'`) still drives pull-to-refresh/initial-load feedback exactly as before.
- No change to `today`/`todayLeave` derived state (ปฏิทิน section, clock-in/out actions) — those come from `useAttendance()`, a separate hook/load state, untouched.
- No navigation structure change, no attendance/leave/off-site/manager-approval business logic touched, no `.env` edits.

## Tests Added/Updated
`apps/mobile/src/hooks/useHomeSummaries.test.tsx` — the mobile app has no React Testing Library / screen-render test infra (only pure-function `utils` tests existed previously: `leaveOverlay.test.ts`, `offsiteAttendance.test.ts`). Per the task's fallback guidance, added the safest available coverage at the hook layer instead of a screen-level test, using `react-test-renderer` (already present transitively via `jest-expo`, confirmed in `node_modules` — no new runtime dependency added) with a minimal harness component + `act()`:
1. **Success:** mocked API calls resolve → `loadState` reaches `'success'`, `error` is `null`.
2. **Error:** one mocked API call rejects with a safe Thai message → `loadState` reaches `'error'`, `error` holds that exact safe message (verifies the hook surfaces a usable, non-technical string rather than swallowing the failure).
3. **Retry recovers:** after an initial failure, calling `refresh()` with the mock now resolving → `loadState` transitions back to `'success'`, `error` back to `null` (verifies the retry action actually works end-to-end at the hook layer, which is what the screen's "ลองใหม่" button now calls).

`expo-router`'s `useRouter` and `../auth/useAuth` were mocked with **stable object references** — an earlier draft returned a fresh object literal from the `useRouter` mock on every call, which fed a new `router` reference into the hook's `useCallback` dependency array each render, retriggered the fetch effect every render, and produced an infinite render loop that OOM-crashed the Node process running Jest. Fixing the mock to return one stable module-level object resolved it; this is a test-only artifact and does not reflect any issue in `home.tsx` or the hook's production code.

Full mobile suite: `npx jest` → 3 suites, **29 tests, all pass** (26 pre-existing + 3 new).

## Verification Commands and Results
| Command | Result |
|---|---|
| `npx jest` (apps/mobile) | **PASS** — 3 suites, 29/29 tests |
| `npx tsc --noEmit` (apps/mobile) | **PASS** — no errors |
| `./scripts/verify.sh` | **PASS** — API build, Prisma schema valid, Web build |
| `./scripts/docker-verify.sh` | **PASS** — all containers healthy/reachable (`hr-api` healthy, `hr-web`/`hr-mobile` up and reachable, `hr-db` healthy); non-destructive, stack left running |
| `./scripts/api-smoke-test.sh` | **PASS** — login, `/auth/me`, `/employees`, `/departments`, `/positions`, `/attendance`, `/leave`, `/leave-balances`, `/dashboard`, unauthenticated 401 check all OK |
| `git status` | clean tree except the files listed above |
| `git diff --stat` | `apps/mobile/app/home.tsx` only (125 insertions, 82 deletions — mostly re-indentation from wrapping existing JSX in the new conditional) |
| `git diff --check` | no whitespace errors |
| `git diff --stat -- apps/api/ prisma/` | empty — confirms zero API/backend/migration impact |

## Runtime Impact
Mobile/PWA runtime only. No changes to Admin Web, API, or database runtime behavior.

## API Impact
None. No endpoint, DTO, guard, or contract changed. Confirmed via empty `git diff --stat -- apps/api/`.

## Migration Impact
None. No Prisma schema or migration touched. Confirmed via empty `git diff --stat -- prisma/`.

## Security/RBAC/Privacy Impact
- **Auth impact:** none — no guarded endpoint added/changed.
- **RBAC impact:** none — no role check added/changed; this screen's data visibility (own attendance/leave/overtime) is unchanged, only the *presentation* of a failure state changed.
- **Data privacy impact:** none new. The error text shown is drawn from the hook's existing `error` state, which is itself built from `apps/mobile/src/api/client.ts`'s curated, already-safe Thai messages (e.g. `ไม่สามารถโหลดข้อมูลได้: HTTP 500`) or the fallback `'ไม่สามารถโหลดข้อมูลสรุปได้'` — never a raw stack trace, token, or URL. This matches the existing, unaudited-as-risky pattern already shipped on `attendance.tsx`'s error card.
- **Password/token/hash impact:** none.
- **Mobile security impact:** none — no change to token storage or API call construction; only a new conditional render branch and a retry button that calls the hook's pre-existing `refresh()`.
- **Dependency/advisory impact:** no new npm dependency. `react-test-renderer` was already present in `node_modules` (transitive via `jest-expo`); only a local ambient `.d.ts` (dev-only, test-only) was added because no `@types/react-test-renderer` package exists to install. No `package.json`/lockfile change.
- **Secrets/logging check:** no new logging added; nothing printed beyond the existing curated Thai error string rendered in the UI (never a console/log write).
- **New endpoints protected:** none — no new endpoint added.
- **Risk level:** LOW.
- **Security decision:** PASS.

`./scripts/security-review.sh` was **not run** for this task: the change is confirmed Mobile/PWA-frontend-only (no auth/RBAC/API/dependency files touched — verified via `git diff --stat -- apps/api/ prisma/` returning empty, and no `package.json`/lockfile change), matching the CLAUDE.md condition under which the full security-review script is not required.

## Production Redeploy Requirement
Mobile/PWA redeploy required after commit/tag (per Expected Impact in the task brief) to ship the error/retry UI to users. Admin Web and API need no redeploy — they are unaffected.

## Manual QA Checklist
Added to `docs/QA_T098_PRODUCTION_STABILITY_REGRESSION.md` Section D ("Home summary error/retry state"):
- [ ] Normal condition: Home's stat cards load with real data (no error card shown)
- [ ] Simulate a failed summary fetch (airplane mode after login, or briefly stop the `api` container) then open/refresh Home: a Thai error card appears in place of the stat cards, not zeroed-looking "real" data
- [ ] The "ลองใหม่" retry button, tapped after restoring connectivity, successfully reloads real data and the error card disappears
- [ ] No stack trace, raw HTTP status/URL, or token ever appears in the error card text

This was not exercised against a live, authenticated mobile session in this pass (matches the sandbox's existing `.env`/CORS/no-seeded-account limitations noted elsewhere in `Current Status.md`); recommend the user run this checklist on a real device/PWA session post-deploy.

## Remaining Risks / Deferred Work
- The ปฏิทิน (calendar) section's `TodayScheduleCard` still derives its approved-leave lookup (`todayLeave`) from the same `useHomeSummaries()` `approvedLeave` array; on a summary-fetch failure it silently falls back to "no leave today" rather than showing its own error — this is a softer failure (no fabricated data, just a missing enhancement) and was left out of scope to keep this fix additive and narrowly targeted, per the task's explicit "avoid a broad mobile redesign" guidance. Worth a follow-up if it proves confusing in practice.
- `useDashboard()`'s discarded fetch (flagged separately by `UX-AUDIT-001`, not part of this task) is unchanged — still a wasted authenticated round-trip on every Home visit, tracked as its own item, not addressed here.
- No screen-level (rendered-pixel) test exists for `home.tsx` itself, only the underlying hook — the mobile app has no React Testing Library/component-render test framework, and adding one was explicitly out of scope for this task.

## Recommended Commit Message
```
fix(mobile): show home summary error state

Mobile Home silently rendered zeroed dashboard/leave/overtime stat
cards when useHomeSummaries() failed to load. Add a Thai error+retry
card, reusing the existing attendance.tsx error-box pattern and the
hook's already-working refresh() function.
```

## Decision
PASS
