# CTO Summary

## Step
SEC-ATT-005A — Android Play Integrity Feasibility & Architecture Decision

## Status
PASS

> **Two separate verdicts — do not collapse them:**
> - **This documentation step: PASS** — the feasibility/architecture deliverable
>   was produced and verified (docs-safe checks below).
> - **The Play Integrity *implementation* (SEC-ATT-005): HOLD / DEFER** — see
>   §12 and the recommendation. "HOLD" is the recommendation for the *future
>   implementation task*, not a failure of this task.

## 1. Scope
Feasibility and architecture-decision task only. Evaluates whether/how Android
Play Integrity could be added to HR Management attendance security, compares
architecture options, defines the conceptual backend/native prerequisites and a
phased rollout, and records a recommended **decision to DEFER** implementation
until a native Android build strategy is approved.

**Explicitly NOT done** (per task guardrails): no Play Integrity runtime code, no
native Android app, no Expo EAS build setup, no Android signing, no Play Console
integration, no backend token-verification endpoint, no schema/migration, no
mobile/attendance runtime change, no SEC-ATT-006 (iOS) or SEC-ATT-007 (risk
scoring) work. No git mutation performed.

## 2. Files Created / Updated
**Created:**
- `docs/SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md` — the feasibility &
  architecture decision document.
- `docs/CTO_SUMMARY_SEC_ATT_005A.md` — this summary.

**Updated:**
- `docs/SEC_ATT_ROADMAP.md` — added SEC-ATT-005A as a feasibility precursor to
  SEC-ATT-005 (SEC-ATT-005 **not** renumbered); refreshed the "next actual task"
  pointer to reflect 005 feasibility complete → DEFER, next executable work is
  SEC-ATT-006A / SEC-ATT-007 planning.
- `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` — recorded the
  SEC-ATT-005A feasibility conclusion (Play Integrity unavailable on PWA;
  deferred pending native-build decision).
- `HR-Knowledge/01-START-HERE/Current Status.md` — refreshed the stale "Next
  Recommended Task" (was still SEC-ATT-002, though 002–004 are complete) to
  reflect current reality.

**Not created — ADR.** No new ADR was written. SEC-ATT-001 §9/§15 (Open Q#3)
already record that SEC-ATT-005/006 are blocked on a native-build product
decision, and ADR-029 already set the web-vs-mobile clock policy. This document
makes **no new durable architecture commitment** — "defer until a native Android
strategy is approved" is the elaborated status quo, not a new decision. The
ADR-worthy moment is when native-build investment is *actually approved* (a real
architectural commitment with downstream consequences), not the decision to keep
waiting.

## 3. Current Architecture Finding
- STEP Connect is Expo Router delivered **only as a PWA** (ADR-025). No native
  Android build, no Play Store listing, no signed Android binary exists today.
- The current attendance channel is hardened at the payload/backend layer:
  SEC-ATT-002 (payload metadata + freshness), SEC-ATT-003 (stale/future/mock
  rejection), SEC-ATT-004 (server nonce/replay protection, production-verified).
- Play Integrity is a **native Android API bound to a signed, Play-registered
  package** — there is no browser-JS entry point. It is **categorically
  unavailable** on the current PWA and must be reported as
  `deviceIntegritySignal: UNAVAILABLE`, never implied as partial/soft.

## 4. Feasibility Conclusion
Android Play Integrity is **feasible only with a native Android build (or native
wrapper)**, which does not exist and has not been approved. It would add real
device/app-integrity signal for the native cohort (reducing residual risk on
SEC-ATT-001 threats #1/#2/#11) but is **not** a location-integrity API, is **not**
bypass-proof, and belongs as a **risk signal feeding SEC-ATT-007**, not a binary
gate. It is additive to — not a replacement for — the existing payload hardening
and replay protection.

## 5. Options Compared
| Option | Effort | Security benefit | Roadmap fit | Verdict |
|---|---|---|---|---|
| **A — Defer, keep PWA + backend controls** | None | None beyond current (status quo, honestly reported) | High — backend work unblocked | **Recommended now** |
| **B — Expo EAS Android build** | Medium | High (native cohort) | Medium — reuses Expo | **Most likely eventual path if native approved** |
| **C — Native wrapper (WebView/TWA)** | Medium | Medium-High | Low-Medium — weaker than B given Expo already present | Not preferred |
| **D — Full native Android app** | High | High | Deferred — justified only if native mobile is a broader product priority | Overkill for Play Integrity alone |

Full dimension-by-dimension matrix (complexity, cost/time, operational, release,
security, testing, maintenance, roadmap fit) is in the feasibility doc §4.

## 6. Recommended Decision
**DEFER SEC-ATT-005 (Android Play Integrity) implementation** until a native
Android build strategy is explicitly approved. Concurrently proceed with work
that is **not** blocked on that decision: **SEC-ATT-006A (iOS App
Attest/DeviceCheck feasibility)** and **SEC-ATT-007 (risk scoring + review queue)
planning**. **Do not block the current PWA attendance flow on Play Integrity** —
it must keep working, reporting `deviceIntegritySignal: UNAVAILABLE`. If native
is later approved, **Option B (Expo EAS)** via the §7 Phase 2→5 rollout is the
most likely path.

## 7. Security / Privacy Review
| Field | Assessment |
|---|---|
| Auth impact | None. No endpoint added/changed; no guard/JWT change. |
| RBAC impact | None. No role checks added/changed. |
| Data privacy impact | None. Docs only. Conceptual future design mandates categorical `deviceIntegritySignal` only — no raw tokens, coordinates, or device IDs. |
| Password/token/hash impact | None. No password/JWT/hash handling changed. Future raw integrity token must be verified-and-discarded (same discipline as the SEC-ATT-004 raw nonce). |
| Mobile security impact | None to runtime. Documents that Play Integrity requires a native build; PWA remains `UNAVAILABLE`. No mobile token storage/API change. |
| Dependency/advisory impact | None. No package added to api/web/mobile. `security-review.sh` re-surfaces only the pre-existing, already-accepted Multer audit findings — unrelated to this task, no new packages. |
| Secrets/logging check | Clean. Package name / signing / service-account credential appear only as `TBD` placeholders — no real keystore, SHA fingerprint, or service-account JSON. `secret-scan.sh` PASS. |
| New endpoints protected | None (no endpoints added). |
| Risk level | LOW |
| Security decision | PASS |

## 8. Runtime Impact
None. Documentation only. No API, mobile, web, or DB behavior changes. The PWA
attendance flow is unchanged and explicitly not blocked on Play Integrity.

## 9. Schema / Migration Impact
None. No Prisma schema change, no migration, no DB access. No migration was run;
no production DB was touched.

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
  residual risk on threats #1/#2/#11 for PWA users is unchanged.
- Effort/cost figures in the feasibility doc §4 are relative estimates, not
  verified numbers — confirm EAS pricing / Play Console specifics before
  committing to Option B/C/D.
- Whether to invest in native mobile at all is a product/resourcing decision
  outside this task's authority (SEC-ATT-001 §15 Open Question #3).

## 12. Recommendation: PASS or HOLD
- **This documentation step: PASS** — deliverable produced and verified.
- **SEC-ATT-005 (Play Integrity implementation): HOLD / DEFER** — cannot proceed
  until a native Android build strategy is approved. Next backend-executable
  work is SEC-ATT-006A (iOS feasibility) and SEC-ATT-007 (risk scoring) planning.

## Recommended Commit Message
```
docs(security): add SEC-ATT-005A Android Play Integrity feasibility & decision

Adds docs/SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md and its CTO
summary. Feasibility/architecture only — no code, schema, migration,
mobile, or enforcement change.

Finding: Play Integrity is a native Android API bound to a signed,
Play-registered package; it is categorically unavailable on the current
PWA-only STEP Connect surface. Compares four options (defer / Expo EAS /
native wrapper / full native) and defines the conceptual backend
token-verification path (reusing the SEC-ATT-004 nonce/user/action
binding), native prerequisites, and a 5-phase report-only-first rollout.

Decision: DEFER SEC-ATT-005 implementation until a native Android build
strategy is approved; do not block the PWA attendance flow on Play
Integrity (report deviceIntegritySignal: UNAVAILABLE). Proceed instead
with SEC-ATT-006A (iOS feasibility) and SEC-ATT-007 (risk scoring)
planning. No new ADR (deferral is the elaborated status quo, already
recorded in SEC-ATT-001 §9/§15). Updates roadmap + knowledge notes.
```
</content>
