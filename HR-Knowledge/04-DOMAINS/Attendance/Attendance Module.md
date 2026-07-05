# Attendance Module

## Purpose

Tracks daily employee attendance via clock-in and clock-out. Evaluates whether an arrival was on-time or late using the Asia/Bangkok timezone. Stores all timestamps in UTC.

## Module Path

`apps/api/src/attendance/`

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /attendance/clock-in | ✅ | Any | Clock in for today (Bangkok rules) |
| POST | /attendance/clock-out | ✅ | Any | Clock out for today |
| GET | /attendance/geofence-config | ✅ | SUPER_ADMIN, HR_ADMIN | Fetch effective geofence config (DB or env) |
| PATCH | /attendance/geofence-config | ✅ | SUPER_ADMIN, HR_ADMIN | Update geofence config in DB |
| GET | /attendance/me | ✅ | Any | Own attendance history (paginated) |
| GET | /attendance | ✅ | SUPER_ADMIN, HR_ADMIN | All attendance records (paginated) |
| GET | /attendance/:id | ✅ | Any (owner or admin) | Single attendance record |
| POST | /attendance/offsite/mixed-checkout-exception | ✅ | Any | Submit mixed checkout exception (ONSITE check-in + off-site check-out) |
| GET | /attendance/offsite-review | ✅ | SUPER_ADMIN, HR_ADMIN | List pending off-site / mixed checkout records for review |
| PATCH | /attendance/offsite-review/:id/approve | ✅ | SUPER_ADMIN, HR_ADMIN | Approve pending record |
| PATCH | /attendance/offsite-review/:id/reject | ✅ | SUPER_ADMIN, HR_ADMIN | Reject pending record (reason required) |

Note: geofence-config routes are declared before `/me` and `/:id` in the controller to avoid `ParseUUIDPipe` conflicts.

## Web vs. Mobile Clock Channel (v1.2.66)

As of `v1.2.66-disable-web-clock-actions`, the Web/Admin `/attendance` page no
longer offers clock-in/out actions. **STEP Connect Mobile/PWA is the only
supported channel for clock-in/out.** This is a **frontend-only UX policy
change** — see [[ADR-029 Web vs Mobile Attendance Clock Policy]]:

- `POST /attendance/clock-in` / `POST /attendance/clock-out` are **unchanged**
  and remain open to any authenticated role at the API level (mobile calls them
  directly) — the RBAC matrix in [[RBAC Rules]] is not affected
- Web `/attendance` is now **view/review/history only**: today's attendance
  summary (read-only), own history with date filters, and (for admins) the
  global attendance list and off-site review — all unchanged
- The removed web clock buttons are replaced by a bilingual informational panel
  directing users to STEP Connect Mobile
- Rationale: the web buttons had no GPS capture and no geofence check, unlike
  the mobile path, so they were a location-spoofing gap ("clock in from home")
- Backend geofence enforcement (below) and mobile clock-in/out are unaffected
- Follow-up: **SEC-ATT-001 Cross-Platform Attendance Anti-Spoofing** — this
  hotfix removes the UI affordance but does not add backend-side platform
  enforcement (e.g. rejecting non-mobile-sourced clock calls outright — still
  true after SEC-ATT-003, see §15 Open Question #1 in the spec).
  SEC-ATT-001 through **SEC-ATT-004** are now
  complete — see
  [docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md](../../../docs/SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md)
  for the threat model and design reference,
  [docs/CTO_SUMMARY_SEC_ATT_002.md](../../../docs/CTO_SUMMARY_SEC_ATT_002.md)
  for what SEC-ATT-002 shipped,
  [docs/CTO_SUMMARY_SEC_ATT_003.md](../../../docs/CTO_SUMMARY_SEC_ATT_003.md)
  for what SEC-ATT-003 shipped,
  [docs/CTO_SUMMARY_SEC_ATT_004.md](../../../docs/CTO_SUMMARY_SEC_ATT_004.md)
  for what SEC-ATT-004 shipped,
  [docs/SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md](../../../docs/SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md)
  (with [docs/CTO_SUMMARY_SEC_ATT_005A.md](../../../docs/CTO_SUMMARY_SEC_ATT_005A.md))
  for the **SEC-ATT-005A** Android Play Integrity feasibility &
  architecture decision — which **recommends DEFER** (Play Integrity is
  categorically unavailable on the current PWA; requires an approved native
  Android build, spec §15 Open Question #3), and
  [docs/SEC_ATT_ROADMAP.md](../../../docs/SEC_ATT_ROADMAP.md) for the full
  SEC-ATT-001 through SEC-ATT-007 sequencing

## Query Parameters (GET /attendance, GET /attendance/me)

`page` · `limit` · `startDate` · `endDate` · `status` · `employeeId` (admin list only)

## Business Rules

### LATE Rule

| Clock-in time (Asia/Bangkok, UTC+7) | Status |
|---|---|
| 08:30:00 or earlier | PRESENT |
| 08:30:01 or later | LATE |

Exactly 08:30:00 = PRESENT. Strictly after 08:30 = LATE.

### Schedule Reference

- Current work schedule: `08:30–17:30`

### Timezone Implementation

```typescript
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no DST
```

No external timezone library. Thailand has no Daylight Saving Time — this constant never changes.

### Clock-in Rules

- Employee must have a linked `Employee` record (via `userId`) — 400 if not linked
- Only one clock-in per employee per day. Duplicate clock-in returns 409.
- `status` (PRESENT or LATE) is computed server-side at clock-in time and stored

### Clock-out Rules

- Employee must have clocked in for today before they can clock out — 400 otherwise
- Clock-out does not change the `status` (PRESENT/LATE was set at clock-in)

### ABSENT Status

`ABSENT` is not automatically assigned. It is only recorded if explicitly created via an admin action. No automatic absent-marking job exists in v1.0.

## Attendance Status Enum

`PRESENT` · `LATE` · `ABSENT`

## Ownership Checks

- `GET /attendance/:id` — service checks that the requesting user owns the record; admin bypass
- `POST /attendance/clock-in|clock-out` — bound to own employee via `requireEmployeeId(userId)`

## Work Mode

Attendance records now carry a `workMode` field (`ONSITE | OFFSITE`). Default is `ONSITE`. Pass `workMode: "OFFSITE"` in the clock-in body to record off-site attendance.

Off-site clock-in requires a pre-approved `OffSiteRequest` for the employee and today's date. See [[Off-site Work Mode]] for full details.

## Mobile Geofence

The attendance module enforces location-based clock-in/out for mobile users. See [[Attendance Geofence]] for full details.

Summary:
- `source: "mobile"` in clock-in/out body triggers **company-radius** geofence validation (ONSITE mode) — this radius gate is unaffected by SEC-ATT-003's source-omission fix (see below); the SEC-ATT-003 payload-integrity checks (stale/future/invalid `capturedAt`, `isMockLocation`) are separate and run regardless of `source`
- `workMode: "OFFSITE"` bypasses the radius check at clock-in (approved request required)
- Clock-out is always geofence-validated regardless of work mode
- Backend validates employee GPS against the configured company location
- Onsite (`COMPANY_GEOFENCE`) employee GPS is never stored; backend validates and discards it. Off-site clock-in/out **does** persist raw coordinates on the `Attendance` row for dispute resolution — see [[Off-site Work Mode]]. Neither path ever writes raw GPS to `AuditLog`.
- Company geofence is configurable via `GET/PATCH /attendance/geofence-config` (admin only)
- DB config takes priority over env-var fallback
- Audit event `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` is recorded on each admin update (safe metadata — no coordinates)

### SEC-ATT-002: Mobile Payload Metadata

`ClockInDto`/`ClockOutDto`/`OffsiteClockInDto`/`OffsiteClockOutDto` accept four additional optional fields, sent by STEP Connect Mobile since this task:

- `capturedAt` (ISO-8601) — when the client captured the GPS fix
- `timezoneOffsetMinutes` — client's local UTC offset
- `platform` (`ios`/`android`/`web`) — client runtime
- `nonce` — SEC-ATT-004 replay-protection nonce; validated and enforced (see below)

All four are optional/additive for backward compatibility with mobile app builds that predate this field set. `platform`/`timezoneOffsetMinutes`/`hasNonce` (never the raw nonce) are logged as-is on the existing attendance audit events. None of these fields are persisted to the `Attendance` table — they are transient, request-scoped signals only, consistent with the existing "GPS is discarded" convention.

### SEC-ATT-003: Hard Rejection of Stale/Future/Mock Location

For **every** clock-in/out and off-site clock-in/out request — `ClockInDto`/`ClockOutDto` (any `source`, including omitted), the `workMode: OFFSITE` branch inside `clockIn`, and `OffsiteClockInDto`/`OffsiteClockOutDto` — the backend hard-rejects (422):

| Reason code | Trigger | Gated by `source`? | Gated by geofence `enabled`? | Enforcement |
|---|---|---|---|---|
| `INVALID_CAPTURED_AT` | `capturedAt` present but unparseable | No | No | Hard reject (defense-in-depth; `@IsISO8601()` on the DTO already blocks malformed values with a 400 before this runs) |
| `STALE_LOCATION` | `capturedAt` older than 120s (server receipt time) | No | No | Hard reject |
| `FUTURE_LOCATION` | `capturedAt` more than 30s in the future (clock-skew tolerance) | No | No | Hard reject |
| `MOCK_LOCATION_DETECTED` | client sets the optional `isMockLocation: true` | No | No | Hard reject — **no current production client (the PWA) sends this field**; reserved for a future native build that can read a real mock-location flag |
| `MISSING_CAPTURED_AT` | `capturedAt` absent, `source` present | No | No | **Soft-enforced only** — request still succeeds, but a separate `ATTENDANCE_CAPTURED_AT_MISSING` audit event (`result: 'ALLOWED'`) is logged |
| `MISSING_SOURCE_CAPTURED_AT` | `capturedAt` absent, `source` also absent (web, offsite, or a very old client) | No | No | Same soft-enforcement as above — distinguished in the audit trail so visibility into fleet rollout isn't lost |
| `MISSING_LOCATION` / `POOR_ACCURACY` / `GEOFENCE_NOT_CONFIGURED` / `OUTSIDE_RADIUS` (pre-existing, radius-only) | unchanged | **Yes**, `source === 'mobile'` only | **Yes** (unchanged) | Unchanged |

Hard rejection of `MISSING_CAPTURED_AT`/`MISSING_SOURCE_CAPTURED_AT` is deferred until 100% mobile fleet rollout of the SEC-ATT-002 build is confirmed — an explicit product decision, not an oversight.

**Deliberate choice: the payload-integrity checks above run regardless of the company geofence `enabled` toggle**, unlike the company-radius checks. Payload-freshness/mock-location validation is an anti-spoofing control, not a radius control — an admin turning off company-radius enforcement (e.g. no office configured yet) should not also silently turn off capturedAt/mock validation. This was confirmed against the live environment during SEC-ATT-003 implementation: the running `GeofenceConfig` had `enabled: false`, which would have made the first implementation (gated behind `enabled`, matching the older checks) completely inert — surfaced to the user and corrected before shipping.

**Post-review fix: these checks also run regardless of `source`.** The original implementation additionally gated every check on `dto.source === 'mobile'`, which review correctly identified as a manual-payload-edit bypass — a request that simply omitted `source` (or the off-site clock-in/out endpoints, which have no `source` field at all) skipped every anti-spoofing check. Payload-integrity checks now run unconditionally, extracted into `enforcePayloadIntegrity()` and called from `clockIn` (before the `workMode` branch), `clockOut`, `clockInOffsite`, and `clockOutOffsite`. Only the **company-radius** checks (`MISSING_LOCATION`/`POOR_ACCURACY`/`GEOFENCE_NOT_CONFIGURED`/`OUTSIDE_RADIUS`) remain `source === 'mobile'`-gated — see [docs/CTO_SUMMARY_SEC_ATT_003.md](../../../docs/CTO_SUMMARY_SEC_ATT_003.md) for the full before/after.

Thresholds reuse the SEC-ATT-002 `gpsAgeBucket` constants unchanged (`GPS_AGE_ACCEPTABLE_SECONDS = 120`, `GPS_FUTURE_SKEW_TOLERANCE_SECONDS = 30`) — the `ACCEPTABLE` band (30–120s) still succeeds, so legitimate poor-connectivity clock-ins are not punished (spec §12 abuse-case #12).

**PWA limitation, stated explicitly:** the current STEP Connect PWA has no way to detect a mocked/simulated GPS fix — `isMockLocation` exists in the DTO for a future native build only. This is heuristic/signal-based enforcement, not device-integrity detection (that's SEC-ATT-005/006, native-only).

**Still open, not resolved by SEC-ATT-003:** whether the **company-radius** check itself should also apply to non-mobile-sourced calls — SEC-ATT-001 §15 Open Question #1 — remains unresolved. This is narrower than it used to be: a request that omits `source` can no longer skip the payload-integrity checks (fixed above), only radius enforcement. Travel-speed/implausible-movement heuristics (spec §6) are also not implemented — those are probabilistic signals reserved for the SEC-ATT-007 risk-scoring queue, not a hard-reject task.

### SEC-ATT-004: Server Nonce / Replay Protection

Mobile/PWA fetches a short-lived, single-use nonce from `POST /attendance/nonce` (body: `{ action }`, one of `CLOCK_IN` / `CLOCK_OUT` / `OFFSITE_CLOCK_IN` / `OFFSITE_CLOCK_OUT`) immediately before submitting the matching clock request, then echoes it back in the existing `nonce` field reserved by SEC-ATT-002. The response contains only `{ nonce, expiresAt, action }` — no internal hash values.

**Storage:** a new additive `AttendanceNonce` table (`attendance_nonces`) stores only a SHA-256 hash of the nonce (`tokenHash`, unique), never the raw value — the raw nonce is returned to the client once at issuance and never persisted or logged. Bound to `userId` (the actual security key), `employeeId` (best-effort, "if available"), `action`, and a 300s `expiresAt`. Postgres was chosen over the provisioned-but-unused Redis (see `CLAUDE.md` ports table) for consistency with the rest of the system's all-Postgres persistence and because the spec (§8) leaves the storage choice to this task.

**Atomic single-use consumption:** `AttendanceNonceService.consumeNonce()` performs a single conditional `updateMany({ tokenHash, userId, action, consumedAt: null, expiresAt: { gt: now } } → { consumedAt: now })`. Only one concurrent caller can flip `consumedAt` from null — this atomic update, not the diagnostic lookup that follows it on failure, is the actual replay-protection gate. The nonce is consumed **last**, immediately before the DB write, after every other check (payload integrity, geofence, dup-day) has already passed — so a nonce is only burned by a request that would otherwise have succeeded.

**Enforcement (rollout decision, explicit user sign-off):** a **missing** nonce is soft-enforced — the request still succeeds, audited as `ATTENDANCE_NONCE_MISSING` / `ALLOWED` — because `POST /attendance/nonce` is new in this task and no previously-shipped mobile/PWA build can fetch or send a real nonce yet; hard-rejecting immediately would break clock-in/out fleet-wide until every client updates. Mirrors the SEC-ATT-003 `MISSING_CAPTURED_AT` precedent. A **present** nonce, however, is always strictly enforced regardless of this toggle:

| Reason code | Trigger | Result |
|---|---|---|
| `NONCE_MISSING` | no `nonce` field sent | Soft-allowed (`ATTENDANCE_NONCE_MISSING`/`ALLOWED`) — promote to hard-reject once fleet rollout is confirmed |
| `NONCE_INVALID` | nonce hash not found (never issued, or garbage) | 422, `ATTENDANCE_NONCE_REJECTED` |
| `NONCE_EXPIRED` | present but past `expiresAt` (300s TTL) | 422 |
| `NONCE_REUSED` | already consumed (replay) | 422 |
| `NONCE_ACTION_MISMATCH` | issued for a different action (e.g. CLOCK_OUT nonce sent to clock-in) | 422 |
| `NONCE_USER_MISMATCH` | issued to a different authenticated user | 422 |

All rejections return one generic message ("Your attendance session has expired. Please try again.") — no detail that would let an attacker distinguish reused from expired from never-issued (spec §8).

**Known gap, explicitly out of scope:** `mixedCheckoutException` is **not** covered by nonce enforcement — spec §8 names it a distinct nonce scope, but this task's action list and expected-files list excluded it (mirrors the SEC-ATT-003 precedent of leaving that endpoint untouched). It remains a documented, currently-open replay surface on that one endpoint.

**No cleanup job.** Consumed/expired `AttendanceNonce` rows are never deleted — no scheduler package (`@nestjs/schedule` or similar) exists in this codebase yet. A future task should add periodic deletion of rows past `expiresAt`.

## Known Limitations

- `todayUtc()` in AttendanceService and `todayBangkok()` in Dashboard can differ 17:00–23:59 UTC
- No automatic absent-marking job (future scheduled task)
- No overtime or shift scheduling
- Geofence: single office only; GPS spoofing is not preventable at the software layer
- Web clock-in/out is disabled (v1.2.66); the backend still does not reject a non-mobile client's **radius** check outright (payload-integrity checks now apply regardless of `source` — see SEC-ATT-003 section above) — SEC-ATT-001 §15 Open Question #1, unresolved
- `MISSING_CAPTURED_AT`/`MISSING_SOURCE_CAPTURED_AT` are soft-enforced only (see SEC-ATT-003 section above) — a client can still omit `capturedAt` indefinitely without being blocked, by design, pending confirmed mobile rollout
- `isMockLocation` has no real-world sender today (PWA cannot produce this signal); it only takes effect once a future native build populates it
- `NONCE_MISSING` is soft-enforced only (SEC-ATT-004, mirrors the SEC-ATT-003 rollout pattern) — a client can omit the nonce entirely without being blocked, by design, pending confirmed mobile fleet rollout
- `mixedCheckoutException` is not covered by SEC-ATT-004 nonce enforcement — a captured mixed-checkout-exception request remains replayable; spec §8 names it as a distinct nonce scope but it was out of this task's scope
- No scheduled cleanup of expired/consumed `AttendanceNonce` rows — the table grows unboundedly until a future janitor task is added
- **Device/app integrity (Play Integrity) is unavailable on the current PWA** — SEC-ATT-005A assessed it and **recommends DEFER**: Play Integrity is a native Android API bound to a signed, Play-registered package with no browser entry point, so it cannot run on the PWA-only STEP Connect surface and reports `deviceIntegritySignal: UNAVAILABLE`. Implementation (SEC-ATT-005) is blocked until a native Android build strategy is approved (spec §15 Open Question #3). Mock-GPS / rooted-device / emulator threats therefore remain heuristic-only on the PWA. See [docs/SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md](../../../docs/SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md)

## Related ADRs

- [[ADR-010 Attendance Timezone]]
- [[ADR-006 RBAC]]
- [[ADR-020 Attendance Geofence and Admin Configuration]]
- [[ADR-022 Off-site Work Request Workflow]]
- [[ADR-027 Mixed Attendance Checkout Exception Workflow]]
- [[ADR-028 Fresh GPS Requirement for Attendance Actions]]
- [[ADR-029 Web vs Mobile Attendance Clock Policy]]

## Related Notes

- [[Attendance Rules]]
- [[Attendance Geofence]]
- [[Off-site Work Mode]]
- [[Mixed Checkout Exception]]
- [[Dashboard Module]]
- [[API Route Index]]
- [docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md](../../../docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md) — production migration-drift recovery for the `AttendanceSource`/off-site attendance fields migration; schema unaffected
- [docs/SEC_ATT_ROADMAP.md](../../../docs/SEC_ATT_ROADMAP.md) — SEC-ATT-001 through SEC-ATT-007 sequencing

#domain #attendance #backend-v1 #timezone #geofence #off-site #mixed-checkout
