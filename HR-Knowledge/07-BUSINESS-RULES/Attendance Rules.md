# Attendance Rules

## Company Timezone

**Asia/Bangkok — UTC+7 — permanently fixed.**

Thailand observes no Daylight Saving Time. The +7h offset never changes.

## LATE Evaluation Rule

| Clock-in time (Asia/Bangkok) | Status |
|---|---|
| Before 09:00:00 | PRESENT |
| Exactly 09:00:00 | PRESENT |
| 09:00:01 or later | LATE |

**Strictly after 09:00 Bangkok time = LATE. Exactly 09:00:00 = PRESENT.**

## How LATE Is Evaluated

The server computes the Bangkok wall-clock time from the UTC timestamp at clock-in:

```typescript
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no DST

private isLateInBangkok(now: Date): boolean {
  const bangkokWallClock = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const hour = bangkokWallClock.getUTCHours();
  const minute = bangkokWallClock.getUTCMinutes();
  return hour > 9 || (hour === 9 && minute > 0);
}
```

No external library. The status is computed at clock-in time and stored in the `Attendance` record.

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

## Known Date Boundary Limitation

Between **17:00–23:59 UTC** (00:00–06:59 Bangkok the following day):

- A clock-in at 23:00 UTC on June 12 is stored as `date: 2026-06-12`
- Bangkok calendar at that moment is June 13
- Dashboard `todayDate` returns `2026-06-13`
- Dashboard present/late/absent counts will be **0** during this window (date mismatch)

**Impact**: Metrics normalise after UTC midnight (07:00 Bangkok). Acceptable for v1.0 — system is used during normal business hours (07:00–20:00 Bangkok = 00:00–13:00 UTC).

**Fix planned for v1.1**: Align `todayUtc()` in AttendanceService with `todayBangkok()` in DashboardService.

## ABSENT Status

`ABSENT` is **not automatically assigned**. It is only recorded if an admin explicitly creates an absent record. No automatic absent-marking job exists in v1.0.

`todayAbsentCount` in the dashboard counts only explicitly created ABSENT records.

## Clock-in / Clock-out Rules

- An employee can only clock in **once per day** (unique constraint on `(employeeId, date)`)
- Clock-out requires a prior clock-in for the same day
- Status (PRESENT/LATE) is set at clock-in time and never changes on clock-out

## Related ADRs

- [[ADR-010 Attendance Timezone]]

## Related Notes

- [[Attendance Module]]
- [[Dashboard Module]]

#business-rules #attendance #timezone #rag-ready
