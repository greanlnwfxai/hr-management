# SEC-ATT Roadmap — Cross-Platform Attendance Anti-Spoofing

> **Orientation index, not a spec.** This document lists the planned SEC-ATT
> work items and their intended order. It records scope and sequencing only —
> each item gets its own design/spec document when work on it begins.
>
> SEC-ATT-001 and SEC-ATT-002 are now complete — see
> [SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md](SEC_ATT_001_CROSS_PLATFORM_ANTI_SPOOFING_SPEC.md)
> for the full threat model, platform capability matrix, and design
> reference for SEC-ATT-002 through SEC-ATT-007, and
> [CTO_SUMMARY_SEC_ATT_002.md](CTO_SUMMARY_SEC_ATT_002.md) for what SEC-ATT-002
> actually shipped. SEC-ATT-003 is the next actual task.

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
| SEC-ATT-003 | Backend rejection of mock/simulated/stale location — server-side checks against mock-location flags, GPS staleness, and implausible movement | No |
| SEC-ATT-004 | Server nonce / replay protection — prevent a captured clock-in/out request from being replayed | No |
| SEC-ATT-005 | Android Play Integrity — device/app attestation for Android | Yes |
| SEC-ATT-006 | iOS App Attest / DeviceCheck — device/app attestation for iOS | Yes |
| SEC-ATT-007 | Attendance risk scoring + review queue — aggregate signals from 002–006 into a risk score with a human review workflow, reusing the existing `AttendanceReviewStatus` lifecycle from the mixed-checkout-exception workflow ([[Mixed Checkout Exception]], ADR-027) | No (consumes signals from prior items) |

## Sequencing Rationale

Items 002–004 and 007 are backend-only and can proceed against the current
PWA/mobile-web client. Items 005–006 require a native app or native wrapper
and are blocked on that decision being made separately; they are ordered last
so backend hardening isn't blocked waiting on a mobile platform decision.

## Related Notes

- [[Attendance Module]]
- [[ADR-029 Web vs Mobile Attendance Clock Policy]]
- [[ADR-028 Fresh GPS Requirement for Attendance Actions]]
- [[ADR-021 Failed Geofence Attempt Audit]]
- [[Mixed Checkout Exception]]
- [[Current Status]]
