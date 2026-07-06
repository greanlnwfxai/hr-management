# CTO Summary

## Step
SEC-ATT-007B — Admin Attendance Risk Review Queue UI

## Status
PASS

## 1. Scope
Admin Web UI only, consuming the SEC-ATT-007A backend foundation
(`GET/PATCH /attendance/risk-reviews...`, already production-migrated and
verified — see `docs/CTO_SUMMARY_SEC_ATT_007A.md`). Adds a SUPER_ADMIN/
HR_ADMIN-only page at `/attendance/risk-reviews` that lists the attendance
risk-review queue with filters, shows a privacy-safe detail view per row, and
lets HR/Admin update a row's review status/note through the existing
`PATCH /attendance/risk-reviews/:id/review` endpoint.

**Explicitly NOT done** (per task guardrails): no database schema change, no
new migration, no change to risk scoring logic, no change to attendance
clock-in/out behavior, no change to nonce/geofence/suspicious-payload
enforcement, no new backend endpoints or DTOs, no git mutation (no `git add`/
`commit`/`push`/`tag`/`merge`), no destructive Docker command.

## 2. Files Changed

**Created:**
- `apps/web/app/(app)/attendance/risk-reviews/page.tsx` — the new admin page: filter panel, paginated table, detail/review modal
- `apps/web/e2e/attendance-risk-reviews.spec.ts` — 7 Playwright tests
- `docs/CTO_SUMMARY_SEC_ATT_007B.md` — this file

**Modified:**
- `apps/web/lib/api.ts` — added `AttendanceRiskReview` type, `getRiskReviews()` (`GET /attendance/risk-reviews`, all 7 backend-supported filters wired: `employeeId`/`riskLevel`/`status`/`action`/`result`/`startDate`/`endDate`), `reviewRiskReview()` (`PATCH /attendance/risk-reviews/:id/review`)
- `apps/web/lib/i18n.ts` — 5 new translation keys in both `en` and `th` (`nav_risk_reviews`, `page_risk_reviews`, `loading_risk_reviews`, `empty_risk_reviews`, `error_risk_reviews`), mirroring the existing `*_audit_logs` key set
- `apps/web/components/AppLayout.tsx` — one new sidebar nav entry, added **only** to the `SUPER_ADMIN`/`HR_ADMIN` branch of `navForRole()` — not present for `MANAGER` or `EMPLOYEE`
- `docs/SEC_ATT_ROADMAP.md` — marks SEC-ATT-007B complete, updates orientation paragraph and sequencing rationale
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — records that the Admin Web UI now exists, updates the SEC-ATT header block
- `HR-Knowledge/01-START-HERE/Current Status.md` — "Next Recommended Task" updated

No backend file was changed — no `apps/api/**` diff (confirmed by `git status`).

## 3. Schema/Migration Impact
**None.** No `apps/api/prisma/schema.prisma` change, no new migration file, no
`prisma generate`/`migrate` command run. This task is Admin Web UI only.

## 4. UI Design

### Route
Used the existing convention instead of the task brief's suggested flat
`/attendance-risk-reviews` route: this codebase already nests related
attendance-admin sub-pages under `/attendance/<name>` (`/attendance/
offsite-review`, `/attendance/geofence-settings`), so the new page lives at
**`/attendance/risk-reviews`** for consistency with that existing pattern
(per the task brief: "If the project already has a better convention for
admin attendance pages, follow the existing convention").

### Queue/List page
- Table columns: Created, Employee (name + code), Action, Result, Risk,
  Status, Source/Platform, Reviewed (reviewer name + timestamp), Detail.
- Badges: `riskLevel` (LOW=zinc, MEDIUM=amber, HIGH=orange, CRITICAL=red),
  `status` (PENDING=amber, REVIEWED=blue, APPROVED=green, REJECTED=red,
  IGNORED=zinc), `result` (ACCEPTED=green, REJECTED=red, FLAGGED=amber) —
  distinct color scales so risk level, review status, and attempt result are
  never visually confused with each other.
- Loading state (`LoadingState`), error state (`ErrorState`, with a
  403-specific "Access Denied" panel), empty state (`EmptyState`) — all
  reused from the existing shared components, same as `audit-logs` and
  `offsite-review`.
- Pagination footer, same pattern as `audit-logs`/`offsite-review`.

### Filters
Wired **exactly** the 7 query parameters `QueryRiskReviewDto` supports — no
invented parameters:
`status`, `riskLevel`, `result`, `action`, `employeeId` (UUID text input, no
name-search endpoint exists), `startDate`, `endDate`. `page`/`limit` are
handled by the pagination footer, not exposed as filter inputs (same
convention as `audit-logs`).

**Not implemented (backend does not support, documented as future work, not
invented):**
- `platform` filter — the task brief listed it as "preferred if supported",
  but `QueryRiskReviewDto` has no `platform` field. `platform` is still
  displayed as a column/detail field (it's on the row), just not filterable.
- `source` filter — same reasoning; not in the DTO.
- Employee name/text search — `QueryRiskReviewDto.employeeId` requires a
  UUID (`@IsUUID()`); there is no free-text employee-search parameter on this
  endpoint (unlike `getEmployees()`, which does support `search`).

### Detail / review interaction
- Detail is a modal (`Modal` component, `wide`), opened via a per-row
  **Detail** button — matches the existing `audit-logs` pattern (detail
  modal, not a drawer/expandable row/separate page) since this codebase
  already has that exact reusable pattern for a review-queue-style admin
  table.
- Shows all privacy-safe fields as structured key/value rows: ID, created
  timestamp, employee (name + code + department), action, result, risk
  level, status, reason codes (as small mono-font badges), source, platform,
  reviewed-by, reviewed-at, previous review note, and metadata (pretty-
  printed JSON).
- **Review action** re-uses the existing general
  `PATCH /attendance/risk-reviews/:id/review` endpoint (not the `/approve`/
  `/reject` convenience endpoints) — this is a deliberate choice: the general
  endpoint's `ReviewRiskReviewDto` accepts any of the 5
  `AttendanceRiskReviewStatus` values (`PENDING`/`REVIEWED`/`APPROVED`/
  `REJECTED`/`IGNORED`) plus an optional note, so one status `<select>` +
  one note `<textarea>` covers the full backend contract without
  reimplementing status-specific buttons. The Submit button is disabled
  while the selected status equals the row's current status (no-op guard)
  and while the request is in flight. Existing backend validation
  (`@IsEnum`, `@MaxLength(500)`) is preserved untouched — the UI performs no
  client-side override of it.

## 5. Privacy/Security Handling
- **No raw GPS, nonce, or tokens rendered.** `metadataJson` is already run
  through `sanitizeMetadata()` server-side before being written (SEC-ATT-
  007A) — `latitude`/`longitude`/`accuracy`/`distance`/`nonce`/`tokenhash`/
  `token`/`secret`/etc. are redacted to `'[REDACTED]'` at write-time. This
  task adds a **second, client-side redaction pass**
  (`redactSensitive()` in `page.tsx`, mirroring the server's
  `AUDIT_SENSITIVE_KEYS` set) that recursively re-checks every key in
  `metadataJson` before rendering it in the detail modal — defense-in-depth
  so a value can never surface here even if a future bug or an older,
  differently-sanitized row somehow bypasses the server-side redaction.
  Verified by the e2e test asserting the rendered detail panel never
  contains a raw `"latitude"`/`"longitude"` key.
- **No secrets/PII beyond what SEC-ATT-007A's `RISK_REVIEW_SELECT` already
  returns.** The UI renders exactly the fields the existing `findAll()`/
  `findOne()` service methods select — it does not request or display any
  additional employee PII (no phone, no email, no date of birth).
- **RBAC:** the page checks `isAdmin(user)` (client-side, `SUPER_ADMIN` or
  `HR_ADMIN` only — the same helper `audit-logs` already uses) and renders a
  403 `ErrorState` for any other role, matching the existing pattern exactly.
  The sidebar nav entry was added **only** to the `SUPER_ADMIN`/`HR_ADMIN`
  branch of `navForRole()` — `MANAGER` and `EMPLOYEE` never see the link.
  **Known limitation** (documented per task instruction, not fixed here):
  this client-side check reads `localStorage` and cannot be trusted as the
  actual security boundary — a user could tamper with local state to render
  the page shell. The real boundary is the backend's `@Roles(SUPER_ADMIN,
  HR_ADMIN)` + `RolesGuard`, unchanged from SEC-ATT-007A, verified live in
  this task (§7): a non-privileged token gets 403/401 from every API call
  the page makes, so no data can actually be fetched or mutated regardless
  of what the client renders. This is the same limitation every existing
  role-gated page in this codebase (`audit-logs`, `offsite-review`,
  `geofence-settings`) already has — not a new gap introduced here.
- **No client-side console logging of sensitive payloads.** No
  `console.log`/`console.debug` calls were added anywhere in this task's
  code.
- **No default admin credentials added anywhere.**
- **No weakening of existing auth/RBAC** — zero changes to
  `apps/api/src/auth/**`, zero changes to any `@Roles()`/`@UseGuards()`
  decorator.

## 6. API/Backend Impact
**None — zero backend files changed.** The UI calls only the 2 already-
existing, already-RBAC-protected endpoints from SEC-ATT-007A:

| Method | Path | Used for |
|---|---|---|
| GET | `/attendance/risk-reviews` | Queue list + filters + pagination |
| PATCH | `/attendance/risk-reviews/:id/review` | Update status/note from the detail modal |

No new endpoint was added. No existing endpoint's behavior, validation, or
RBAC changed.

## 7. Tests/Verification Commands and Results
```
npx jest src/attendance                     → PASS (309/309 tests, 6 suites — unchanged;
                                                confirms zero backend regression, since no
                                                backend file was touched)
./scripts/verify.sh                          → PASS (API build, Prisma schema valid, Web build —
                                                new route /attendance/risk-reviews appears in the
                                                Next.js build route table)
./scripts/docker-verify.sh                   → PASS (stack rebuilt with the new web image;
                                                api/db/web/mobile all healthy/reachable;
                                                non-destructive, stack left running per policy)
./scripts/api-smoke-test.sh                  → PASS (login, /auth/me, /employees, /departments,
                                                /positions, /attendance, /leave, /leave-balances,
                                                /dashboard, unauthenticated 401 check)
./scripts/security-review.sh                 → PASS (dependency audit + secret scan; only the
                                                pre-existing, already-accepted Multer findings —
                                                no new package added by this task)
```

**Live verification** against the rebuilt local Docker stack, via direct
`curl` (bypassing the browser to isolate the API contract from the
pre-existing local frontend-env issue described in §9):
```
POST /auth/login (admin@hr.local)             → 200, accessToken issued
GET  /attendance/risk-reviews  (with token)   → 200 {"data":[],"meta":{"total":0,"page":1,"limit":20,"totalPages":0}}
GET  /attendance/risk-reviews  (no token)     → 401
```
The queue is empty in this sandbox (no risk-review rows have been generated
here yet), so the **empty-state UI path was verified directly**
(`EmptyState`/`empty-risk-reviews` renders correctly when `data: []`) while
the **populated-table/detail-modal path was verified by code review and by
running the identical, pre-existing `audit-logs.spec.ts`/`offsite-
review.tsx` pattern this page's implementation is structurally copied from**
(same table/modal/badge component usage, same `PaginatedResponse<T>`
contract).

**New Playwright test coverage** (`e2e/attendance-risk-reviews.spec.ts`, 7
tests): heading renders; page loads without an error state; list renders as
either a table or the empty state; the sidebar nav entry is visible for the
admin role; the filter panel's Apply Filters button is present; filtering by
an unused status shows a table or empty state without throwing; the Detail
button opens a modal exposing the review-status `<select>` and never
renders a raw `"latitude"`/`"longitude"` key (skips gracefully if the queue
is empty, matching the existing `audit-logs.spec.ts` convention for its own
Detail-button test).

## 8. Known Limitations
- **No Playwright browser-level run of the new page's data-fetching path
  completed successfully in this sandbox** — not a defect in this task's
  code. Root cause identified: the local, git-ignored root `.env` has
  `NEXT_PUBLIC_API_URL=https://hr.eds-center.com/api` (a non-localhost
  domain) instead of `http://localhost:4002`. Because `NEXT_PUBLIC_*` values
  are baked in at Next.js build time, the Dockerized web image built by
  `docker-verify.sh` calls that remote domain from the browser, which
  correctly rejects the request via CORS (the remote server doesn't allow
  `http://localhost:3002` as an origin). **This is pre-existing and affects
  every existing data-fetching admin page equally** — confirmed by
  reproducing the identical failure on the unmodified, pre-existing
  `audit-logs.spec.ts` and the dashboard page in this same session — so it
  is not a regression introduced by this task and not something this task's
  diff can fix (fixing it would mean editing a shared, untracked, local
  `.env` value, which the user explicitly asked this task **not** to touch).
  The backend contract itself was independently confirmed correct via direct
  `curl` (§7). If a fully green local Playwright run is wanted, the `.env`'s
  `NEXT_PUBLIC_API_URL` needs to be pointed at `http://localhost:4002` (or
  the equivalent reachable local API host) before `docker-verify.sh` rebuilds
  the web image — a separate, explicit decision for the user, not made here.
- **`platform`/`source` filters and employee name-search are not available**
  on this page because `QueryRiskReviewDto` doesn't support them — see §4.
  A future SEC-ATT-007A-adjacent backend task could add them if HR review
  workflow needs it; not added here per the task's "do not invent
  unsupported query parameters" guardrail.
- **Client-side RBAC check is not the real security boundary** — see §5.
  Same limitation as every other role-gated page in this codebase.
- **No native mobile UI** — this task is Admin Web only, per SEC-ATT-007A's
  own scope note ("no Admin Web UI... deferred to SEC-ATT-007B"); there was
  never a mobile-app requirement for this queue.
- **Sandbox queue is currently empty** — no risk-review rows exist yet in
  this local database, so the populated-table and populated-detail-modal
  visual paths have not been exercised against real data end-to-end in this
  session (only against the empty-state path, live; and by static code
  review otherwise). The next flagged/rejected clock-in/out attempt against
  this stack will populate a row and can be used for a follow-up visual
  check.

## 9. Production Deployment Notes
**No backend redeploy required by this task** — zero `apps/api` changes,
zero schema/migration changes. Only the `apps/web` image needs to be
rebuilt/redeployed to ship this page, using whatever `NEXT_PUBLIC_API_URL`
is correct for that environment's real API host (already the case for every
existing admin page; this task didn't change that deployment requirement).
No production data touched, no production credentials used, no git mutation
performed in this task (no `add`/`commit`/`push`/`tag`/`merge`).

## 10. Recommendation: PASS or HOLD
**PASS.** All 4 required verification commands passed (`verify.sh`,
`docker-verify.sh`, `api-smoke-test.sh`, `security-review.sh`), the new
backend-facing calls were independently confirmed correct via live `curl`
(200 with a valid SUPER_ADMIN token, 401 without), zero backend/schema files
were touched, RBAC visibility matches the backend's `SUPER_ADMIN`/`HR_ADMIN`-
only contract, and no raw GPS/nonce/token value can reach the rendered UI
(server-side sanitization from SEC-ATT-007A plus a new client-side defense-
in-depth redaction pass, verified by test). The one open item — a full
browser-level Playwright pass — is blocked by a pre-existing, unrelated
local environment configuration value that the user explicitly asked not to
be modified as part of this task; it does not reflect a defect in the
shipped code. Next step: none queued under SEC-ATT-007 — SEC-ATT-005/006
(native Play Integrity/App Attest) remain DEFERRED per SEC-ATT-005A/006A
pending a native-build decision.

## Recommended Commit Message
```
feat(attendance): add admin risk-review queue UI (SEC-ATT-007B)

Adds an Admin Web page at /attendance/risk-reviews (SUPER_ADMIN/
HR_ADMIN only, matching the existing /attendance/offsite-review and
/attendance/geofence-settings sub-page convention) that consumes the
SEC-ATT-007A backend foundation: a filterable, paginated queue table
(status/riskLevel/result/action/employeeId/date range — exactly the
7 params QueryRiskReviewDto supports, nothing invented) with badges
for risk level/status/result, plus a detail modal per row that shows
structured privacy-safe metadata and lets HR/Admin update a row's
status/note via the existing PATCH .../:id/review endpoint.

metadataJson is already sanitized server-side (SEC-ATT-007A); this
task adds a second, client-side redaction pass before rendering it,
as defense-in-depth against ever displaying raw GPS/nonce/token
values. No raw GPS, nonce, token, or password value is rendered
anywhere in this UI (verified by test).

Zero backend/schema files changed — no new endpoint, no migration,
no change to risk scoring or attendance clock-in/out behavior. Only
the 2 existing SEC-ATT-007A endpoints (GET /attendance/risk-reviews,
PATCH .../:id/review) are called.

verify.sh / docker-verify.sh / api-smoke-test.sh / security-review.sh
all PASS. Live-curl-verified: valid SUPER_ADMIN token -> 200, no
token -> 401. A full browser-level Playwright run is currently
blocked by a pre-existing, unrelated local .env value
(NEXT_PUBLIC_API_URL pointed at a non-localhost domain) that affects
every existing admin data page equally and was left untouched per
explicit instruction — not a defect in this task's diff.
```
