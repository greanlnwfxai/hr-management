# ADR-029 — Web vs. Mobile Attendance Clock Policy

**Status:** Accepted
**Date:** 2026-07-02
**Tasks:** HOTFIX-ATTENDANCE-UI-001 (v1.2.66)
**Related tags:** `v1.2.66-disable-web-clock-actions`
**Implementation reference:** `docs/CTO_SUMMARY_HOTFIX_ATTENDANCE_UI_001.md`

---

## Context

The Web/Admin attendance page (`apps/web/app/(app)/attendance/page.tsx`) rendered
active clock-in ("เข้างาน") and clock-out ("ออกงาน") buttons that called the same
`POST /attendance/clock-in` / `POST /attendance/clock-out` endpoints used by the
STEP Connect mobile PWA. The web buttons captured no location and performed no
geofence check, unlike the mobile path (see ADR-020, ADR-028), so any
authenticated user could record attendance from a desktop browser at any
location — including from home, bypassing the entire GPS/geofence enforcement
model. This was a policy gap in the UI layer, not a backend defect: the backend
clock-in/out endpoints have never distinguished caller platform, and mobile
geofence enforcement (ADR-020) only applies when the request body sets
`source: "mobile"`.

## Decision

Disable clock-in/out actions on the Web/Admin attendance page entirely. The web
`/attendance` page becomes **view/review/history only**:
- Today's attendance summary (check-in/out time, status) — still shown, read-only
- My attendance history with date filters — unchanged
- Admin "All Attendance Records" list and off-site review — unchanged
- The clock-in/out buttons are replaced by a bilingual informational panel
  (`data-testid="mobile-only-notice"`) directing the user to STEP Connect Mobile

**STEP Connect Mobile/PWA is the only supported clock-in/out channel.** The
mobile geofence enforcement path (ADR-020) remains the sole mechanism by which
an attendance action is validated against the company location.

This is a **frontend-only, UX-layer decision**. It does not modify:
- `POST /attendance/clock-in` / `POST /attendance/clock-out` — endpoints remain
  open to any authenticated role, unchanged, because the mobile app still calls
  them directly (see RBAC matrix in [[RBAC Rules]] / `docs/adr/ADR-006`)
- Backend geofence validation logic (ADR-020) — untouched
- The RBAC role matrix — no role gained or lost API-level access

## Consequences

**Positive:**
- Eliminates the only clock-in/out path with no location capture and no
  geofence check, closing a real location-spoofing / "clock in from home" risk.
- Reduces the attendance page's surface area to what it is now used for:
  review and history, consistent with admin/HR's actual usage pattern.
- No backend risk introduced — no endpoint behavior changed.

**Negative / Trade-offs:**
- Employees without the mobile PWA installed have no in-browser fallback for
  clock-in/out. This is intentional: the policy explicitly requires GPS/geofence
  enforcement, which only the mobile path provides.
- The backend clock-in/out endpoints remain callable directly (e.g. via `curl`)
  by any authenticated user without geofence validation unless `source:
  "mobile"` triggers it — this ADR only removes the browser UI affordance, it
  does not add backend-side platform enforcement. See Follow-up.

## Follow-up

This ADR intentionally leaves a gap that the next initiative, **SEC-ATT-001
Cross-Platform Attendance Anti-Spoofing**, is scoped to close: strengthening the
backend so that clock-in/out cannot be spoofed by a client claiming
`source: "mobile"` without genuinely running on a mobile device, and evaluating
whether the backend should reject non-mobile-sourced clock actions outright
rather than relying on UI-layer removal alone.

## Related ADRs

- ADR-020 — Attendance Geofence and Admin Configuration (backend enforcement
  this policy protects; unchanged)
- ADR-022 — Off-site Work Request Workflow (mobile-only off-site clock-in path)
- ADR-027 — Mixed Attendance Checkout Exception Workflow (mobile-only exception
  path)
- ADR-028 — Fresh GPS Requirement for Attendance Actions (mobile GPS freshness
  this policy relies on)
- ADR-006 — Role-Based Access Control (clock-in/out endpoint RBAC, unchanged by
  this decision)
