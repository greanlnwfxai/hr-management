# SEC-ATT-005A — Android Play Integrity Feasibility & Architecture Decision

> Status: FEASIBILITY / ARCHITECTURE DECISION ONLY — no code, schema,
> migration, route, mobile, or UI changes. This document evaluates whether and
> how Android Play Integrity could be added to HR Management attendance
> security, compares implementation options, and records a recommended
> **decision to DEFER** implementation until a native Android strategy is
> approved.
>
> This is the feasibility precursor to **SEC-ATT-005** (the actual Play
> Integrity implementation, still blocked). It does **not** replace or renumber
> SEC-ATT-005. It extends — it does not restate —
> [SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md](SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md)
> §9 (Native Integrity Roadmap) and §15 (Open Question #3, native-build
> investment), which already record that SEC-ATT-005/006 are blocked on a
> native-build product decision. Read those sections first; this document adds
> the option matrix, the conceptual backend token-verification path,
> prerequisites, and a phased rollout that §9/§15 deliberately left open.

---

## 1. Purpose & Scope

### Purpose

SEC-ATT-004 (server nonce / replay protection) is complete, deployed, migrated,
and production-verified (`v1.2.76-sec-att-004-nonce-replay-protection`). The next
roadmap item, **SEC-ATT-005 — Android Play Integrity**, has been flagged since
SEC-ATT-001 as blocked on a native-build decision that has not been made. Rather
than open the implementation task against a precondition that does not exist,
this document does the feasibility and architecture work up front so the
product owner can make that native-build decision from a concrete basis.

### In scope (this document)

- Assessment of the current mobile/PWA architecture and why it cannot provide
  Play Integrity.
- What Play Integrity does and does not prove.
- A comparison of architecture options (defer / Expo EAS build / native wrapper
  / full native app) across effort, cost/time, operational, release, security,
  testing, maintenance, and roadmap-fit dimensions.
- A **conceptual** backend design for token verification, if implemented later.
- Mobile/native prerequisites before any implementation can begin.
- A safe, phased rollout strategy.
- Security and privacy constraints binding any future implementation.
- A recommended decision.

### Out of scope (this document)

Per the task guardrails, none of the following are performed here:

- Play Integrity runtime code; backend token-verification endpoint.
- Native Android app; Expo EAS build setup; Android package signing.
- Google Play Console integration.
- Database schema changes; Prisma migrations.
- Mobile runtime changes; attendance enforcement changes.
- SEC-ATT-006 (iOS App Attest / DeviceCheck); SEC-ATT-007 (risk scoring +
  review queue).
- Any real keystore, SHA-256 signing fingerprint, package name, or service
  account credential — all such values appear only as clearly-marked
  placeholders (`TBD`).

---

## 2. Current Mobile Architecture Assessment

### 2.1 Current Mobile / PWA / Expo Web status

- **STEP Connect** is an Expo Router application delivered today **only** as an
  installable PWA (`apps/mobile`, ADR-025). There is **no native Android build,
  no Play Store listing, and no signed Android binary** for this project today.
- On web/PWA, GPS acquisition bypasses `expo-location` and calls
  `navigator.geolocation` directly with `maximumAge: 0` (ADR-028). On native
  (`Platform.OS !== 'web'`) the code path uses `expo-location`'s `Accuracy.High`
  — but **that branch is not exercised by any shipped build**; it exists in
  source only.
- Web dashboard clock-in/out was removed in v1.2.66 (ADR-029). Mobile/PWA is the
  only supported attendance-clock channel.

### 2.2 Why the current PWA cannot provide Play Integrity

This is a hard platform ceiling, restated from SEC-ATT-001 §5:

- Play Integrity is a **native Android API** (`com.google.android.play:integrity`).
  It is invoked from Android app code, is tied to a Play-distributed, signed
  application package, and produces a token signed by Google attesting to the
  device, the app, and the Play account. **There is no browser-JavaScript entry
  point to it.** A PWA running in Chrome (or in an Android WebView) cannot call
  it, cannot obtain a token, and cannot present anything a backend could verify
  as a Play Integrity verdict.
- Even installed as a PWA / "Add to Home Screen," STEP Connect is still a web
  document in a browser sandbox. It has no app-signing identity registered with
  Google Play and no native attestation surface. There is nothing for Play
  Integrity to attest *about*.
- **Do not claim Play Integrity is available, partial, or "soft" on the current
  PWA flow.** It is categorically unavailable until a native Android app exists,
  is signed, and is distributed through Play (or an equivalent signed-native
  channel). Any future CTO Summary must state `deviceIntegritySignal:
  UNAVAILABLE` for PWA clients (SEC-ATT-001 §11) rather than imply coverage.

### 2.3 Security controls already in place (SEC-ATT-001 → 004)

The current attendance channel is **not** unprotected — it is hardened at the
backend/payload layer, which is what a PWA-only surface allows:

| Item | Control | Status |
|---|---|---|
| SEC-ATT-001 | Cross-platform anti-spoofing spec: threat model, platform capability matrix, phased plan | ✅ Spec complete |
| SEC-ATT-002 | Mobile payload hardening: `capturedAt`, `platform`, `timezoneOffsetMinutes`, reserved `nonce`; server-time freshness comparison | ✅ Complete |
| SEC-ATT-003 | Hard rejection of stale / future / invalid `capturedAt`; `isMockLocation` signal reserved for a future native build; runs regardless of `source` | ✅ Complete |
| SEC-ATT-004 | Server-issued single-use nonce (`POST /attendance/nonce`), atomic single-use consumption, replay rejection; missing-nonce soft-enforced pending fleet rollout | ✅ Complete, deployed, production-verified |

Play Integrity would sit **on top of** these — it is a device/app-integrity
signal, not a replacement for payload hardening or replay protection. The
backend remains the authoritative decision point (SEC-ATT-001 §5, ADR-020).

---

## 3. Android Play Integrity Feasibility

### 3.1 What Play Integrity is intended to prove

Play Integrity returns a Google-signed verdict with (broadly) these components:

- **Device integrity** — whether the request comes from a genuine Android device
  that passes system integrity checks (`MEETS_DEVICE_INTEGRITY`,
  `MEETS_BASIC_INTEGRITY`, `MEETS_STRONG_INTEGRITY` tiers).
- **App integrity** — whether the calling app is the unmodified binary Google
  recognizes (`PLAY_RECOGNIZED`) vs. a re-signed/modified package
  (`UNRECOGNIZED_VERSION`) vs. not from Play (`UNEVALUATED`).
- **Account / licensing** — whether the app was obtained/licensed via the Play
  account (`LICENSED` vs. `UNLICENSED`).

### 3.2 What it can help detect

- Requests from **emulators** and many **rooted / tampered** devices (subject to
  tier — strong integrity is hardware-backed).
- A **re-signed or modified** STEP Connect APK (app-integrity mismatch).
- Some categories of automated / non-genuine clients that cannot produce a
  valid Google-signed token at all.

This directly reduces residual risk on SEC-ATT-001 threats **#1 (mock GPS app),
#2 (simulated location), #11 (rooted/jailbroken device)** — but only for users
on the native build.

### 3.3 What it cannot guarantee

- It is **not** a location-integrity API. A genuine, unmodified app on a genuine
  device can still feed the app a spoofed GPS fix (e.g. developer-options mock
  provider, hardware GPS spoofers). Play Integrity attests the *app/device*, not
  the *coordinates*. The `isMockLocation` native flag (reserved in SEC-ATT-003)
  is the location-side complement, not Play Integrity itself.
- It is **not 100% bypass-proof** (SEC-ATT-001 threat #12). Modified OSes,
  hide-root tooling, and emulator passthrough evolve continuously. Play
  Integrity therefore belongs in a **risk signal feeding SEC-ATT-007**, not a
  brittle binary allow/deny gate (SEC-ATT-001 §9, Open Question #5).
- It says nothing about **who** is holding the phone (SEC-ATT-001 threat #15,
  shared-device misuse remains a process control).

### 3.4 Why it requires native Android / a native wrapper

Play Integrity's token is bound to a **signed, Play-registered application
package** and produced by a native API call. A native build (or a native wrapper
hosting the web content and making the native call) is a hard prerequisite:
there must be (a) a native Android package with a stable package name, (b) an app
signing identity registered in Play so Google can evaluate app integrity, and
(c) native code able to invoke the Integrity API and hand the token to the
backend. None of these can be produced by a browser.

### 3.5 Why PWA / browser cannot be treated as equivalent

A PWA has no app-signing identity, no native API surface, and no Play
registration. Any "integrity-like" signal a browser could self-report (user
agent, feature detection) is **trivially spoofable** and provides false
assurance — exactly the trap SEC-ATT-001 §6 warns against for User-Agent/IP.
Treating a browser claim as equivalent to a Google-signed verdict would be
strictly worse than honestly reporting `UNAVAILABLE`.

---

## 4. Architecture Options

Effort / cost / time are given as **relative tiers and rough order-of-magnitude
estimates**, not authoritative figures — actual numbers depend on team
familiarity with Expo native builds, Play Console access, and CI capacity.

### Option A — Defer Play Integrity; continue with PWA + backend controls

Keep STEP Connect PWA-only. Rely on SEC-ATT-002/003/004 (and future 007 risk
scoring) as the full anti-spoofing posture. Revisit when/if a native Android
strategy is approved for independent reasons.

| Dimension | Assessment |
|---|---|
| Implementation complexity | **None** — no build, no code. |
| Cost / time | **~None.** Documentation only (this task). |
| Operational impact | None. No new infra, no Play Console, no service credentials. |
| Release / deployment impact | None. PWA delivery unchanged. |
| Security benefit | **None beyond current.** Threats #1/#2/#11 remain heuristic-only on the PWA — but that is the status quo, honestly reported (`UNAVAILABLE`), not a regression. |
| Testing burden | None. |
| Maintenance burden | None. |
| Roadmap fit | **High.** Backend items (007) proceed unblocked; no premature platform investment. |

### Option B — Expo EAS Android build

Use Expo Application Services (EAS Build) to produce a genuine native Android app
from the existing Expo project, distributed via Play, and add the Play Integrity
API + a backend verification step.

| Dimension | Assessment |
|---|---|
| Implementation complexity | **Medium.** Existing Expo project is the enabler; still requires EAS config, Play Console setup, an Integrity module/config plugin, native token retrieval, and backend verification. |
| Cost / time | **Medium.** Native build pipeline + Play Console onboarding + backend endpoint + rollout. EAS may carry subscription/build-minute cost (verify current pricing before committing). |
| Operational impact | **Medium.** New Play Console account/ownership, app signing (Play App Signing) management, a Google service account for server-side verification, secret storage for that credential. |
| Release / deployment impact | **High.** Introduces an app-store release train (review latency, staged rollout, versioning) alongside the current instant PWA deploys. Dual-surface (PWA + native) during transition. |
| Security benefit | **High (for native users).** Real device/app integrity verdicts; closes most of threats #1/#2/#11 for that cohort. PWA users still `UNAVAILABLE`. |
| Testing burden | **Medium-High.** Requires real physical Android devices (Play Integrity is unreliable on emulators by design); internal test track; verdict-tier tuning against real-world distribution. |
| Maintenance burden | **Medium.** Ongoing native dependency/SDK upkeep, Play policy compliance, signing-key custody, Integrity API/library version tracking. |
| Roadmap fit | **Medium.** Reuses the Expo investment; but pulls the "native build" product decision forward, which SEC-ATT-001 §15 leaves open. |

### Option C — Native Android wrapper around the current mobile app

A thin native Android shell (WebView / Trusted Web Activity hosting the existing
web content) whose only native job is app-signing identity + the Play Integrity
call, forwarding the token to the backend.

| Dimension | Assessment |
|---|---|
| Implementation complexity | **Medium.** Less UI rework than a full rewrite, but a WebView/TWA wrapper is a distinct artifact to build, sign, and maintain, and bridging the native Integrity token into the web-hosted flow adds a JS↔native boundary. |
| Cost / time | **Medium.** Similar Play Console / signing / backend work to Option B; wrapper plumbing instead of full native adoption. |
| Operational impact | **Medium.** Same Play Console / service-account / signing obligations as B. |
| Release / deployment impact | **High.** Same app-store release train as B; the wrapper still ships through Play. |
| Security benefit | **Medium-High.** Real Play Integrity verdict for wrapper users; but a WebView-hosted flow is a larger attack surface than a native UI and can dilute app-integrity assurance if the web content is loaded remotely. |
| Testing burden | **Medium-High.** Real-device testing; plus the native↔web bridge is its own test surface. |
| Maintenance burden | **Medium-High.** Two runtimes to keep aligned (web app + native wrapper), WebView compatibility drift. |
| Roadmap fit | **Low-Medium.** Given STEP Connect is *already* an Expo app that can produce a genuine native build (Option B), a separate WebView wrapper is usually the weaker path — it adds a second artifact without B's benefit of a first-class native runtime. |

### Option D — Full native Android app (later)

Invest in a first-class native Android app (Expo native or bare workflow) as the
primary Android surface, with Play Integrity as one part of a broader native
capability set.

| Dimension | Assessment |
|---|---|
| Implementation complexity | **High.** Largest scope — native UX parity, native navigation, store presence, full platform lifecycle. |
| Cost / time | **High.** Multi-milestone effort well beyond attendance security alone. |
| Operational impact | **High.** Full app-store operational model (releases, crash reporting, device matrix, support). |
| Release / deployment impact | **High.** Committed app-store release cadence. |
| Security benefit | **High.** Strongest integrity posture; also unlocks iOS-parity path (SEC-ATT-006) and native-only capabilities. |
| Testing burden | **High.** Full device-matrix QA. |
| Maintenance burden | **High.** Ongoing native platform ownership. |
| Roadmap fit | **Deferred.** Justified only if native mobile becomes a product priority for reasons broader than attendance anti-spoofing; overkill if Play Integrity is the sole driver. |

### Option summary

- **A** is the correct default *now*: zero cost, no regression, keeps backend
  work unblocked, honestly reports the platform ceiling.
- **B** is the most likely *eventual* path **if** a native Android build is
  approved — it reuses the existing Expo investment and gives first-class native
  integrity.
- **C** is rarely preferable to B given STEP Connect is already Expo-based.
- **D** is justified only if native mobile becomes a broader product priority,
  not for Play Integrity alone.

---

## 5. Backend Impact If Implemented Later (Conceptual)

Design intent only — **no endpoint, DTO, schema, or migration is created by this
task.** This section defines *what* a future SEC-ATT-005 implementation would
need, consistent with SEC-ATT-001 §9 and the existing nonce design (SEC-ATT-004).

- **Integrity-token intake path.** A future request would carry a Play Integrity
  token alongside the existing payload (`capturedAt`, `nonce`, etc.). Two shapes
  are possible — a dedicated verification endpoint, or an additional field on the
  existing clock/nonce flow. The natural fit is to bind integrity verification to
  the **nonce issuance/consumption** already established by SEC-ATT-004: the
  server-issued nonce becomes the Integrity API *requestHash*, tying a specific
  attestation to a specific pending clock action and inheriting the replay
  protection already built.
- **Server-side token verification.** The backend must decode/verify the token
  via Google's Play Integrity verification (server-to-server, using a Google
  service account credential) rather than trusting any client-parsed result. The
  verdict is evaluated server-side; the client never decides.
- **Binding to authenticated user / session / action.** The verdict must be
  bound to the same `userId` + `action` the nonce already binds (SEC-ATT-004),
  so an attestation captured for one user/action cannot be presented for
  another. Reuse the existing binding model — do not invent a parallel one.
- **Privacy-safe audit metadata.** Persist only a **categorical**
  `deviceIntegritySignal` (`PASS` / `FAIL` / `UNAVAILABLE`) and verdict-tier
  category (SEC-ATT-001 §11) — never the raw token, never raw device
  identifiers. `UNAVAILABLE` must be recorded explicitly (never silently
  omitted) so reviewers distinguish "checked and failed" from "not checkable on
  this platform."
- **Safe failure behavior.** Verification outages, timeouts, or `UNAVAILABLE`
  verdicts must not hard-break clock-in/out. Follow the SEC-ATT-004 rollout
  precedent: **report-only / soft-enforce first**, feed the signal to SEC-ATT-007
  risk scoring, and hard-gate (if ever) only after real-device verdict data
  justifies a tier policy (SEC-ATT-001 Open Question #5). Generic, non-revealing
  client errors only.
- **Feature flag / rollout strategy.** Gate enforcement behind config so the
  signal can be collected in report-only mode independent of enforcement, and so
  PWA and pre-native clients (always `UNAVAILABLE`) are never blocked.
- **No raw token logging; no secrets in code or docs.** The raw integrity token
  is verified and discarded — never persisted, never logged, never placed in
  audit metadata (same discipline as the raw nonce in SEC-ATT-004). The Google
  service-account credential is a secret managed via the existing environment/
  secret mechanism, never committed.

---

## 6. Mobile / Native Prerequisites

None of these exist today; all are prerequisites **before** any SEC-ATT-005
implementation task can start. Values shown are placeholders — no real secrets.

1. **Native Android build decision** — an explicit product/resourcing approval
   to invest in a native Android build (Option B/C/D). This is the top-level
   blocker (SEC-ATT-001 §15 Open Question #3).
2. **Android package name** — a stable application ID (e.g.
   `com.<org>.stepconnect` — **TBD**), fixed before Play registration.
3. **Signing key / app signing strategy** — enroll in **Play App Signing**;
   custody plan for the upload key. **No keystore, key, or SHA-256 fingerprint
   is created or recorded in this document.**
4. **Google Play Console setup** — Play Console account/ownership, app listing,
   data-safety declarations, and internal test track provisioning.
5. **Internal / closed testing plan** — an internal test track and a small set
   of **real physical Android devices** (Play Integrity is unreliable on
   emulators by design), across a representative OS/vendor range.
6. **Play Integrity API setup** — enable the Integrity API for the app, choose
   standard vs. classic request flow, and define the acceptable verdict-tier
   policy (feeds SEC-ATT-007, per Open Question #5).
7. **Backend service credential strategy** — a Google service account for
   server-side verification, its credential stored as an environment secret (not
   in source, not in docs), with rotation ownership assigned.
8. **CI/CD release implications** — a native build/release pipeline (EAS or bare)
   added alongside the current instant-PWA deploy flow, with app-store review
   latency and staged rollout accounted for in release planning.

---

## 7. Rollout Strategy (If Approved)

A safe, reversible progression. Each phase gates the next; nothing enforces
until real-device evidence justifies it.

- **Phase 1 — Document & defer (this task).** Feasibility recorded;
  implementation deferred pending the native-build decision. PWA attendance flow
  unchanged and unblocked.
- **Phase 2 — Native Android build proof of concept.** *Only after* the
  native-build decision. Produce a signed internal-track build (Option B most
  likely), confirm it installs and the Integrity API returns a token on real
  devices. No backend enforcement yet.
- **Phase 3 — Backend token verification in report-only mode.** Add
  server-side verification bound to the SEC-ATT-004 nonce/user/action; record
  `deviceIntegritySignal` categorically; **enforce nothing** — collect verdict
  distribution across the real fleet.
- **Phase 4 — Audit / risk-scoring integration (SEC-ATT-007).** Feed the
  categorical verdict into risk scoring and the review queue as one signal among
  several — not a standalone gate.
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

- **Do not log raw Play Integrity tokens.** Verify server-side and discard;
  never persist, never log, never place in audit metadata (same discipline as
  the raw nonce, SEC-ATT-004).
- **Do not store sensitive device identifiers unnecessarily.** Persist only the
  categorical verdict/tier; no hardware IDs, no advertising IDs.
- **Avoid device fingerprinting beyond approved scope.** No long-term device
  identity beyond what a future SEC-ATT-007 signal explicitly justifies; bucket/
  hash rather than store raw identifiers (SEC-ATT-001 §10).
- **Audit only sanitized verdict / risk category.** `deviceIntegritySignal`
  (`PASS`/`FAIL`/`UNAVAILABLE`) and tier category only — never raw tokens,
  coordinates, or device IDs. Reuse `AUDIT_SENSITIVE_KEYS` as defense-in-depth.
- **User-facing errors must be safe and non-sensitive.** Generic messages only;
  never reveal why an integrity check specifically failed in attacker-actionable
  detail (consistent with the geofence/nonce error convention).
- **No production secrets in docs or source.** Package name, signing strategy,
  and service-account credential are described conceptually with `TBD`
  placeholders only. `secret-scan.sh` guards this.

---

## 9. Decision Recommendation

**DEFER SEC-ATT-005 (Android Play Integrity) implementation** until a native
Android build strategy is explicitly approved by the product owner. Rationale:

- Play Integrity is **categorically unavailable** on the current PWA-only
  surface (§2.2, §3.4–3.5). It cannot be implemented without a native Android
  build that does not exist and has not been approved (SEC-ATT-001 §15 Open
  Question #3).
- The current attendance channel is **already hardened** at the layers a PWA
  allows (SEC-ATT-002/003/004; §2.3). Play Integrity is additive, not a gap-fill
  for an unprotected channel.
- Recommended concurrent work that is **not** blocked on the native-build
  decision:
  - **SEC-ATT-006A** — iOS App Attest / DeviceCheck **feasibility** (mirror this
    doc's "A = feasibility" convention; same native-build precondition).
  - **SEC-ATT-007** — attendance risk scoring + review queue **planning**
    (backend-only; consumes existing SEC-ATT-002/003/004 signals; provides the
    home a future integrity verdict would feed into).
- **Do not block the current PWA attendance flow on Play Integrity.** It must
  keep working, honestly reporting `deviceIntegritySignal: UNAVAILABLE`.

If/when a native Android build is approved, **Option B (Expo EAS Android build)**
is the most likely path (reuses the existing Expo investment), executed via the
Phase 2→5 rollout in §7.

---

## 10. Known Limitations

- This document is feasibility/architecture only — it makes no code, schema, or
  behavioral change and produces no security *improvement* by itself. The
  residual risk on threats #1/#2/#11 for PWA users is unchanged.
- Effort/cost tiers in §4 are estimates, not verified figures; confirm EAS
  pricing and Play Console specifics before committing to Option B/C/D.
- Whether native mobile is worth the investment at all is a product/resourcing
  decision this document cannot make (SEC-ATT-001 §15 Open Question #3) — it only
  frames the options and recommends the default.
- No ADR is created (see the CTO Summary for why): deferral is the elaborated
  status quo, not a new durable architecture commitment.

---

## Related Documents

- [SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md](SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md) — threat model, platform capability matrix, §9 native roadmap, §15 open questions
- [SEC_ATT_ROADMAP.md](SEC_ATT_ROADMAP.md) — canonical SEC-ATT item order
- [CTO_SUMMARY_SEC_ATT_004.md](CTO_SUMMARY_SEC_ATT_004.md) — the nonce/user/action binding this doc proposes reusing
- [CTO_SUMMARY_SEC_ATT_005A.md](CTO_SUMMARY_SEC_ATT_005A.md) — CTO Summary for this feasibility task
- [ADR-029 — Web vs. Mobile Attendance Clock Policy](adr/ADR-029-web-vs-mobile-attendance-clock-policy.md)
- [ADR-025 — STEP Connect PWA Branding and Standalone Delivery](adr/ADR-025-step-connect-pwa-branding-and-standalone-delivery.md)
- [HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md](../HR-Knowledge/04-DOMAINS/Attendance/Attendance%20Module.md)
</content>
</invoke>
