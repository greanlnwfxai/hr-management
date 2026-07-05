# CTO Summary

## Step
SEC-ATT-006A — iOS App Attest / DeviceCheck Feasibility & Architecture Decision

## Status
PASS

> **Two separate verdicts — do not collapse them:**
> - **This documentation step: PASS** — the feasibility/architecture deliverable
>   was produced and verified (docs-safe checks below).
> - **The App Attest / DeviceCheck *implementation* (SEC-ATT-006): HOLD / DEFER**
>   — see §12 and the recommendation. "HOLD" is the recommendation for the
>   *future implementation task*, not a failure of this task.

## 1. Scope
Feasibility and architecture-decision task only. Evaluates whether/how iOS App
Attest and/or DeviceCheck could be added to HR Management attendance security,
compares architecture options, defines the conceptual backend/native
prerequisites and a phased rollout, and records a recommended **decision to
DEFER** implementation until a native iOS build strategy is approved. Mirrors the
Android SEC-ATT-005A "A = feasibility" convention.

**Explicitly NOT done** (per task guardrails): no App Attest / DeviceCheck runtime
code, no native iOS app, no Expo EAS iOS build setup, no iOS signing/provisioning,
no Apple Developer / App Store Connect setup, no backend
attestation/assertion/token verification endpoint, no schema/migration, no
mobile/attendance runtime change, no SEC-ATT-007 (risk scoring) work. No git
mutation performed.

## 2. Files Created / Updated
**Created:**
- `docs/SEC_ATT_006A_IOS_APP_ATTEST_DEVICECHECK_FEASIBILITY.md` — the feasibility
  & architecture decision document.
- `docs/CTO_SUMMARY_SEC_ATT_006A.md` — this summary.

**Updated:**
- `docs/SEC_ATT_ROADMAP.md` — added SEC-ATT-006A as a feasibility precursor to
  SEC-ATT-006 (SEC-ATT-006 **not** renumbered); advanced the "next
  backend-executable" pointer to SEC-ATT-007 (both 005 and 006 implementations
  now deferred).
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — recorded the
  SEC-ATT-006A feasibility conclusion (App Attest/DeviceCheck unavailable on PWA;
  deferred pending native-build decision).
- `HR-Knowledge/01-START-HERE/Current Status.md` — refreshed "Next Recommended
  Task" from "006A and/or 007" to **007** (006 implementation deferred like 005).

**Not created — ADR.** No new ADR was written, mirroring SEC-ATT-005A's rationale.
SEC-ATT-001 §9 already scopes SEC-ATT-006 and §15 (Open Q#3) already records that
SEC-ATT-005/006 are blocked on a native-build product decision; ADR-029 already
set the web-vs-mobile clock policy. This document makes **no new durable
architecture commitment** — "defer until a native iOS strategy is approved" is the
elaborated status quo. The ADR-worthy moment is when native-build investment is
*actually approved* (a real architectural commitment — and one shared with the
Android path), not the decision to keep waiting.

## 3. Current Architecture Finding
- STEP Connect is Expo Router delivered **only as a PWA** (ADR-025). No native
  iOS build, no App Store/TestFlight listing, no signed iOS binary exists today;
  on iOS the surface is Mobile Safari / Home-Screen WebKit.
- The current attendance channel is hardened at the payload/backend layer:
  SEC-ATT-002 (payload metadata + freshness), SEC-ATT-003 (stale/future/mock
  rejection), SEC-ATT-004 (server nonce/replay protection, production-verified).
- App Attest (`DCAppAttestService`) and DeviceCheck (`DCDevice`) are **native iOS
  framework APIs bound to an Apple app identity and the Secure Enclave** — there
  is no WebKit/browser entry point. They are **categorically unavailable** on the
  current PWA and must be reported as `deviceIntegritySignal: UNAVAILABLE`, never
  implied as partial/soft.

## 4. Feasibility Conclusion
iOS App Attest is **feasible only with a native iOS build (or native wrapper)**,
which does not exist and has not been approved. **App Attest and DeviceCheck are
not co-equal**: App Attest is the real Secure Enclave–backed app/device-integrity
attestation (the Play Integrity analog, with a monotonic assertion counter for
replay defense); DeviceCheck is a secondary, lower-assurance persistent 2-bit
per-device store, useful for abuse flags but **not** app integrity. App Attest
would reduce residual risk on SEC-ATT-001 threats #1/#2/#11 for the native cohort,
but is **not** a location-integrity API (iOS has no mock-location flag), is **not**
bypass-proof, and belongs as a **risk signal feeding SEC-ATT-007**, not a binary
gate. It is additive to — not a replacement for — the existing payload hardening
and replay protection.

**Key iOS-specific divergence from Android:** App Attest is **stateful** — the
backend must persist a per-key enrollment (keyId + public key + monotonic
counter + user/action binding) to verify future assertions. This is a
future-schema footprint the Android Play Integrity design did not have (documented
conceptually in the feasibility doc §5; **no schema change in this task** — see
§9).

## 5. Options Compared
| Option | Effort | Apple Dev acct | Security benefit | Roadmap fit | Verdict |
|---|---|---|---|---|---|
| **A — Defer, keep PWA + backend controls** | None | No | None beyond current (status quo, honestly reported) | High — backend work unblocked | **Recommended now** |
| **B — Expo EAS iOS build** | Medium | Required | High (native cohort) | Medium — reuses Expo | **Most likely eventual path if native approved** |
| **C — Native wrapper (`WKWebView`)** | Medium | Required | Medium-High | Low-Medium — weaker than B given Expo already present | Not preferred |
| **D — Full native iOS app** | High | Required | High | Deferred — justified only if native mobile is a broader product priority | Overkill for App Attest alone |

Full dimension-by-dimension matrix (complexity, cost/time, Apple Developer
account, App Store/TestFlight, operational, release, security, testing,
maintenance, roadmap fit) is in the feasibility doc §4. The native-build decision
is **shared with Android** (SEC-ATT-005A).

## 6. Recommended Decision
**DEFER SEC-ATT-006 (iOS App Attest / DeviceCheck) implementation** until a native
iOS build strategy is explicitly approved — the **same blocker** as Android
SEC-ATT-005. Concurrently proceed with work that is **not** blocked: **SEC-ATT-007
(attendance risk scoring + review queue) planning** — now the next
backend-executable item, since both SEC-ATT-005 and SEC-ATT-006 implementations
are deferred. **Do not block the current PWA attendance flow on App Attest /
DeviceCheck** — it must keep working, reporting `deviceIntegritySignal:
UNAVAILABLE`. If native is later approved, **Option B (Expo EAS)** via the §7
Phase 2→5 rollout is the most likely path, most naturally alongside the Android
native build.

## 7. Security / Privacy Review
| Field | Assessment |
|---|---|
| Auth impact | None. No endpoint added/changed; no guard/JWT change. |
| RBAC impact | None. No role checks added/changed. |
| Data privacy impact | None to runtime. Docs only. Conceptual future design mandates categorical `deviceIntegritySignal` for audit — no raw attestations/assertions/tokens. Documents that a future App Attest enrollment legitimately persists a pseudonymous `keyId` + public key + counter as necessary verification state (not audit data, not gratuitous fingerprinting). |
| Password/token/hash impact | None. No password/JWT/hash handling changed. Future raw attestation objects, assertions, and DeviceCheck tokens must be verified-and-discarded (same discipline as the SEC-ATT-004 raw nonce). |
| Mobile security impact | None to runtime. Documents that App Attest/DeviceCheck require a native iOS build; PWA/WebKit remains `UNAVAILABLE`. No mobile token storage/API change. |
| Dependency/advisory impact | None. No package added to api/web/mobile. `security-review.sh` re-surfaces only the pre-existing, already-accepted Multer audit findings — unrelated to this task, no new packages. |
| Secrets/logging check | Clean. Bundle ID / Team ID / signing / App Attest key / DeviceCheck auth key (`.p8`) appear only as `TBD` placeholders — no real Apple credentials or private keys. `secret-scan.sh` PASS. |
| New endpoints protected | None (no endpoints added). |
| Risk level | LOW |
| Security decision | PASS |

## 8. Runtime Impact
None. Documentation only. No API, mobile, web, or DB behavior changes. The PWA
attendance flow is unchanged and explicitly not blocked on App Attest/DeviceCheck.

## 9. Schema / Migration Impact
**None.** No Prisma schema change, no migration, no DB access. No migration was
run; no production DB was touched. (The App Attest enrollment table is described
**conceptually only** in the feasibility doc §5 as a *future* SEC-ATT-006
footprint; it is deliberately not created here.)

## 10. Verification Commands and Results
Documentation-safe checks only (no build/docker/Prisma — docs-only task):
```
git status                    → new/modified doc files only, as expected
git diff --check              → clean (no whitespace/conflict errors)
./scripts/secret-scan.sh      → PASS (no findings; only TBD placeholders in docs)
./scripts/security-review.sh  → PASS (dependency audit + secret scan; only the
                                 pre-existing, already-accepted Multer findings —
                                 no new packages added by this task)
```
No production deploy, no Prisma migration, no destructive Docker command, no
production DB access — per task guardrails.

## 11. Known Limitations
- Feasibility/architecture only — produces no security improvement by itself;
  residual risk on threats #1/#2/#11 for PWA/iOS users is unchanged.
- Effort/cost figures in the feasibility doc §4 are relative estimates, not
  verified numbers — confirm EAS pricing, Apple Developer Program cost, and App
  Store Connect specifics before committing to Option B/C/D.
- The App Attest stateful enrollment is described conceptually only; its exact
  schema is left to the eventual SEC-ATT-006 implementation.
- Whether to invest in native mobile at all is a product/resourcing decision
  outside this task's authority (SEC-ATT-001 §15 Open Question #3), and is shared
  with the Android native-build decision.

## 12. Recommendation: PASS or HOLD
- **This documentation step: PASS** — deliverable produced and verified.
- **SEC-ATT-006 (App Attest / DeviceCheck implementation): HOLD / DEFER** — cannot
  proceed until a native iOS build strategy is approved. With both SEC-ATT-005 and
  SEC-ATT-006 implementations deferred, the next backend-executable work is
  **SEC-ATT-007 (risk scoring + review queue) planning**.

## Recommended Commit Message
```
docs(security): add SEC-ATT-006A iOS App Attest/DeviceCheck feasibility & decision

Adds docs/SEC_ATT_006A_IOS_APP_ATTEST_DEVICECHECK_FEASIBILITY.md and its
CTO summary. Feasibility/architecture only — no code, schema, migration,
mobile, or enforcement change.

Finding: App Attest (DCAppAttestService) and DeviceCheck (DCDevice) are
native iOS framework APIs bound to an Apple app identity and the Secure
Enclave; both are categorically unavailable on the current PWA-only STEP
Connect surface (no WebKit entry point). App Attest and DeviceCheck are
not co-equal — App Attest is the app/device-integrity attestation (Play
Integrity analog, with a monotonic assertion counter), DeviceCheck a
secondary per-device abuse-bit store. Key iOS divergence from Android:
App Attest is stateful (server must persist keyId + public key + counter
enrollment) — a future-schema footprint documented conceptually only.

Compares four options (defer / Expo EAS / native wrapper / full native)
and defines the conceptual backend verification path (App Attest challenge
= SEC-ATT-004 nonce), native/Apple prerequisites, and a 5-phase
report-only-first rollout.

Decision: DEFER SEC-ATT-006 implementation until a native iOS build
strategy is approved (same blocker as SEC-ATT-005, a shared native-build
decision); do not block the PWA attendance flow on App Attest/DeviceCheck
(report deviceIntegritySignal: UNAVAILABLE). Next backend-executable work
is SEC-ATT-007 (risk scoring) planning. No new ADR (deferral is the
elaborated status quo, already recorded in SEC-ATT-001 §9/§15). Updates
roadmap + knowledge notes.
```
</content>
