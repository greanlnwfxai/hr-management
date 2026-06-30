# ADR-027 — Mixed Attendance Checkout Exception Workflow

**Status:** Accepted
**Date:** 2026-06-27
**Tasks:** REQ-002F-1 (backend), REQ-002F-2 (mobile), REQ-002F-3 (admin web)
**Related tags:** `v1.2.49`, `v1.2.50`, `v1.2.52`
**Source file:** `docs/adr/ADR-027-mixed-attendance-checkout-exception-workflow.md`

---

## Context

The HR Management System already supported two attendance patterns:

1. **ONSITE (default):** Employee clocks in and out from within the company geofence.
2. **OFFSITE:** Employee with a pre-approved `OffSiteRequest` clocks in from a remote location (geofence bypassed at clock-in; clock-out still enforced).

A gap existed for **ONSITE employees who leave the company premises during the workday** (client meetings, site visits, deliveries). When such an employee attempted to clock out remotely, the standard geofence check returned `422 OUTSIDE_GEOFENCE` and blocked the action.

Key constraints:
- **No schema migration:** `attendanceSource`, `workMode`, `reviewStatus`, `reviewNote` columns already existed on the `Attendance` model.
- **Preserve check-in truth:** `attendanceSource = COMPANY_GEOFENCE` and `workMode = ONSITE` must not be altered.
- **Backend authority:** Backend determines whether the employee is genuinely outside the geofence. The exception must not be exploitable from inside the office.

---

## Decision

### Dedicated exception endpoint

`POST /attendance/offsite/mixed-checkout-exception` — a discrete endpoint separate from the standard clock-out and off-site submission paths.

### Backend-authoritative geofence inversion

The endpoint *requires* the employee to be **outside** the geofence. GPS submitted from inside the company radius returns `422 OUTSIDE_GEOFENCE`.

### ReviewStatus lifecycle

`reviewStatus = PENDING_REVIEW` on submission → `APPROVED` or `REJECTED` by HR. Same lifecycle as standard off-site review records.

### Record identification via existing fields

Mixed checkout records: `attendanceSource = 'COMPANY_GEOFENCE' AND reviewStatus IS NOT NULL`. No new columns or tables required. The `GET /attendance/offsite-review` query was extended to include these records.

### Preserve original check-in truth

`attendanceSource` and `workMode` are read from the existing Attendance row and never changed by the exception flow.

### Audit event with privacy-safe metadata

`ATTENDANCE_MIXED_CHECKOUT_SUBMITTED` — GPS stripped by `audit-log.sanitizer.ts`.

---

## Consequences

**Positive:**
- ONSITE employees who leave for work obligations can check out without returning to the office.
- HR maintains oversight via mandatory review.
- No schema migration required.

**Negative / Trade-offs:**
- Re-submission after rejection not supported.
- `GET /attendance/offsite-review` queue now surfaces two record types; no `type` filter yet (deferred OD-3).

---

## Related Notes

- [[ADR-022 Off-site Work Request Workflow]]
- [[ADR-020 Attendance Geofence and Admin Configuration]]
- [[ADR-021 Failed Geofence Attempt Audit]]
- [[ADR-028 Fresh GPS Requirement for Attendance Actions]]
- [[Mixed Checkout Exception]]
- [[Attendance Geofence]]

#adr #attendance #geofence #mixed-checkout #v1-2-49
