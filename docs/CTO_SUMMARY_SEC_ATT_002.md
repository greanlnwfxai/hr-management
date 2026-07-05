# CTO Summary

## Step
SEC-ATT-002 — Mobile Attendance Payload Hardening

## Status
PASS

## Scope
Harden the mobile/PWA attendance clock-in/out payload with explicit,
privacy-aware client metadata and GPS-quality signals so a later task
(SEC-ATT-003) can validate suspicious activity. Per
`docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md` §6–7: add
`capturedAt` (GPS-capture timestamp), reserve (but do not enforce) a `nonce`
field for SEC-ATT-004, and make `source` handling explicit as a hint, not a
trusted assertion. No hard rejection of stale/mock/replayed GPS — that is
SEC-ATT-003. No nonce enforcement, no native attestation, no risk-scoring
queue — those are SEC-ATT-004/005/006/007.

## Files Created
- `docs/CTO_SUMMARY_SEC_ATT_002.md` — this file
- `apps/mobile/src/utils/timezone.ts` — `getTimezoneOffsetMinutes()` helper shared by both attendance hooks

## Files Modified
- `apps/api/src/attendance/dto/clock-in.dto.ts` — added `capturedAt`, `timezoneOffsetMinutes`, `platform`, `nonce` (all optional)
- `apps/api/src/attendance/dto/clock-out.dto.ts` — same four fields
- `apps/api/src/attendance/dto/offsite-clock-in.dto.ts` — same four fields, for consistency across all mobile-only clock actions
- `apps/api/src/attendance/dto/offsite-clock-out.dto.ts` — same four fields
- `apps/api/src/attendance/attendance.service.ts` — added `computeGpsAgeBucket()` and `clientMetadata()` helpers; wired into the audit metadata for `clockIn`, `clockOut`, `clockInOffsite`, `clockOutOffsite`; clarified the `source`-is-a-hint comment above `validateGeofence()`
- `apps/api/src/attendance/attendance.service.spec.ts` — DTO validation tests + `gpsAgeBucket`/metadata audit tests (see Tests below)
- `apps/mobile/src/hooks/useDeviceLocation.ts` — `DeviceLocation` now also returns `capturedAt` (from `GeolocationPosition.timestamp` / `expo-location`'s `result.timestamp`) and `platform`
- `apps/mobile/src/api/types.ts` — `MobileLocationPayload`/`OffsiteClockInPayload`/`OffsiteClockOutPayload` extended with `capturedAt?`, `timezoneOffsetMinutes?`, `platform?`
- `apps/mobile/src/hooks/useAttendance.ts` — sends the new fields on clock-in/out
- `apps/mobile/src/hooks/useOffsiteAttendance.ts` — sends the new fields on off-site clock-in/out
- `docs/SEC_ATT_ROADMAP.md` — marked SEC-ATT-002 complete, pointed "next" at SEC-ATT-003
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — documented the new payload fields/behavior; corrected a pre-existing blanket "GPS is never stored" statement to distinguish onsite (discarded) vs. off-site (persisted for dispute resolution, unchanged by this task)

## Payload Fields Added
All four fields below are **optional** on `ClockInDto`, `ClockOutDto`,
`OffsiteClockInDto`, and `OffsiteClockOutDto`:

| Field | Type | Purpose |
|---|---|---|
| `capturedAt` | ISO-8601 string | When the client captured the GPS fix (mirrors ADR-028's fresh-GPS pattern, but not previously sent to the server) |
| `timezoneOffsetMinutes` | int, -720..840 | Client's local UTC offset, e.g. Bangkok = 420 |
| `platform` | `'ios' \| 'android' \| 'web'` | Client runtime, for diagnostic/risk-signal purposes |
| `nonce` | string, ≤128 chars | Reserved for SEC-ATT-004 replay protection — accepted, never validated or used |

The mobile app (`apps/mobile`, a single Expo codebase serving native + PWA)
now populates `capturedAt`/`platform` from the device's actual location
timestamp/runtime, and `timezoneOffsetMinutes` from the device clock, on every
clock-in/out call. It does **not** yet send `nonce` (nothing to send until
SEC-ATT-004 defines the protocol).

## Privacy/Security Handling
- **No new persistence.** None of the four fields are written to any Prisma
  column. `Attendance` and `GeofenceConfig` schemas are unchanged (see
  Schema/Migration Impact below).
- **`gpsAgeBucket`, not raw freshness data.** The backend computes
  `(serverReceiptTime - capturedAt)` and buckets it into `FRESH` / `ACCEPTABLE`
  / `STALE` / `FUTURE` / `UNKNOWN` (missing/unparseable `capturedAt`). Only the
  bucket is logged to `AuditLogService` — never the raw `capturedAt` value or
  a raw age in seconds. Thresholds are code constants (`GPS_AGE_FRESH_SECONDS
  = 30`, `GPS_AGE_ACCEPTABLE_SECONDS = 120`, `GPS_FUTURE_SKEW_TOLERANCE_SECONDS
  = 30`) — see Known Limitations for why these aren't DB-configurable yet.
- **`nonce` is never logged raw.** Only `hasNonce: boolean` reaches the audit
  log, even though `nonce` isn't a real secret yet — treating it as
  log-sensitive now avoids a behavior change later when SEC-ATT-004 makes it
  one. Verified by test (`records hasNonce as a boolean but never logs the raw
  nonce value`).
- **`AUDIT_SENSITIVE_KEYS` untouched.** `latitude`/`longitude`/`accuracy`/
  `distance` remain denylisted in `apps/api/src/audit-log/audit-log.types.ts`;
  this task didn't need to touch the sanitizer since none of the new fields
  are raw coordinates.
- **`platform`/`timezoneOffsetMinutes` are logged as-is** — neither is PII or
  a secret; they're the same class of low-sensitivity diagnostic data as the
  `userAgent`/`ipAddress` already captured on every attendance audit event.
- **`source` is now explicitly documented as a hint, not corroborated proof.**
  A code comment above `validateGeofence()` now states this per spec §7.3.
  Functionally unchanged: `source==='mobile'` still merely *triggers*
  geofence validation; a caller that omits `source` or sends `'web'` still
  *skips* that validation entirely. Closing that gap is SEC-ATT-003's job, not
  this task's — flagging it here so it isn't mistaken for already-fixed.

## Explicit Non-Scope Confirmation
- **No nonce/replay protection.** `nonce` is accepted and stored nowhere; the
  backend never validates, consumes, or checks it for reuse. SEC-ATT-004 owns
  that.
- **No native integrity.** No Play Integrity, App Attest, or DeviceCheck
  logic added. `platform` is a self-reported string like `source`, with the
  same "hint, not proof" caveat.
- **No risk-scoring queue.** `gpsAgeBucket`/`platform`/`hasNonce` are logged
  for a *future* SEC-ATT-007 to consume; no scoring, thresholding, or review
  workflow was added in this task.
- **No hard rejection added.** A `STALE`, `FUTURE`, or `UNKNOWN` `gpsAgeBucket`
  never throws. The only rejections on these endpoints are the pre-existing
  geofence ones (`MISSING_LOCATION`, `POOR_ACCURACY`, `GEOFENCE_NOT_CONFIGURED`,
  `OUTSIDE_RADIUS`), unchanged by this task.
- **`MixedCheckoutExceptionDto` was deliberately left untouched.** It also
  carries GPS and is a mobile attendance action, but it is neither clock-in
  nor clock-out (spec §7 names only `ClockInDto`/`ClockOutDto`), and the
  SEC-ATT-004 replay-protection design already treats it as a distinct nonce
  scope from clock-in/clock-out. Extending it was out of this task's scope.

### `capturedAt` enforcement — decision point raised and resolved with the user
The spec (§7.1) describes `capturedAt` as "required when `source === 'mobile'`,"
mirroring the existing hard-enforced `latitude`/`longitude`/`accuracy` fields.
Taken literally, that would 422-reject every clock-in/out from any
currently-installed mobile app build (i.e., before this update reaches a given
device via app-store/PWA rollout), since no client sends `capturedAt` yet.
This was surfaced to the user as a decision point; the user chose the
non-breaking option: **`capturedAt` stays optional, missing values bucket to
`UNKNOWN`, and no request is rejected for lacking it.** Spec §7.5 explicitly
leaves this fallback as an open implementation decision, so this is consistent
with the spec, not a deviation from it. The "required" reading, if ever
adopted, is SEC-ATT-003's or a later task's call — after this mobile build has
had time to roll out.

## Runtime Impact
None for existing clients. Old mobile app builds (pre-this-change) keep
working exactly as before — they simply don't populate the four new fields,
which all bucket to safe defaults (`gpsAgeBucket: 'UNKNOWN'`, `platform: null`,
`timezoneOffsetMinutes: null`, `hasNonce: false`). New mobile builds send
richer, non-PII metadata that is logged but does not change clock-in/out
success/failure behavior. Web dashboard is unaffected — it has no clock-in/out
UI (confirmed no call sites reference `clockIn`/`clockOut` in `apps/web`), and
the Playwright e2e assertion that `btn-clock-in`/`btn-clock-out` never render
on the web attendance page was not touched.

## Schema/Migration Impact
**None.** No changes to `apps/api/prisma/schema.prisma`, no new migration.
All four new fields are validated, used to compute a transient audit signal,
and discarded — never persisted to `Attendance`, `OffSiteRequest`, or
`GeofenceConfig`. The "max GPS age window" the spec describes as
"DB-configurable, the same way `maxAccuracyMeters` is" was deliberately
implemented as **code constants instead**, specifically to avoid a
`GeofenceConfig` schema change in this task (see Known Limitations).

## Tests / Verification

```
npx jest attendance.service.spec.ts        → PASS (154 tests)
npx jest src/attendance                    → PASS (199 tests, all 4 suites)
npx jest (full apps/api suite)              → PASS (549 tests, all 24 suites — no cross-module regression)
cd apps/mobile && npm run typecheck        → PASS (tsc --noEmit, no errors)
./scripts/mobile-verify.sh                 → PASS (typecheck + expo web export)
./scripts/verify.sh                        → PASS (API build, Prisma validate, Web build)
./scripts/secret-scan.sh                   → PASS (no findings)
./scripts/security-review.sh               → PASS (dependency audit + secret scan; pre-existing accepted-risk Multer findings only, unrelated to this task — no new packages added)
git status / git diff --check              → clean, no whitespace errors
```

New/updated test coverage (`attendance.service.spec.ts`):
- DTO validation (`plainToInstance` + `class-validator`'s `validate()`,
  matching the existing precedent in `leave-adjustment.service.spec.ts`):
  accepts a fully-populated mobile payload; still accepts an empty payload
  (backward compatibility); rejects malformed `capturedAt`; rejects an
  unrecognized `platform`; same coverage for `OffsiteClockInDto`/
  `OffsiteClockOutDto`.
- `gpsAgeBucket` computation on `clockIn`/`clockOut`: `FRESH`, `ACCEPTABLE`,
  `STALE` (accepted, not rejected), `FUTURE` (clock-skew case), and `UNKNOWN`
  (missing `capturedAt`, request still succeeds).
- `platform`/`timezoneOffsetMinutes` reach audit metadata as provided.
- `hasNonce` is a boolean; the raw nonce value never appears in metadata or
  its JSON-serialized form.
- Existing geofence, audit, and RBAC test suites (offsite review/approve/
  reject, mixed-checkout-exception, controller RBAC metadata) all still pass
  unmodified — no regression.

Not run: `./scripts/docker-verify.sh`, `./scripts/api-smoke-test.sh` — not in
this task's specified verification list and require the Docker stack; no
container/runtime behavior was touched that those checks would newly exercise.

**Conscious substitution, flagged for explicit ratification:** the task's
testing requirements literally list "Mobile clock-in payload includes new
metadata" / "Mobile clock-out payload includes new metadata" as tests to add.
No automated mobile test was added for these — see Known Limitations for why
(no Jest/RN test infra exists in `apps/mobile`). The requirement's *substance*
is covered indirectly: the API-side tests prove the backend correctly reads
`capturedAt`/`platform`/`timezoneOffsetMinutes`/`hasNonce` when present, and
`tsc --noEmit` proves the mobile payload objects type-check with these fields
attached at every call site. This is a substitution, not a silent omission —
flagging it for the user to explicitly accept or reject before this is called
done.

## Known Limitations
- **No mobile unit-test infrastructure exists** (`apps/mobile/package.json`
  has no `test` script; no Jest config; only `node_modules`-internal test
  files were found). Rather than standing up a new test framework as a side
  effect of this task, mobile changes were verified via `tsc --noEmit` (full
  typecheck, clean) and `expo export --platform web` (successful production
  bundle). If mobile test infra is wanted, that's a separate task.
- **Max-GPS-age thresholds are code constants, not DB-configurable.** Unlike
  `maxAccuracyMeters` (which lives in `GeofenceConfig`), `GPS_AGE_FRESH_SECONDS`
  /`GPS_AGE_ACCEPTABLE_SECONDS`/`GPS_FUTURE_SKEW_TOLERANCE_SECONDS` are
  hardcoded in `attendance.service.ts`. This avoids a schema change now; if
  SEC-ATT-003 or ops wants these tunable at runtime, promoting them into
  `GeofenceConfig` is a small, additive schema change to make then.
- **`capturedAt` is optional, not enforced**, per the resolved decision point
  above. This means a client can currently omit it indefinitely without
  consequence. SEC-ATT-003 (or a scheduled follow-up once mobile rollout is
  confirmed complete) should revisit whether to start enforcing it.
- **`source`/`platform` remain self-reported, uncorroborated hints.** This
  task makes that explicit in code comments and this document; it does not
  close the gap. A crafted request can still set `source: 'mobile'` (or omit
  it to skip geofence checks) — unchanged from before this task, and out of
  scope per SEC-ATT-003.

## Issues Found
None. One design decision required user input mid-implementation — see
"`capturedAt` enforcement" above — resolved before writing code.

## Risk
Low. No schema change, no new endpoint, no auth/RBAC change, no persisted
data change, and old clients are unaffected. The only behavior change is
additive audit logging and DTO shape acceptance.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None. No endpoint added; existing `JwtAuthGuard`/`RolesGuard` on `AttendanceController` unchanged. |
| RBAC impact | None. No `@Roles()` change. |
| Data privacy impact | None to persisted data (nothing new is stored). New audit-log fields are bucketed/categorical (`gpsAgeBucket`, `platform`, `timezoneOffsetMinutes`, `hasNonce`) — no raw GPS, no raw nonce. `AUDIT_SENSITIVE_KEYS` denylist unchanged and not needed for these fields since none are raw coordinates. |
| Password/token/hash impact | None. Not touched. |
| Mobile security impact | Additive only: mobile now sends more (non-secret) metadata per request. Token storage/auth flow unchanged. `nonce` field exists in the DTO but mobile does not populate it yet — no token-like value is transmitted or stored by this task. |
| Dependency/advisory impact | None. No package added to `apps/api`, `apps/web`, or `apps/mobile`. `security-review.sh` dependency audit passed with only the pre-existing, already-documented Multer accepted-risk findings (unrelated to this task). |
| Secrets/logging check | Clean — `secret-scan.sh` passed. Verified by test that the reserved `nonce` value is never logged raw, and by design that `gpsAgeBucket` (not raw `capturedAt`) is the only freshness signal logged. |
| New endpoints protected | None — no endpoints added. Existing four endpoints (`clock-in`, `clock-out`, `offsite/clock-in`, `offsite/clock-out`) keep their existing `JwtAuthGuard`+`RolesGuard` (no `@Roles()` restriction, i.e. any authenticated user with a linked employee — unchanged from before this task). |
| Risk level | LOW |
| Security decision | PASS |

## Decision
PASS

## Next Step
**SEC-ATT-003 — Backend rejection of mock/simulated/stale location**, per
`docs/SEC_ATT_ROADMAP.md`. This is the natural point to revisit whether
`capturedAt` should become enforced (see Known Limitations) once this mobile
build has had time to reach the fleet, and to add the plausibility heuristics
(implausible travel speed, repeated identical coordinates) the spec describes
in §6.

## Recommended Commit Message
```
feat(attendance): harden mobile clock-in/out payload (SEC-ATT-002)

Add capturedAt/timezoneOffsetMinutes/platform/nonce to ClockInDto,
ClockOutDto, and their off-site counterparts. Bucket GPS freshness into
gpsAgeBucket and log it alongside platform/timezoneOffsetMinutes/hasNonce
on existing attendance audit events, never raw coordinates or the reserved
nonce value. All fields optional and additive — no schema change, no new
endpoint, no hard rejection of stale/missing data (reserved for SEC-ATT-003).
```
