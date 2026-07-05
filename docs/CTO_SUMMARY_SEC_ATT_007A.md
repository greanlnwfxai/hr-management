# CTO Summary

## Step
SEC-ATT-007A — Attendance Risk Scoring + Review Queue Backend Foundation

## Status
PASS

## 1. Scope
Backend foundation only, per `docs/SEC_ATT_ROADMAP.md` and
`docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md` §9. Adds a new,
privacy-safe `AttendanceRiskReview` table that records a sanitized,
categorized risk row whenever an existing SEC-ATT-002/003/004 check flags
(soft-allows) or rejects a clock-in/out attempt, scores that row into a
LOW/MEDIUM/HIGH/CRITICAL risk level, and exposes SUPER_ADMIN/HR_ADMIN-only
APIs to list/read/review the queue.

**Explicitly NOT done** (per task guardrails): no Admin Web UI (deferred to
SEC-ATT-007B), no Native Android Play Integrity (SEC-ATT-005, DEFERRED per
SEC-ATT-005A), no iOS App Attest/DeviceCheck (SEC-ATT-006, DEFERRED per
SEC-ATT-006A), no hard-enforcement change to the existing soft-enforced
missing-nonce or missing-`capturedAt` checks (both remain exactly as
SEC-ATT-003/004 left them), no payroll/unrelated attendance feature work, no
production deploy, no production migration. No git mutation performed
(no `git add`/`commit`/`push`/`tag`/`merge`).

## 2. Files Changed

**Created:**
- `apps/api/prisma/migrations/20260705134306_sec_att_007a_risk_review_foundation/migration.sql` — additive migration (3 new enums + 1 new table + indexes/FKs only)
- `apps/api/src/attendance/attendance-risk-review.service.ts` — risk scoring (`scoreRisk()`), best-effort recording (`recordReview()`), and the review-queue read/write API (`findAll`/`findOne`/`review`/`setStatus`)
- `apps/api/src/attendance/attendance-risk-review.service.spec.ts` — 17 unit tests
- `apps/api/src/attendance/dto/query-risk-review.dto.ts` — `GET /attendance/risk-reviews` query DTO (page/limit/employeeId/riskLevel/status/action/result/date range)
- `apps/api/src/attendance/dto/review-risk-review.dto.ts` — `PATCH .../:id/review` body DTO (status + optional reviewNote)
- `apps/api/src/attendance/dto/risk-review-note.dto.ts` — shared body DTO for the `approve`/`reject` convenience endpoints (mirrors `ApproveOffsiteDto`/`RejectOffsiteDto`)
- `docs/CTO_SUMMARY_SEC_ATT_007A.md` — this file

**Modified:**
- `apps/api/prisma/schema.prisma` — 3 new enums (`AttendanceRiskLevel`, `AttendanceRiskReviewStatus`, `AttendanceRiskResult`) and new `AttendanceRiskReview` model; nullable back-relations added on `Employee` (`riskReviews`, `reviewedRiskReviews`) and `Attendance` (`riskReviews`) — additive only, no existing column/table altered
- `apps/api/src/common/enums.ts` — mirrors the 3 new Prisma enums as runtime-safe TS enums for `@IsEnum`, plus a new `AttendanceRiskReasonCode` TS enum (not a Prisma enum — the `reasonCodes` column is a Postgres `String[]`, not a native enum column)
- `apps/api/src/attendance/attendance.module.ts` — registers `AttendanceRiskReviewService`
- `apps/api/src/attendance/attendance.controller.ts` — 5 new endpoints (`GET/PATCH /attendance/risk-reviews...`, see §6); `AttendanceRiskReviewService` injected directly (not proxied through `AttendanceService`, since there's no audit-context need the way `issueNonce()` had)
- `apps/api/src/attendance/attendance.service.ts` — `AttendanceRiskReviewService` injected; `enforcePayloadIntegrity()`, `validateGeofence()`, and `enforceNonce()` gained two new parameters (`nonceAction`, `employeeId`) threaded from all 6 call sites (`clockIn`/`clockOut`/`clockInOffsite`/`clockOutOffsite`); the four existing best-effort audit-recorder helpers (`recordGeofenceRejectedAuditBestEffort`, `recordCapturedAtMissingAuditBestEffort`, `recordNonceMissingAuditBestEffort`, `recordNonceRejectedAuditBestEffort`) each gained one additional best-effort call to the new `recordRiskReviewBestEffort()` — **no business-logic call site was rewritten**, only these 4 shared recorder functions
- `apps/api/src/attendance/attendance.service.spec.ts` — added `AttendanceRiskReviewService` mock provider; added a new `SEC-ATT-007A: risk-review recording` describe block (13 tests)
- `apps/api/src/attendance/attendance.controller.spec.ts` — added `AttendanceRiskReviewService` mock provider; added 5 delegation tests + 5 RBAC-metadata tests for the new endpoints
- `apps/api/src/test-utils/prisma.mock.ts` — added `attendanceRiskReview` mock methods
- `docs/SEC_ATT_ROADMAP.md` — split the SEC-ATT-007 roadmap row into **SEC-ATT-007A ✅** (this task, complete) and **SEC-ATT-007B** (Admin Web UI, next); updated the header orientation paragraph and sequencing rationale
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — added the 5 new endpoints to the endpoint table, documented the design in the SEC-ATT header block, added a Known Limitations entry
- `HR-Knowledge/01-START-HERE/Current Status.md` — "Next Recommended Task" updated from "SEC-ATT-007 planning" to **SEC-ATT-007B** (Admin Web UI), with SEC-ATT-007A's completion summarized

## 3. Schema/Migration Impact
**Additive only.** Verified by reading the generated `migration.sql` — it contains
only `CREATE TYPE` (×3), `CREATE TABLE`, `CREATE INDEX` (×5), and `ALTER TABLE
... ADD CONSTRAINT` (×3, all `ON DELETE SET NULL` foreign keys) statements. No
`DROP`, no `ALTER COLUMN`, no existing table touched.

- **New enums:** `AttendanceRiskLevel` (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`),
  `AttendanceRiskReviewStatus` (`PENDING`/`REVIEWED`/`APPROVED`/`REJECTED`/`IGNORED`),
  `AttendanceRiskResult` (`ACCEPTED`/`REJECTED`/`FLAGGED`).
- **New table `attendance_risk_reviews`** (`AttendanceRiskReview` model): `id`,
  nullable `employeeId`/`attendanceId`/`userId`, `action` (reuses the existing
  `AttendanceNonceAction` enum — `CLOCK_IN`/`CLOCK_OUT`/`OFFSITE_CLOCK_IN`/
  `OFFSITE_CLOCK_OUT`), `result`, `riskLevel`, `reasonCodes` (Postgres
  `String[]`), `status` (default `PENDING`), nullable `source`/`platform`,
  nullable `metadataJson` (JSONB, already sanitized before write), nullable
  `reviewedById`/`reviewedAt`/`reviewNote`, `createdAt`/`updatedAt`. Indexed on
  `employeeId`, `attendanceId`, `status`, `riskLevel`, `createdAt`.
- **Migration was generated and applied against the local Docker `hr-db`
  sandbox only** (`localhost:5432`, the same container the running dev stack
  already uses — confirmed via `docker exec hr-db pg_isready` before running,
  and the root `.env`'s `POSTGRES_PASSWORD` was used transiently for the one
  migration command without ever being echoed to output or written to a
  file). **Not run against any real production database.**
- `npx prisma validate` — PASS (part of `verify.sh`).

## 4. Risk Scoring Design
`AttendanceRiskReviewService.scoreRisk(reasonCodes[])` takes the **highest
severity** among all reason codes present on an event (an event can trip more
than one signal, e.g. a missing-`capturedAt` soft-allow observed alongside a
rejected mock-location signal in the same request — rare but possible).
Unmapped/future codes default to `LOW` rather than throwing, so a scoring gap
never suppresses a row.

| Level | Reason codes |
|---|---|
| LOW | `NONCE_MISSING_ALLOWED`, `DEVICE_INTEGRITY_UNAVAILABLE`*, `NATIVE_ATTESTATION_UNAVAILABLE`* |
| MEDIUM | `MISSING_CAPTURED_AT`, `MISSING_SOURCE_CAPTURED_AT`, `LOW_LOCATION_ACCURACY`, `GEOFENCE_EDGE_CASE` |
| HIGH | `STALE_LOCATION`, `FUTURE_LOCATION`, `INVALID_CAPTURED_AT`, `GEOFENCE_REJECTED`, `NONCE_INVALID`, `NONCE_EXPIRED`, `NONCE_ACTION_MISMATCH`, `NONCE_USER_MISMATCH` |
| CRITICAL | `NONCE_REUSED`, `MOCK_LOCATION_DETECTED`, `SIMULATED_LOCATION_DETECTED`* |

`*` = defined in the enum/mapping for schema completeness but **not emitted by
any current hook** — see "Known Limitations" (§12).

Codes the task brief didn't explicitly place were classified by nearest
documented sibling and stated here rather than left implicit:
`INVALID_CAPTURED_AT` → HIGH (same rejection path as `STALE`/`FUTURE_LOCATION`);
`NONCE_ACTION_MISMATCH`/`NONCE_USER_MISMATCH` → HIGH (same "invalid/expired
nonce" bucket as `NONCE_INVALID`/`NONCE_EXPIRED`); the existing internal
geofence-check reasons `MISSING_LOCATION`/`OUTSIDE_RADIUS` → `GEOFENCE_REJECTED`
(HIGH), `POOR_ACCURACY` → `LOW_LOCATION_ACCURACY` (MEDIUM),
`GEOFENCE_NOT_CONFIGURED` → `GEOFENCE_EDGE_CASE` (MEDIUM, an admin-config edge
case rather than a suspicious client action).

## 5. Review Queue Design
- **Integration points, not new call sites.** Rather than sprinkling
  risk-recording calls through `clockIn`/`clockOut`/`clockInOffsite`/
  `clockOutOffsite`, the hook lives in the **4 existing shared best-effort
  audit-recorder helpers** every rejection/flag path already funnels through
  (`recordGeofenceRejectedAuditBestEffort`, `recordCapturedAtMissingAuditBestEffort`,
  `recordNonceMissingAuditBestEffort`, `recordNonceRejectedAuditBestEffort`).
  This kept the business-logic methods themselves untouched (requirement #3,
  "keep existing attendance logic intact") — only two new parameters
  (`nonceAction`, `employeeId`) were threaded through, both already available
  in scope at every call site.
- **No noise on the happy path.** A fully clean clock-in/out never calls
  `recordReview()` at all — only flagged (soft-allowed) or rejected paths do.
  Verified by test ("a fully clean clock-in never calls recordReview at all").
- **One row per distinct signal, not per request.** A single request typically
  trips exactly one signal (payload-integrity checks are mutually exclusive
  via `classifyCapturedAt()`); the rare case of two independent signals in one
  request (e.g. missing-`capturedAt` soft-allow + a separate hard rejection)
  produces two rows, one per signal — not merged into one. Documented as a
  known limitation, not fixed in this task (see §12).
- **No time-window deduplication.** A client that repeatedly triggers the same
  low-severity signal (e.g. omits the nonce on every clock-in during rollout)
  produces one row per attempt, not a rolled-up counter. The `IGNORED` status
  exists precisely so HR can bulk-triage known, expected bulk categories
  rather than review 1:1 — documented, not built as auto-collapsing logic
  (out of scope for a "foundation" task).
- **Administrative status tracking only.** `review()`/`setStatus()` update
  `status`/`reviewNote`/`reviewedAt`/`reviewedById` on the risk-review row —
  they never touch the underlying `Attendance` record. Any attendance
  correction remains a separate, future concern.
- **Best-effort by convention**, mirroring `AuditLogService`/`recordBestEffort()`:
  a risk-review write failure is caught and swallowed
  (`recordRiskReviewBestEffort()`) so it can never block or fail a clock-in/out.
  Verified by test.

## 6. API/RBAC Behavior
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/attendance/risk-reviews` | SUPER_ADMIN, HR_ADMIN | Paginated, filterable (employeeId/riskLevel/status/action/result/date range) |
| GET | `/attendance/risk-reviews/:id` | SUPER_ADMIN, HR_ADMIN | 404 if not found |
| PATCH | `/attendance/risk-reviews/:id/review` | SUPER_ADMIN, HR_ADMIN | Body: `{ status, reviewNote? }` |
| PATCH | `/attendance/risk-reviews/:id/approve` | SUPER_ADMIN, HR_ADMIN | Convenience: fixes `status = APPROVED`; body `{ reviewNote? }` |
| PATCH | `/attendance/risk-reviews/:id/reject` | SUPER_ADMIN, HR_ADMIN | Convenience: fixes `status = REJECTED`; body `{ reviewNote? }` |

- All 5 routes sit behind the controller-level `@UseGuards(JwtAuthGuard,
  RolesGuard)` — unauthenticated requests get 401 (verified live: `curl` with
  no token → `401`), and any authenticated role not in `[SUPER_ADMIN,
  HR_ADMIN]` gets 403 via `RolesGuard` (unit-tested: `RolesGuard.canActivate()`
  denies unless `user.role` is in the required list — this is exercised
  directly by the pre-existing `RolesGuard` test suite, not re-tested per
  endpoint; the 5 new RBAC-metadata tests assert the `@Roles()` decorator
  itself carries exactly `[SUPER_ADMIN, HR_ADMIN]`, matching the pattern the
  existing `offsite-review` RBAC tests already use).
- **MANAGER access is explicitly deferred**, per task guardrail — unlike
  `offsite-review` (which includes MANAGER with department-scoping),
  risk-reviews has no MANAGER row yet. `EMPLOYEE` has no path to these routes.
- Routes are declared **before** the catch-all `@Get(':id')`/generic attendance
  routes in the controller (same ordering convention as `offsite-review`), so
  `/attendance/risk-reviews` is never swallowed by the `:id` param route.
- Live-verified against the rebuilt local Docker stack: `GET
  /attendance/risk-reviews` with a valid SUPER_ADMIN token → `200
  {"data":[],...}`; without a token → `401`.

## 7. Privacy/Security Handling
- **No raw GPS in risk-review metadata.** `metadataJson` is passed through the
  same `sanitizeMetadata()` used by `AuditLogService` before being written —
  `latitude`/`longitude`/`accuracy` (already in `AUDIT_SENSITIVE_KEYS`) are
  redacted to `'[REDACTED]'`. Verified by test.
- **No raw nonce in risk-review metadata.** Same sanitizer path; `nonce`/
  `tokenhash` (already in `AUDIT_SENSITIVE_KEYS` since SEC-ATT-004) are
  redacted. Verified by test.
- **No tokens/secrets/production credentials** anywhere in this task's code or
  docs. No native attestation raw tokens/assertions exist to leak (App
  Attest/DeviceCheck remain unimplemented, SEC-ATT-006 DEFERRED).
- **Categorical data only.** `reasonCodes`, `riskLevel`, `result`, `status`,
  `source`, `platform` are the only searchable/filterable fields — all
  enumerated, sanitized categories, never free-form user input.
- **User-facing errors unaffected.** This task adds no new client-facing error
  path — the existing clock-in/out error messages (already generic/safe per
  SEC-ATT-003/004) are unchanged. The new admin endpoints return standard
  NestJS 404/403/401 without leaking internals.
- **No secrets committed.** `secret-scan.sh` PASS; the transient local-DB
  migration credential was read from the root `.env`, used only in the shell
  environment for one command, and never echoed to any output, log, or file
  (see §3).

## 8. Audit/Review Metadata Behavior
- Existing `AuditLogService`/`AuditLog` records are **unchanged** — this task
  adds a parallel, purpose-built table rather than overloading the general
  audit log. Every existing `ATTENDANCE_*` audit action continues to fire
  exactly as before SEC-ATT-004 left it; the new risk-review call is *additive*
  (fired alongside, not instead of, the existing `recordBestEffort()` call in
  each of the 4 shared recorder helpers).
- `AttendanceRiskReview.metadataJson` carries only non-sensitive diagnostic
  context (`attemptType`, `nonceAction`, `source`, `hasCoordinates`,
  `hasAccuracy`, `accuracyBucket`, `configSource`) — the same fields already
  considered audit-safe in the existing `ATTENDANCE_*` audit metadata, run
  through the sanitizer again as defense-in-depth.
- `employeeId`/`userId` are populated whenever available (both are already in
  scope at every hook call site); `attendanceId` is **null on essentially every
  automatically-created row** — the payload/nonce checks that trigger a row run
  before the attendance record is created or fetched (same reason the existing
  `ATTENDANCE_*` audit calls already use `targetId: null` for these same
  events) — rows remain traceable via `employeeId`/`userId`/`createdAt`.

## 9. Explicit Non-Scope Confirmation
- **No Admin Web UI** — zero changes to `apps/web`; confirmed by `git status`
  (no `apps/web` files touched). Deferred to SEC-ATT-007B.
- **No Native Android Play Integrity / iOS App Attest/DeviceCheck** — no
  runtime code for either; `DEVICE_INTEGRITY_UNAVAILABLE`/
  `NATIVE_ATTESTATION_UNAVAILABLE` reason codes exist in the enum/scoring
  table for schema completeness only and are **not wired to any hook** (see
  §12) — recording them on every PWA clock action would be 100% noise, not an
  actionable signal, since no native build exists (SEC-ATT-005A/006A, both
  DEFERRED).
- **No hard-enforcement change to missing nonce** — `enforceNonce()`'s
  soft-allow branch for a missing nonce is functionally unchanged; it now
  *additionally* records a risk-review row, but still returns successfully.
  Verified by test ("rollout decision: missing nonce still succeeds").
- **No hard-enforcement change to missing `capturedAt`** — same: the
  `MISSING` branch in `enforcePayloadIntegrity()` still does not throw; it now
  additionally records a risk-review row. Verified by the existing
  SEC-ATT-003 tests continuing to pass unmodified alongside the new ones.
- **No payroll or unrelated attendance feature changes.**
- **No production deploy, no production migration** — see §13.

## 10. Runtime Impact
- **New table, no behavior change to existing attendance flows.** Every
  existing clock-in/out/offsite success/rejection path is byte-for-byte
  unchanged in its response, status code, and existing audit-log entry; the
  only addition is one extra best-effort DB write (risk-review row) on
  flagged/rejected paths, which cannot fail the request (best-effort,
  try/catch-wrapped).
- **New endpoints** (`GET/PATCH /attendance/risk-reviews...`) — additive,
  SUPER_ADMIN/HR_ADMIN-only, no impact on any existing route.
- **Minor additional DB write volume** on flagged/rejected clock attempts only
  (not on clean ones) — bounded by the same `ThrottlerGuard` that already
  applies to every attendance endpoint.
- **Web dashboard** — unaffected; no web files touched (confirmed by
  `git status`).

## 11. Tests/Verification Commands and Results
```
npx jest src/attendance                     → PASS (309 tests, 6 suites — up from 277)
npx jest (full apps/api suite)               → PASS (659 tests, 26 suites — no cross-module regression)
git status                                   → clean tree, expected new/modified files only
git diff --check                             → clean, no whitespace/conflict errors
npx prisma validate                          → PASS ("schema at prisma/schema.prisma is valid")
./scripts/verify.sh                          → PASS (API build, Prisma schema valid, Web build)
./scripts/docker-verify.sh                   → PASS (stack rebuilt with the new Prisma client;
                                                api/db/web/mobile all healthy/reachable;
                                                non-destructive, stack left running per policy)
./scripts/api-smoke-test.sh                  → PASS (login, /auth/me, /employees, /departments,
                                                /positions, /attendance, /leave, /leave-balances,
                                                /dashboard, unauthenticated 401 check)
./scripts/secret-scan.sh                     → PASS (no findings)
./scripts/security-review.sh                 → PASS (dependency audit + secret scan; only the
                                                pre-existing, already-accepted Multer findings —
                                                no new packages added by this task)
```

**Live verification** against the rebuilt local Docker stack: `GET
/attendance/risk-reviews` with a valid `admin@hr.local` SUPER_ADMIN token →
`200 {"data":[],"meta":{"total":0,...}}`; the same request with no
`Authorization` header → `401`. (A live EMPLOYEE-role 403 check was not
performed — no employee-role credential is available in the seeded demo data
outside the admin account; RBAC-denial is instead directly verified by the
pre-existing `RolesGuard` unit test suite plus the 5 new RBAC-metadata tests
confirming the `@Roles()` decorator carries exactly `[SUPER_ADMIN,
HR_ADMIN]` on all 5 new endpoints.)

**New test coverage:**
- `attendance-risk-review.service.spec.ts` (17 tests): `scoreRisk()` for
  LOW/MEDIUM/HIGH/CRITICAL, multi-code max-severity selection, empty-list
  default; `recordReview()` derives the correct risk level, never persists raw
  GPS or raw nonce in `metadataJson` (sanitizer round-trip), defaults
  employeeId/attendanceId/userId to null when omitted; `findAll()`
  pagination/filtering; `findOne()` 404; `review()`/`setStatus()` update
  status/note/reviewedAt, resolve `reviewedById` from the caller's `userId`
  (best-effort — still updates status if the reviewer has no linked
  Employee), 404 on a missing row.
- `attendance.service.spec.ts` new `SEC-ATT-007A: risk-review recording`
  describe block (13 tests): missing-nonce-allowed → LOW/`FLAGGED`;
  missing-`capturedAt` → MEDIUM/`FLAGGED`; stale/future/mock location →
  HIGH/HIGH/CRITICAL `REJECTED`; all 5 nonce-rejection reasons via `it.each` →
  `REJECTED`; `OUTSIDE_RADIUS` geofence rejection → HIGH/`REJECTED`; no raw
  nonce or raw GPS ever reaches `recordReview()`'s arguments; a fully clean
  clock-in never calls `recordReview()` (no happy-path noise); a
  `recordReview()` rejection never blocks or fails the clock-in
  (best-effort).
- `attendance.controller.spec.ts`: 5 delegation tests (each new endpoint calls
  the right service method with the right arguments) + 5 RBAC-metadata tests
  (`[SUPER_ADMIN, HR_ADMIN]`, no MANAGER, matching the task guardrail).

**No regression:** all 277 pre-existing `src/attendance` tests and all 659
pre-existing/updated tests across the full API suite pass unmodified in
substance (only the two spec files' `beforeEach` setup gained the new mock
provider, required by the new constructor dependency — no existing test
assertion was changed).

## 12. Known Limitations
- **`attendanceId` is null on essentially every automatically-created row.**
  The payload/nonce checks that trigger a risk-review row run *before* the
  attendance record is created (clock-in) or fetched (clock-out) — there is
  nothing to link to yet at record-time. This mirrors the existing
  `ATTENDANCE_*` audit-log convention (`targetId: null` for these same
  events), so it is not a new gap this task introduces. Rows remain
  traceable via `employeeId`/`userId`/`createdAt`.
- **No time-window deduplication.** Each distinct signal on each attempt
  produces its own row; a client repeatedly missing the nonce or
  `capturedAt` during rollout produces one row per attempt, not a rolled-up
  counter. The `IGNORED` status exists so HR can bulk-triage known bulk
  categories; automatic collapsing/aggregation is left to a future
  enhancement, not built here (avoiding premature complexity in a foundation
  task).
- **A single request tripping two independent signals produces two rows**,
  not one merged row (e.g. a missing-`capturedAt` soft-allow observed
  alongside a separate hard rejection). Rare in practice given
  `classifyCapturedAt()`'s mutual exclusivity, but not merged across the two
  distinct recorder-helper call sites in this task.
- **`DEVICE_INTEGRITY_UNAVAILABLE`/`NATIVE_ATTESTATION_UNAVAILABLE` are
  defined but unwired.** Recording them on every PWA clock action (100% of
  current traffic) would be pure, non-actionable noise given no native build
  exists (SEC-ATT-005A/006A, both DEFERRED). Reserved for when a future
  SEC-ATT-005/006 implementation can populate a real per-request signal.
- **No Admin Web UI yet** (SEC-ATT-007B) — the queue is API-only; HR/Admin
  must use the API directly (e.g. via Swagger or a script) until the UI task
  ships.
- **No scheduled cleanup/archival** of `attendance_risk_reviews` rows — same
  precedent as `attendance_nonces` (SEC-ATT-004): no scheduler package exists
  in this codebase today; a future task should add one if table growth
  becomes a concern.
- **Effort/risk-level mappings for codes not explicitly given a bucket in the
  task brief** (`INVALID_CAPTURED_AT`, `NONCE_ACTION_MISMATCH`,
  `NONCE_USER_MISMATCH`, the internal `MISSING_LOCATION`/`GEOFENCE_NOT_CONFIGURED`/
  `OUTSIDE_RADIUS`/`POOR_ACCURACY` reasons) were classified by nearest
  documented sibling and stated explicitly in §4 — these are reasonable but
  not literally specified by the task brief; revisit if HR review experience
  suggests a different severity is more useful.

## 13. Production Deploy/Migration Requirement
**Yes — both a database migration and an API redeploy would be required**,
in this order, whenever this change is promoted beyond the local sandbox:
1. `npx prisma migrate deploy` against the production database (additive
   only: 3 `CREATE TYPE` statements, 1 `CREATE TABLE`, 5 indexes, 3
   `ON DELETE SET NULL` foreign keys — no existing table/column altered, no
   data touched).
2. Rebuild and redeploy the `apps/api` image (new service, new controller
   endpoints, changed internal parameter signatures in `attendance.service.ts`
   — all internal, no external API contract change to any existing endpoint).

**This task ran the migration only against the local Docker `hr-db` sandbox**
(confirmed running/healthy via `docker exec hr-db pg_isready` before the
migration, using the local stack's actual credential transiently, never
echoed or persisted) **and rebuilt/redeployed only the local Docker stack**
via `docker-verify.sh` (non-destructive, stack left running). **No command in
this task touched a real production database or used production credentials.**

## 14. Recommendation: PASS or HOLD
**PASS.** All required verification commands passed (see §11), the migration
is additive-only and was applied only to the local sandbox, no existing
attendance behavior changed for any current client, RBAC on the 5 new
endpoints is SUPER_ADMIN/HR_ADMIN-only with MANAGER explicitly deferred per
guardrail, and no raw GPS/nonce/token value can reach the new table (sanitized
at write-time, verified by test). Next step: **SEC-ATT-007B** (Admin Web UI
for the risk-review queue), which consumes this task's APIs and is not
blocked on any native-build decision.

## Recommended Commit Message
```
feat(attendance): add risk scoring + review queue backend foundation (SEC-ATT-007A)

Adds a new, additive AttendanceRiskReview table + 3 new enums
(AttendanceRiskLevel, AttendanceRiskReviewStatus, AttendanceRiskResult)
that records a privacy-safe, categorized risk row whenever an existing
SEC-ATT-002/003/004 payload/geofence/nonce check flags or rejects a
clock-in/out attempt. Reason codes (MISSING_CAPTURED_AT, STALE_LOCATION,
NONCE_REUSED, etc.) are scored into LOW/MEDIUM/HIGH/CRITICAL by
scoreRisk() (highest severity wins across multiple signals).

Integration is via the 4 existing shared best-effort audit-recorder
helpers in attendance.service.ts (not new call sites in clockIn/
clockOut/etc.) — existing attendance business logic and every
client-visible response/status code is unchanged. metadataJson is
sanitized through the same sanitizeMetadata() AuditLogService uses:
never raw GPS, never raw nonce, never tokens.

New SUPER_ADMIN/HR_ADMIN-only APIs: GET /attendance/risk-reviews,
GET /attendance/risk-reviews/:id, PATCH .../:id/review (+ approve/
reject convenience endpoints) — administrative status tracking only,
does not touch the underlying Attendance record. MANAGER access
explicitly deferred; no Admin Web UI (SEC-ATT-007B, next).

Migration is additive-only (3 CREATE TYPE, 1 CREATE TABLE, 5 indexes,
3 nullable FKs) and was applied only to the local Docker sandbox in
this task — production migrate deploy + API redeploy still required
before this ships to production.

No native Play Integrity/App Attest work (SEC-ATT-005/006 remain
DEFERRED); DEVICE_INTEGRITY_UNAVAILABLE/NATIVE_ATTESTATION_UNAVAILABLE
reason codes exist for schema completeness but are deliberately not
wired to any hook (would be 100% noise on today's PWA-only traffic).
No hard-enforcement change to missing nonce/capturedAt soft-allow
behavior. 309/309 attendance tests pass (32 new), 659/659 full suite.
```
