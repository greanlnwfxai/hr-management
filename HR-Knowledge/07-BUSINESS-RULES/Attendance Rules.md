# Attendance Rules

## Company Timezone

**Asia/Bangkok — UTC+7 — permanently fixed.**

Thailand observes no Daylight Saving Time. The +7h offset never changes.

## LATE Evaluation Rule

| Clock-in time (Asia/Bangkok) | Status |
|---|---|
| Before 08:30:00 | PRESENT |
| Exactly 08:30:00 | PRESENT |
| 08:30:01 or later | LATE |

**Strictly after 08:30 Bangkok time = LATE. Exactly 08:30:00 = PRESENT.**

## How LATE Is Evaluated

The server computes the Bangkok wall-clock time from the UTC timestamp at clock-in:

```typescript
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no DST

private isLateInBangkok(now: Date): boolean {
  const bangkokWallClock = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const hour = bangkokWallClock.getUTCHours();
  const minute = bangkokWallClock.getUTCMinutes();
  return hour > 8 || (hour === 8 && minute > 30);
}
```

No external library. The status is computed at clock-in time and stored in the `Attendance` record.

## Work Schedule

The current schedule presented across web/mobile UI and attendance summaries is:

- `08:30–17:30`

## Storage vs Evaluation

- **Stored in DB**: UTC timestamps (`checkIn`, `checkOut`) and UTC date (`date`)
- **Evaluated for LATE**: Bangkok wall-clock (UTC + 7h offset applied at evaluation time)

## "Today" Computation

The Attendance module uses `todayUtc()` to compute the current day's date for deduplication and retrieval:

```typescript
private todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
```

The Dashboard module uses `todayBangkok()` which applies the +7h correction before extracting the calendar date.

## ABSENT Status

`ABSENT` is **not automatically assigned**. It is only recorded if an admin explicitly creates an absent record. No automatic absent-marking job exists in v1.0.

`todayAbsentCount` in the dashboard counts only explicitly created ABSENT records.

## Work Mode

Attendance records carry a `workMode` field: `ONSITE` (default) or `OFFSITE`.

- `ONSITE`: normal attendance; geofence validation applies if geofence is enabled
- `OFFSITE`: requires a pre-approved `OffSiteRequest` for the employee and today's date; geofence radius check is skipped at clock-in; GPS is still required

Off-site bypass applies to clock-in only. Clock-out always enforces the geofence regardless of work mode.

See [[Off-site Work Mode]] for the full workflow.

## Mixed Checkout Exception

An ONSITE employee who leaves the company premises during the workday may submit a mixed checkout exception via `POST /attendance/offsite/mixed-checkout-exception`.

Rules:
- Employee must have a valid clock-in for today (`attendanceSource = COMPANY_GEOFENCE`) with no clock-out yet.
- Employee must be **outside** the company geofence at time of submission. Backend enforces this — submission from inside geofence returns `422 OUTSIDE_GEOFENCE`.
- GPS accuracy must be ≤ 100 m (backend DTO `@Max(100)` constraint; mobile also enforces this gate).
- GPS is re-acquired fresh at the moment of submit (`maximumAge: 0`); stale GPS is not accepted.
- Accepted submissions set `reviewStatus = PENDING_REVIEW`. HR or admin must review and approve or reject.
- `attendanceSource` and `workMode` from the original check-in are preserved unchanged.
- Employee cannot submit a second exception for the same attendance record (HTTP 409).

Review status lifecycle: `PENDING_REVIEW → APPROVED | REJECTED`

See [[Mixed Checkout Exception]] for the full workflow and Admin Web review UI.

## Manager Flexible Attendance (REQ-002H)

Managers may clock in or out at non-standard times due to legitimate management duties (after-hours work, customer visits, emergency service, etc.). REQ-002H defines the policy:

- **Who:** MANAGER role only.
- **What:** Manager submits a mandatory reason when using flexible attendance (FLEX) at check-in or check-out.
- **Reviewer:** HR_ADMIN reviews and approves or rejects. SUPER_ADMIN has override authority.
- **No fixed time limit:** Any check-in/out time is eligible for FLEX; reason is always required.
- **Final status:** Approved records display `FLEX_APPROVED` in reports (not LATE). Rejected records fall back to normal LATE evaluation.
- **Actual time always stored:** FLEX does not suppress or alter timestamps.
- **EMPLOYEE is not affected:** Normal employee late policy is unchanged.

This is specification-only as of 2026-06-30. See `docs/REQ_002H_MANAGER_FLEXIBLE_ATTENDANCE_POLICY_SPEC.md`.

## Off-site Attendance Review — Manager Approval (Planned)

REQ-002G specifies changing off-site attendance review from HR-only to Manager-first. Planned scope:

- Manager reviews off-site records (full off-site and mixed checkout exception) for employees in their managed department.
- HR_ADMIN / SUPER_ADMIN retain full visibility and override authority.
- Scoping mechanism: `Department.managerId` → same pattern as ADR-023 (leave/off-site approval).
- Fallback to HR queue if employee has no department or department has no assigned Manager.

This is specification-only as of 2026-06-30. See `docs/REQ_002G_MANAGER_BASED_OFFSITE_ATTENDANCE_APPROVAL_SPEC.md`.

## Clock-in / Clock-out Rules

- An employee can only clock in **once per day** (unique constraint on `(employeeId, date)`)
- Clock-out requires a prior clock-in for the same day
- Status (PRESENT/LATE) is set at clock-in time and never changes on clock-out

## Related ADRs

- [[ADR-010 Attendance Timezone]]
- [[ADR-022 Off-site Work Request Workflow]]
- [[ADR-027 Mixed Attendance Checkout Exception Workflow]]
- [[ADR-028 Fresh GPS Requirement for Attendance Actions]]

## Related Notes

- [[Attendance Module]]
- [[Off-site Work Mode]]
- [[Mixed Checkout Exception]]
- [[Attendance Geofence]]
- [[Dashboard Module]]

#business-rules #attendance #timezone #off-site #mixed-checkout #rag-ready
