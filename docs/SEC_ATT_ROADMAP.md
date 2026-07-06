# SEC-ATT Roadmap — Cross-Platform Attendance Anti-Spoofing

> **Orientation index, not a spec.** This document lists the planned SEC-ATT
> work items and their intended order. It records scope and sequencing only —
> each item gets its own design/spec document when work on it begins.
>
> SEC-ATT-001 through SEC-ATT-004 are now complete — see
> [SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md](SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md)
> for the full threat model, platform capability matrix, and design
> reference for SEC-ATT-002 through SEC-ATT-007,
> [CTO_SUMMARY_SEC_ATT_002.md](CTO_SUMMARY_SEC_ATT_002.md) for what SEC-ATT-002
> actually shipped, [CTO_SUMMARY_SEC_ATT_003.md](CTO_SUMMARY_SEC_ATT_003.md)
> for what SEC-ATT-003 actually shipped, and
> [CTO_SUMMARY_SEC_ATT_004.md](CTO_SUMMARY_SEC_ATT_004.md) for what SEC-ATT-004
> actually shipped. SEC-ATT-005 (Android Play Integrity) and
> SEC-ATT-006 (iOS App Attest / DeviceCheck) have both now been
> **feasibility-assessed** —
> [SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md](SEC_ATT_005A_ANDROID_PLAY_INTEGRITY_FEASIBILITY.md)
> (with [CTO_SUMMARY_SEC_ATT_005A.md](CTO_SUMMARY_SEC_ATT_005A.md)) and
> [SEC_ATT_006A_IOS_APP_ATTEST_DEVICECHECK_FEASIBILITY.md](SEC_ATT_006A_IOS_APP_ATTEST_DEVICECHECK_FEASIBILITY.md)
> (with [CTO_SUMMARY_SEC_ATT_006A.md](CTO_SUMMARY_SEC_ATT_006A.md)) — and **both
> recommend DEFER**: Play Integrity and App Attest/DeviceCheck are categorically
> unavailable on the current PWA and cannot proceed until a native build strategy
> is approved (still open, §15 Open Question #3 in the spec — a single decision
> spanning both platforms). With both 005 and 006 implementations deferred,
> **SEC-ATT-007A (attendance risk scoring + review queue backend foundation)
> is now complete** — see
> [CTO_SUMMARY_SEC_ATT_007A.md](CTO_SUMMARY_SEC_ATT_007A.md). It records a
> privacy-safe `AttendanceRiskReview` row (categorical reason codes + derived
> risk level only — never raw GPS/nonce/tokens) whenever an existing
> SEC-ATT-002/003/004 check flags or rejects a clock-in/out, and exposes
> SUPER_ADMIN/HR_ADMIN-only review-queue APIs. **SEC-ATT-007B (Admin Web UI
> for the review queue) is now also complete** — see
> [CTO_SUMMARY_SEC_ATT_007B.md](CTO_SUMMARY_SEC_ATT_007B.md). It adds a
> SUPER_ADMIN/HR_ADMIN-only page at `/attendance/risk-reviews` (filterable
> queue table + a detail/review modal), consuming the SEC-ATT-007A APIs only
> — no backend/schema change. With both 007A and 007B complete, there is no
> further SEC-ATT-007 work queued; the remaining open items are SEC-ATT-005/
> 006 (native Play Integrity/App Attest), both DEFERRED pending the shared
> native-build decision. Do not block the PWA attendance flow on Play
> Integrity, App Attest/DeviceCheck, or risk scoring.

## Background

Web clock-in/out was disabled in v1.2.66 (ADR-029) because the web/PWA client
cannot strongly prove device integrity. Mobile (STEP Connect) is the only
supported attendance-clock channel, but the backend does not yet fully harden
that channel against a spoofed or simulated mobile client. SEC-ATT-001 through
SEC-ATT-007 are the planned steps to close that gap.

## Architecture Note

- A PWA/web client **cannot** strongly prove device integrity — there is no
  equivalent of a native attestation API available to browser JavaScript.
- Strong anti-spoofing (Play Integrity, App Attest/DeviceCheck) **requires** a
  native app or native wrapper for Android/iOS. This is out of scope until a
  native or native-wrapper mobile build exists.
- Backend request/payload validation does **not** require a native wrapper and
  should be implemented first — it raises the bar against casual spoofing
  immediately, for both the current PWA and any future native client.
- Raw GPS coordinates should be avoided in logs, docs, and audit trails where
  possible — existing audit sanitization already denylists raw GPS fields (see
  [[Audit Log Module]] / ADR-021); new SEC-ATT work must preserve that
  convention.

## Roadmap

| Item | Scope | Depends on native wrapper? |
|---|---|---|
| SEC-ATT-001 | Cross-platform attendance anti-spoofing spec — defines the overall threat model and phased plan for SEC-ATT-002 through 007 | No (spec only) |
| SEC-ATT-002 ✅ | Mobile attendance payload hardening — tighten what the client sends and how the backend validates shape/freshness of the payload | No |
| SEC-ATT-003 ✅ | Backend rejection of mock/simulated/stale location — server-side checks against mock-location flags, GPS staleness, and implausible movement | No |
| SEC-ATT-004 ✅ | Server nonce / replay protection — prevent a captured clock-in/out request from being replayed | No |
| SEC-ATT-005A | Android Play Integrity **feasibility & architecture decision** — options matrix, conceptual backend/native prerequisites, phased rollout; recommends DEFER (spec/decision only, no build) | No (feasibility only) |
| SEC-ATT-005 | Android Play Integrity — device/app attestation for Android | Yes (DEFERRED — see SEC-ATT-005A) |
| SEC-ATT-006A | iOS App Attest / DeviceCheck **feasibility & architecture decision** — options matrix, conceptual (stateful) backend/native prerequisites, phased rollout; recommends DEFER (spec/decision only, no build) | No (feasibility only) |
| SEC-ATT-006 | iOS App Attest / DeviceCheck — device/app attestation for iOS | Yes (DEFERRED — see SEC-ATT-006A) |
| SEC-ATT-007A ✅ | Attendance risk scoring + review queue **backend foundation** — new `AttendanceRiskReview` table; scores sanitized reason codes from the existing SEC-ATT-002/003/004 checks into LOW/MEDIUM/HIGH/CRITICAL; SUPER_ADMIN/HR_ADMIN-only list/read/review APIs. No Admin Web UI. See [CTO_SUMMARY_SEC_ATT_007A.md](CTO_SUMMARY_SEC_ATT_007A.md). | No |
| SEC-ATT-007B ✅ | Admin Web UI for the risk-review queue — filterable queue table + detail/review modal at `/attendance/risk-reviews` (SUPER_ADMIN/HR_ADMIN only), consumes SEC-ATT-007A's APIs only, no backend/schema change. See [CTO_SUMMARY_SEC_ATT_007B.md](CTO_SUMMARY_SEC_ATT_007B.md). | No |

## Sequencing Rationale

Items 002–004 and 007A/007B are backend/web-only and can proceed against the
current PWA/mobile-web client. Items 005–006 require a native app or native
wrapper and are blocked on that decision being made separately; they are
ordered last so backend hardening isn't blocked waiting on a mobile platform
decision. Their feasibility precursors (SEC-ATT-005A, SEC-ATT-006A) are
complete and both recommend DEFER; SEC-ATT-007A/007B (backend foundation +
Admin Web UI) are both now complete, so there is no further executable
SEC-ATT-007 item — the only open items are 005/006, both blocked on the
native-build decision.

## Related Notes

- [[Attendance Module]]
- [[ADR-029 Web vs Mobile Attendance Clock Policy]]
- [[ADR-028 Fresh GPS Requirement for Attendance Actions]]
- [[ADR-021 Failed Geofence Attempt Audit]]
- [[Mixed Checkout Exception]]
- [[Current Status]]
