# CTO Summary

## Step
SEC-ATT-003 — Backend Rejection of Mock/Simulated/Stale Location

## Status
PASS

## Post-Review Patch: Source-Omission Bypass Closed

A review of this task **HOLD**ed the original implementation below: gating
every check in `validateGeofence()` on `dto.source === 'mobile'` meant a
request that simply omitted `source` (or sent `source: "web"`) skipped every
anti-spoofing check this task added — a stale, future-skewed, unparseable, or
explicitly-mocked payload would sail through if the caller just dropped one
field. That defeated the point of the hardening: `source` is exactly as
self-reported/forgeable as `capturedAt` or `isMockLocation` themselves, so
using it as a gate for validating *other* self-reported fields was not a
real control.

**Fix applied:** payload-integrity checks (`INVALID_CAPTURED_AT`,
`FUTURE_LOCATION`, `STALE_LOCATION`, `MOCK_LOCATION_DETECTED`, and the
`MISSING_CAPTURED_AT` soft-signal) were extracted into a new
`enforcePayloadIntegrity()` method that runs unconditionally — for every
`clockIn`/`clockOut` call (including the `workMode: OFFSITE` branch inside
`clockIn`, which is just as forgeable as `source`) and for every
`clockInOffsite`/`clockOutOffsite` call — regardless of `source` and
regardless of `config.enabled`. Only the **company-radius** checks
(`MISSING_LOCATION`/`POOR_ACCURACY`/`GEOFENCE_NOT_CONFIGURED`/
`OUTSIDE_RADIUS`, still in `validateGeofence()`) remain gated behind
`source === 'mobile'` + `config.enabled` — whether radius enforcement itself
should apply to non-mobile-sourced calls is a separate, still-open question
(SEC-ATT-001 §15 Open Question #1), not resolved by this patch.

The soft-enforce decision for a missing `capturedAt` is unchanged, but the
audit trail now distinguishes *why* it's missing: `MISSING_CAPTURED_AT` (a
`source` was given but `capturedAt` wasn't) vs. `MISSING_SOURCE_CAPTURED_AT`
(no `source` at all — web, offsite, or a very old client), so visibility into
fleet rollout isn't lost by the fix. `source` is restricted to
`'web' | 'mobile'` by the DTO's `@IsIn()` validator, so any other value
already 400s before reaching the service — there is no "unsupported source"
case left to decide.

**Rejection Rules, Runtime Impact, Known Limitations, and Explicit Non-Scope
Confirmation below are updated in place to reflect this patch** rather than
kept as a stale historical record — see each section for what changed.

## Scope
Add hard backend rejection of implausible attendance location payloads for
clock-in/out and off-site clock-in/out requests, per
`docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md` §6/§12/§14. Promotes
the SEC-ATT-002 `capturedAt` freshness signal (informational-only) to a hard
422 rejection for stale, future-skewed, or unparseable timestamps, and adds a
new optional `isMockLocation` signal for a future native build. Two decision
points were raised with the user before/during implementation and resolved
explicitly (see "Decision Points" below):
1. Whether to hard-reject a *missing* `capturedAt` → resolved as soft-enforce.
2. Whether the new checks should be gated behind the geofence `enabled` flag
   (like the pre-existing radius checks) or run independently → resolved as
   **independent of `config.enabled`**, because these are anti-spoofing
   payload checks, not radius/geofence checks.

**Post-review patch (see above):** the checks were originally also gated
behind `source === 'mobile'`, which review correctly identified as a bypass;
they now run independent of `source` too, for every clock-in/out and
off-site clock-in/out path.

No nonce/replay protection, no Play Integrity/App Attest, no risk-scoring
queue, no database schema/migration changes.

## Files Created
- `docs/CTO_SUMMARY_SEC_ATT_003.md` — this file

## Files Modified

**Original implementation:**
- `apps/api/src/attendance/attendance.service.ts` — `validateGeofence()`
  gains five new checks, running for every `source: 'mobile'` request
  **immediately after the config is fetched, before the `if (!config.enabled)
  return` line** (see Decision Point #2): `INVALID_CAPTURED_AT` (hard),
  `MISSING_CAPTURED_AT` (soft, logged only), `FUTURE_LOCATION` (hard),
  `STALE_LOCATION` (hard), `MOCK_LOCATION_DETECTED` (hard). The pre-existing
  `MISSING_LOCATION`/`POOR_ACCURACY`/`GEOFENCE_NOT_CONFIGURED`/`OUTSIDE_RADIUS`
  checks are unchanged and remain gated behind `config.enabled`, after the new
  checks. Added `classifyCapturedAt()` (replaces inline logic in
  `computeGpsAgeBucket()`, which now delegates to it — same external bucket
  output, no behavior change to SEC-ATT-002's informational bucketing).
  Added `recordCapturedAtMissingAuditBestEffort()` for the new non-rejecting
  audit signal. Widened the `reason` union on
  `recordGeofenceRejectedAuditBestEffort()`. Because the new checks can now
  run before location fields are known to be present, `hasCoordinates`/
  `hasAccuracy`/`accuracyBucket` for their audit metadata are computed
  defensively from the raw DTO/config rather than assumed `true`/`'ACCEPTABLE'`.
- `apps/api/src/attendance/dto/clock-in.dto.ts` — added optional
  `isMockLocation?: boolean`
- `apps/api/src/attendance/dto/clock-out.dto.ts` — same
- `apps/api/src/attendance/attendance.service.spec.ts` — 22 new tests across
  3 new `describe` blocks, plus 4 pre-existing tests updated to locate the
  relevant audit event by `action` instead of assuming it's
  `mock.calls[0][0]`, since a `MISSING_CAPTURED_AT` audit call can now precede
  it for any mobile fixture that omits `capturedAt` (all pre-existing
  fixtures do): 2 geofence-rejected tests (`configSource in metadata...`,
  `metadata contains no forbidden GPS fields`) and, caught in a second review
  pass after the geofence-independence restructuring, 2 success-path privacy
  tests (`metadata excludes raw GPS coordinates and note text...` for both
  clockIn and clockOut) that had silently stopped guarding the
  `ATTENDANCE_CLOCK_IN`/`ATTENDANCE_CLOCK_OUT` event once a
  `MISSING_CAPTURED_AT` call started preceding it in the mock's call history
- `docs/SEC_ATT_ROADMAP.md` — marked SEC-ATT-003 complete, pointed "next" at SEC-ATT-004
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — documented the
  new reason codes, thresholds, the geofence-independence decision, and the
  (now-closed) `source`-omission gap

**Post-review patch (source-omission bypass fix):**
- `apps/api/src/attendance/attendance.service.ts` — extracted the five
  payload-integrity checks out of `validateGeofence()` into a new
  `enforcePayloadIntegrity()` method, called unconditionally (no `source`
  gate) from the top of `clockIn()` (before the `workMode` branch, so
  `workMode: OFFSITE` can't dodge it either), `clockOut()`,
  `clockInOffsite()`, and `clockOutOffsite()`. `validateGeofence()` now only
  contains the company-radius checks (`MISSING_LOCATION`/`POOR_ACCURACY`/
  `GEOFENCE_NOT_CONFIGURED`/`OUTSIDE_RADIUS`), still gated behind
  `source === 'mobile'` + `config.enabled`, unchanged in behavior. Threaded a
  real `source: string | null` (from `dto.source ?? null`) through
  `recordGeofenceRejectedAuditBestEffort()` and
  `recordCapturedAtMissingAuditBestEffort()`, replacing the hardcoded
  `source: 'mobile'` literal both previously had (which would otherwise have
  mislabeled audit events for non-mobile/offsite callers once the source gate
  was removed). Split the missing-`capturedAt` soft-signal `reason` into
  `MISSING_CAPTURED_AT` (a `source` was present) vs.
  `MISSING_SOURCE_CAPTURED_AT` (no `source` at all).
- `apps/api/src/attendance/dto/offsite-clock-in.dto.ts` — added optional
  `isMockLocation?: boolean` (needed so off-site payloads can carry the same
  anti-spoofing signal as clock-in/out; these DTOs have no `source` field at
  all, which is fine — `enforcePayloadIntegrity()` treats an absent `source`
  uniformly with an explicitly-omitted one)
- `apps/api/src/attendance/dto/offsite-clock-out.dto.ts` — same
- `apps/api/src/attendance/attendance.service.spec.ts` — added two new
  `describe` blocks (`SEC-ATT-003 (patched): source omission no longer
  bypasses payload-integrity checks`, 8 tests; `SEC-ATT-003 (patched): offsite
  clock-in/out payloads are no longer exempt from payload-integrity checks`,
  4 tests) covering every case the review required (stale/future/invalid
  `capturedAt` and `isMockLocation: true` rejected with `source` omitted;
  missing `capturedAt` with `source` omitted soft-allowed and flagged
  `MISSING_SOURCE_CAPTURED_AT`; stale rejection holds with geofence disabled;
  no raw GPS/nonce leak into audit metadata; offsite clock-in/out reject
  stale/mock and soft-allow missing). Rewrote one existing test
  (`leaves off-site clock-in unaffected by a stale capturedAt`, in the
  `workMode: OFFSITE` `clockIn` path) that had encoded the old bypass as
  intended behavior — it now asserts the opposite (rejection). Fixed 8
  pre-existing tests that asserted on `mock.calls[0][0]` and broke once a
  `MISSING_SOURCE_CAPTURED_AT` soft-signal call started preceding the main
  success event for fixtures with no `source` and no `capturedAt` (which most
  pre-existing offsite/no-source fixtures are) — switched to finding the
  event by `action`, same pattern already used for the 4 tests fixed in the
  original implementation.

## Decision Points Raised and Resolved With the User

### 1. Missing `capturedAt` — hard-reject or soft-enforce?
The spec (§6, §14) and this task's own instructions both flag "hard-rejecting
a missing `capturedAt`" as a decision requiring explicit sign-off if it could
break production: SEC-ATT-002 shipped `capturedAt` as fully optional, and
there is no data confirming 100% of the mobile/PWA fleet has picked up that
build (SEC-ATT-002's "redeployed, production health checked" refers to the
backend, not client-side rollout). Asked the user directly before writing
code; the user chose **soft-enforcement**: a missing `capturedAt` on a
`source: "mobile"` request still succeeds (as it did after SEC-ATT-002), but
now emits a distinct `ATTENDANCE_CAPTURED_AT_MISSING` audit event
(`result: 'ALLOWED'`, `reason: 'MISSING_CAPTURED_AT'`) for visibility. All
other new checks (invalid format, stale, future, mock-when-present)
hard-reject immediately, since none of them can fire for a client that simply
omits the field — only a client that sends a *bad* value is affected, so
there's no rollout risk for those. Hard-rejecting missing `capturedAt` is
deferred to a follow-up task once fleet rollout is confirmed complete.

### 2. Should the new checks be gated behind `config.enabled`?
The first implementation placed the new checks alongside the pre-existing
ones, all gated behind `if (!config.enabled) return`, matching the existing
code structure exactly. While verifying this against the running Docker
stack, the live `GeofenceConfig` was found to have **`enabled: false`**
(`GET /attendance/geofence-config` → `{"enabled": false, "source": "db", ...}`)
— meaning, as first implemented, none of this task's new rejections would
ever fire in the current production-like environment. This was surfaced to
the user as an explicit question rather than silently shipped or silently
changed. The user's answer: **the new checks must run independently of
`config.enabled`** — payload freshness/mock-location validation is an
anti-spoofing control, not a radius control, and an admin disabling
company-radius enforcement (e.g. no office configured yet) should not also
silently disable capturedAt/mock validation. The code was restructured
accordingly: `INVALID_CAPTURED_AT`/`MISSING_CAPTURED_AT`/`FUTURE_LOCATION`/
`STALE_LOCATION`/`MOCK_LOCATION_DETECTED` now evaluate immediately after
`source === 'mobile'` is confirmed, before the `config.enabled` check;
`MISSING_LOCATION`/`POOR_ACCURACY`/`GEOFENCE_NOT_CONFIGURED`/`OUTSIDE_RADIUS`
remain exactly where and how they were (gated behind `config.enabled`,
unchanged). Six new tests were added specifically for "geofence disabled"
scenarios to lock this in.

## Rejection Rules Implemented

**Updated by the post-review patch.** The five payload-integrity rules below
now apply to **every** clock-in/out and off-site clock-in/out request —
`ClockInDto`/`ClockOutDto` (any `source`, including omitted), the
`workMode: OFFSITE` branch inside `clockIn()`, and
`OffsiteClockInDto`/`OffsiteClockOutDto` (which have no `source` field at
all). `MixedCheckoutExceptionDto` still never calls either check function and
remains unaffected (verified by test) — it was not named in the review's
required fix and stays out of scope here.

| Reason code | Trigger | Gated by `source`? | Gated by `config.enabled`? | Result |
|---|---|---|---|---|
| `INVALID_CAPTURED_AT` | `capturedAt` present but `Date.parse()` fails | No | No | 422, audited, `ATTENDANCE_GEOFENCE_REJECTED` |
| `MISSING_CAPTURED_AT` | `capturedAt` absent, `source` present | No | No | **200/201 — request succeeds.** Audited separately as `ATTENDANCE_CAPTURED_AT_MISSING` / `result: ALLOWED` |
| `MISSING_SOURCE_CAPTURED_AT` | `capturedAt` absent, `source` also absent | No | No | Same as above — soft-enforced, request succeeds |
| `FUTURE_LOCATION` | `capturedAt` more than 30s ahead of server receipt time | No | No | 422, audited, `ATTENDANCE_GEOFENCE_REJECTED` |
| `STALE_LOCATION` | `capturedAt` more than 120s behind server receipt time | No | No | 422, audited, `ATTENDANCE_GEOFENCE_REJECTED` |
| `MOCK_LOCATION_DETECTED` | client sends `isMockLocation: true` | No | No | 422, audited, `ATTENDANCE_GEOFENCE_REJECTED` |
| `MISSING_LOCATION` / `POOR_ACCURACY` / `GEOFENCE_NOT_CONFIGURED` / `OUTSIDE_RADIUS` (pre-existing, radius-only) | unchanged | **Yes**, `source === 'mobile'` only | **Yes** (unchanged) | Unchanged |

Every `ATTENDANCE_GEOFENCE_REJECTED`/`ATTENDANCE_CAPTURED_AT_MISSING` audit
event now carries the real `source` value (`'web' | 'mobile' | null`) instead
of a hardcoded `'mobile'` literal, since these checks are no longer specific
to mobile-sourced requests.

**Not implemented in this task (explicitly out of scope):**
- `SIMULATED_LOCATION_DETECTED` as a *distinct* code from `MOCK_LOCATION_DETECTED`
  — there is only one available client signal (`isMockLocation`) today; inventing
  a second code with no distinguishing signal behind it would be fabricated,
  not implemented.
- **Radius enforcement for non-mobile-sourced calls** — the payload-integrity
  source-omission bypass (closed by this patch) is *not* the same question as
  "should the company-radius check itself also apply when `source` isn't
  `'mobile'`". That remains SEC-ATT-001 §15 Open Question #1, explicitly left
  unresolved by the spec and requiring a separate product decision. A crafted
  request that omits `source` still skips `MISSING_LOCATION`/`POOR_ACCURACY`/
  `GEOFENCE_NOT_CONFIGURED`/`OUTSIDE_RADIUS` — but it can no longer skip the
  freshness/mock-location anti-spoofing checks, which is what this task's
  review was about.
- `UNSUPPORTED_ATTENDANCE_SURFACE` — moot: `source` is restricted to
  `'web' | 'mobile'` by the DTO's `@IsIn()` validator, so any other value
  already 400s before reaching the service.
- Implausible-travel-speed / repeated-identical-coordinate heuristics (spec
  §6's "when available" hedge for mock detection on the PWA) — the spec
  frames these as probabilistic signals belonging to SEC-ATT-007 risk scoring,
  not a hard-reject item, and this task's scope excludes SEC-ATT-007.

## Thresholds Used
Reused unchanged from SEC-ATT-002's existing constants (`attendance.service.ts`)
rather than introducing new magic numbers:
- `GPS_AGE_ACCEPTABLE_SECONDS = 120` — the STALE cutoff. Age ≤ 120s (including
  the FRESH ≤30s and ACCEPTABLE 30–120s bands) passes; age > 120s rejects.
  The ACCEPTABLE band deliberately still passes to protect legitimate
  poor-connectivity clock-ins (spec abuse-case #12) — this was already the
  design intent of SEC-ATT-002's bucket boundaries, now enforced rather than
  just logged.
- `GPS_FUTURE_SKEW_TOLERANCE_SECONDS = 30` — the FUTURE cutoff.
- These remain code constants, not DB-configurable via `GeofenceConfig` (same
  known limitation carried over from SEC-ATT-002 — promoting them to
  DB-configurable is a small additive schema change for a future task, not
  done here to honor "no schema changes unless unavoidable").

## Privacy/Security Handling
- **No new persistence.** `isMockLocation` and all capturedAt-derived
  judgments are transient, request-scoped — never written to `Attendance`,
  `GeofenceConfig`, or any other table. Schema is unchanged.
- **No raw GPS in any new audit metadata.** Every new rejection reuses the
  existing `recordGeofenceRejectedAuditBestEffort()` helper, which only ever
  logs `hasCoordinates`/`hasAccuracy`/`accuracyBucket` (categorical), never
  `latitude`/`longitude`/`accuracy`/`distance` — those remain denylisted in
  `AUDIT_SENSITIVE_KEYS` as defense-in-depth, but the new code never attempts
  to pass them in the first place. Since the new checks can now run before
  location fields are confirmed present, `hasCoordinates`/`hasAccuracy`/
  `accuracyBucket` are computed defensively from the raw request rather than
  hardcoded — verified by test that no raw values leak regardless.
- **No raw nonce logged.** Unchanged from SEC-ATT-002 — `nonce` is still
  never included in any metadata object; verified by test.
- **Safe, generic error messages.** All five new rejection paths return one
  of two non-revealing messages ("Location data is invalid. Please try
  again." / "Location data has expired. Please try again.") — none reveal
  *which* specific check failed, consistent with the existing
  `OUTSIDE_RADIUS`/`POOR_ACCURACY` convention and spec §6/§10's "safe error
  handling" requirement.
- **New audit action name.** `ATTENDANCE_CAPTURED_AT_MISSING` is a new,
  free-form string action (no enum constrains `AuditLogEvent.action`,
  confirmed in `audit-log.types.ts`/`audit-log.service.ts`) — chosen instead
  of overloading `ATTENDANCE_GEOFENCE_REJECTED` with `result: 'REJECTED'`,
  because the request is *not* rejected; conflating the two would misrepresent
  the audit trail to a reviewer filtering by `result`.

## Audit Behavior
- **Hard rejections** (`INVALID_CAPTURED_AT`, `FUTURE_LOCATION`,
  `STALE_LOCATION`, `MOCK_LOCATION_DETECTED`) all emit
  `ATTENDANCE_GEOFENCE_REJECTED` / `result: 'REJECTED'` with the same
  metadata shape as the pre-existing `MISSING_LOCATION`/`POOR_ACCURACY`/
  `GEOFENCE_NOT_CONFIGURED`/`OUTSIDE_RADIUS` reasons — `attemptType`,
  `source` (**post-review patch: the real `dto.source ?? null`, was
  hardcoded `'mobile'`**), `reason`, `hasCoordinates`, `hasAccuracy`,
  `accuracyBucket`, `configSource`, `geofenceEnabled` (now correctly
  reflecting `false` when geofence is disabled, since these checks can fire
  in that state — verified by test). No new metadata shape was introduced;
  the existing vocabulary was simply extended (per spec §11's "extends,
  rather than weakens" convention and this task's explicit recommended
  reason-code list).
- **Soft signal** (`MISSING_CAPTURED_AT` / `MISSING_SOURCE_CAPTURED_AT`)
  emits a new `ATTENDANCE_CAPTURED_AT_MISSING` / `result: 'ALLOWED'` event
  with `attemptType`, `source` (real value, post-review patch), `reason`
  (**post-review patch: now distinguishes `MISSING_CAPTURED_AT`, a `source`
  was present, from `MISSING_SOURCE_CAPTURED_AT`, no `source` at all**),
  `configSource` — deliberately excludes
  `hasCoordinates`/`hasAccuracy`/`accuracyBucket`/`geofenceEnabled` since
  those aren't yet meaningful for a request that hasn't reached the location
  checks and wasn't rejected on those grounds.
- All audit writes remain best-effort (wrapped in `recordBestEffort()`'s
  try/catch) — an audit-log outage never blocks or breaks the attendance
  action, unchanged from the existing pattern.

## Explicit Non-Scope Confirmation
- **No nonce/replay enforcement.** `nonce` continues to be accepted,
  never validated, never consumed. SEC-ATT-004 owns this.
- **No Play Integrity.** Not implemented; `isMockLocation` is a self-reported
  client field, not an attestation verdict. SEC-ATT-005 owns this, and it
  remains blocked on a native Android build that does not exist.
- **No App Attest/DeviceCheck.** Same as above for iOS; SEC-ATT-006.
- **No risk-scoring/review queue.** No new `AttendanceReviewStatus` states,
  no new review workflow, no aggregation of signals into a score. SEC-ATT-007
  owns this.
- **No admin review queue.** Rejections are hard 422s returned synchronously
  to the caller, not queued for later human review.
- **The payload-integrity `source`-omission bypass is now closed** (see
  Post-Review Patch section at the top) — this is the one item from the
  original implementation's non-scope list that this task's review required
  fixing, and it has been. The **narrower, still-open** question of whether
  the company-radius check itself should also apply to non-mobile-sourced
  calls (SEC-ATT-001 §15 Open Question #1) remains unresolved by design — see
  Known Limitations.
- **No native app attestation.** `isMockLocation` merely reserves a DTO field
  for a value a future native build *could* populate (e.g. Android
  `expo-location`'s `LocationObject.mocked`, confirmed present in the
  installed `expo-location@~19.0.8` but only populated on native builds, not
  web). **No mobile client code was touched in this task** — STEP Connect
  remains PWA-only in production (per the spec, no native binary is built or
  distributed), so no current client can ever set this field to `true`. This
  is the same "reserve the field now, no client sends it yet" pattern
  SEC-ATT-002 used for `nonce`.
- **PWA cannot detect mock GPS — stated per spec §14's SEC-ATT-003 PASS
  criterion.** `MOCK_LOCATION_DETECTED` is reachable only if a client
  explicitly sends `isMockLocation: true`; the current PWA has no browser-API
  equivalent of a mock-location flag and never sends this field. This is
  signal-based enforcement (reject when told), not device-integrity detection
  (verify independently) — those remain SEC-ATT-005/006, native-only.
- **`source`-omission gap not closed.** A request that omits `source` or
  sends `source: "web"` still bypasses every check added in this task, same
  as it bypassed every SEC-ATT-002 check — this is SEC-ATT-001 §15 Open
  Question #1, explicitly left unresolved by the spec and not decided here.

## Runtime Impact
- **This is now live and active in the current environment.** The running
  Docker stack's `GeofenceConfig` has `enabled: false` (confirmed via
  `GET /attendance/geofence-config`). Because of Decision Point #2, the new
  `INVALID_CAPTURED_AT`/`MISSING_CAPTURED_AT`/`FUTURE_LOCATION`/
  `STALE_LOCATION`/`MOCK_LOCATION_DETECTED` checks run regardless of that
  setting — this task's hardening is **not** dormant in production today.
  (Had the checks stayed gated behind `config.enabled` as first implemented,
  they would have been inert until an admin enabled geofence — this exact gap
  is why Decision Point #2 was raised.)
- **Post-review patch:** the same checks also now run regardless of `source`
  — a request that omits `source`, sends `source: "web"`, or hits any of the
  off-site clock-in/out endpoints (which have no `source` field) is no longer
  exempt. Only the company-radius checks remain `source === 'mobile'`-gated.
- **Old mobile clients (pre-SEC-ATT-002, never send `capturedAt`):** clock-in/
  out continues to succeed exactly as today — `MISSING_CAPTURED_AT` (or, for a
  client that also never set `source`, `MISSING_SOURCE_CAPTURED_AT`) is
  soft-enforced. The only new behavior visible to them is an additional
  audit-log entry, invisible to the client.
- **Current SEC-ATT-002 mobile clients (send `capturedAt`, no
  `isMockLocation`):** succeed unless their GPS fix is genuinely stale
  (>120s old) or clock-skewed (>30s ahead) — both already-flagged-but-not-
  enforced conditions per SEC-ATT-002's `gpsAgeBucket`. A legitimately poor-
  connectivity clock-in within the 120s window is unaffected (abuse-case
  #12).
- **Off-site clock-in/out (`clockInOffsite`/`clockOutOffsite`):** now also
  reject `INVALID_CAPTURED_AT`/`FUTURE_LOCATION`/`STALE_LOCATION`/
  `MOCK_LOCATION_DETECTED` under the same rules as clock-in/out — this is new
  behavior introduced by the patch (previously these paths ran zero
  payload-integrity checks at all). A missing `capturedAt` is soft-enforced
  the same way, logged as `MISSING_SOURCE_CAPTURED_AT` (these DTOs have no
  `source` concept). Company-radius checks remain N/A for off-site by design
  (unchanged) — off-site attendance deliberately bypasses radius, only its
  GPS-freshness/mock-signal plausibility is now checked.
- **`mixedCheckoutException`:** entirely unaffected — neither check function
  is called on that path. Verified by test. Not named in the review's
  required fix; unchanged from the original implementation.
- **Web dashboard:** no clock-in/out UI exists (ADR-029, unchanged); not
  exercised by this task's backend-only changes.
- **A malicious/scripted client** with a stale, future, or fabricated-mock
  payload now gets a 422 regardless of what it claims for `source` (or
  whether it sets `source` at all) — this closes the manual-payload-edit
  bypass the review identified, and applies even with the company radius
  check turned off.

## Schema/Migration Impact
**None.** No changes to `apps/api/prisma/schema.prisma`. `isMockLocation` is
validated, evaluated, and discarded — never persisted. Confirmed via
`prisma validate` (part of `./scripts/verify.sh`) and by inspection (no
`prisma migrate` command run, no migration files created).

## Tests / Verification

**Post-review patch verification:**
```
npx jest attendance.service.spec.ts   → PASS (188 tests, up from 176)
npx jest (full apps/api suite)        → PASS (583 tests, all 24 suites — no cross-module regression)
./scripts/verify.sh                   → PASS (API build, Prisma schema valid, Web build)
./scripts/docker-verify.sh            → PASS (stack rebuilt, API/Web/Mobile all
                                          healthy/reachable; non-destructive, stack left
                                          running per policy)
./scripts/api-smoke-test.sh           → PASS (login, /auth/me, /employees, /departments,
                                          /positions, /attendance, /leave, /leave-balances,
                                          /dashboard, unauthenticated 401 check)
./scripts/security-review.sh          → PASS (dependency audit + secret scan; same
                                          pre-existing accepted-risk Multer findings,
                                          unrelated to this task — no new packages added)
```

**Original implementation verification (retained for history):**
```
npx jest attendance.service.spec.ts   → PASS (176 tests, up from 154)
npx jest (full apps/api suite)        → PASS (571 tests, all 24 suites — no cross-module regression)
git status / git diff --check         → clean, no whitespace errors
./scripts/secret-scan.sh              → PASS (no findings)
./scripts/security-review.sh          → PASS (dependency audit + secret scan; pre-existing
                                          accepted-risk Multer findings only, unrelated to
                                          this task — no new packages added)
./scripts/verify.sh                   → PASS (API build, Prisma schema valid, Web build)
./scripts/docker-verify.sh            → PASS (stack rebuilt twice — once per implementation
                                          revision — API/Web/Mobile all healthy/reachable;
                                          non-destructive, stack left running per policy)
./scripts/api-smoke-test.sh           → PASS (login, /auth/me, /employees, /departments,
                                          /positions, /attendance, /leave, /leave-balances,
                                          /dashboard, unauthenticated 401 check)
```

**New test coverage from the post-review patch** (`attendance.service.spec.ts`,
12 new tests across 2 new `describe` blocks, 1 existing test rewritten, 8
existing tests fixed for call-order robustness):
- `SEC-ATT-003 (patched): source omission no longer bypasses payload-integrity
  checks` (8 tests) — with `source` omitted entirely: stale/future/invalid
  `capturedAt` and `isMockLocation: true` all now 422 with the correct reason
  code and `source: null` in audit metadata; missing `capturedAt` still
  soft-allows but is flagged `MISSING_SOURCE_CAPTURED_AT` (distinct from
  `MISSING_CAPTURED_AT`); stale rejection holds even with geofence disabled;
  no raw GPS coordinates or raw nonce leak into rejected-attempt audit
  metadata; same stale-rejection parity verified on clock-out.
- `SEC-ATT-003 (patched): offsite clock-in/out payloads are no longer exempt
  from payload-integrity checks` (4 tests) — `clockInOffsite`/
  `clockOutOffsite` (previously ran zero payload-integrity checks) now reject
  a stale `capturedAt` and `isMockLocation: true`, and soft-allow (flagged
  `MISSING_SOURCE_CAPTURED_AT`) a missing `capturedAt`, the same as clock-in/
  out.
- Rewrote `leaves off-site clock-in unaffected by a stale capturedAt
  (OFFSITE workMode never calls validateGeofence)` — this test had encoded
  the bypass as intended behavior; it now asserts a stale `capturedAt` with
  `workMode: OFFSITE` is rejected before the off-site-request lookup even
  runs.
- Fixed 8 pre-existing tests that broke because a `MISSING_SOURCE_CAPTURED_AT`
  (or `MISSING_CAPTURED_AT`) soft-signal audit call now precedes the main
  success event for fixtures with no `capturedAt` (the majority of
  pre-existing clockIn/clockOut/clockInOffsite/clockOutOffsite fixtures):
  2 in `audit: clockIn`/`audit: clockOut` (`metadata.employeeId is the
  resolved employee id`), 2 in `clockInOffsite`/`clockOutOffsite` (`audit
  metadata does NOT contain raw latitude or longitude`), and 4 in
  `SEC-ATT-002: gpsAgeBucket + client metadata` (missing-`capturedAt`,
  platform/timezone, hasNonce tests, for both clockIn and clockOut) — same
  "find the event by `action` instead of assuming `mock.calls[0][0]`" pattern
  already established by the original implementation's own fixes.
- All pre-existing geofence, audit, RBAC, off-site, and
  mixed-checkout-exception tests otherwise pass unmodified — confirms the
  patch did not regress existing behavior beyond the intentional bypass
  closure.

**Original implementation's test coverage (retained for history):**
`attendance.service.spec.ts`, 22 new tests across 3 new
`describe` blocks, 2 pre-existing tests updated for call-order robustness):
- `SEC-ATT-003: DTO validation for isMockLocation` (4 tests) — accepts a
  boolean on `ClockInDto`/`ClockOutDto`, rejects a non-boolean, backward
  compatible with an empty payload.
- `SEC-ATT-003: mock/stale/future location rejection (mobile source)`,
  geofence **enabled** (11 tests):
  - Fresh `capturedAt` inside geofence → accepted (abuse-case #1)
  - `capturedAt` in the ACCEPTABLE band (90s old) → accepted, not rejected
    (abuse-case #12, legitimate poor connectivity)
  - Missing `capturedAt` → accepted, `ATTENDANCE_CAPTURED_AT_MISSING` /
    `ALLOWED` fires; no `ATTENDANCE_GEOFENCE_REJECTED` fires
  - Unparseable `capturedAt` → 422, `INVALID_CAPTURED_AT`, no record created
  - Stale `capturedAt` (10 min old) → 422, `STALE_LOCATION`, no record created
  - Future `capturedAt` (5 min ahead) → 422, `FUTURE_LOCATION`
  - `isMockLocation: true` → 422, `MOCK_LOCATION_DETECTED`, no record created
  - `isMockLocation: false` → accepted (explicit false is not a signal)
  - Same `STALE_LOCATION` rejection verified on clock-out for a
    `COMPANY_GEOFENCE` record (abuse-case parity between clock-in/out)
  - Rejected-attempt audit metadata contains no `latitude`/`longitude`/
    `accuracy`/`distance`/`nonce`, and the raw nonce string never appears
    anywhere in the serialized metadata
  - Off-site clock-in (`workMode: OFFSITE`) with a stale `capturedAt` still
    succeeds — confirms `validateGeofence()` is never reached on that path
    (abuse-case #13, off-site remains unaffected)
- `SEC-ATT-003: payload-freshness/mock checks run independently of geofence
  enabled`, geofence **disabled** (7 tests, added for Decision Point #2):
  - Stale, future, unparseable, and `isMockLocation: true` all still 422
    with `geofenceEnabled: false` correctly reflected in audit metadata
  - A valid, fresh, non-mock payload proceeds normally with the radius check
    skipped (`geofenceService.isWithinRadius` never called)
  - Missing `capturedAt` still soft-allows (logged, not rejected)
  - Pre-existing `MISSING_LOCATION`-class gating is unchanged: with geofence
    disabled, a request missing lat/lon still succeeds (proves the
    restructuring didn't accidentally start enforcing location-presence
    independent of `config.enabled` too — only the five new checks moved)
- Four pre-existing tests updated to find the relevant audit event by
  `action` rather than assuming `mock.calls[0][0]`, since a
  `MISSING_CAPTURED_AT` soft-signal call can now precede the event they
  actually care about — test fixture updates, not behavior changes; each
  test's original assertions still pass against the correct event:
  - `configSource in metadata reflects effective config source` and
    `metadata contains no forbidden GPS fields` (both target
    `ATTENDANCE_GEOFENCE_REJECTED`)
  - `metadata excludes raw GPS coordinates and note text even when dto
    carries them`, for both `clockIn` and `clockOut` (target
    `ATTENDANCE_CLOCK_IN`/`ATTENDANCE_CLOCK_OUT`) — these two were caught in
    a second review pass specifically *because* they had gone quietly green
    without checking the right event: their assertions (no `latitude`, no
    `note`, etc.) happened to hold for the `MISSING_CAPTURED_AT` event too,
    so the test suite stayed green while no longer exercising the
    success-path GPS/note-privacy invariant it exists to guard. Fixed by
    asserting against the event found by `action === 'ATTENDANCE_CLOCK_IN'`
    (respectively `'ATTENDANCE_CLOCK_OUT'`) instead of `calls[0][0]`.
- All pre-existing geofence, audit, RBAC, off-site, and mixed-checkout-exception
  tests pass unmodified otherwise — confirms this task did not regress any
  existing behavior (abuse-cases #2, #5, #9, #13).

**Live verification attempted, partially blocked by an unrelated
environment fact:** after rebuilding and redeploying the Docker stack, a
live curl against `POST /attendance/clock-in` with `source: "mobile"` and a
stale `capturedAt` was attempted using the seeded `admin@hr.local` account.
It returned `400 "No employee profile linked to this account"` — the seeded
admin account has no linked `Employee` record, so `requireEmployeeId()`
throws before `validateGeofence()` ever runs. This is a pre-existing
property of the demo dataset, unrelated to this task. Creating or mutating
another employee's attendance data to work around it was judged out of scope
for a verification step (destructive to a shared/seeded environment,
essentially untraceable to a real user's credentials). The 176-test Jest
suite — which exercises the exact "geofence disabled" state confirmed live —
is the authoritative verification per `CLAUDE.md`'s required commands, and is
the standard verification method already used throughout this codebase's
existing test suite.

**Not run / not applicable:** mobile typecheck/export — **no mobile files
were touched in this task** (confirmed: only `apps/api/src/attendance/*`
files changed). Per the task's own instruction, mobile verification beyond
the existing SEC-ATT-002 checks is not required and was not run.

## Known Limitations
- **`MISSING_CAPTURED_AT`/`MISSING_SOURCE_CAPTURED_AT` remain soft-enforced
  indefinitely until a follow-up task explicitly promotes them**, per
  Decision Point #1. There is no automated signal in this codebase that
  would tell a future task "100% of the fleet has updated" — that
  determination will need to come from mobile release/analytics data
  outside this repo.
- **`isMockLocation` has no real sender today.** It is validated and
  enforced correctly, but until a native STEP Connect build exists and
  populates it, `MOCK_LOCATION_DETECTED` cannot fire in production. This is
  the same class of limitation SEC-ATT-002 accepted for `nonce`.
- **Radius enforcement for non-mobile-sourced calls remains a separate, open
  question.** The post-review patch closed the payload-integrity
  source-omission bypass (stale/future/invalid/mock checks now run
  regardless of `source`), but the company-radius checks
  (`MISSING_LOCATION`/`POOR_ACCURACY`/`GEOFENCE_NOT_CONFIGURED`/
  `OUTSIDE_RADIUS`) are unchanged and still only apply when
  `source === 'mobile'`. A crafted request that omits `source` still skips
  radius enforcement — that is SEC-ATT-001 §15 Open Question #1, a distinct
  product decision (not a defect) that this task does not resolve.
- **No travel-speed/implausible-movement heuristic.** The spec's "when
  available" hedge for PWA mock detection (§6) suggests this as a future
  signal; it requires comparing consecutive requests over time and is framed
  by the spec as SEC-ATT-007 risk-scoring material, not a SEC-ATT-003 hard
  reject — not implemented here, by design.
- **Thresholds remain code constants**, not promoted to `GeofenceConfig` —
  carried over from SEC-ATT-002's same limitation, to avoid a schema change
  this task's scope explicitly discourages.
- **Live end-to-end curl verification of the rejection paths was not
  completed** due to the seeded admin account lacking an `Employee` link (see
  Tests/Verification above) — coverage relies on the Jest suite instead,
  which directly exercises the live-observed `enabled: false` configuration.

## Production Redeploy Requirement
Yes — this changes `apps/api` runtime behavior (new 422 rejection paths,
now active regardless of the geofence toggle *and* regardless of `source`,
plus new rejection paths on the off-site clock-in/out endpoints) and must be
rebuilt/redeployed the same way SEC-ATT-002 was. Verified locally via
`./scripts/docker-verify.sh` (API image rebuilt, container recreated, health
check passed). No mobile or web redeploy is required — no files in
`apps/mobile` or `apps/web` changed.

## Issues Found
**Post-review:** a HOLD was raised identifying that gating every
payload-integrity check on `dto.source === 'mobile'` created a
manual-payload-edit bypass — a request that simply omitted `source` skipped
every check this task added, undermining the anti-spoofing threat model.
Fixed as described above (Post-Review Patch section); the two original
design decisions below remain unchanged and were not part of the HOLD:
missing-`capturedAt` enforcement policy; geofence-enabled gating. Both were
surfaced to the user and resolved during the original implementation — the
first before writing code, the second after live-verifying against the
running Docker stack revealed it would otherwise have been inert in the
current environment.

## Risk
Low. No schema change, no new endpoint, no auth/RBAC change, no change to
persisted data, no mobile or web files touched. The externally visible
behavior change is that clock-in/out and off-site clock-in/out requests with
a stale, future-skewed, unparseable, or explicitly-flagged-mock
`capturedAt`/`isMockLocation` now receive a 422 instead of succeeding —
regardless of `source` — a security hardening, and one designed so that no
currently-shipping client (which never sends `isMockLocation` and, per
SEC-ATT-002, may still omit `capturedAt`) can be broken by it. This applies
regardless of the geofence `enabled` toggle (Decision Point #2) and
regardless of `source` (post-review patch) — both deliberate widenings of
effect, the first explicitly approved by the user, the second implementing
the review's required fix.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None. No endpoint added or removed; existing `JwtAuthGuard`/`RolesGuard` on `AttendanceController` unchanged. |
| RBAC impact | None. No `@Roles()` change. |
| Data privacy impact | None to persisted data. New audit fields (`isMockLocation`-driven `reason` codes, `MISSING_CAPTURED_AT`/`MISSING_SOURCE_CAPTURED_AT` signals, real `source` value instead of a hardcoded literal) are categorical only — no raw GPS, no raw nonce, verified by test. |
| Password/token/hash impact | None. Not touched. |
| Mobile security impact | None — no mobile files changed in this task. The `isMockLocation` DTO field (now also on the off-site DTOs) is additive/optional; no currently-shipping mobile build sends it, so no behavior change for any real client today. |
| Dependency/advisory impact | None. No package added to `apps/api`, `apps/web`, or `apps/mobile`. `security-review.sh` dependency audit passed with only the pre-existing, already-documented Multer accepted-risk findings (unrelated to this task). |
| Secrets/logging check | Clean — `secret-scan.sh`/`security-review.sh` passed. New and existing audit paths verified by test to never log raw GPS or the raw nonce value. |
| New endpoints protected | None — no endpoints added. The existing attendance-clock endpoints (including the two off-site ones, now also covered by payload-integrity checks) keep their existing `JwtAuthGuard`+`RolesGuard` (no `@Roles()` restriction, unchanged from before this task). |
| Risk level | LOW |
| Security decision | PASS |

## Decision
PASS — the source-omission bypass identified by review has been closed;
verified by `./scripts/verify.sh`, `./scripts/docker-verify.sh`,
`./scripts/api-smoke-test.sh`, and `./scripts/security-review.sh`, plus the
full Jest suite (583 tests, 24 suites).

## Next Step
**SEC-ATT-004 — Server nonce/replay protection**, per `docs/SEC_ATT_ROADMAP.md`
and spec §8. Also flagged for a future (not this next) task: revisit whether
`MISSING_CAPTURED_AT`/`MISSING_SOURCE_CAPTURED_AT` should become a hard
rejection once mobile fleet rollout is confirmed complete, and whether
SEC-ATT-001 §15 Open Question #1 (whether the company-radius check itself
should also apply to non-mobile-sourced calls — separate from the
payload-integrity bypass this patch closed) should finally be resolved.

## Recommended Commit Message
```
fix(attendance): close source-omission bypass in SEC-ATT-003 checks

Payload-integrity checks (stale/future/invalid capturedAt,
isMockLocation:true) were gated on dto.source === 'mobile', so a
request that simply omitted source skipped every anti-spoofing check
SEC-ATT-003 added — source is exactly as forgeable as any other
client field. Extracted the checks into enforcePayloadIntegrity(),
now called unconditionally from clockIn (before the workMode branch,
so workMode: OFFSITE can't dodge it either), clockOut,
clockInOffsite, and clockOutOffsite — closing the gap for offsite
payloads too, which previously ran zero payload-integrity checks.
Only the company-radius checks (MISSING_LOCATION/POOR_ACCURACY/
GEOFENCE_NOT_CONFIGURED/OUTSIDE_RADIUS) remain source==='mobile'-gated;
that narrower question is a separate, still-open product decision
(SEC-ATT-001 §15). Audit events now carry the real source value
(was hardcoded 'mobile'); a missing capturedAt with no source at all
is now distinguished as MISSING_SOURCE_CAPTURED_AT vs.
MISSING_CAPTURED_AT, preserving soft-enforcement visibility. Added
isMockLocation to the off-site DTOs. No schema change.
```
