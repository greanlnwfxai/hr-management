# ADR-027 — Mixed Attendance Checkout Exception Workflow

**Status:** Accepted
**Date:** 2026-06-27
**Tasks:** REQ-002F-1 (backend), REQ-002F-2 (mobile), REQ-002F-3 (admin web)
**Related tags:** `v1.2.49`, `v1.2.50`, `v1.2.52`
**Implementation reference:** `docs/CTO_SUMMARY_REQ_002F_1.md`, `docs/CTO_SUMMARY_REQ_002F_2.md`, `docs/CTO_SUMMARY_REQ_002F_3.md`

---

## Context

The HR Management System already supported two attendance patterns:

1. **ONSITE (default):** Employee clocks in and out from within the company geofence.
2. **OFFSITE:** Employee with a pre-approved `OffSiteRequest` clocks in from a remote location (geofence bypassed at clock-in; clock-out still enforced).

A gap existed for **ONSITE employees who leave the company premises during the workday** (client meetings, site visits, deliveries). When such an employee attempted to clock out remotely, the standard geofence check returned `422 OUTSIDE_GEOFENCE` and blocked the action. The only remedies were to return to the office or ask HR for a manual record correction.

Key constraints:
- **No schema migration:** The `Attendance` model already contained `attendanceSource`, `workMode`, `reviewStatus`, and `reviewNote` columns from prior implementations.
- **Preserve check-in truth:** The original `attendanceSource = COMPANY_GEOFENCE` and `workMode = ONSITE` must not be altered — they reflect how the employee arrived.
- **Backend authority:** The backend, not the mobile client, determines whether the employee is genuinely outside the geofence. The exception must not be exploitable from inside the office.

---

## Decision

### Dedicated exception endpoint

We created a new endpoint `POST /attendance/offsite/mixed-checkout-exception` specifically for this case, rather than reusing the existing clock-out or off-site submission paths.

**Rationale:** Mixing this into the existing clock-out would require augmenting the clock-out DTO with exception-specific fields and complicating the clock-out service logic. A discrete endpoint makes the exception path explicit, auditable, and separately guardable.

### Backend-authoritative geofence inversion

The endpoint *requires* the employee to be **outside** the geofence. If the submitted GPS coordinates are within the company radius, the backend returns `422 OUTSIDE_GEOFENCE`. This prevents an employee from exploiting the exception path while physically at the office.

### ReviewStatus lifecycle: PENDING_REVIEW → APPROVED / REJECTED

Accepted exception submissions set `reviewStatus = PENDING_REVIEW` on the existing Attendance record. HR or admin reviews and approves or rejects. This is the same lifecycle as standard off-site review records.

### Record identification via existing fields

Mixed checkout records are identified by `attendanceSource = 'COMPANY_GEOFENCE' AND reviewStatus IS NOT NULL`. No new columns or tables were required. The same `GET /attendance/offsite-review` query that returns pre-approved OFFSITE records was extended to include these records.

### Preserve original check-in truth

`attendanceSource` and `workMode` are read from the existing Attendance row at submission time and never changed. The exception does not retroactively reclassify the check-in.

### Audit event with privacy-safe metadata

A dedicated audit event `ATTENDANCE_MIXED_CHECKOUT_SUBMITTED` is emitted. GPS coordinates are excluded by `audit-log.sanitizer.ts`. Only safe business metadata (distance bucket, `workLocationName` presence, boolean flags) is recorded.

---

## Consequences

**Positive:**
- ONSITE employees who leave for work obligations can check out without returning to the office.
- HR maintains oversight: every exception requires review.
- No schema migration was required; implementation used existing Prisma columns.
- The exception path is verifiable and auditable end-to-end.

**Negative / Trade-offs:**
- The reject flow introduces a new employee-facing state ("ถูกปฏิเสธ" on mobile) that must be handled gracefully.
- Re-submission after rejection is not supported — HR must manually correct the record if an employee re-submits an invalid exception.
- The `GET /attendance/offsite-review` queue now surfaces two record types (pure OFFSITE and mixed checkout). The Admin UI distinguishes them with a type badge; the absence of a `type` query-parameter filter (deferred as OD-3) means HR cannot yet filter by type.

---

## Related ADRs

- ADR-022 — Off-site Work Request Workflow (sibling workflow; OFFSITE clock-in pre-approval)
- ADR-020 — Attendance Geofence and Admin Configuration (geofence engine this decision extends)
- ADR-021 — Failed Geofence Attempt Audit (audit sanitizer used here)
- ADR-028 — Fresh GPS Requirement for Attendance Actions (mobile GPS freshness companion)
