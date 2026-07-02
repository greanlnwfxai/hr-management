# ADR-029: Web vs. Mobile Attendance Clock Policy

**Status:** Accepted | **Date:** 2026-07-02

## Decision

Disable clock-in/out actions on the Web/Admin attendance page. Web `/attendance`
is now view/review/history only. STEP Connect Mobile/PWA is the only supported
clock-in/out channel.

## Key Points

- Frontend-only change — `POST /attendance/clock-in|out` endpoints unchanged and
  still open to any authenticated role (mobile calls them directly)
- Backend geofence enforcement (ADR-020) untouched
- Web page shows a bilingual "use STEP Connect Mobile" notice in place of the
  removed clock-in/out buttons
- Reduces location-spoofing risk: web had no GPS capture or geofence check
- Follow-up: SEC-ATT-001 Cross-Platform Attendance Anti-Spoofing roadmap

## Source

`docs/adr/ADR-029-web-vs-mobile-attendance-clock-policy.md`

#adr #attendance #security #mobile
