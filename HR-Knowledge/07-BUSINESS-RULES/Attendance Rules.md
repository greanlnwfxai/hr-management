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

## Clock-in / Clock-out Rules

- An employee can only clock in **once per day** (unique constraint on `(employeeId, date)`)
- Clock-out requires a prior clock-in for the same day
- Status (PRESENT/LATE) is set at clock-in time and never changes on clock-out

## Related ADRs

- [[ADR-010 Attendance Timezone]]
- [[ADR-022 Off-site Work Request Workflow]]

## Related Notes

- [[Attendance Module]]
- [[Off-site Work Mode]]
- [[Attendance Geofence]]
- [[Dashboard Module]]

#business-rules #attendance #timezone #off-site #rag-ready
