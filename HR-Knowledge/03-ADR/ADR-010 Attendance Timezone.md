# ADR-010: Attendance Timezone Policy

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Apply **Asia/Bangkok (UTC+7, permanently fixed)** for all business-rule evaluations involving wall-clock time. All database timestamps remain in UTC.

## LATE Rule

| Clock-in time (Bangkok) | Status |
|---|---|
| ≤ 08:30:00 | PRESENT |
| 08:30:01 or later | LATE |

Exactly 08:30:00 = PRESENT. Strictly after 08:30 = LATE.

## Schedule Reference

Current attendance schedule reference:
- `08:30–17:30`

## Implementation

```typescript
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no DST

private isLateInBangkok(now: Date): boolean {
  const bangkokWallClock = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const hour = bangkokWallClock.getUTCHours();
  const minute = bangkokWallClock.getUTCMinutes();
  return hour > 8 || (hour === 8 && minute > 30);
}
```

No external timezone library. Thailand has no Daylight Saving Time — the +7h constant never changes.

## "Today" in Bangkok (Dashboard)

The Dashboard computes the current Bangkok calendar date for attendance queries:

```typescript
private todayBangkok(): Date {
  const bangkokNow = new Date(Date.now() + BANGKOK_OFFSET_MS);
  return new Date(Date.UTC(
    bangkokNow.getUTCFullYear(),
    bangkokNow.getUTCMonth(),
    bangkokNow.getUTCDate(),
  ));
}
```

## Known Edge Case

`AttendanceService.todayUtc()` and `DashboardService.todayBangkok()` can produce different calendar dates between **17:00–23:59 UTC** (00:00–06:59 next Bangkok day).

- A clock-in at 23:00 UTC on June 12 is stored as `date: 2026-06-12` (UTC date)
- Bangkok calendar that moment is June 13 — dashboard `todayDate = 2026-06-13`
- Dashboard present/late/absent counts for today will be 0 during this window

**Acceptable for v1.0.** Fix planned for v1.1.

## Source

`docs/adr/ADR-010-attendance-timezone-policy.md`

## Related Notes

- [[Attendance Rules]]
- [[Attendance Module]]
- [[Dashboard Module]]
- [[ADR Index]]

#adr #business-rules #timezone #attendance
