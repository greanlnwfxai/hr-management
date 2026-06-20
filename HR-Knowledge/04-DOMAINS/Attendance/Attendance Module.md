# Attendance Module

## Purpose

Tracks daily employee attendance via clock-in and clock-out. Evaluates whether an arrival was on-time or late using the Asia/Bangkok timezone. Stores all timestamps in UTC.

## Module Path

`apps/api/src/attendance/`

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /attendance/clock-in | ✅ | Any | Clock in for today (Bangkok rules) |
| POST | /attendance/clock-out | ✅ | Any | Clock out for today |
| GET | /attendance/me | ✅ | Any | Own attendance history (paginated) |
| GET | /attendance | ✅ | SUPER_ADMIN, HR_ADMIN | All attendance records (paginated) |
| GET | /attendance/:id | ✅ | Any (owner or admin) | Single attendance record |

## Query Parameters (GET /attendance, GET /attendance/me)

`page` · `limit` · `startDate` · `endDate` · `status` · `employeeId` (admin list only)

## Business Rules

### LATE Rule

| Clock-in time (Asia/Bangkok, UTC+7) | Status |
|---|---|
| 08:30:00 or earlier | PRESENT |
| 08:30:01 or later | LATE |

Exactly 08:30:00 = PRESENT. Strictly after 08:30 = LATE.

### Schedule Reference

- Current work schedule: `08:30–17:30`

### Timezone Implementation

```typescript
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no DST
```

No external timezone library. Thailand has no Daylight Saving Time — this constant never changes.

### Clock-in Rules

- Employee must have a linked `Employee` record (via `userId`) — 400 if not linked
- Only one clock-in per employee per day. Duplicate clock-in returns 409.
- `status` (PRESENT or LATE) is computed server-side at clock-in time and stored

### Clock-out Rules

- Employee must have clocked in for today before they can clock out — 400 otherwise
- Clock-out does not change the `status` (PRESENT/LATE was set at clock-in)

### ABSENT Status

`ABSENT` is not automatically assigned. It is only recorded if explicitly created via an admin action. No automatic absent-marking job exists in v1.0.

## Attendance Status Enum

`PRESENT` · `LATE` · `ABSENT`

## Ownership Checks

- `GET /attendance/:id` — service checks that the requesting user owns the record; admin bypass
- `POST /attendance/clock-in|clock-out` — bound to own employee via `requireEmployeeId(userId)`

## Known Limitations

- `todayUtc()` in AttendanceService and `todayBangkok()` in Dashboard can differ 17:00–23:59 UTC
- No automatic absent-marking job (future scheduled task)
- No overtime or shift scheduling

## Related ADRs

- [[ADR-010 Attendance Timezone]]
- [[ADR-006 RBAC]]

## Related Notes

- [[Attendance Rules]]
- [[Dashboard Module]]
- [[API Route Index]]

#domain #attendance #backend-v1 #timezone
