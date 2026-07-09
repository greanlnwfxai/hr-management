# Off-site Work Mode

> Implemented: T-071 (v1.2.0)
> See [[ADR-022 Off-site Work Request Workflow]] for the full architectural decision.

---

## Business Rule

An employee working off-site (client visit, field assignment, remote work) can request pre-approval for off-site attendance for a specific date. When an approved request exists for today, the employee can clock in from their actual location using `workMode: "OFFSITE"`.

**Off-site approval is the gating mechanism.** The mobile client cannot bypass geofence unilaterally. The clock-in is rejected with 403 if no approved off-site request exists for that employee and date.

**Clock-out is not affected.** `POST /attendance/clock-out` always enforces the geofence regardless of `workMode`.

---

## Off-site Request Lifecycle

```
[Employee submits request] → status: PENDING
         │
         ├── Admin/Manager approves ──► status: APPROVED
         │                              (clock-in allowed for that date)
         │
         └── Admin/Manager rejects ──► status: REJECTED
                                       (re-submission allowed for same date)
```

Only `PENDING` requests can be approved or rejected. One PENDING or APPROVED request per employee per date (overlap guard returns 409 on re-submission). REJECTED can be resubmitted.

---

## Off-site Clock-in Validation Sequence

Runs when `workMode === "OFFSITE"` and `source === "mobile"`:

1. **GPS fields required** — `latitude`, `longitude`, `accuracy` must all be present → 422 if missing
2. **Approved request required** — lookup `OffSiteRequest` where `{employeeId, date: today, status: APPROVED}` → 403 `ไม่พบคำขอทำงานนอกสถานที่ที่อนุมัติแล้วสำหรับวันนี้` if not found
3. **Radius check skipped** — geofence radius is not enforced for OFFSITE clock-in
4. Proceed with normal clock-in rules (LATE evaluation, duplicate check, etc.)

**Key distinction from ONSITE:** GPS coordinates are still required, but the distance-from-office check is bypassed.

---

## Off-site API Endpoints

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | /off-site/request | Any (JWT) | Submit off-site request for a target date |
| GET | /off-site/me | Any (JWT) | Own off-site requests (paginated) |
| GET | /off-site | SUPER_ADMIN, HR_ADMIN, MANAGER | All off-site requests (org-wide, paginated) |
| GET | /off-site/:id | Any (owner or admin) | Single off-site request |
| PATCH | /off-site/:id/approve | SUPER_ADMIN, HR_ADMIN, MANAGER | Approve PENDING (MANAGER: own-department only) |
| PATCH | /off-site/:id/reject | SUPER_ADMIN, HR_ADMIN, MANAGER | Reject PENDING (MANAGER: own-department only) |

---

## Query Parameters

`POST /off-site/request` body:

| Field | Type | Description |
|---|---|---|
| `date` | string (ISO date) | Target date for off-site work |
| `reason` | string? | Optional reason (max length per DTO) |

`GET /off-site` and `GET /off-site/me`:

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default 1) |
| `limit` | number | Page size (default 20) |
| `status` | OffSiteStatus | Filter by PENDING / APPROVED / REJECTED |
| `date` | string | Filter by date |
| `employeeId` | string | Filter by employee (admin/manager list only) |

---

## Manager Approval Scope

| Role | Approve scope |
|---|---|
| SUPER_ADMIN | All employees |
| HR_ADMIN | All employees |
| MANAGER | Own managed department only (via `Department.managerId`) |

MANAGER list access (`GET /off-site`) is org-wide — scoping applies only to approve/reject.

See [[ADR-023 Department Manager Leave Approval Scope]] for the scoping mechanism.

---

## RBAC

| Operation | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| Submit request (POST /off-site/request) | ✅ | ✅ | ✅ | ✅ |
| Own list (GET /off-site/me) | ✅ | ✅ | ✅ | ✅ |
| All list (GET /off-site) | ✅ | ✅ | ✅ | ❌ |
| Read single (GET /off-site/:id) | ✅ | ✅ | ✅ | owner only |
| Approve/reject | ✅ | ✅ | own-dept only | ❌ |

---

## Audit Events

| Event | Trigger |
|---|---|
| `OFFSITE_APPROVED` | PATCH /off-site/:id/approve success |
| `OFFSITE_REJECTED` | PATCH /off-site/:id/reject success |

Audit metadata includes: `offSiteRequestId`, `employeeId`, `date`, `status`, and `hasRejectReason` (rejection only). No GPS data is logged.

Audit writes are best-effort. A failed audit write does not affect the approve/reject response.

---

## Attendance `workMode` Field

The `Attendance` model now carries a `workMode` field (`ONSITE | OFFSITE`). New records default to `ONSITE`. All historical records are unaffected (existing rows default to `ONSITE` via DB default).

When an off-site clock-in succeeds, the `workMode` is set to `OFFSITE` in the created attendance record. The `offSiteRequestId` is included in the `ATTENDANCE_CLOCK_IN` audit metadata (not stored on the Attendance row).

---

## Privacy

Employee GPS coordinates during off-site clock-in are used for presence capture only and are not stored in any table or audit log. The off-site approval workflow records no location data.

---

## Web UI

Off-site request management is at `/offsite` in the web admin. Supports list view and approve/reject actions for SUPER_ADMIN, HR_ADMIN, and MANAGER.

---

## Mobile UI

Employees submit off-site requests from the `offsite-request` screen. The `GeofenceMapModal` component shows a map view during off-site clock-in for location awareness.

Off-site **clock-in/clock-out** (as opposed to the pre-approval request above) are separate STEP Connect screens: `apps/mobile/app/offsite-checkin.tsx` (GPS, required `workLocationName` + `reason`, optional `note`) and `apps/mobile/app/offsite-checkout.tsx` (GPS, required `note` as of REQ-002E-F1). Both screens submit through the shared `apps/mobile/src/hooks/useOffsiteAttendance.ts` hook, which is the single place that attaches `capturedAt`/`timezoneOffsetMinutes`/`platform`/the SEC-ATT-004 replay nonce and enforces the client-side GPS-accuracy guard (rejects >100m fixes before they leave the device, mirroring the server DTO's `@Max(100)`). Validation and payload-building are pure functions in `apps/mobile/src/utils/offsiteAttendance.ts`, unit-tested independently of the screens. See [docs/CTO_SUMMARY_REQ_002E.md](../../../docs/CTO_SUMMARY_REQ_002E.md) (initial UI) and [docs/CTO_SUMMARY_REQ_002E_F1_OFFSITE_SUBMIT_NORMALIZATION.md](../../../docs/CTO_SUMMARY_REQ_002E_F1_OFFSITE_SUBMIT_NORMALIZATION.md) (submit-path normalization + required check-out note).

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Clock-out geofence not bypassed for OFFSITE employees | `clockOut()` validates geofence regardless of workMode — **OFFSITE-mode** employees must be within radius to clock out. This limitation remains. For **ONSITE** employees who are outside the geofence at clock-out, the mixed checkout exception path is available. See [[Mixed Checkout Exception]]. |
| List visibility org-wide for MANAGER | MANAGER sees all off-site requests; scoping is approve/reject only |
| No notification on approval | Employee is not notified when their request is approved; they must check status manually |

---

## Related Notes

- [[Attendance Module]]
- [[Attendance Geofence]]
- [[Mixed Checkout Exception]]
- [[ADR-022 Off-site Work Request Workflow]]
- [[ADR-023 Department Manager Leave Approval Scope]]
- [[RBAC Rules]]
- [docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md](../../../docs/PRODUCTION_INCIDENT_LEAVE_ADJUSTMENTS_MIGRATION.md) — production migration-drift recovery for the extended attendance fields (`attendanceSource`, review fields) this mode depends on

#domain #attendance #off-site #mobile #geofence #v1-2-0
