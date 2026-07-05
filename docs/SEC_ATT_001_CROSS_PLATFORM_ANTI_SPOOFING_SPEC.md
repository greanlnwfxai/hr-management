# SEC-ATT-001 — Cross-Platform Attendance Anti-Spoofing Spec

> Status: SPECIFICATION ONLY — no code, schema, migration, route, or UI changes.
> Defines the threat model and phased plan for SEC-ATT-002 through SEC-ATT-007.
> See [SEC_ATT_ROADMAP.md](SEC_ATT_ROADMAP.md) for the canonical item order and
> [ADR-029](adr/ADR-029-web-vs-mobile-attendance-clock-policy.md) for the policy
> this spec follows up on.

---

## 1. Purpose

The Web/Admin attendance page no longer offers clock-in/out actions
(ADR-029, `v1.2.66`). STEP Connect Mobile/PWA is now the only supported
attendance-clock channel. That change closed the UI-layer gap (a browser
button with no GPS capture and no geofence check) but explicitly left a
backend-layer gap open: `POST /attendance/clock-in` and
`POST /attendance/clock-out` remain callable by any authenticated user, and
geofence enforcement activates only when the request body sets
`source: "mobile"` — a self-reported string, not a verified platform signal.

This document defines:

- The full threat model for attendance clock-in/out spoofing across web,
  mobile PWA, and future native clients.
- What each platform can and cannot prove today, and what backend validation
  can compensate for without native capability.
- A phased hardening plan (SEC-ATT-002 through SEC-ATT-007) with concrete
  backend validation rules, a mobile payload contract, a replay-protection
  design, and a native device-integrity roadmap.
- Privacy constraints that any implementation of the later items must honor.
- PASS/HOLD criteria so each future implementation task can be judged against
  a fixed bar rather than ad hoc review.

This spec makes no code, schema, or behavioral change. It is the design
reference for SEC-ATT-002 through SEC-ATT-007.

---

## 2. Current System Context

Grounded in the current codebase and prior ADRs, not aspirational:

- **Clock-in/out endpoints:** `POST /attendance/clock-in`,
  `POST /attendance/clock-out` (`apps/api/src/attendance/attendance.controller.ts`).
  Guarded by `JwtAuthGuard` + `RolesGuard` at the class level, but **no
  `@Roles()` restriction** — any authenticated user with a linked `Employee`
  record can call them. There is no rate limiting on these endpoints (unlike
  `POST /auth/login`, which has `LOGIN_THROTTLE_TTL`/`LOGIN_THROTTLE_LIMIT`).
- **Request payload (`ClockInDto`/`ClockOutDto`):** `note?`, `source?: "web" |
  "mobile"`, `latitude?`, `longitude?`, `accuracy?`, `workMode?` (clock-in
  only). All location fields are optional at the DTO level; "location
  required" is enforced conditionally in the service, only when
  `source === "mobile"`.
- **`source` is self-reported.** The mobile app hardcodes the literal string
  `source: "mobile"` in client code (`apps/mobile/src/hooks/useAttendance.ts`).
  It is not derived from any signed or verifiable platform signal. Any HTTP
  client — including `curl` — can set `source: "mobile"` with fabricated
  coordinates, or omit `source` entirely to bypass geofence validation
  altogether (web/legacy path skips `validateGeofence()` unconditionally).
- **Geofence enforcement:** `validateGeofence()` in
  `apps/api/src/attendance/attendance.service.ts` runs only when
  `source === "mobile"`. Order: missing location fields → 422; accuracy worse
  than `maxAccuracyMeters` → 422; company coordinates not configured → 422;
  Haversine distance beyond `radiusMeters` → 422 (`OUTSIDE_RADIUS`). Config is
  DB-first (`GeofenceConfig` singleton) with env-var fallback.
  See [ATTENDANCE_GEOFENCE_BACKEND.md](ATTENDANCE_GEOFENCE_BACKEND.md).
- **Server-authoritative time.** Neither DTO accepts a client timestamp.
  `checkIn`/`checkOut` are always `new Date()` at the moment the server
  processes the request. The recorded attendance *time* cannot be forged by
  the client today. (This is distinct from GPS *freshness*, which the client
  does control — see §4 "Stale GPS payload".)
- **No replay/nonce protection.** A captured request (headers + body) can be
  resent. The only incidental protection is business-logic dedup: a second
  clock-in for the same employee/day returns `409 Already clocked in for
  today`. This is not a security control — it does not protect clock-out,
  the mixed-checkout-exception endpoint, or a replay sent *before* the
  legitimate request.
- **Audit events today:** `ATTENDANCE_CLOCK_IN`, `ATTENDANCE_CLOCK_OUT`,
  `ATTENDANCE_GEOFENCE_REJECTED` (mobile-only, see
  [SPEC_T064](SPEC_T064_FAILED_GEOFENCE_ATTEMPT_AUDIT.md)),
  `ATTENDANCE_GEOFENCE_CONFIG_UPDATED`. All go through
  `AuditLogService`, which sanitizes metadata against `AUDIT_SENSITIVE_KEYS`
  (`apps/api/src/audit-log/audit-log.types.ts`) — a denylist that already
  includes `latitude`, `longitude`, `accuracy`, `distance` alongside
  password/token fields. `ipAddress` and `userAgent` are already captured on
  every attendance audit event.
- **Raw GPS storage — three distinct behaviors, not one:**
  1. **Onsite (`COMPANY_GEOFENCE`) clock-in/out:** GPS is used transiently for
     the Haversine check and discarded. Never persisted to `Attendance`,
     never written to `AuditLog`.
  2. **Off-site (planned/unplanned) clock-in/out:** raw
     `checkInLatitude`/`checkInLongitude`/`checkInAccuracyMeters`/
     `checkInDistanceFromCompanyMeters` (and `checkOut*` equivalents) **are**
     persisted on the `Attendance` row itself, for dispute resolution. This
     data is visible via `GET /attendance/:id` to the owner and
     SUPER_ADMIN/HR_ADMIN, but excluded from the MANAGER/HR
     `offsite-review` list/detail responses.
  3. **`AuditLog`:** raw GPS never appears here, for either path — enforced
     by the sanitizer denylist as defense-in-depth on top of caller
     discipline.

  Any SEC-ATT-002–007 design must preserve this distinction rather than
  collapsing it into a single "GPS is/isn't stored" claim.

- **Mobile client (STEP Connect):** Expo Router app, delivered today as an
  installable PWA (`apps/mobile`, `ADR-025`). On web, GPS acquisition
  bypasses `expo-location` and calls `navigator.geolocation` directly with
  `maximumAge: 0` (`ADR-028`) to avoid a stale-cache bug. On native
  (iOS/Android), it uses `expo-location`'s `Accuracy.High`. **No native
  binary is currently built or distributed** — the `Platform.OS !== 'web'`
  branch exists in code but is not exercised by any shipped build today.
- **Web dashboard:** confirmed in code — `apps/web/app/(app)/attendance/page.tsx`
  contains no clock-in/out handlers; only a static `data-testid=
  "mobile-only-notice"` panel remains (ADR-029).

---

## 3. Scope / Non-Scope

### In scope (this document)

- Threat model for clock-in/out spoofing across all current and near-term
  client surfaces.
- Platform capability analysis (what each surface can/cannot prove).
- Design-level backend validation rules for SEC-ATT-002/003.
- Design-level replay/nonce protection for SEC-ATT-004.
- Native device-integrity roadmap for SEC-ATT-005/006 (definition only — no
  native build work here).
- Privacy constraints binding all later implementation items.
- Abuse-case test plan to validate later items.
- PASS/HOLD criteria for SEC-ATT-002 through SEC-ATT-007.

### Out of scope (this document)

- Any code, DTO, schema, migration, or route change.
- Any change to mobile, web, or API runtime behavior.
- Committing to Play Integrity or App Attest as *fully enforced* on the
  current PWA — both require a native app or native wrapper (§9). This spec
  does not claim otherwise.
- Deciding whether the backend should outright reject non-mobile-sourced
  clock calls (ADR-029's stated follow-up question) — this is an open
  question for a later item, not resolved here (§15).
- Choosing a specific nonce-store technology (Redis, DB table, in-memory) —
  candidates are named in §8, the decision is deferred to SEC-ATT-004.

---

## 4. Threat Model

Each entry: description, current defense (if any), residual risk, and the
item that is expected to close or reduce the gap.

| # | Threat | Current defense | Residual risk today | Addressed by |
|---|---|---|---|---|
| 1 | **Mock GPS app** (Android developer-options mock provider, or third-party spoofing app) | None. Backend cannot distinguish a real fix from a mock provider on a PWA. | High — coordinates inside the geofence are indistinguishable from real ones. | SEC-ATT-003 (heuristic only on web/PWA), SEC-ATT-005/006 (native signal, when a native build exists) |
| 2 | **Simulated location** (iOS Simulator / Android emulator location override, used against a non-native client) | None. | High in dev/test contexts; low relevance in production if native builds are gated by store review, but PWA remains exposed regardless. | SEC-ATT-003 (heuristic), SEC-ATT-005/006 (native) |
| 3 | **Browser/devtools spoofed geolocation** (Chrome DevTools "Sensors" override, geolocation API polyfill/override) | None — the PWA calls `navigator.geolocation` directly; nothing verifies the browser isn't lying. | High — this is the lowest-effort spoofing path against the current PWA. | SEC-ATT-003 (heuristic signals only — a browser fundamentally cannot attest to itself); native app removes this vector entirely for users on the native build |
| 4 | **Stale GPS payload** (cached fix reused across requests) | Client-side only: `ADR-028` forces `maximumAge: 0` on the web GPS acquisition path. The server has no way to verify freshness — there is no client capture-timestamp field today. | Medium — a modified/non-standard client can ignore the freshness hint entirely; server cannot detect it. | SEC-ATT-002 (add a client capture-timestamp field + server-side max-age check) |
| 5 | **Replay attack** (resending a previously captured valid request) | Incidental only: same-day duplicate clock-in/out returns 409. Does not protect clock-out timing, the mixed-checkout-exception endpoint, or replay before the first legitimate request lands. | Medium-High — a captured request (e.g. via a compromised network, malware, or a shared device) can be resent to forge an attendance action. | SEC-ATT-004 (server nonce/challenge) |
| 6 | **Copied payload from another device/session** (valid employee token + coordinates captured once, reused from a different device/location) | None beyond JWT validity (8h expiry). | Medium-High — overlaps with replay; a stolen token plus a single captured payload can be reused repeatedly until nonce protection lands. | SEC-ATT-004 |
| 7 | **Manually edited request payload** (`curl`/Postman with fabricated `source`, coordinates, or accuracy) | Partial — DTO-level bounds validation (`-90..90`, `-180..180`, positive accuracy) reject malformed values, but plausible fabricated values pass. `source` omission bypasses geofence entirely. | High — this is the primary gap ADR-029's follow-up calls out. | SEC-ATT-002 (payload hardening), SEC-ATT-003 (plausibility checks) |
| 8 | **Low accuracy GPS** (poor fix used to pass a boundary check by chance) | Enforced: `accuracy > maxAccuracyMeters` → 422, both client-side (mobile UX gate) and server-side (authoritative). | Low — already well covered. | No change needed; SEC-ATT-003 may add plausibility checks on top |
| 9 | **Geofence edge case** (legitimate employee near the radius boundary, GPS jitter causes intermittent rejection) | Partial — `maxAccuracyMeters` reduces false rejections; radius is admin-configurable. | Low-Medium — a UX/support cost, not a security gap. | Not primarily a SEC-ATT concern; noted for SEC-ATT-007 risk-scoring context (repeated boundary rejections vs. deliberate spoofing pattern) |
| 10 | **Clock-in/out from unsupported web surface** (Web/Admin dashboard, or a raw API client claiming `source: "web"` or omitting it) | UI-layer only: ADR-029 removed the web dashboard buttons. Backend endpoints remain open at the API level to any authenticated caller. | High at the API layer — the endpoint has no platform enforcement, only a removed UI affordance. | SEC-ATT-002/003 backend hardening; open question in §15 on whether to reject non-mobile `source` outright |
| 11 | **Rooted/jailbroken/high-risk device** | None. No device-integrity signal is collected today. | High — cannot be assessed at all without a native attestation API. | SEC-ATT-005 (Play Integrity), SEC-ATT-006 (App Attest/DeviceCheck) — native-only |
| 12 | **Device integrity bypass** (attestation API present but circumvented via a modified OS, Magisk hide, emulator passthrough, etc.) | N/A today. | Unknown until native attestation exists; even Play Integrity/App Attest are not 100% bypass-proof. | SEC-ATT-005/006, feeding into SEC-ATT-007 risk scoring rather than a binary allow/deny |
| 13 | **Time manipulation** (client device clock set incorrectly or deliberately, used to reason about "freshness") | Not applicable to the *recorded* attendance time — that's always server `new Date()`. Applicable to any future client-supplied capture-timestamp used for freshness checks. | Low today (no client timestamp exists yet); becomes Medium once SEC-ATT-002 adds one, unless bounded against server receipt time. | SEC-ATT-002 — validate client capture-time against **server receipt time**, not client clock alone, within a bounded skew window |
| 14 | **Offline/poor network scenarios** (request delayed/queued, then sent late; GPS fix acquired long before submit due to retry) | Partial — ADR-028 re-acquires GPS at submit time in the exception/off-site screens, not purely at mount. Standard clock-in/out screens are simpler and less exposed to this specific mount-vs-submit gap. | Low-Medium — mostly a UX/false-rejection concern once SEC-ATT-002's max-GPS-age check lands; must be tuned to not punish legitimate poor-connectivity users. | SEC-ATT-002 (age window sizing), SEC-ATT-007 (risk scoring instead of hard rejection for borderline cases) |
| 15 | **Shared account/session misuse** (employee shares credentials, or a manager/admin uses another employee's device while authenticated) | Partial — JWT ties the action to `actorUserId`; `requireEmployeeId(userId)` binds the action to the caller's own employee record; there is no cross-check against a known/registered device. | Medium — the system already prevents clocking in *as* someone else via API identity, but cannot detect "employee handed their unlocked phone/session to a coworker." | Largely an HR/process control, not fully solvable by SEC-ATT-002–007; SEC-ATT-007 risk scoring can surface anomalous patterns (e.g. device/location inconsistent with recent history) for human review |

---

## 5. Platform Capability Matrix

| Platform | Detectable now | Cannot reliably detect | Backend-enforceable | Requires native capability | Recommended phase |
|---|---|---|---|---|---|
| **Web dashboard** (`apps/web` `/attendance`) | N/A — clock actions removed from UI (ADR-029) | N/A | Endpoints still callable directly; backend cannot yet distinguish this caller from a scripted client claiming `source: "mobile"` | No — this is a backend authorization/plausibility problem, not a device-integrity one | SEC-ATT-002 (payload/`source` hardening); open question in §15 on hard rejection |
| **Mobile PWA** (STEP Connect, current production surface) | Browser Geolocation API result, accuracy, coarse User-Agent string, request timing | Whether the browser/OS is genuinely reporting GPS vs. a devtools/extension override; device root/jailbreak state; app integrity | Payload shape/freshness, plausibility heuristics (impossible travel speed, repeated identical coordinates, accuracy anomalies), replay/nonce (SEC-ATT-004) | **Yes, for strong integrity** — a PWA has no equivalent of Play Integrity/App Attest. This is a hard platform ceiling, not a scoping choice. | SEC-ATT-002, 003, 004, 007 now; SEC-ATT-005/006 **not applicable** to this surface as long as it remains a PWA |
| **Android native or native wrapper** (not currently built/shipped) | Everything the PWA can detect, plus: Play Integrity verdict (device integrity, app integrity, licensing), mock-location developer flag (`Location.isFromMockProvider()` equivalent in native APIs) | Nothing fundamentally new is undetectable relative to PWA once native attestation is wired — this is the platform that closes most of §4's residual risk | All of SEC-ATT-002–004 apply identically; SEC-ATT-005 adds attestation | **Yes** — SEC-ATT-005 requires a native Android build (Expo EAS Build or bare) and a Google Play Integrity API server-side verification step | SEC-ATT-005, after a native-build decision is made (blocked, see §15) |
| **iOS native or native wrapper** (not currently built/shipped) | Everything the PWA can detect, plus: App Attest / DeviceCheck assertion (app + device integrity, replay-protected by design) | Same as Android — mostly closed once wired | Same as above | **Yes** — SEC-ATT-006 requires a native iOS build and server-side App Attest/DeviceCheck verification | SEC-ATT-006, after the same native-build decision |
| **Backend API** (`apps/api`) | Everything the client sends: coordinates, accuracy, `source`, timestamps (once added), IP address, User-Agent (already captured in audit events) | Ground truth about physical device state without a native attestation signal to consume | This is where nearly all of SEC-ATT-002, 003, 004, and 007 live — the backend is and remains the authoritative decision point (unchanged from ADR-020's original design principle) | No — backend hardening requires no native capability and should land first | SEC-ATT-002, 003, 004, 007 — no native dependency |

**Key takeaway, stated explicitly per the task's guardrail:** a PWA/web
client cannot strongly prove device integrity — there is no browser-JS
equivalent of Play Integrity or App Attest. SEC-ATT-005/006 are **not**
achievable against the current STEP Connect PWA; they require a native app
or native wrapper build to exist first, which is a separate,
not-yet-made product decision (see §15). Backend hardening (SEC-ATT-002,
003, 004, 007) requires no such decision and should proceed first.

---

## 6. Backend Validation Strategy

Design-level rules for **SEC-ATT-002** (payload hardening) and
**SEC-ATT-003** (mock/simulated/stale location rejection). No implementation
in this document.

| Rule | Design | Rationale |
|---|---|---|
| **Required timestamp** | Add an optional client `capturedAt` (ISO-8601) field to `ClockInDto`/`ClockOutDto`, populated at the moment GPS was read (mirrors the existing submit-time re-acquisition pattern from ADR-028). Required when `source === "mobile"`, same conditional pattern as `latitude`/`longitude`/`accuracy` today. | Enables freshness checking without trusting the client's own clock in isolation (see next rule). |
| **Server-time comparison** | Compare `capturedAt` against server receipt time (`Date.now()` at request handling), not against the client's self-reported "now." Bound the skew: reject if `capturedAt` is in the future beyond a small tolerance (clock drift allowance, e.g. low tens of seconds — exact value is an SEC-ATT-002 implementation decision, not fixed here). | Prevents a client from claiming an arbitrarily old-but-labeled-fresh fix by lying about its own clock (threat #13). |
| **Max GPS age window** | Reject if `(server receipt time) - capturedAt` exceeds a configurable threshold (candidate: low tens of seconds, tunable via env/DB config the same way `maxAccuracyMeters` is today). | Directly addresses stale GPS payload (threat #4) and offline/queued-request replay of an old fix (threat #14). Must be tuned against real network latency to avoid punishing legitimate poor-connectivity users — an abuse-case test target (§12). |
| **Accuracy threshold** | Already enforced (`maxAccuracyMeters`); no change proposed. Continue to reject worse-than-threshold accuracy before evaluating radius. | Existing control is sound; SEC-ATT-002/003 should not weaken it. |
| **Suspicious source/client metadata** | Log and evaluate (not necessarily hard-reject in SEC-ATT-003) `userAgent` shape anomalies (e.g., missing entirely, or a pattern inconsistent with a browser/Expo runtime), and IP-address-to-employee-history inconsistency, as **risk signals** feeding SEC-ATT-007, not as a standalone block in SEC-ATT-003. | User-Agent and IP are both trivially spoofable — treating them as hard gates would be a false sense of security; they are useful only as one signal among several. |
| **Mock/simulated location signal, when available** | On a future native build, consume the platform's mock-location flag (Android `isFromMockProvider`, iOS has no direct equivalent but App Attest/DeviceCheck cover the surrounding integrity question) and reject or flag when set. On the current PWA, **no such signal exists** — do not claim otherwise. Instead, apply heuristic plausibility checks: implausible travel speed between consecutive clock actions (distance/time exceeding a realistic max), repeated bit-identical coordinates across many requests, or accuracy values that are suspiciously "too perfect." | Preserves the "when signal is available" hedge required by the task. Heuristics are probabilistic and belong in risk scoring (SEC-ATT-007), not a hard reject, to avoid false positives against legitimate employees. |
| **Request origin/surface restrictions** | Open question (§15): whether to reject requests where `source` is omitted or `"web"` outright, now that the UI affordance is gone (ADR-029 follow-up). If adopted, this closes threat #10 at the API layer, not just the UI layer. | Not decided here — a behavior change with product implications (e.g., legitimate internal/admin tooling that might rely on the web-sourced path) needs explicit sign-off, not a spec-level default. |
| **User/session binding** | No new binding beyond existing JWT `actorUserId` + `requireEmployeeId()`. Device-binding (e.g., persisting a device fingerprint per employee and flagging first-seen devices) is a candidate for SEC-ATT-007 risk scoring, not a hard gate here — a hard device-lock would break legitimate device replacement/reinstall flows without a re-enrollment UX, which is out of scope. | Avoids introducing a support burden (locked-out employees) without first having a risk-scoring/review workflow (SEC-ATT-007) to fall back on. |
| **Nonce/challenge validation** | Deferred to SEC-ATT-004 in full (§8). Backend validation strategy here only reserves the DTO shape (an optional `nonce` field) so SEC-ATT-002's payload change and SEC-ATT-004's enforcement don't require two separate breaking client updates. | Sequencing efficiency — one client payload version, two backend enforcement phases. |
| **Safe error handling** | Preserve the existing pattern: generic, non-revealing 422 messages to the client (already true for geofence rejections); never echo back why a plausibility/replay check failed in enough detail to help an attacker calibrate (e.g., don't say "coordinates too far from your last request" — say the existing generic rejection message). | Consistent with existing `ATTENDANCE_GEOFENCE_REJECTED` design, which already avoids leaking exact distance to the client or the audit log. |
| **Privacy-safe audit logging** | Every new rejection reason must emit through the existing `recordBestEffort()` / `AuditLogService` pattern with bucketed/categorical metadata only — never raw coordinates, distance, or accuracy (already enforced by `AUDIT_SENSITIVE_KEYS`, extend the *reason* vocabulary, not the sanitizer's exemptions). See §11. | Extends, rather than weakens, the convention established by ADR-020/ADR-021/T-064. |

---

## 7. Mobile Payload Hardening Plan

Scope of **SEC-ATT-002**, design-level only:

1. **Add `capturedAt`** (ISO-8601 client GPS-capture timestamp) to
   `ClockInDto`/`ClockOutDto`, required when `source === "mobile"` — same
   conditional-required pattern already used for `latitude`/`longitude`/
   `accuracy`.
2. **Reserve (do not yet enforce) a `nonce` field** in the same DTOs, so the
   SEC-ATT-004 rollout does not require a second client-breaking payload
   change.
3. **Tighten `source` handling:** continue accepting `"web" | "mobile"` at
   the DTO level (`@IsIn`), but treat `source` as a hint requiring backend
   corroboration (payload completeness, freshness, plausibility) rather than
   a trusted platform assertion — it was never anything else, but SEC-ATT-002
   should make that explicit in validation error semantics rather than
   implicit in code comments.
4. **No change to what the client displays or decides.** The mobile app
   remains a data collector and result renderer only — consistent with the
   "backend is source of truth" principle already established in
   [ATTENDANCE_GEOFENCE_BACKEND.md](ATTENDANCE_GEOFENCE_BACKEND.md) and
   [MOBILE_GEOFENCE_CLOCK.md](MOBILE_GEOFENCE_CLOCK.md). SEC-ATT-002 does not
   introduce any client-side security *decision* — only more complete data
   collection (a capture timestamp that already conceptually exists in the
   ADR-028 fresh-GPS flow, just not sent to the server today).
5. **Backward compatibility:** `capturedAt` should be additive/optional at
   the transport level with a defined server-side fallback behavior (to be
   fixed at SEC-ATT-002 implementation time — e.g., treat a missing
   `capturedAt` from an old client build as equivalent to "unknown age," and
   decide there whether that means reject, or accept-with-risk-flag pending
   SEC-ATT-007). This spec intentionally does not fix that fallback decision,
   to avoid over-specifying an implementation detail that depends on mobile
   release/rollout timing.

---

## 8. Replay Protection Plan

Scope of **SEC-ATT-004**, design-level only:

- **Mechanism:** server-issued, single-use nonce (or challenge/response)
  bound to the employee's session and the specific clock action
  (clock-in vs. clock-out vs. mixed-checkout-exception are distinct nonce
  scopes). Client must request or receive a nonce before submitting, then
  echo it back in the request; the server invalidates it on first successful
  use and rejects any repeat.
- **Candidate storage:** the project's `docker-compose.yml` already
  provisions **Redis but marks it "not used yet"** (see `CLAUDE.md` ports
  table). Redis is a natural fit for short-TTL, single-use nonce storage, but
  this spec does **not** decide the storage mechanism — a DB-table-backed
  nonce (short-lived rows in Postgres, consistent with the rest of the
  system's current all-Postgres persistence) is an equally valid candidate.
  This decision belongs to SEC-ATT-004.
- **Scope of protection:** defeats simple request replay (threat #5) and
  reduces (but does not eliminate — a stolen token plus a *fresh* nonce
  fetch is still possible) the impact of a copied payload (threat #6),
  since a captured historical request can no longer be resent verbatim.
- **Interaction with existing dedup:** the existing same-day 409 duplicate
  check remains as a business-logic safeguard; nonce protection is
  independent and applies per-request, not per-day.
- **Failure mode:** a missing/invalid/expired/reused nonce should return the
  same class of generic 4xx used elsewhere in this flow — no detail that
  would help an attacker distinguish "nonce reused" from "nonce expired"
  from "nonce never issued."
- **Rollout consideration:** nonce enforcement is a breaking change for any
  client build that doesn't yet request/send one. This needs a compatibility
  window (e.g., soft-enforce/log-only before hard rejection) — the exact
  rollout mechanics belong to SEC-ATT-004 implementation planning, not this
  spec.

---

## 9. Native Integrity Roadmap

Scope of **SEC-ATT-005** (Android Play Integrity) and **SEC-ATT-006** (iOS
App Attest/DeviceCheck) — definition only, no build work here.

**Precondition, stated plainly:** neither item is achievable against the
current STEP Connect PWA. Both require a native app or native wrapper build
to exist and be distributed (App Store / Play Store, or an equivalent
signed-native-binary distribution channel) before there is any attestation
surface to call. STEP Connect is built with Expo Router; Expo supports
native builds via EAS Build or a bare workflow, and there are established
community/first-party integration paths for Play Integrity and App
Attest/DeviceCheck from an Expo-based app — but no such build currently
exists, is configured, or is distributed for this project. Whether and when
to invest in a native build is a **product decision outside this spec's
scope** (see §15).

| Item | What it adds | Server-side requirement | Blocked on |
|---|---|---|---|
| **SEC-ATT-005 — Android Play Integrity** | Device integrity verdict (genuine device, no known tampering), app integrity verdict (unmodified, from Play), basic/strong verdict tiers | A server-side call to Google's Play Integrity verification API per attestation token, plus a policy for what verdict tiers are acceptable vs. flagged vs. rejected (feeds SEC-ATT-007, not necessarily a hard binary gate — see threat #12) | Native Android build existing and shipped |
| **SEC-ATT-006 — iOS App Attest / DeviceCheck** | App Attest: hardware-backed key attestation proving the app instance is genuine and running on genuine Apple hardware, with built-in replay protection per assertion. DeviceCheck as a fallback/complement for lower-assurance signals. | A server-side call to Apple's attestation verification, key/assertion counter tracking to prevent assertion replay, and the same verdict-tier policy question as Android | Native iOS build existing and shipped |

**Fallback behavior when native integrity is unavailable** (i.e., the
PWA, indefinitely, and any native build before it ships): the system
continues to rely on SEC-ATT-002/003/004/007 (payload hardening, plausibility
heuristics, replay protection, risk scoring) as the full extent of its
anti-spoofing posture. This is not a temporary gap to be silent about — it
is a documented, permanent platform ceiling for as long as STEP Connect
remains PWA-only, and must be stated as such in any future implementation
task's CTO Summary (do not claim device-integrity coverage that doesn't
exist).

---

## 10. Privacy Review

### What should be stored

- Employee-linked clock-in/out records: unchanged (`Attendance` row,
  server-assigned `checkIn`/`checkOut` times, `status`, `workMode`).
- For off-site records specifically: raw GPS on the `Attendance` row,
  exactly as today — this spec does not propose expanding or narrowing that
  existing dispute-resolution design.
- New in SEC-ATT-002+: `capturedAt` (a timestamp, not a location value — safe
  to store as a normal field), and eventually a `nonce`-related consumption
  record (SEC-ATT-004; a used/expired token, not personal data beyond the
  existing session binding).
- Risk signals for SEC-ATT-007 (bucketed/categorical only — see §11), stored
  as audit metadata, not as new raw location or device-identifying fields.

### What should not be stored

- Raw coordinates or exact accuracy/distance in `AuditLog` — unchanged,
  already enforced by `AUDIT_SENSITIVE_KEYS`.
- Raw coordinates for **onsite** (`COMPANY_GEOFENCE`) clock-in/out anywhere
  persistent — unchanged; GPS remains transient/discarded for this path.
  SEC-ATT-002/003 must not change this by, e.g., logging raw coordinates as
  part of a new plausibility-check audit trail.
- Any new device-fingerprinting data beyond what's needed for the
  risk-scoring signal itself (e.g., do not store a full User-Agent string as
  a long-term device identity — bucket/hash it if device consistency
  tracking is pursued in SEC-ATT-007).
- Native attestation raw tokens beyond the verification step — store the
  verdict/outcome, not the raw attestation blob, once SEC-ATT-005/006 exist.

### How to avoid raw GPS leakage where possible

- Continue the established **bucket pattern** rather than storing raw
  numeric location-derived values. `accuracyBucket` (`UNKNOWN` /
  `ACCEPTABLE` / `POOR`) already exists (T-064/ADR-021); SEC-ATT-003 should
  introduce an analogous `distanceBucket`-style categorical signal
  (e.g., inside-radius vs. outside-radius-near vs. outside-radius-far) rather
  than a raw meters value, for any new rejection-reason metadata that
  references distance.
- **Do not follow the task prompt's literal suggestion of storing
  `distanceMeters`/`accuracyMeters` as audit fields.** `distance` and
  `accuracy` are already in `AUDIT_SENSITIVE_KEYS` and would be redacted to
  `[REDACTED]` by the existing sanitizer — proposing raw numeric fields would
  be self-defeating and would contradict the ADR-021/T-064 precedent this
  system already established. This spec deliberately resolves that conflict
  in favor of the existing, durable privacy convention.
- `gpsAgeSeconds` (derived from `capturedAt` vs. server receipt time) is
  **not** location-revealing on its own and is safe to store as a raw
  numeric audit field, unlike distance/accuracy/coordinates.

### How audit metadata should be sanitized

- No change to the sanitizer's mechanism (`audit-log.sanitizer.ts` +
  `AUDIT_SENSITIVE_KEYS`). New rejection reasons and risk signals introduced
  by SEC-ATT-002–007 must be designed to *never need* to pass a denylisted
  key in the first place (caller-enforced exclusion, same as today), with
  the sanitizer as defense-in-depth, not the primary control.

### How to record risk reasons without exposing sensitive exact location

- Categorical `reason`/`reasonCode` fields (extending the existing
  `MISSING_LOCATION` / `POOR_ACCURACY` / `GEOFENCE_NOT_CONFIGURED` /
  `OUTSIDE_RADIUS` vocabulary with new codes for stale-GPS, replay-rejected,
  implausible-travel, etc.), plus bucketed severity/confidence
  (`riskLevel`), are sufficient for HR/security review without exact
  coordinates — consistent with the existing `ATTENDANCE_GEOFENCE_REJECTED`
  design rationale (§5 of T-064).

### What should appear in user-facing errors vs. admin/security logs

- **User-facing (mobile app):** generic, actionable messages only — same
  pattern as today ("Location is required...", "GPS accuracy is too
  low...", "You are outside the allowed company area."). New rejection
  reasons (stale GPS, replay) should get similarly generic, non-diagnostic
  messages — never reveal *why* a plausibility/replay check specifically
  failed in attacker-actionable detail.
- **Admin/security (audit log, future SEC-ATT-007 review queue):** the full
  categorical reason code, risk level, and bucketed signals — visible only
  to SUPER_ADMIN/HR_ADMIN, consistent with existing `GET /audit-logs` RBAC
  (SUPER_ADMIN/HR_ADMIN only; MANAGER and EMPLOYEE get 403 today).

---

## 11. Audit Behavior

No schema or code changes proposed here. This section defines the
**conceptual** metadata shape future items should converge on, extending
(not replacing) the existing `ATTENDANCE_GEOFENCE_REJECTED` pattern.

Recommended conceptual fields for new/extended attendance-security audit
events (SEC-ATT-002 through 007):

| Field | Type (conceptual) | Notes |
|---|---|---|
| `reasonCode` | categorical string | Extends existing reason vocabulary (`MISSING_LOCATION`, `POOR_ACCURACY`, `GEOFENCE_NOT_CONFIGURED`, `OUTSIDE_RADIUS`) with new codes as each item ships (e.g. `STALE_GPS`, `FUTURE_TIMESTAMP`, `REPLAY_REJECTED`, `IMPLAUSIBLE_TRAVEL`) |
| `riskLevel` | categorical (`LOW`/`MEDIUM`/`HIGH`) | New in SEC-ATT-007; a coarse severity signal for the review queue, not a raw score in early phases |
| `distanceBucket` | categorical | **Not** `distanceMeters` — see §10. Reuses the bucketing principle already established by `accuracyBucket` |
| `accuracyBucket` | `UNKNOWN` \| `ACCEPTABLE` \| `POOR` | Already exists (T-064); reused as-is, not redefined |
| `gpsAgeSeconds` | integer (raw) | New in SEC-ATT-002. Safe to store raw — an age duration is not location-revealing |
| `source`/`surface` | categorical | Already exists as `source`; SEC-ATT-002/003 may add a derived `surface` signal (e.g., "declared-mobile-plausible" vs. "declared-mobile-implausible") without storing raw User-Agent |
| `nonceStatus` | categorical (`VALID`/`MISSING`/`EXPIRED`/`REUSED`) | New in SEC-ATT-004 |
| `deviceIntegritySignal` | categorical (`PASS`/`FAIL`/`UNAVAILABLE`) | New in SEC-ATT-005/006; `UNAVAILABLE` is the expected value for the PWA indefinitely and for any client build predating native attestation — this value must not be silently omitted, so reviewers can distinguish "checked and failed" from "not checkable on this platform" |
| `result` | existing pattern | Unchanged — `REJECTED` (or new terminal states as needed) |

**Forbidden, unchanged from T-064/ADR-021:** `latitude`, `longitude`,
`accuracy` (raw), `distance` (raw), company coordinates, any derived field
enabling reverse-calculation of position (bearing, offset), free-form text
fields that might contain incidental location detail.

No new audit event *action* names are prescribed here — whether new
reasons extend `ATTENDANCE_GEOFENCE_REJECTED` or warrant new action strings
(e.g. `ATTENDANCE_REPLAY_REJECTED`) is an implementation decision for the
relevant SEC-ATT item, informed by whether HR admins need to filter them
separately in `GET /audit-logs`.

---

## 12. Abuse-Case Test Plan

Test scenarios for validating SEC-ATT-002 through SEC-ATT-004 once
implemented. Written now so later implementation tasks have a fixed target.

| # | Scenario | Expected outcome |
|---|---|---|
| 1 | Valid clock-in, `source: "mobile"`, fresh GPS, inside geofence, valid accuracy | 200/201, attendance recorded, `ATTENDANCE_CLOCK_IN` audit event, no rejection event |
| 2 | Outside geofence radius | 422 `OUTSIDE_RADIUS`, `ATTENDANCE_GEOFENCE_REJECTED` audit event — unchanged existing behavior |
| 3 | Stale timestamp (`capturedAt` older than the configured max-age window) | 422 (new `STALE_GPS`-class reason), audit event recorded, no attendance record created |
| 4 | Missing `capturedAt` on a `source: "mobile"` request (post SEC-ATT-002 rollout) | 422, same conditional-required pattern as missing lat/lon today |
| 5 | Low accuracy (`accuracy > maxAccuracyMeters`) | 422 `POOR_ACCURACY` — unchanged existing behavior, must remain intact after SEC-ATT-002/003 changes |
| 6 | Mock/simulated location, native build with mock-provider flag available (post SEC-ATT-003 + native build) | Rejected or flagged per the mock-location signal — **only testable once a native build exists**; on the current PWA, this scenario is untestable at the signal level and must instead be validated via the plausibility heuristics (implausible travel speed, repeated identical coordinates) |
| 7 | Replayed request (identical previously-used payload resent) — post SEC-ATT-004 | Rejected with `nonceStatus: REUSED`, no duplicate attendance action, no silent 200 |
| 8 | Copied payload from another device/session (same nonce cannot be reused; a stolen token with a *freshly requested* nonce succeeds) | Confirms nonce protection defeats simple replay but is explicitly **not** a full defense against a fully compromised session — document this limitation in the SEC-ATT-004 CTO Summary, don't overclaim |
| 9 | Web dashboard clock action | Remains unavailable in the UI (ADR-029, unchanged); if SEC-ATT-002/003 adds backend-level `source` restriction (pending §15 decision), a direct API call with `source: "web"` or omitted `source` behaves per whatever that decision resolves to — test both the "still allowed, geofence skipped" and "now rejected" outcomes depending on which is adopted |
| 10 | PWA limitation acknowledgment | A test/verification step (not a pass/fail gate) confirming that no CTO Summary or user-facing claim for SEC-ATT-003 asserts mock-location *detection* (as opposed to heuristic *flagging*) on the PWA surface |
| 11 | Native integrity unavailable fallback | With `deviceIntegritySignal: UNAVAILABLE` (PWA or pre-native-build client), confirm the system falls back to SEC-ATT-002/003/004 signals only and does not silently treat "unavailable" as "passed" |
| 12 | Legitimate poor-connectivity clock-in (GPS acquired, request delayed by slow network, still within the max-age window) | Succeeds — validates that the max-GPS-age threshold (§6) is tuned generously enough not to punish real users; a tuning/regression test, not just a security test |
| 13 | Legitimate off-site clock-in/out (existing `OffSiteRequest`-approved flow) | Unaffected by SEC-ATT-002–004 changes — off-site's existing radius-bypass and raw-GPS-for-dispute-resolution behavior must continue working exactly as today |

---

## 13. Implementation Roadmap

Restates and slightly elaborates [SEC_ATT_ROADMAP.md](SEC_ATT_ROADMAP.md)'s
existing sequencing, now grounded in this spec's detail:

| Item | Depends on native wrapper? | Depends on this spec's design for |
|---|---|---|
| SEC-ATT-002 — Mobile attendance payload hardening | No | §6 (required timestamp, server-time comparison, max-GPS-age), §7 (payload shape) |
| SEC-ATT-003 — Backend rejection of mock/simulated/stale location | No | §6 (plausibility heuristics, "when available" hedge), §10 (bucketing, not raw storage) |
| SEC-ATT-004 — Server nonce/replay protection | No | §8 (mechanism, storage candidates, rollout consideration) |
| SEC-ATT-005 — Android Play Integrity | **Yes** | §9 (blocked on native-build decision, §15) |
| SEC-ATT-006 — iOS App Attest/DeviceCheck | **Yes** | §9 (same blocker) |
| SEC-ATT-007 — Attendance risk scoring + review queue | No (consumes signals from 002–006) | §11 (audit metadata shape), reuses `AttendanceReviewStatus` lifecycle from the mixed-checkout-exception workflow (ADR-027) per the existing roadmap note |

Sequencing rationale is unchanged from `SEC_ATT_ROADMAP.md`: 002–004 and 007
are backend-only and can proceed immediately; 005–006 are blocked on a
separate native-build product decision and are ordered last so backend
hardening isn't held up waiting for it.

---

## 14. PASS/HOLD Criteria

For each future SEC-ATT implementation task, PASS requires all of the
following; any failure is HOLD (not FAIL — these are gating criteria for
readiness to merge/deploy, consistent with this project's spec-first
convention, not a judgment that the work is wrong).

### General (applies to every item 002–007)

- [ ] No raw GPS coordinates, exact distance, or exact accuracy introduced
  into `AuditLog` metadata (verified by inspecting actual persisted
  metadata in a test/sandbox run, not just code review).
- [ ] `./scripts/verify.sh`, `./scripts/docker-verify.sh`,
  `./scripts/api-smoke-test.sh` all exit 0 (per `CLAUDE.md`).
- [ ] `./scripts/security-review.sh` run and CTO Summary includes the full
  Security Review section (per `CLAUDE.md`, required post-T-052A.1).
- [ ] No claim in the CTO Summary that overstates what was achieved (e.g.,
  no claiming device-integrity coverage on the PWA before a native build
  exists).
- [ ] Existing off-site and mixed-checkout-exception flows remain
  functionally unaffected unless the task explicitly targets them.
- [ ] Web dashboard clock-in/out remains unavailable in the UI (ADR-029
  unchanged) unless a future task explicitly revisits that decision.

### SEC-ATT-002 specific

- [ ] `capturedAt` freshness check does not produce a materially higher
  false-rejection rate for legitimate poor-connectivity users than the
  existing accuracy gate does today (abuse-case #12).
- [ ] Backward-compatibility behavior for pre-upgrade mobile clients (missing
  `capturedAt`) is explicitly decided and tested, not left implicit.

### SEC-ATT-003 specific

- [ ] Any plausibility heuristic ships as a flag/audit signal first, or is
  explicitly justified as a hard reject with a documented false-positive
  analysis — no heuristic should hard-block legitimate attendance without
  that analysis.
- [ ] CTO Summary explicitly states this item does **not** provide
  device-level mock-location detection on the PWA (heuristic only).

### SEC-ATT-004 specific

- [ ] Nonce reuse is rejected (abuse-case #7) without breaking the existing
  same-day duplicate-clock-in business rule.
- [ ] Rollout/compatibility plan for pre-upgrade clients is documented (soft
  enforcement window or equivalent), not a silent breaking change.

### SEC-ATT-005 / SEC-ATT-006 specific

- [ ] **HOLD by default** until the native-build product decision (§15) is
  explicitly made by the user/product owner — these items cannot proceed
  on spec alone; they require a prerequisite decision this document
  deliberately does not make.

### SEC-ATT-007 specific

- [ ] Review queue reuses `AttendanceReviewStatus` (per ADR-027 precedent)
  rather than introducing a parallel review lifecycle.
- [ ] Risk scores/levels are explainable in categorical terms an HR admin
  can act on (no opaque numeric-only score with no reason codes).

---

## 15. Open Questions

These are intentionally **not resolved** by this spec — each requires a
decision from the user/product owner before the relevant implementation
item can proceed:

1. **Should the backend reject non-mobile-sourced clock calls outright?**
   ADR-029 explicitly left this open as SEC-ATT-001's follow-up: should
   `POST /attendance/clock-in`/`clock-out` reject requests where `source`
   is `"web"` or omitted, now that the UI affordance is gone — or is there
   a legitimate reason (internal tooling, future admin-assisted correction
   flow, etc.) to keep that path open at the API level? This spec frames
   the options (§6, §12 abuse-case #9) but does not choose.
2. **Nonce store technology.** Redis (provisioned but unused per
   `CLAUDE.md`) vs. a Postgres-backed short-lived table vs. another
   mechanism — a SEC-ATT-004 implementation-time decision (§8).
3. **Native build investment.** Whether/when to invest in an EAS
   Build/bare-workflow native Android and/or iOS build of STEP Connect at
   all — a prerequisite for SEC-ATT-005/006 that is a product/resourcing
   decision, not a technical one this spec can make.
4. **Max-GPS-age and clock-skew tolerance values.** This spec recommends
   the *mechanism* (§6) but leaves exact thresholds (seconds) to
   SEC-ATT-002 implementation-time tuning against real network/GPS
   latency data.
5. **Verdict-tier policy for Play Integrity / App Attest.** Once native
   attestation exists, should a "basic" (vs. "strong") integrity verdict
   hard-block, or only feed SEC-ATT-007 risk scoring? Deferred to
   SEC-ATT-005/006 design time, informed by real-world verdict
   distribution data this project does not have yet.
6. **New audit action names vs. extended reason codes.** Whether
   SEC-ATT-002–004 introduce new `AuditLog.action` values or extend
   `ATTENDANCE_GEOFENCE_REJECTED`'s reason vocabulary — deferred to each
   item, informed by whether HR admins need separate `GET /audit-logs`
   filtering (§11).

---

## Related Documents

- [SEC_ATT_ROADMAP.md](SEC_ATT_ROADMAP.md) — orientation index and canonical item order
- [ADR-029 — Web vs. Mobile Attendance Clock Policy](adr/ADR-029-web-vs-mobile-attendance-clock-policy.md)
- [ADR-028 — Fresh GPS Requirement for Attendance Actions](adr/ADR-028-fresh-gps-requirement-for-attendance-actions.md)
- [ADR-027 — Mixed Attendance Checkout Exception Workflow](adr/ADR-027-mixed-attendance-checkout-exception-workflow.md)
- [ATTENDANCE_GEOFENCE_BACKEND.md](ATTENDANCE_GEOFENCE_BACKEND.md)
- [MOBILE_GEOFENCE_CLOCK.md](MOBILE_GEOFENCE_CLOCK.md)
- [SPEC_T064_FAILED_GEOFENCE_ATTEMPT_AUDIT.md](SPEC_T064_FAILED_GEOFENCE_ATTEMPT_AUDIT.md) — precedent for privacy-safe audit event design and for this project's "spec-only, no code" documentation pattern
- [SECURITY_HARNESS.md](SECURITY_HARNESS.md)
- [HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md](../HR-Knowledge/04-DOMAINS/Attendance/Attendance%20Module.md)
