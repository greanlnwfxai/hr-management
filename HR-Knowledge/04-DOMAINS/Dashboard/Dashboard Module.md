# Dashboard Module

## Purpose

Provides a single read-only aggregated HR snapshot for administrators and managers. All data is computed at request time via 19 parallel Prisma queries.

## Module Path

`apps/api/src/dashboard/`

## Endpoint

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /dashboard | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | Aggregated HR snapshot |

EMPLOYEE role → 403 Forbidden.

## Response Shape

```json
{
  "generatedAt": "ISO8601 timestamp",
  "timezone": "Asia/Bangkok",
  "employees": {
    "totalEmployees": 0,
    "activeEmployees": 0,
    "inactiveEmployees": 0,
    "resignedEmployees": 0,
    "totalDepartments": 0,
    "totalPositions": 0
  },
  "attendance": {
    "todayDate": "YYYY-MM-DD",
    "todayPresentCount": 0,
    "todayLateCount": 0,
    "todayAbsentCount": 0,
    "todayClockedInCount": 0,
    "todayClockedOutCount": 0
  },
  "leave": {
    "totalLeaveRequests": 0,
    "pendingLeaveRequests": 0,
    "approvedLeaveRequests": 0,
    "rejectedLeaveRequests": 0,
    "lowLeaveBalanceCount": 0
  },
  "recent": {
    "employees": [],
    "attendance": [],
    "leaveRequests": []
  }
}
```

## Key Design Decisions

- **Read-only**: no mutations — pure aggregation
- **19 parallel queries** via `Promise.all` for minimal latency
- **Recent lists capped at 5 records** each
- **Safe fields only** in recent lists — no password, no sensitive data

## Metrics Explained

| Metric | Explanation |
|---|---|
| `todayDate` | Current Bangkok calendar date (UTC+7 corrected) |
| `todayPresentCount` | Attendance records with status=PRESENT for todayDate |
| `todayLateCount` | Attendance records with status=LATE for todayDate |
| `todayAbsentCount` | Explicitly created ABSENT records for todayDate (no auto-marking) |
| `todayClockedInCount` | Attendance records where `checkIn` is not null for todayDate |
| `todayClockedOutCount` | Attendance records where `checkOut` is not null for todayDate |
| `lowLeaveBalanceCount` | Balances for current Bangkok year where `remainingDays ≤ 3` |

`LOW_BALANCE_THRESHOLD = 3` days.

## Bangkok Timezone

```typescript
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

private todayBangkok(): Date {
  const bangkokNow = new Date(Date.now() + BANGKOK_OFFSET_MS);
  return new Date(Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate()));
}
```

## Known Limitations

- `todayAbsentCount` only counts explicitly created ABSENT records
- `todayBangkok()` and `AttendanceService.todayUtc()` diverge between 17:00–23:59 UTC — dashboard metrics may be 0 during this window even if employees clocked in (Bangkok calendar day is already the next day)

## Related ADRs

- [[ADR-010 Attendance Timezone]]
- [[ADR-006 RBAC]]

## Related Notes

- [[Attendance Rules]]
- [[Attendance Module]]
- [[API Route Index]]

#domain #dashboard #backend-v1
