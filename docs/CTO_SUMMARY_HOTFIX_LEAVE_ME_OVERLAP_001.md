# CTO Summary

## Step
HOTFIX-LEAVE-ME-OVERLAP-001 — Fix `/leave/me` date-range overlap filtering

## Status
PASS

## Scope
`GET /leave/me`'s date-range filter (`leave.service.ts#buildDateFilter`) implemented **containment**
(`leave.startDate >= queryStart AND leave.endDate <= queryEnd`) instead of **range overlap**, so a
date-range query could silently miss a multi-day leave request that merely overlapped — but was not
fully contained by — the queried window. This was known technical debt (limitation #18 in
`HR-Knowledge/01-START-HERE/Current Status.md`), found but not fixed during the prior mobile
leave-display hotfixes. `buildDateFilter` is shared by both `findMy` (→ `GET /leave/me`) and `findAll`
(→ `GET /leave`), since `findMy` delegates to `findAll` with the caller's own `employeeId`; the fix
therefore corrects both endpoints, but the task's blast radius is scoped to the reported `/leave/me` bug.

## Root Cause
`buildDateFilter(startDate?, endDate?)` built:
```ts
{
  ...(startDate && { startDate: { gte: new Date(startDate) } }),
  ...(endDate   && { endDate:   { lte: new Date(endDate) } }),
}
```
This requires the leave record's own start/end to sit *inside* the query range — i.e. containment, not
overlap. `create()`'s pre-existing conflict check already used the correct overlap pattern
(`startDate: { lte: end }, endDate: { gte: start }`); `buildDateFilter` had drifted from it.

## Old Behavior
- Query range must fully contain the leave's start and end dates to match.
- Example: leave Jul 8–10, query Jul 9–9 → **did not match** (leave.startDate Jul 8 < query.startDate Jul 9 fails `gte`).

## New Behavior
`buildDateFilter` now builds:
```ts
{
  ...(endDate   && { startDate: { lte: new Date(endDate) } }),
  ...(startDate && { endDate:   { gte: new Date(startDate) } }),
}
```
i.e. `leave.startDate <= queryEnd AND leave.endDate >= queryStart` — standard inclusive range-overlap,
mirroring `create()`'s conflict check. All 6 examples from the task spec verified (see Verification Result).

**Single-sided date filter behavior changed as a side effect of switching to overlap semantics** (flagged
during review, documented here per the advisor's recommendation rather than left implicit):
- Old: `startDate` only → `leave.startDate >= queryStart`; `endDate` only → `leave.endDate <= queryEnd` (still containment on the one bound provided).
- New: `startDate` only → `leave.endDate >= queryStart` (open-ended range `[queryStart, ∞)`, correct overlap semantics); `endDate` only → `leave.startDate <= queryEnd` (open-ended range `(-∞, queryEnd]`).
- **Confirmed moot for current callers**: grepped `apps/web/lib/api.ts` (`getMyLeave`/`getLeave` don't expose `startDate`/`endDate` params at all) and `apps/mobile/src/api/client.ts` (`getMyLeaveRequests` exposes both params, but every caller — `useLeave.ts`, `useApprovedLeave.ts`, `useHomeSummaries.ts` — only ever passes `status`, never date params). No live caller is affected today; this is a forward-looking correctness fix, not an observed regression.

## Files Modified
- `apps/api/src/leave/leave.service.ts` — `buildDateFilter` switched from containment to overlap (9 lines changed, incl. a clarifying comment).
- `apps/api/src/leave/leave.service.spec.ts` — 14 new unit tests under `findMy: date range overlap filtering` covering all 10 required scenarios plus single-sided/no-filter cases.
- `HR-Knowledge/04-DOMAINS/Leave/Leave Request Module.md` — documented overlap semantics in Query Parameters section; closed the containment/overlap Known Limitation entry.
- `HR-Knowledge/01-START-HERE/Current Status.md` — closed limitation #18, added a v1.2.91 release-summary row, updated "Next Recommended Task" status line.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_LEAVE_ME_OVERLAP_001.md` (this file)

## API Impact
- No new endpoints, no request/response shape change, no new query parameters.
- `GET /leave/me` and `GET /leave` (both consume `buildDateFilter`) now return additional records for `startDate`/`endDate` queries that overlap — but were not previously contained by — the queried window. Existing exact-match/no-filter behavior unchanged.

## Database/Migration Impact
- **None.** No schema change, no Prisma migration. `prisma validate` confirmed via `verify.sh`.

## Auth/RBAC/Security Impact
See full Security Review table below. Summary: no auth/RBAC change — `findMy` still forces `employeeId` to the caller's own resolved employee record (`findMy(userId, query) → findAll({...query, employeeId})`), overriding any `employeeId` supplied in the query string. Verified via new unit test `9. auth isolation`.

## Test Cases Added/Updated
All 10 required cases added to `leave.service.spec.ts` (`describe('findMy: date range overlap filtering')`):

| # | Case | Result |
|---|---|---|
| 1 | Exact same-day query inside leave range | PASS |
| 2 | Query range inside multi-day leave | PASS |
| 3 | Query starts before leave, ends on leave start | PASS |
| 4 | Query starts on leave end, ends after leave | PASS |
| 5 | Query range fully contains leave | PASS |
| 6 | Query range after leave → no match | PASS |
| 7 | Query range before leave → no match | PASS |
| 8 | Status filter combined with overlap filter | PASS |
| 9 | Auth isolation — `employeeId` in query is ignored/overridden | PASS |
| 10 | Status filter (REJECTED) combined with, not replacing, overlap filter | PASS |

Plus 3 extra edge-case tests: only-`startDate`, only-`endDate`, and no-date-filter-provided all assert the exact Prisma `where` clause shape.

## Verification Result

| Command | Result |
|---|---|
| `npx jest src/leave/leave.service.spec.ts src/leave/leave.controller.spec.ts` | **PASS** — 58/58 |
| `npx jest` (full backend suite) | **PASS** — 704/704, 28 suites |
| `./scripts/verify.sh` | **PASS** — API build, Prisma schema valid, Web build |
| `./scripts/api-smoke-test.sh` | **PASS** — all 11 checks (against rebuilt container) |
| `./scripts/security-review.sh` | **PASS** — dependency audit clean (pre-existing accepted-risk Multer findings only), secret scan clean |
| `./scripts/docker-verify.sh` | **PASS** — API/Web/Mobile images rebuilt, all containers healthy, stack left running |

**Live end-to-end verification against the rebuilt container** (real Postgres, not mocks), using an existing seeded leave record (employee `c0664bc6…`, leave `d6f5af84…`, `startDate=2026-10-01`, `endDate=2026-10-05`, via admin `GET /leave?employeeId=…` — same `buildDateFilter` code path `findMy` delegates to):

| Query | Expectation | Result |
|---|---|---|
| Oct 3–3 (single day inside range) | 1 match | ✅ 1 (would have been 0 under old containment logic) |
| Sep 15–20 (no overlap) | 0 matches | ✅ 0 |
| Sep 25–Oct 1 (ends exactly on leave start) | 1 match | ✅ 1 |
| Oct 5–10 (starts exactly on leave end) | 1 match | ✅ 1 |
| Oct 6–10 (starts day after leave ends) | 0 matches | ✅ 0 |
| Sep 25–30 (ends day before leave starts) | 0 matches | ✅ 0 |

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — no guarded endpoints added or changed; `JwtAuthGuard`/`RolesGuard` on `LeaveController` untouched |
| RBAC impact | None — role checks (`@Roles(...)`) untouched; `findMy` still hard-scopes to the caller's own `employeeId`, verified by new test #9 |
| Data privacy impact | None — no new fields exposed, `LEAVE_SELECT` projection unchanged; the fix only widens which *already-authorized* own records are returned for a given date filter |
| Password/token/hash impact | None |
| Mobile security impact | None — no mobile files touched; mobile token storage/API call shape unchanged |
| Dependency/advisory impact | None — no packages added/changed. `security-review.sh` dependency audit: PASS (only pre-existing accepted-risk Multer HIGH findings, documented in `.security-accepted-risks`) |
| Secrets/logging check | None — no logging changes; secret scan (`security-review.sh` step 2) PASS |
| New endpoints protected | None — no new endpoints added |
| Risk level | LOW |
| Security decision | PASS |

## Remaining Work
None required by this hotfix. Optional follow-up (not blocking): if a future task adds date-range filter UI to web/mobile leave views, the open-ended single-sided semantics documented above should inform that UI's query construction.

## Recommended Commit Message
```
fix(leave): return overlapping leave ranges from leave me endpoint

buildDateFilter in leave.service.ts used containment
(startDate >= queryStart AND endDate <= queryEnd) instead of
range overlap, so GET /leave/me (and GET /leave, which shares
the same filter) could miss multi-day leave that overlapped but
wasn't fully contained by the queried date range. Switched to
leave.startDate <= queryEnd AND leave.endDate >= queryStart,
mirroring the overlap check already used in create(). No
schema/migration change. 14 new unit tests; 704/704 backend
tests passing.
```

## Decision
**PASS**
