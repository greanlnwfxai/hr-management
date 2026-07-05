# CTO Summary

## Step
SEC-ATT-004 — Server Nonce / Replay Protection

## Status
PASS

## Scope
Implement server-issued, single-use, short-lived nonces to defeat replay of
captured attendance clock-in/clock-out requests, per
`docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md` §8 and
`docs/SEC_ATT_ROADMAP.md`. Covers `POST /attendance/clock-in`,
`POST /attendance/clock-out`, `POST /attendance/offsite/clock-in`, and
`POST /attendance/offsite/clock-out`. A new `POST /attendance/nonce` endpoint
issues the nonce; mobile fetches one immediately before each clock action and
echoes it back in the `nonce` field SEC-ATT-002 already reserved.

No Play Integrity, no App Attest/DeviceCheck, no risk scoring/review queue, no
admin review queue, no native attestation — all explicitly out of scope
(SEC-ATT-005/006/007). `mixedCheckoutException` is also out of scope (see
"Known Limitations").

## Files Created
- `apps/api/prisma/migrations/20260705092615_add_attendance_nonce/migration.sql` — additive migration (new enum + new table only)
- `apps/api/src/attendance/attendance-nonce.service.ts` — nonce issuance/consumption logic
- `apps/api/src/attendance/attendance-nonce.service.spec.ts` — 12 unit tests
- `apps/api/src/attendance/dto/issue-attendance-nonce.dto.ts` — `POST /attendance/nonce` request DTO
- `docs/CTO_SUMMARY_SEC_ATT_004.md` — this file

## Files Modified
- `apps/api/prisma/schema.prisma` — new `AttendanceNonceAction` enum, new `AttendanceNonce` model (additive only)
- `apps/api/src/common/enums.ts` — mirrors `AttendanceNonceAction` as a runtime-safe TS enum for `@IsEnum` (per `CLAUDE.md` API Rules — never import enums directly from `@prisma/client` in DTOs)
- `apps/api/src/attendance/attendance.module.ts` — registers `AttendanceNonceService`
- `apps/api/src/attendance/attendance.controller.ts` — new `POST /attendance/nonce` endpoint
- `apps/api/src/attendance/attendance.service.ts` — `issueNonce()`, `enforceNonce()`, two new audit helpers; called from `clockIn`, `clockOut`, `clockInOffsite`, `clockOutOffsite`
- `apps/api/src/attendance/attendance.service.spec.ts` — added `AttendanceNonceService` mock provider, fixed 3 pre-existing tests whose `mock.calls[0][0]` indexing broke because a new audit call can now precede the success event (same pattern SEC-ATT-003 established), added ~23 new tests
- `apps/api/src/attendance/dto/clock-in.dto.ts` / `clock-out.dto.ts` — updated the `nonce` field's Swagger description (no validator change — `@IsString()@MaxLength(128)` already accepted the 64-hex-char nonce)
- `apps/api/src/audit-log/audit-log.types.ts` — added `nonce`/`tokenhash` to `AUDIT_SENSITIVE_KEYS` (defense-in-depth; the code never passes a raw nonce into metadata in the first place)
- `apps/api/src/test-utils/prisma.mock.ts` — added `attendanceNonce` mock methods
- `apps/mobile/src/api/types.ts` — `nonce?` on the three clock payload types; new `AttendanceNonceAction`/`AttendanceNonceResponse` types
- `apps/mobile/src/api/client.ts` — new `issueAttendanceNonce()`
- `apps/mobile/src/hooks/useAttendance.ts` — clock-in/out fetch a nonce (best-effort) right after `getLocation()`, right before submitting
- `apps/mobile/src/hooks/useOffsiteAttendance.ts` — same for off-site clock-in/out
- `docs/SEC_ATT_ROADMAP.md` — marked SEC-ATT-004 complete, pointed "next" at SEC-ATT-005
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — documented the nonce design, reason codes, rollout decision, and known limitations

## Nonce/Challenge Design
- **Endpoint:** `POST /attendance/nonce`, body `{ action: 'CLOCK_IN' | 'CLOCK_OUT' | 'OFFSITE_CLOCK_IN' | 'OFFSITE_CLOCK_OUT' }`. Same guards as every other attendance endpoint (`JwtAuthGuard` + `RolesGuard`, no `@Roles()` restriction — any authenticated user, mirroring the clock endpoints themselves). Response is `{ nonce, expiresAt, action }` only — no internal hash, no secrets.
- **Generation:** `crypto.randomBytes(32).toString('hex')` (256 bits of entropy, 64 hex chars — fits the existing `@MaxLength(128)` on the DTO's reserved `nonce` field unchanged).
- **Binding:** `userId` (the actual authenticated-session security key — verified equal at consumption), `employeeId` (best-effort "if available" per the task spec — looked up softly via `employee.findFirst({ where: { userId } })`, stored as `null` if absent, kept for audit/reporting only since `userId` already uniquely determines it), `action` (one of four distinct scopes — clock-in/out on the main endpoint use `CLOCK_IN`/`CLOCK_OUT`; the two off-site endpoints use `OFFSITE_CLOCK_IN`/`OFFSITE_CLOCK_OUT`, so a nonce for one endpoint cannot be replayed against another), `expiresAt` (300s TTL).
- **TTL — 300 seconds.** Chosen deliberately longer than the SEC-ATT-003 `capturedAt` staleness window (120s) because the nonce-fetch-to-submit window on mobile now includes a cold-start GPS fix (the client fetches the nonce *after* `getLocation()` resolves, to minimize this window further — see mobile changes below) plus network latency; 300s comfortably covers slow GPS acquisition without materially widening the replay window.
- **Consumption is atomic and single-use:** `AttendanceNonceService.consumeNonce()` issues one conditional `updateMany({ where: { tokenHash, userId, action, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })`. Only one concurrent request can flip `consumedAt` from null — this update, not any preceding read, is the actual security gate. On `count === 0`, a diagnostic-only `findUnique` (by `tokenHash`) classifies *why* for the audit reason code (invalid / expired / reused / wrong action / wrong user) — this lookup never re-decides enforcement, it only labels an outcome the atomic update already determined.
- **Consumed last, right before the write.** In every one of the four call sites, `enforceNonce()` runs immediately before the final `prisma.attendance.create`/`update` — after payload-integrity (SEC-ATT-003), geofence/off-site-request validation, and the same-day duplicate check have all already passed. This means a nonce is only ever burned by a request that would otherwise have succeeded; a request rejected for an unrelated reason (stale GPS, outside radius, already clocked in) never consumes the nonce. Documented tradeoff: if the final DB write itself fails for an unrelated reason after the nonce is consumed (rare — e.g. a transient DB error), the nonce is still burned and the client must fetch a new one — accepted rather than wrapping the whole flow in an interactive transaction, which would have required a much larger refactor of already-complex, well-tested methods for a rare edge case.

## Persistence/Schema/Migration Impact
**Additive only.** New Prisma enum `AttendanceNonceAction` (`CLOCK_IN` / `CLOCK_OUT` / `OFFSITE_CLOCK_IN` / `OFFSITE_CLOCK_OUT`) and new model `AttendanceNonce` → table `attendance_nonces` (`id`, `tokenHash` unique, `userId`, `employeeId` nullable, `action`, `expiresAt`, `consumedAt` nullable, `createdAt`). No existing table, column, or enum touched. Verified via `prisma validate` (part of `verify.sh`) and by inspecting the generated `migration.sql` — it contains only `CREATE TYPE` and `CREATE TABLE`/`CREATE INDEX` statements, nothing destructive.

**Why Postgres over Redis:** the spec (§8) explicitly leaves this choice to this task and names Redis (provisioned in `docker-compose.yml` but marked "not used yet" per `CLAUDE.md`'s ports table) as a candidate alongside a DB table. Chose Postgres for consistency with the rest of the system's all-Postgres persistence (no new infrastructure dependency, no new failure mode to wire up, no change to `docker-compose.yml`), and because a short-lived row with a unique-indexed hash and a conditional `updateMany` gives the same atomicity guarantee Redis's `SETNX`/`GETDEL` would, without introducing a second stateful store this codebase doesn't otherwise use.

**Only a SHA-256 hash is stored**, never the raw nonce — the raw value is returned to the client once at issuance and appears nowhere else (not in the DB, not in logs, not in audit metadata). Verified by unit test (`attendance-nonce.service.spec.ts`: "never persists the raw nonce value" / "never sends the raw nonce to the database").

**No cleanup job.** Consumed and expired rows are never deleted — this codebase has no scheduler package (`@nestjs/schedule` or equivalent) today, and adding one was judged out of this task's scope. Documented as a known limitation; a future task should add periodic deletion of rows past `expiresAt`.

## Enforcement Behavior
| Reason code | Trigger | Enforcement |
|---|---|---|
| `NONCE_MISSING` | no `nonce` field on the request | **Soft-allowed** — request succeeds, audited `ATTENDANCE_NONCE_MISSING` / `ALLOWED` |
| `NONCE_INVALID` | hash not found (never issued / garbage value) | 422, audited `ATTENDANCE_NONCE_REJECTED` / `REJECTED` |
| `NONCE_EXPIRED` | present, past the 300s TTL | 422, same audit action |
| `NONCE_REUSED` | already consumed (the actual replay case) | 422, same audit action |
| `NONCE_ACTION_MISMATCH` | issued for a different action (e.g. a `CLOCK_OUT` nonce sent to clock-in) | 422, same audit action |
| `NONCE_USER_MISMATCH` | issued to a different authenticated user | 422, same audit action |

Every rejection returns the same generic message ("Your attendance session has expired. Please try again.") — the spec (§8) explicitly requires that a caller not be able to distinguish reused from expired from never-issued from the response alone; only the audit trail (internal-only) carries the specific reason.

Existing SEC-ATT-003 checks (`INVALID_CAPTURED_AT`/`STALE_LOCATION`/`FUTURE_LOCATION`/`MOCK_LOCATION_DETECTED`, soft `MISSING_CAPTURED_AT`) and geofence/company-radius validation are unchanged and still run — nonce enforcement is additive to them, placed after them in the call sequence (see "Nonce/Challenge Design"). Web dashboard clock actions remain unavailable (no web files were touched — confirmed by `grep` for clock-in code in `apps/web`, no matches).

## Rollout Compatibility Decision
**Explicitly surfaced to the user before writing code, per this task's own instructions.** `POST /attendance/nonce` is new — no previously-shipped mobile/PWA build can fetch or send a real nonce yet (the `nonce` field existed since SEC-ATT-002 but was never enforced, so no live client populates it meaningfully today). Hard-rejecting a missing nonce the instant this deploys would make every clock-in/out fail, fleet-wide, until every device picks up the new PWA bundle — an outage of the core attendance feature, not a degraded corner case.

**User's decision: Option B — soft-enforce missing nonce.** A missing nonce still succeeds (audited `ATTENDANCE_NONCE_MISSING` / `ALLOWED` for rollout-progress visibility), mirroring the SEC-ATT-003 `MISSING_CAPTURED_AT` precedent. A **present** nonce is always strictly validated regardless of this toggle — invalid/expired/reused/wrong-action/wrong-user all hard-reject unconditionally. Hard-enforcement of missing nonce is an explicit follow-up task, once fleet rollout of this task's mobile changes is confirmed complete (no automated signal in this codebase can confirm that — it requires mobile release/analytics data outside this repo, same limitation SEC-ATT-003 documented for `capturedAt`).

**Stated plainly, so "PASS" isn't over-read:** during this soft-enforcement window, an attacker can defeat replay protection entirely just by omitting the `nonce` field — the same captured-request replay this task exists to stop still succeeds if the replayed request never had a nonce to begin with (true of every request from a client on the current, pre-this-task mobile bundle). Replay protection is therefore **implemented but not yet actually in effect against real traffic** until (a) the mobile bundle in this task's diff is rolled out to the fleet and (b) a follow-up task hard-enforces `NONCE_MISSING`. This is the correct, deliberate rollout tradeoff given the alternative (fleet-wide clock-in/out outage), but it means today's actual security posture is unchanged until both of those land — not "replay protection shipped and active."

**Mobile-side mitigation for the soft window:** the nonce is fetched as late as possible — after `getLocation()` resolves, immediately before the POST — to keep the issuance-to-use window as short as possible and avoid a legitimate slow-GPS clock-in accidentally landing outside the TTL. If nonce issuance itself fails (network error, endpoint unreachable) for a reason other than session expiry, the client falls back to submitting without one rather than blocking the clock action — consistent with the server-side soft-enforcement decision.

## Privacy/Security Handling
- Raw nonce is never persisted (only its SHA-256 hash), never logged, and never included in audit metadata anywhere — verified by unit test at both the `AttendanceNonceService` level and the `AttendanceService` level (rejected-nonce audit metadata test asserts the raw nonce string does not appear anywhere in the serialized metadata).
- `nonce` and `tokenhash` added to `AUDIT_SENSITIVE_KEYS` as defense-in-depth (the code never attempts to pass either into metadata, matching the existing pattern for `latitude`/`longitude`/`accuracy`).
- No raw GPS leakage in any new audit metadata — the new nonce-audit helpers only ever include `attemptType`, `nonceAction`, `source`, and `reason`, none of which are GPS fields; verified by test.
- Safe, generic error messages for every rejection reason (see "Enforcement Behavior" table) — no detail that would help an attacker distinguish nonce states.
- No change to password, token, or hash handling elsewhere in the system.

## Audit Behavior and Reason Codes
Two new best-effort audit actions (both wrapped in the existing `recordBestEffort()` try/catch — an audit-log outage never blocks or breaks a clock action, unchanged pattern):
- **`ATTENDANCE_NONCE_MISSING`** / `result: 'ALLOWED'` — emitted only when soft-enforcing a missing nonce. Metadata: `attemptType`, `nonceAction`, `source`, `reason: 'NONCE_MISSING'`.
- **`ATTENDANCE_NONCE_REJECTED`** / `result: 'REJECTED'` — emitted for every hard-rejection case. Metadata: `attemptType`, `nonceAction`, `source`, `reason` (one of `NONCE_INVALID`/`NONCE_EXPIRED`/`NONCE_REUSED`/`NONCE_ACTION_MISMATCH`/`NONCE_USER_MISMATCH`).

Nonce **issuance** itself is not audited (by design) — every clock attempt fetches one, so auditing issuance would roughly double audit-log volume for a non-security-relevant success event; only failures are audited, matching this task's explicit requirement ("audit rejected replay/nonce failures").

## Explicit Non-Scope Confirmation
- **No Play Integrity** (SEC-ATT-005) — not implemented, still blocked on a native Android build that doesn't exist.
- **No App Attest/DeviceCheck** (SEC-ATT-006) — same, iOS.
- **No risk scoring/review queue** (SEC-ATT-007) — no new `AttendanceReviewStatus` states, no aggregation of signals into a score.
- **No admin review queue** — nonce rejections are synchronous 422s, not queued for human review.
- **`mixedCheckoutException` is out of scope** — spec §8 names it as a distinct nonce scope alongside clock-in/out, but this task's explicit action list and expected-files list named only `CLOCK_IN`/`CLOCK_OUT`/`OFFSITE_CLOCK_IN`/`OFFSITE_CLOCK_OUT` and did not list `mixed-checkout-exception.dto.ts`. Verified by test that `AttendanceNonceService.consumeNonce` is never called on that path. This mirrors the SEC-ATT-003 precedent of leaving that endpoint untouched, but is a real, currently-open replay gap on that one endpoint — flagged here rather than silently left undocumented (see "Known Limitations").

## Runtime Impact
- **New endpoint, new DB table** — requires the migration to be applied and the API image rebuilt/redeployed (see "Production Deploy/Migration Requirement" below).
- **No currently-shipping mobile/PWA client can fetch or send a real nonce yet** — until the mobile bundle in this task's diff rolls out, every clock-in/out request continues to soft-allow via `NONCE_MISSING`/`ALLOWED`, functionally unchanged from a user's perspective except for the additional audit entry (invisible to the client).
- **Once the mobile changes roll out**, clock-in/out gains one additional round-trip (`POST /attendance/nonce`) before each clock action, adding minor latency; the nonce fetch happens in parallel with no additional user-facing step (it happens automatically after location is already being acquired).
- **No change** to existing SEC-ATT-003 payload-integrity behavior, geofence/company-radius behavior, or the same-day duplicate-clock-in/out check — all unchanged and still run before nonce enforcement.
- **Web dashboard** — no clock-in/out UI exists (ADR-029, unchanged); confirmed no web files were touched.

## Tests/Verification

```
npx jest attendance-nonce.service.spec.ts   → PASS (12 tests, new file)
npx jest attendance.service.spec.ts         → PASS (210 tests, up from 188)
npx jest (full apps/api suite)              → PASS (617 tests, all 25 suites — no cross-module regression)
git status                                  → clean tree, expected new/modified files only
git diff --check                            → clean, no whitespace errors
./scripts/secret-scan.sh                    → PASS (no findings)
./scripts/security-review.sh                → PASS (dependency audit + secret scan; same
                                               pre-existing accepted-risk Multer findings,
                                               unrelated to this task — no new packages added)
./scripts/verify.sh                         → PASS (API build, Prisma schema valid, Web build)
./scripts/docker-verify.sh                  → PASS (stack rebuilt, API/Web/Mobile all
                                               healthy/reachable; non-destructive, stack
                                               left running per policy)
./scripts/api-smoke-test.sh                 → PASS (login, /auth/me, /employees, /departments,
                                               /positions, /attendance, /leave, /leave-balances,
                                               /dashboard, unauthenticated 401 check)
apps/mobile: npm run typecheck              → PASS (tsc --noEmit, clean)
```

**New test coverage** (`attendance-nonce.service.spec.ts`, 12 tests): nonce issuance binds employee when linked / `employeeId: null` when not; never persists the raw nonce (hash only); generates a distinct nonce per call; successful atomic consumption (and skips the diagnostic fallback lookup on the happy path); never sends the raw nonce to the DB (hash only); rejects `NONCE_INVALID`/`NONCE_EXPIRED`/`NONCE_REUSED`/`NONCE_ACTION_MISMATCH`/`NONCE_USER_MISMATCH`; a same-nonce replay (second consumption attempt) is rejected.

**New test coverage** (`attendance.service.spec.ts`, ~23 tests across 5 new `describe` blocks): `issueNonce()` delegates correctly; clock-in and clock-out each test missing-nonce soft-allow, valid-nonce consumption with the correct action, all five hard-rejection reasons via `it.each` (clock-in), expired/reused (clock-out), nonce-not-consumed when an earlier check (stale `capturedAt`, `OUTSIDE_RADIUS`) rejects first, no raw nonce/GPS in rejected-nonce audit metadata, and a same-nonce-twice replay sequence; off-site clock-in/out verified to use the distinct `OFFSITE_CLOCK_IN`/`OFFSITE_CLOCK_OUT` scopes (not `CLOCK_IN`/`CLOCK_OUT`) and to reject invalid/reused nonces without writing a record; `mixedCheckoutException` verified to never call `consumeNonce`.

**3 pre-existing tests fixed** (same pattern SEC-ATT-003 established): the SEC-ATT-002 `gpsAgeBucket` clock-in/clock-out tests that indexed `mockAuditLog.record.mock.calls[0][0]` directly now find the success event by `action`, since a `MISSING_NONCE` soft-signal audit call can now precede it for any fixture without a `nonce`. All other pre-existing tests were unaffected (they either use `toHaveBeenCalledWith(expect.objectContaining(...))`, which matches any call, or don't exercise clock-in/out/offsite paths at all).

**Live verification:** rebuilt and redeployed the local Docker stack (`docker-verify.sh`, non-destructive). Live-curled `POST /auth/login` → `POST /attendance/nonce` with `{"action":"CLOCK_IN"}` using the seeded `admin@hr.local` account — succeeded, returned `{ nonce, expiresAt, action }`. Confirmed via a read-only `SELECT` against the `attendance_nonces` table that the row was created with `employeeId` null (admin has no linked `Employee`, matching the "best-effort" binding design), `consumedAt` null, `expiresAt` in the future, and a 64-hex-char `tokenHash` distinct from the raw nonce returned to the client. Live-curled `POST /attendance/clock-in` with that nonce — as with SEC-ATT-003's live verification, it 400s at the pre-existing `requireEmployeeId()` check (the seeded admin has no `Employee` record) before nonce consumption is ever reached; this is a known, pre-existing property of the demo dataset, not a defect in this task. Full end-to-end clock-in/out nonce consumption is exercised by the Jest suite instead, per the same precedent SEC-ATT-003 established.

**Database environment note:** this task's local Docker Postgres instance uses the same credential values as the root `.env` (labeled "Production" in that file's header comment). Before running any Prisma migration command, this was surfaced to the user directly; the user confirmed the running local Docker stack is a local mirror, not the real production database, and approved running `prisma migrate dev --create-only` and `prisma migrate deploy` against it. No command was run against the actual production database at any point in this task.

## Known Limitations
- **`NONCE_MISSING` is soft-enforced indefinitely** until a follow-up task explicitly promotes it to a hard rejection, per the rollout decision above. No automated signal in this codebase can confirm 100% mobile fleet rollout — that determination requires mobile release/analytics data outside this repo (same limitation SEC-ATT-003 documented for `capturedAt`).
- **`mixedCheckoutException` is not covered.** A captured mixed-checkout-exception request (which sets `checkOut` on an `ONSITE` record) remains replayable — spec §8 names it as a distinct nonce scope, but it was outside this task's explicit scope. This is a real, currently-open gap, not an oversight; a follow-up task should close it.
- **No scheduled cleanup of `attendance_nonces`.** Consumed and expired rows accumulate indefinitely — no scheduler package exists in this codebase today. A future task should add periodic deletion of rows past `expiresAt` (e.g. a daily job, or a lightweight query run from an existing cron-like mechanism if one is added for other purposes).
- **Employee binding is best-effort, not a security boundary.** `employeeId` on the nonce row can be `null` (no linked Employee at issuance time); the actual security check at consumption is `userId`, not `employeeId` — this is intentional (Employee↔User is a stable 1:1 relationship via `userId`, so checking `userId` alone is equivalent and simpler), but worth stating explicitly since the spec's wording ("bound to the employee") could be read as requiring an employee-level check.
- **Full replay protection still assumes a non-fully-compromised session.** Per spec §8's abuse-case #8: nonce protection defeats resending a previously captured *complete* request, but a fully compromised session (attacker has the JWT and can request a *fresh* nonce) is not defended against by this task — that would require SEC-ATT-005/006 device attestation, which remains blocked on a native mobile build.

## Production Deploy/Migration Requirement
**Yes — both a database migration and an API redeploy are required**, and they must happen in that order:
1. Run `npx prisma migrate deploy` against the production database (additive-only: `CREATE TYPE "AttendanceNonceAction"`, `CREATE TABLE "attendance_nonces"`, three indexes — no existing table/column altered, no data touched).
2. Rebuild and redeploy the `apps/api` image (new endpoint, new service, changed enforcement logic in the four clock-action methods).
3. Mobile: the updated `apps/mobile` bundle (new nonce-fetch calls in `useAttendance.ts`/`useOffsiteAttendance.ts`) should also be rebuilt/redeployed so real clients begin exercising the new nonce flow — not strictly required for the backend to function (missing nonce is soft-enforced), but required for this task's actual replay-protection benefit to take effect for real traffic.

Verified locally via `./scripts/docker-verify.sh` against a local Docker mirror only (migration applied via `prisma migrate deploy`, API image rebuilt, container recreated, health check passed) — **not** against the real production database, per the explicit user-confirmed environment boundary described in "Tests/Verification" above.

## Issues Found
None beyond the pre-existing test-fragility pattern already known from SEC-ATT-003 (fixed the same way — locate audit events by `action`, not call index).

## Risk
**Low-Medium.** New endpoint and new table (additive, no destructive migration), but:
- No auth/RBAC change — the new endpoint uses the exact same guards as every other attendance endpoint.
- No existing behavior changes for any currently-shipping client until its bundle is updated (soft-enforcement).
- The one behavior change visible to any client today is an additional best-effort audit-log entry — invisible to the client, non-blocking.
- The main residual risk is operational: the production migration must be applied before/alongside the API redeploy, and the mobile bundle should follow reasonably soon after for the security benefit to materialize — both called out explicitly above.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | New endpoint (`POST /attendance/nonce`) — protected by the same `JwtAuthGuard` + `RolesGuard` as every other attendance endpoint. No new auth flow, no change to JWT issuance/validation. |
| RBAC impact | None. No `@Roles()` restriction added (matches the clock-in/out endpoints themselves — any authenticated user with an account may request a nonce; the actual employee-scoping happens at consumption/clock-time, unchanged). |
| Data privacy impact | None new. `AttendanceNonce` stores only a hash, `userId`, optional `employeeId`, an action label, and timestamps — no PII beyond what's already implied by an authenticated session. |
| Password/token/hash impact | None to password/JWT handling. A new *nonce* hash (SHA-256, not a password/credential hash) is introduced for replay protection — conceptually similar to how a hashed refresh token would be stored, not a new password/JWT mechanism. |
| Mobile security impact | Adds one new authenticated API call per clock action; nonce is fetched late (after GPS) to minimize exposure window; falls back gracefully (no nonce) on issuance failure per the soft-enforcement decision — no new token/credential storage introduced. |
| Dependency/advisory impact | None. No new package added to `apps/api`, `apps/web`, or `apps/mobile` — nonce generation/hashing uses Node's built-in `crypto` module, already used elsewhere in this codebase (`common/password.util.ts`). `security-review.sh` dependency audit passed with only the pre-existing, already-documented Multer accepted-risk findings. |
| Secrets/logging check | Clean — `secret-scan.sh`/`security-review.sh` passed. Raw nonce verified by test to never appear in the database, audit metadata, or (by code inspection) any log statement. |
| New endpoints protected | `POST /attendance/nonce` — `JwtAuthGuard` + `RolesGuard`, no `@Roles()` restriction (any authenticated user). |
| Rate limiting / row-flooding | Confirmed: `ThrottlerGuard` is registered globally via `APP_GUARD` in `app.module.ts` and no `@SkipThrottle()` exists on `AttendanceController` — `POST /attendance/nonce` is subject to the same default `THROTTLE_LIMIT`/`THROTTLE_TTL` (100 req/60s) as every other endpoint. Combined with "no cleanup job" (see Known Limitations), this bounds how fast an authenticated user can grow the `attendance_nonces` table; it does not eliminate unbounded long-run growth from legitimate repeated use, only unauthenticated/scripted flooding. |
| Risk level | LOW-MEDIUM |
| Security decision | PASS |

## Decision
**PASS** — verified by the full test suite (12 new + 210 attendance + 617 total,
all passing), `verify.sh`, `docker-verify.sh` (local mirror), `api-smoke-test.sh`,
`security-review.sh`, `secret-scan.sh`, and a live nonce-issuance curl against
the rebuilt local stack with direct DB inspection confirming hash-only storage.

## Next Step
**SEC-ATT-005 — Android Play Integrity**, per `docs/SEC_ATT_ROADMAP.md` — blocked
on a native Android build/wrapper decision that does not yet exist (product
decision outside this task's scope). Also flagged for a future (not necessarily
next) task: close the `mixedCheckoutException` nonce gap; add scheduled cleanup
of expired/consumed `attendance_nonces` rows; promote `NONCE_MISSING` to a hard
rejection once mobile fleet rollout of this task's changes is confirmed complete.

## Recommended Commit Message
```
feat(attendance): add server nonce/replay protection (SEC-ATT-004)

Adds POST /attendance/nonce, issuing a short-lived (300s), single-use
nonce bound to the authenticated user and a specific clock action
(CLOCK_IN/CLOCK_OUT/OFFSITE_CLOCK_IN/OFFSITE_CLOCK_OUT). Mobile fetches
one right after acquiring GPS, immediately before submitting, and
echoes it back in the nonce field SEC-ATT-002 reserved.

Only a SHA-256 hash of the nonce is stored (new additive
AttendanceNonce table); the raw value is returned once at issuance and
never persisted or logged. Consumption is atomic (single conditional
updateMany, race-safe) and happens last, right before the DB write, so
only a request that already passed every other check can burn a
nonce. A present nonce is always strictly validated (invalid/expired/
reused/wrong-action/wrong-user all hard-reject); a missing nonce is
soft-enforced (rollout decision, explicit user sign-off, mirrors the
SEC-ATT-003 MISSING_CAPTURED_AT precedent) since no previously-shipped
client can send one yet — hard-enforcement is a follow-up once fleet
rollout is confirmed.

mixedCheckoutException is not covered (out of this task's scope,
documented as a known gap). No cleanup job for expired nonce rows yet
(no scheduler package in this codebase). Additive migration only — new
enum + new table, no existing schema touched.
```
