# Mixed Checkout Exception

> Implemented: REQ-002F (v1.2.48–v1.2.52)
> Backend: `apps/api/src/attendance/` · Mobile: `apps/mobile/app/mixed-checkout.tsx`
> See [[ADR-027 Mixed Attendance Checkout Exception Workflow]] for the architectural decision.

---

## Business Problem

An ONSITE employee who has clocked in at the company office may legitimately leave the premises during the workday for meetings, site visits, or other work obligations. When they attempt to clock out remotely, the standard geofence check blocks the action with `422 OUTSIDE_GEOFENCE`.

Before this feature, the only option was to wait until they returned to the office or ask HR to manually adjust the record.

---

## Solution: Mixed Checkout Exception

A dedicated exception flow allows the employee to **submit a mixed checkout** — recording the clock-out time from outside the geofence — while flagging the record for HR review.

**"Mixed" means:** check-in via company geofence (ONSITE), check-out via off-site exception.

The original check-in data (`attendanceSource`, `workMode`) is preserved. Only the review status changes.

---

## API Endpoint

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /attendance/offsite/mixed-checkout-exception | ✅ JWT | Any (employee) | Submit mixed checkout — clock-out from outside geofence for today's ONSITE attendance |

### Request Body

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `latitude` | number | −90 to 90, required | Employee's current GPS latitude |
| `longitude` | number | −180 to 180, required | Employee's current GPS longitude |
| `accuracy` | number | 0 < accuracy ≤ 100, required | GPS error radius in meters |
| `workLocationName` | string | required, max 200 chars | Human-readable location name ("Client Office, Silom") |
| `reason` | string | required, max 500 chars | Business reason for being outside the company area |
| `note` | string | optional, max 500 chars | Additional notes |

### Error Responses

| HTTP | Code | Condition |
|---|---|---|
| 422 | `OUTSIDE_GEOFENCE` | Employee is **inside** the geofence — exception not valid |
| 409 | — | Exception already submitted for this attendance record |
| 400 | — | No attendance check-in found for today; or check-out already recorded via normal path |

**Note:** The backend validates that the employee is genuinely outside the company radius. Submitting from inside the geofence returns `422`. This prevents abuse of the exception path.

---

## Backend Logic

1. Resolve today's attendance record for the employee.
2. Verify no clock-out exists yet.
3. Compute distance from employee GPS to company location.
4. If employee is **inside** geofence radius → return `422 OUTSIDE_GEOFENCE`.
5. Record clock-out timestamp.
6. Set `reviewStatus = PENDING_REVIEW`.
7. Preserve `attendanceSource` and `workMode` from original clock-in.
8. Emit audit event `ATTENDANCE_MIXED_CHECKOUT_SUBMITTED` (GPS metadata stripped by sanitizer).

---

## Record Identification

Mixed checkout records are distinguished in the database by:

```
attendanceSource = 'COMPANY_GEOFENCE'
AND reviewStatus IS NOT NULL
```

They surface in the existing off-site review queue alongside pre-approved OFFSITE records.

---

## Review Status Lifecycle

```
[Employee submits exception] → reviewStatus: PENDING_REVIEW
         │
         ├── Admin approves ──► reviewStatus: APPROVED
         │
         └── Admin rejects ──► reviewStatus: REJECTED
                                (reason stored in reviewNote)
```

---

## HR / Admin Review

Mixed checkout exceptions appear in the Admin Web review page at `/attendance/offsite-review` alongside standard off-site records.

Reviewers see:
- **Type badge:** "เช็คอินบริษัท → เช็คเอาท์นอกสถานที่" (ONSITE check-in → off-site check-out)
- Employee name, check-in and check-out time
- `workLocationName` (human text — no raw GPS)
- Distance from company (meters)
- GPS accuracy (meters)
- Reason and note

**RBAC for review:** `SUPER_ADMIN` and `HR_ADMIN` only.

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /attendance/offsite-review | ✅ JWT | SUPER_ADMIN, HR_ADMIN | List pending review records |
| PATCH | /attendance/offsite-review/:id/approve | ✅ JWT | SUPER_ADMIN, HR_ADMIN | Approve exception |
| PATCH | /attendance/offsite-review/:id/reject | ✅ JWT | SUPER_ADMIN, HR_ADMIN | Reject exception (reason required ≥ 3 chars) |

---

## Mobile UX States (STEP Connect)

| State | Trigger | Display |
|---|---|---|
| A | ONSITE employee — standard checkout inside geofence | Normal checkout button in GeofenceMapModal |
| B | ONSITE employee — outside geofence on checkout | GeofenceMapModal shows "เช็คเอาท์นอกสถานที่" (teal CTA) |
| C | Mixed checkout form | `/mixed-checkout` screen: location name, reason, fresh GPS required |
| D | Submitted — awaiting review | Home screen PENDING_REVIEW banner |
| E | Rejected | Home screen shows "ถูกปฏิเสธ" with reviewer note |

**GPS freshness:** The mobile app re-acquires GPS at submit time using `navigator.geolocation.getCurrentPosition` with `{ maximumAge: 0 }`. Accuracy > 100 m blocks submission. See [[ADR-028 Fresh GPS Requirement for Attendance Actions]].

---

## Privacy

| Data | Treatment |
|---|---|
| Employee GPS (lat/lon/accuracy) | Sent to backend for validation; never stored in any table or audit log |
| Distance from company | Displayed to HR reviewers as a safe business metric |
| Raw coordinates | Excluded from `OffsiteReviewRecord` TypeScript type; cannot render in Admin Web |
| Audit event metadata | GPS keys stripped by `audit-log.sanitizer.ts` |

---

## Audit Event

`ATTENDANCE_MIXED_CHECKOUT_SUBMITTED` is emitted on successful submission.

Safe metadata (no GPS):

```json
{
  "attendanceId": "uuid",
  "employeeId": "uuid",
  "workLocationName": "Client Office, Silom",
  "hasReason": true,
  "hasNote": false,
  "distanceBucket": "FAR"
}
```

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Reject flow not production-verified | `REJECTED` state (State E mobile card) exists in code but was not exercised in production QA (v1.2.52). Tested via unit tests. |
| Single office only | Geofence check uses the single configured company location |
| No re-submission after rejection | Employee cannot re-submit a mixed checkout for the same attendance record after HR rejects |

---

## Related Notes

- [[Attendance Module]]
- [[Attendance Geofence]]
- [[Off-site Work Mode]]
- [[Attendance Rules]]
- [[ADR-027 Mixed Attendance Checkout Exception Workflow]]
- [[ADR-028 Fresh GPS Requirement for Attendance Actions]]
- [[API Route Index]]

#domain #attendance #geofence #mobile #off-site #mixed-checkout #v1-2-49
