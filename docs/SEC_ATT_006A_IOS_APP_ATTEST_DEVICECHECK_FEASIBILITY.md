# SEC-ATT-006A — iOS App Attest / DeviceCheck Feasibility & Architecture Decision

> Status: FEASIBILITY / ARCHITECTURE DECISION ONLY — no code, schema,
> migration, route, mobile, or UI changes. This document evaluates whether and
> how iOS App Attest and/or DeviceCheck could be added to HR Management
> attendance security, compares implementation options, and records a
> recommended **decision to DEFER** implementation until a native iOS strategy
> is approved.
>
> This is the feasibility precursor to **SEC-ATT-006** (the actual iOS App
> Attest / DeviceCheck implementation, still blocked). It does **not** replace
> or renumber SEC-ATT-006. It is the iOS counterpart to
> [SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md](SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md)
> and follows the same "A = feasibility" convention. It extends — it does not
> restate —
> [SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md](SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md)
> §9 (Native Integrity Roadmap, which already scopes SEC-ATT-006) and §15 (Open
> Question #3, native-build investment; Open Question #5, verdict-tier policy),
> which already record that SEC-ATT-005/006 are blocked on a native-build
> product decision. Read those sections first; this document adds the iOS option
> matrix, the conceptual backend verification path, prerequisites, and a phased
> rollout that §9/§15 deliberately left open.

---

## 1. Purpose & Scope

### Purpose

SEC-ATT-004 (server nonce / replay protection) is complete, deployed, migrated,
and production-verified. SEC-ATT-005A (Android Play Integrity feasibility) is
complete and recommends DEFER. The next roadmap item, **SEC-ATT-006 — iOS App
Attest / DeviceCheck**, has been flagged since SEC-ATT-001 as blocked on the
same native-build decision that has not been made. Rather than open the
implementation task against a precondition that does not exist, this document
does the feasibility and architecture work up front so the product owner can
make that native-build decision from a concrete basis — symmetrically with the
Android side.

### In scope (this document)

- Assessment of the current mobile/PWA architecture and why it cannot provide
  App Attest or DeviceCheck.
- What App Attest and DeviceCheck each prove — and, importantly, how they differ
  from one another (they are **not** co-equal; see §3).
- A comparison of architecture options (defer / Expo EAS build / native wrapper
  / full native app) across effort, cost/time, operational, release, security,
  testing, maintenance, and roadmap-fit dimensions.
- A **conceptual** backend design for App Attest attestation/assertion and
  DeviceCheck verification, if implemented later — including the **stateful**
  enrollment footprint that distinguishes iOS App Attest from Android Play
  Integrity.
- Mobile/native prerequisites before any implementation can begin.
- A safe, phased rollout strategy.
- Security and privacy constraints binding any future implementation.
- A recommended decision.

### Out of scope (this document)

Per the task guardrails, none of the following are performed here:

- App Attest runtime code; DeviceCheck runtime code; backend
  attestation/assertion/token verification endpoint.
- Native iOS app; Expo EAS iOS build setup; iOS signing/provisioning; Apple
  Developer / App Store Connect setup.
- Database schema changes; Prisma migrations.
- Mobile runtime changes; attendance enforcement changes.
- SEC-ATT-007 (risk scoring + review queue).
- Any real bundle identifier, Apple Team ID, signing certificate, provisioning
  profile, App Attest key, DeviceCheck auth key (`.p8`), Key ID, or Apple
  credential — all such values appear only as clearly-marked placeholders
  (`TBD`).

---

## 2. Current Mobile Architecture Assessment

### 2.1 Current Mobile / PWA / Expo Web status

- **STEP Connect** is an Expo Router application delivered today **only** as an
  installable PWA (`apps/mobile`, ADR-025). There is **no native iOS build, no
  App Store listing, no TestFlight build, and no signed iOS binary** for this
  project today.
- On web/PWA, GPS acquisition bypasses `expo-location` and calls
  `navigator.geolocation` directly with `maximumAge: 0` (ADR-028). On native
  (`Platform.OS !== 'web'`) the code path uses `expo-location`'s `Accuracy.High`
  — but **that branch is not exercised by any shipped build**; it exists in
  source only.
- Web dashboard clock-in/out was removed in v1.2.66 (ADR-029). Mobile/PWA is the
  only supported attendance-clock channel. On iOS today that means **Mobile
  Safari / "Add to Home Screen" WebKit**, not a native app.

### 2.2 Why the current PWA cannot provide App Attest or DeviceCheck

This is a hard platform ceiling, restated from SEC-ATT-001 §5 and the Android
sibling doc §2.2:

- App Attest (`DCAppAttestService`) and DeviceCheck (`DCDevice`) are **native iOS
  framework APIs** (Apple's DeviceCheck framework). They are invoked from native
  app code, are bound to an app identity (Apple Team ID + bundle identifier), and
  are backed by the Secure Enclave and Apple's attestation servers. **There is no
  browser-JavaScript / WebKit entry point to either.** A PWA running in Mobile
  Safari — even one added to the Home Screen — cannot call them, cannot obtain an
  attestation object / assertion / device token, and cannot present anything a
  backend could verify as an Apple attestation.
- Installed as a Home Screen web app, STEP Connect is still a web document in the
  WebKit sandbox. It has no Apple app-signing identity and no native attestation
  surface. There is nothing for App Attest to attest *about*.
- **Do not claim App Attest or DeviceCheck is available, partial, or "soft" on
  the current PWA flow.** Both are categorically unavailable until a native iOS
  app exists, is signed with an Apple Developer identity, and provisions the App
  Attest capability. Any future CTO Summary must state `deviceIntegritySignal:
  UNAVAILABLE` for PWA/WebKit clients (SEC-ATT-001 §11) rather than imply
  coverage.

### 2.3 Security controls already in place (SEC-ATT-001 → 004)

The current attendance channel is **not** unprotected — it is hardened at the
backend/payload layer, which is what a PWA-only surface allows:

| Item | Control | Status |
|---|---|---|
| SEC-ATT-001 | Cross-platform anti-spoofing spec: threat model, platform capability matrix, phased plan | ✅ Spec complete |
| SEC-ATT-002 | Mobile payload hardening: `capturedAt`, `platform`, `timezoneOffsetMinutes`, reserved `nonce`; server-time freshness comparison | ✅ Complete |
| SEC-ATT-003 | Hard rejection of stale / future / invalid `capturedAt`; `isMockLocation` signal reserved for a future native build; runs regardless of `source` | ✅ Complete |
| SEC-ATT-004 | Server-issued single-use nonce (`POST /attendance/nonce`), atomic single-use consumption, replay rejection; missing-nonce soft-enforced pending fleet rollout | ✅ Complete, deployed, production-verified |
| SEC-ATT-005A | Android Play Integrity feasibility & decision — recommends DEFER | ✅ Complete |

App Attest / DeviceCheck would sit **on top of** these — device/app-integrity
signals, not a replacement for payload hardening or replay protection. The
backend remains the authoritative decision point (SEC-ATT-001 §5, ADR-020).

### 2.4 How SEC-ATT-005A relates to SEC-ATT-006A

SEC-ATT-005A (Android) and SEC-ATT-006A (iOS) are **parallel feasibility
assessments of the same underlying question** — "can STEP Connect obtain a
native device/app-integrity signal?" — answered per platform. They share:

- The **same blocking precondition**: no native build exists and none is
  approved (SEC-ATT-001 §15 Open Question #3). The native-build decision is a
  single product decision that unblocks *both* platforms together, not two
  separate ones.
- The **same "risk signal, not binary gate"** posture (SEC-ATT-001 §9, Open
  Question #5) — both verdicts feed SEC-ATT-007, neither hard-gates alone.
- The **same honest-reporting rule**: PWA clients report
  `deviceIntegritySignal: UNAVAILABLE`; never implied coverage.

They **differ** in one architecturally significant way that this document must
get right: **App Attest is stateful** (the server must persist an enrollment per
attested key), whereas Play Integrity verification is essentially per-request
stateless. This changes the conceptual backend design and future schema
footprint (§5) and the privacy handling of the `keyId` (§8). Do not assume the
Android backend design transfers unchanged to iOS.

---

## 3. iOS App Attest / DeviceCheck Feasibility

**App Attest and DeviceCheck are two different technologies with different jobs.**
The task title bills them together, but for *attendance integrity* they are not
co-equal. Treat App Attest as the primary integrity mechanism (the Play Integrity
analog) and DeviceCheck as a secondary, lower-assurance per-device signal.

### 3.1 What App Attest is intended to prove

App Attest (`DCAppAttestService`, iOS 14+) proves, using a Secure
Enclave–backed key pair and Apple's attestation servers:

- **App instance genuineness** — that the request comes from a genuine,
  unmodified instance of *your* app (identified by Apple Team ID + bundle ID),
  not a tampered or repackaged build.
- **Device genuineness** — that the app is running on genuine Apple hardware
  (the key is hardware-bound in the Secure Enclave), not a simulator or an
  emulated environment.
- **Per-request assertion with replay protection** — after a one-time
  attestation of the key, each subsequent request carries an *assertion* signed
  by that key over server-supplied challenge data, with a **monotonic counter**
  that the server tracks to reject replays (SEC-ATT-001 §9 already names this
  "key/assertion counter tracking").

The typical flow is: client `generateKey` → `attestKey` (produces an attestation
object verified server-side against Apple's App Attest root CA, once, at
enrollment) → thereafter `generateAssertion` per protected request.

### 3.2 What DeviceCheck is intended to provide

DeviceCheck (`DCDevice.generateToken`) is a much lighter mechanism. It produces
an ephemeral, per-device token that the **server** exchanges with Apple's
DeviceCheck API (server-to-server, authenticated with an Apple auth key). It
provides:

- A basic assurance that the token came from a **genuine Apple device**.
- **Two persistent per-device bits** (plus a last-updated timestamp) that Apple
  stores on your behalf, surviving app reinstall — useful for cross-install
  abuse/fraud flags (e.g. "this device already did X"), **not** for proving app
  integrity.

DeviceCheck is **not** an app-integrity attestation. For attendance anti-spoofing
its value is secondary: it could carry a persistent "flagged device" bit into a
future SEC-ATT-007 risk model, but it does not answer "is this a genuine,
unmodified app instance?" — only App Attest does.

### 3.3 What they can help detect

- **App Attest**: requests from the **iOS Simulator** and from **tampered /
  repackaged** builds of STEP Connect; broadly, non-genuine app instances that
  cannot produce a valid Secure Enclave–backed attestation. This reduces
  residual risk on SEC-ATT-001 threats **#1 (mock GPS), #2 (simulated location),
  #11 (jailbroken / high-risk device)** — but only for users on the native iOS
  build.
- **DeviceCheck**: persistent per-device flagging across reinstalls (an
  abuse-tracking aid), and a weak "genuine Apple device" signal.

### 3.4 What they cannot guarantee

- Neither is a **location-integrity** API. A genuine, unmodified app on a genuine
  device can still be fed a spoofed GPS fix. Notably, **iOS has no direct
  mock-location provider flag** (unlike Android's `isFromMockProvider`) — App
  Attest attests the *app/device*, never the *coordinates* (SEC-ATT-001 §7).
- Neither is **100% bypass-proof** (SEC-ATT-001 threat #12). They therefore
  belong as **risk signals feeding SEC-ATT-007**, not brittle binary allow/deny
  gates (SEC-ATT-001 §9, Open Question #5).
- Neither says anything about **who** is holding the phone (SEC-ATT-001 threat
  #15, shared-device misuse remains a process control).
- DeviceCheck specifically guarantees **no app integrity** — do not treat its
  presence as an integrity pass.

### 3.5 Why they require native iOS / a native wrapper

App Attest's attestation and assertions, and DeviceCheck's token, are produced by
native framework calls bound to an Apple app identity (Team ID + bundle ID) and,
for App Attest, the Secure Enclave and the App Attest capability entitlement. A
native build (or a native wrapper hosting the web content and making the native
call) is a hard prerequisite: there must be (a) a native iOS app with a stable
bundle identifier, (b) an Apple Developer signing identity and the App Attest
capability provisioned, and (c) native code able to invoke the DeviceCheck
framework and hand the attestation/assertion/token to the backend. None of these
can be produced by WebKit.

### 3.6 Why PWA / browser cannot be treated as equivalent

A Home Screen PWA has no Apple app-signing identity, no Secure Enclave access,
and no DeviceCheck framework surface. Any "integrity-like" signal a browser could
self-report (user agent, feature detection) is **trivially spoofable** and
provides false assurance — exactly the trap SEC-ATT-001 §6 warns against.
Treating a browser claim as equivalent to an Apple-signed attestation would be
strictly worse than honestly reporting `UNAVAILABLE`.

---

## 4. Architecture Options

Effort / cost / time are given as **relative tiers and rough order-of-magnitude
estimates**, not authoritative figures — actual numbers depend on team
familiarity with Expo native builds, Apple Developer Program access, and CI
capacity. The iOS options mirror the Android ones (SEC-ATT-005A §4) because the
gating decision — invest in a native build or not — is shared.

### Option A — Defer App Attest / DeviceCheck; continue with PWA + backend controls

Keep STEP Connect PWA-only. Rely on SEC-ATT-002/003/004 (and future 007 risk
scoring) as the full anti-spoofing posture. Revisit when/if a native iOS strategy
is approved for independent reasons.

| Dimension | Assessment |
|---|---|
| Implementation complexity | **None** — no build, no code. |
| Cost / time | **~None.** Documentation only (this task). |
| Apple Developer account | **Not required.** |
| App Store / TestFlight | **No impact.** PWA delivery unchanged. |
| Operational impact | None. No new infra, no App Store Connect, no Apple credentials. |
| Release / deployment impact | None. Instant PWA deploys unchanged. |
| Security benefit | **None beyond current.** Threats #1/#2/#11 remain heuristic-only on the PWA — but that is the status quo, honestly reported (`UNAVAILABLE`), not a regression. |
| Testing burden | None. |
| Maintenance burden | None. |
| Roadmap fit | **High.** Backend work (007) proceeds unblocked; no premature platform investment. |

### Option B — Expo EAS iOS build

Use Expo Application Services (EAS Build) to produce a genuine native iOS app from
the existing Expo project, distributed via TestFlight/App Store, and add the App
Attest capability + a backend verification step.

| Dimension | Assessment |
|---|---|
| Implementation complexity | **Medium.** Existing Expo project is the enabler; still requires EAS config, an App Attest config plugin / entitlement, native attestation+assertion retrieval, and **stateful** backend verification (§5). |
| Cost / time | **Medium.** Native build pipeline + Apple onboarding + backend enrollment/verification + rollout. EAS may carry subscription/build-minute cost; the **Apple Developer Program membership (paid, annual) is mandatory** — verify current pricing before committing. |
| Apple Developer account | **Required** — paid Apple Developer Program membership; there is no free-tier equivalent for App Attest capability + App Store Connect distribution. |
| App Store / TestFlight | **Required.** TestFlight for internal/external test builds; App Store review for public distribution. Introduces review latency. |
| Operational impact | **Medium.** Apple Developer account ownership, signing certificate / provisioning profile custody, App Store Connect management, plus a **DeviceCheck/App Attest auth key (`.p8`)** for server-side verification stored as a secret. |
| Release / deployment impact | **High.** Introduces an app-store release train (review latency, phased release, versioning) alongside the current instant PWA deploys. Dual-surface (PWA + native) during transition. |
| Security benefit | **High (for native users).** Real Secure Enclave–backed app/device integrity; closes most of threats #1/#2/#11 for that cohort. PWA users still `UNAVAILABLE`. |
| Testing burden | **Medium-High.** Requires real physical iOS devices (App Attest and DeviceCheck do **not** work on the Simulator); TestFlight internal track; development-vs-production App Attest environment handling. |
| Maintenance burden | **Medium.** Ongoing native dependency/SDK upkeep, Apple policy compliance, certificate/provisioning-profile renewal, auth-key custody, iOS version tracking, **enrollment-state lifecycle** (§5). |
| Roadmap fit | **Medium.** Reuses the Expo investment; but pulls the "native build" product decision forward, which SEC-ATT-001 §15 leaves open. |

### Option C — Native iOS wrapper around the current mobile app

A thin native iOS shell (`WKWebView` hosting the existing web content) whose only
native job is the Apple app-signing identity + the App Attest / DeviceCheck call,
forwarding the attestation/assertion/token to the backend.

| Dimension | Assessment |
|---|---|
| Implementation complexity | **Medium.** Less UI rework than a full rewrite, but a `WKWebView` wrapper is a distinct artifact to build, sign, and maintain, and bridging the native attestation into the web-hosted flow adds a JS↔native boundary. |
| Cost / time | **Medium.** Similar Apple onboarding / signing / backend work to Option B; wrapper plumbing instead of full native adoption. |
| Apple Developer account | **Required** — same as B. |
| App Store / TestFlight | **Required** — the wrapper still ships through Apple; same review train. |
| Operational impact | **Medium.** Same signing / auth-key / App Store Connect obligations as B. |
| Release / deployment impact | **High.** Same app-store release train as B. |
| Security benefit | **Medium-High.** Real App Attest verdict for wrapper users; but a `WKWebView`-hosted flow is a larger attack surface than native UI and can dilute app-integrity assurance if the web content is loaded remotely. |
| Testing burden | **Medium-High.** Real-device testing; plus the native↔web bridge is its own test surface. |
| Maintenance burden | **Medium-High.** Two runtimes to keep aligned (web app + native wrapper), `WKWebView` compatibility drift. |
| Roadmap fit | **Low-Medium.** Given STEP Connect is *already* an Expo app that can produce a genuine native build (Option B), a separate `WKWebView` wrapper is usually the weaker path — it adds a second artifact without B's first-class native runtime. |

### Option D — Full native iOS app (later)

Invest in a first-class native iOS app (Expo native or bare workflow) as the
primary iOS surface, with App Attest as one part of a broader native capability
set.

| Dimension | Assessment |
|---|---|
| Implementation complexity | **High.** Largest scope — native UX parity, native navigation, App Store presence, full platform lifecycle. |
| Cost / time | **High.** Multi-milestone effort well beyond attendance security alone. |
| Apple Developer account | **Required** — plus full App Store operational commitment. |
| App Store / TestFlight | **Required**, as the primary distribution channel with a committed release cadence. |
| Operational impact | **High.** Full app-store operational model (releases, crash reporting, device matrix, support). |
| Release / deployment impact | **High.** Committed App Store release cadence. |
| Security benefit | **High.** Strongest integrity posture; also aligns iOS with any native Android path (SEC-ATT-005). |
| Testing burden | **High.** Full device-matrix QA on real hardware. |
| Maintenance burden | **High.** Ongoing native platform ownership. |
| Roadmap fit | **Deferred.** Justified only if native mobile becomes a product priority for reasons broader than attendance anti-spoofing; overkill if App Attest is the sole driver. |

### Option summary

- **A** is the correct default *now*: zero cost, no regression, keeps backend
  work unblocked, honestly reports the platform ceiling.
- **B** is the most likely *eventual* path **if** a native iOS build is approved —
  it reuses the existing Expo investment and gives first-class native integrity.
- **C** is rarely preferable to B given STEP Connect is already Expo-based.
- **D** is justified only if native mobile becomes a broader product priority,
  not for App Attest alone.

The native-build decision is **shared with Android** (SEC-ATT-005A): approving a
native strategy would most naturally cover both platforms via EAS (Option B on
each), not one in isolation.

---

## 5. Backend Impact If Implemented Later (Conceptual)

Design intent only — **no endpoint, DTO, schema, or migration is created by this
task.** This section defines *what* a future SEC-ATT-006 implementation would
need, consistent with SEC-ATT-001 §9 and the existing nonce design (SEC-ATT-004).

**Key divergence from the Android design (SEC-ATT-005A §5): App Attest is
stateful.** Play Integrity verification is essentially per-request and
stateless — "verify server-side and discard." App Attest is not: to verify
future *assertions*, the backend must persist a per-key **enrollment**. This is
the single most important iOS-specific difference and it changes both the future
schema footprint and the privacy handling below.

- **Attestation intake & enrollment (one-time, per key).** On first use the
  client sends the App Attest *attestation object*. The backend verifies it
  against Apple's App Attest root CA and, if valid, **persists an enrollment
  record**: the `keyId`, the attested **public key**, an initial **counter**,
  and the binding to the authenticated `userId` (see below). This enrollment
  state is what makes subsequent assertion verification possible — it cannot be
  discarded.
- **Assertion verification (per protected request).** Subsequent requests carry
  an *assertion* signed by the enrolled key over server-supplied challenge data.
  The backend verifies the signature with the stored public key and checks the
  **counter strictly increased** since the last seen value — App Attest's
  built-in replay defense — then updates the stored counter.
- **Challenge = the SEC-ATT-004 nonce.** The natural fit is to use the
  server-issued nonce (SEC-ATT-004) as the App Attest challenge / clientDataHash,
  tying a specific attestation/assertion to a specific pending clock action and
  reusing the existing replay protection. **Note the replay defenses now
  overlap**: the nonce is single-use and action-scoped; the App Attest counter is
  monotonic and key-scoped. They are complementary layers, not redundant — keep
  both.
- **DeviceCheck path (secondary).** A future request could optionally carry a
  DeviceCheck token; the backend exchanges it with Apple's DeviceCheck API using
  the Apple auth key, and may read/update the two per-device bits as an
  abuse-flag input to SEC-ATT-007. This is a lower-assurance complement, not the
  integrity mechanism.
- **Binding to authenticated user / session / action.** The enrollment and each
  verdict must be bound to the same `userId` + `action` the nonce already binds
  (SEC-ATT-004), so an attestation captured for one user/action cannot be
  presented for another. Reuse the existing binding model — do not invent a
  parallel one.
- **Privacy-safe audit metadata.** Audit records persist only a **categorical**
  `deviceIntegritySignal` (`PASS` / `FAIL` / `UNAVAILABLE`) and verdict category
  (SEC-ATT-001 §11) — never the raw attestation object, raw assertion, or raw
  DeviceCheck token. `UNAVAILABLE` must be recorded explicitly (never silently
  omitted) so reviewers distinguish "checked and failed" from "not checkable on
  this platform." (The enrollment record's `keyId`/public key/counter are
  *necessary verification state*, held separately from audit metadata and handled
  as pseudonymous data — see §8, not §5's audit line.)
- **Safe failure behavior.** Verification outages, timeouts, un-enrolled keys, or
  `UNAVAILABLE` verdicts must not hard-break clock-in/out. Follow the SEC-ATT-004
  precedent: **report-only / soft-enforce first**, feed the signal to SEC-ATT-007,
  and hard-gate (if ever) only after real-device verdict data justifies a tier
  policy (SEC-ATT-001 Open Question #5). Generic, non-revealing client errors
  only.
- **Feature flag / rollout strategy.** Gate enforcement behind config so the
  signal can be collected in report-only mode independent of enforcement, and so
  PWA and pre-native clients (always `UNAVAILABLE`) are never blocked. The App
  Attest **development-vs-production environment** distinction must be handled by
  config (keys attested in one environment do not verify in the other).
- **No raw attestation/assertion/token logging; no secrets in code or docs.** Raw
  App Attest attestation objects, assertions, and DeviceCheck tokens are verified
  and then discarded — never logged, never placed in audit metadata. The Apple
  auth key (`.p8`) and any App Attest server credential are secrets managed via
  the existing environment/secret mechanism, never committed.

> **Future schema footprint (conceptual only, not this task):** the App Attest
> enrollment (keyId → public key + counter + user/action binding) is a **new
> persisted table** that the Android design did not require. It is called out here
> so the eventual SEC-ATT-006 implementation scopes it. **This task makes no
> schema or migration change** — CTO Summary §9 remains "None."

---

## 6. Mobile / Native Prerequisites

None of these exist today; all are prerequisites **before** any SEC-ATT-006
implementation task can start. Values shown are placeholders — no real secrets.

1. **Native iOS build decision** — an explicit product/resourcing approval to
   invest in a native iOS build (Option B/C/D). This is the top-level blocker
   (SEC-ATT-001 §15 Open Question #3) and is **shared with Android** (SEC-ATT-005A).
2. **Apple Developer Program membership** — a paid, annual Apple Developer
   Program account. Mandatory for the App Attest capability, signing, and App
   Store Connect. There is no free-tier substitute.
3. **Bundle identifier + Team ID** — a stable bundle identifier (e.g.
   `com.<org>.stepconnect` — **TBD**) and the Apple Team ID together forming the
   App Attest `appID`, fixed before provisioning.
4. **Signing certificate / provisioning profile strategy** — Apple distribution
   certificate and provisioning profiles with the **App Attest capability**
   entitlement enabled; custody and renewal plan. **No certificate, profile, or
   key is created or recorded in this document.**
5. **App Store Connect / TestFlight setup** — App Store Connect app record,
   TestFlight internal (and possibly external) test track, and data-privacy
   declarations.
6. **App Attest capability availability** — verify device/OS support (iOS 14+,
   `DCAppAttestService.isSupported`), and handle the development-vs-production
   attestation environment explicitly.
7. **DeviceCheck availability** — DeviceCheck framework support on target devices
   (real hardware only), if the secondary per-device-bit signal is adopted.
8. **Backend credential / key strategy** — an Apple auth key (`.p8`, with its Key
   ID and Team ID) for server-side DeviceCheck / App Attest verification, stored
   as an environment secret (not in source, not in docs), with rotation ownership
   assigned.
9. **CI/CD release implications** — a native build/release pipeline (EAS or bare)
   added alongside the current instant-PWA deploy flow, with App Store review
   latency and phased rollout accounted for in release planning.
10. **Real-device testing requirement** — App Attest and DeviceCheck do **not**
    function on the iOS Simulator; a small set of real physical iOS devices across
    a representative OS-version range is mandatory for any verification.

---

## 7. Rollout Strategy (If Approved)

A safe, reversible progression. Each phase gates the next; nothing enforces until
real-device evidence justifies it. Mirrors the Android §7 phasing.

- **Phase 1 — Document & defer (this task).** Feasibility recorded;
  implementation deferred pending the native-build decision. PWA attendance flow
  unchanged and unblocked.
- **Phase 2 — Native iOS build proof of concept.** *Only after* the native-build
  decision. Produce a signed TestFlight build (Option B most likely), confirm it
  installs and `DCAppAttestService` returns a valid attestation/assertion on real
  devices (and, if adopted, DeviceCheck returns a token). No backend enforcement
  yet.
- **Phase 3 — Backend verification in report-only mode.** Add server-side
  attestation enrollment + assertion verification bound to the SEC-ATT-004
  nonce/user/action; record `deviceIntegritySignal` categorically; **enforce
  nothing** — collect verdict distribution across the real fleet.
- **Phase 4 — Audit / risk-scoring integration (SEC-ATT-007).** Feed the
  categorical verdict (and any DeviceCheck abuse bit) into risk scoring and the
  review queue as one signal among several — not a standalone gate.
- **Phase 5 — Enforcement only after real-device verification.** Consider a hard
  gate (or verdict-tier policy) **only** once Phase 3/4 data shows the
  false-positive rate on genuine devices is acceptable, and only for the native
  cohort — PWA/pre-native clients remain `UNAVAILABLE`, never blocked.

This mirrors the SEC-ATT-003/004 soft-enforce-then-harden precedent and honors
SEC-ATT-001 §9's "risk signal, not binary gate" position and Open Question #5.

---

## 8. Security & Privacy Review

Binding constraints for any future implementation (and satisfied trivially by
this docs-only task):

- **Do not log raw App Attest assertions or attestation objects.** Verify
  server-side and discard the raw material; never log, never place in audit
  metadata.
- **Do not log raw DeviceCheck tokens.** Same discipline — exchange with Apple
  server-side and discard.
- **Do not store sensitive device identifiers unnecessarily.** Do **not** collect
  IDFV / IDFA / hardware identifiers. The App Attest **`keyId` is a legitimate,
  necessary exception**: it is a per-key (per-install) pseudonymous identifier —
  a hash of the attested public key, not a hardware/device ID — and the
  enrollment record *must* persist it (with the public key and counter) to verify
  future assertions (§5). It is verification state, not gratuitous fingerprinting.
  Handle it as pseudonymous, access-controlled data; never log it raw; do not
  correlate it across users beyond its verification purpose.
- **Avoid device fingerprinting beyond approved scope.** No long-term device
  identity beyond the App Attest enrollment `keyId` and what a future SEC-ATT-007
  signal explicitly justifies (SEC-ATT-001 §10).
- **Audit only sanitized verdict / risk category.** `deviceIntegritySignal`
  (`PASS`/`FAIL`/`UNAVAILABLE`) and verdict category only — never raw
  attestations, assertions, tokens, coordinates, or device IDs. Reuse
  `AUDIT_SENSITIVE_KEYS` as defense-in-depth. Note the distinction: the
  enrollment `keyId`/public key/counter are *verification state* held outside the
  audit trail — the audit trail itself still carries only categorical verdicts.
- **User-facing errors must be safe and non-sensitive.** Generic messages only;
  never reveal why an integrity check specifically failed in attacker-actionable
  detail (consistent with the geofence/nonce error convention).
- **No production secrets in docs or source.** Bundle identifier, Team ID,
  signing strategy, App Attest key, and DeviceCheck auth key (`.p8`) are described
  conceptually with `TBD` placeholders only — no real Apple credentials or
  private keys anywhere in the repo or docs. `secret-scan.sh` guards this.

---

## 9. Decision Recommendation

**DEFER SEC-ATT-006 (iOS App Attest / DeviceCheck) implementation** until a native
iOS build strategy is explicitly approved by the product owner. Rationale:

- App Attest and DeviceCheck are **categorically unavailable** on the current
  PWA-only surface (§2.2, §3.5–3.6). They cannot be implemented without a native
  iOS build that does not exist and has not been approved (SEC-ATT-001 §15 Open
  Question #3) — the **same blocker** as Android SEC-ATT-005.
- The current attendance channel is **already hardened** at the layers a PWA
  allows (SEC-ATT-002/003/004; §2.3). App Attest is additive, not a gap-fill for
  an unprotected channel.
- Recommended concurrent work that is **not** blocked on the native-build
  decision:
  - **SEC-ATT-007** — attendance risk scoring + review queue **planning**
    (backend-only; consumes existing SEC-ATT-002/003/004 signals; provides the
    home a future App Attest/Play Integrity verdict would feed into). With both
    SEC-ATT-005 and SEC-ATT-006 implementations now deferred, SEC-ATT-007 is the
    next backend-executable item.
- **Do not block the current PWA attendance flow on App Attest / DeviceCheck.** It
  must keep working, honestly reporting `deviceIntegritySignal: UNAVAILABLE`.

If/when a native iOS build is approved, **Option B (Expo EAS iOS build)** is the
most likely path (reuses the existing Expo investment), executed via the Phase
2→5 rollout in §7 — most naturally alongside the Android native build, since the
gating decision is shared.

---

## 10. Known Limitations

- This document is feasibility/architecture only — it makes no code, schema, or
  behavioral change and produces no security *improvement* by itself. The
  residual risk on threats #1/#2/#11 for PWA/iOS users is unchanged.
- Effort/cost tiers in §4 are estimates, not verified figures; confirm EAS
  pricing, Apple Developer Program cost, and App Store Connect specifics before
  committing to Option B/C/D.
- Whether native mobile is worth the investment at all is a product/resourcing
  decision this document cannot make (SEC-ATT-001 §15 Open Question #3) — it only
  frames the options and recommends the default.
- The App Attest enrollment (stateful `keyId`/public key/counter) is described
  conceptually only; its exact schema is deliberately left to the eventual
  SEC-ATT-006 implementation and is **not** created here.
- No ADR is created (see the CTO Summary for why): deferral is the elaborated
  status quo, not a new durable architecture commitment.

---

## Related Documents

- [SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md](SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md) — threat model, platform capability matrix, §9 native roadmap (scopes SEC-ATT-006), §15 open questions
- [SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md](SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md) — the Android sibling feasibility (shared native-build blocker)
- [SEC_ATT_ROADMAP.md](SEC_ATT_ROADMAP.md) — canonical SEC-ATT item order
- [CTO_SUMMARY_SEC_ATT_004.md](CTO_SUMMARY_SEC_ATT_004.md) — the nonce/user/action binding this doc proposes reusing as the App Attest challenge
- [CTO_SUMMARY_SEC_ATT_006A.md](CTO_SUMMARY_SEC_ATT_006A.md) — CTO Summary for this feasibility task
- [ADR-029 — Web vs. Mobile Attendance Clock Policy](adr/ADR-029-web-vs-mobile-attendance-clock-policy.md)
- [ADR-025 — STEP Connect PWA Branding and Standalone Delivery](adr/ADR-025-step-connect-pwa-branding-and-standalone-delivery.md)
- [HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md](../HR-Knowledge/04-DOMAINS/Attendance/Attendance%20Module.md)
</content>
</invoke>
