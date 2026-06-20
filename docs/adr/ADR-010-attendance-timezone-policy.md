# ADR-010: Attendance Timezone Policy

## Status
Accepted

## Date
2026-06-12

## Context
The HR Management system records employee clock-in and clock-out times and must evaluate whether an arrival was on-time or late. The company operates in Thailand (Asia/Bangkok, UTC+7). All database timestamps are stored in UTC, which is the PostgreSQL default. The current work schedule is 08:30–17:30, and a clock-in after 08:30 local time must be correctly classified as LATE regardless of the UTC offset. The evaluation must be deterministic and consistent between the Attendance module and the Dashboard module.

## Decision
Apply the **Asia/Bangkok timezone (UTC+7, permanently fixed)** for all business-rule evaluations involving wall-clock time. All database storage remains in UTC.

### Attendance LATE rule

| Clock-in time (Asia/Bangkok) | Status |
|---|---|
| ≤ 08:30:00 | PRESENT |
| 08:30:01 or later | LATE |

Strictly after 08:30 Bangkok time = LATE. Exactly 08:30:00 = PRESENT.

### Schedule reference
- Work schedule: `08:30–17:30`

### Implementation (actual code)

```typescript
// Thailand is UTC+7 with no DST — this offset never changes.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

// Shift `now` forward by 7h so UTC methods yield Bangkok wall-clock values.
private isLateInBangkok(now: Date): boolean {
  const bangkokWallClock = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const hour = bangkokWallClock.getUTCHours();
  const minute = bangkokWallClock.getUTCMinutes();
  return hour > 8 || (hour === 8 && minute > 30);
}
```

No external timezone library is used. The +7h shift is a constant; it does not need recalculation because Thailand observes no Daylight Saving Time.

### "Today" in Bangkok (Dashboard)

The Dashboard module computes the current Bangkok calendar date for attendance summary queries:

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

This returns the UTC midnight Date corresponding to the current Bangkok calendar day, which matches the format of `Attendance.date` values stored in the database.

### Known edge case

The `AttendanceService.todayUtc()` method (used when creating attendance records) computes the date from UTC values directly:

```typescript
private todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
```

The Dashboard's `todayBangkok()` applies the +7h correction before extracting the calendar date.

**These two methods produce different dates between 17:00 and 23:59 UTC** (which is 00:00–06:59 the next Bangkok day). During this window:
- A clock-in at 23:00 UTC on June 12 is stored as `date: 2026-06-12` (UTC date).
- The Bangkok calendar on the server at that moment is June 13.
- `todayBangkok()` returns `2026-06-13`, which does not match the stored record date.

**Impact:** During this ~7-hour UTC window, the Dashboard `todayPresentCount` (and related metrics) will be 0 even if employees clocked in that day (Bangkok time). The metrics normalise after UTC midnight (07:00 Bangkok).

**Decision:** This edge case is acceptable for the current system while no overnight workflow depends on exact pre-07:00 Bangkok dashboard counts. See Follow-up Tasks.

### ABSENT status
The `ABSENT` status is not automatically assigned. It is only recorded if explicitly created (e.g., via a future admin-driven absent-marking workflow). The `todayAbsentCount` in the Dashboard counts only explicitly-created ABSENT records.

## Consequences

**Positive**
- No external timezone library required; the +7h constant is self-documenting and verifiable.
- Consistent evaluation: the same offset logic is used in both Attendance and Dashboard.
- All timestamps remain in UTC in the database — no timezone-aware storage type needed.

**Negative**
- `todayUtc()` and `todayBangkok()` can diverge during the 17:00–23:59 UTC window (Bangkok late-night / early-morning).
- No automatic absent-marking means `todayAbsentCount` understates actual absence.
- If company operations expand to other timezones, the hardcoded constant must become configurable.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Store timestamps in Bangkok timezone | Breaks UTC portability; harder to reason about across locales |
| Use `Intl.DateTimeFormat` or `luxon`/`date-fns-tz` | Valid; avoided in favour of a zero-dependency constant for a fixed-offset timezone |
| Evaluate LATE server-side only at query time | Requires storing raw check-in and re-evaluating; the current approach stores the status at clock-in time |

## Follow-up Tasks
- Align `AttendanceService.todayUtc()` with `DashboardService.todayBangkok()` so both modules use the Bangkok-corrected date. This would fix the 17:00–23:59 UTC edge case.
- Add an admin endpoint or scheduled job to auto-mark employees as ABSENT if they have not clocked in by end of business (e.g., 18:00 Bangkok).
- Make the Bangkok offset configurable via an environment variable if multi-timezone support is needed in a future version.
