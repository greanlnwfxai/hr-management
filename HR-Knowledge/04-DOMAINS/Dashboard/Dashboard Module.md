# Dashboard Module

## Purpose

Provides a single read-only aggregated HR snapshot for administrators and managers. All data is computed at request time via 19 parallel Prisma queries.

## Module Path

`apps/api/src/dashboard/`

## Endpoint

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /dashboard | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | Aggregated HR snapshot |

EMPLOYEE role → 403 Forbidden. This guard is **unchanged** as of v1.2.61–v1.2.63
— EMPLOYEE's self-dashboard (below) is built entirely from other, already-open
self-scoped endpoints and never calls this one.

## Web Dashboard Scope by Role (v1.2.61 – v1.2.63)

The web `/dashboard` page (`apps/web/app/(app)/dashboard/page.tsx`) renders
different content per role. This is a **frontend-only** distinction — no new
backend endpoint was added, and the `GET /dashboard` RBAC guard above is
untouched. See [[ADR-032 Manager Employee Dashboard Scope and Personal Summary]].

| Role | View | Data source |
|---|---|---|
| SUPER_ADMIN / HR_ADMIN | Global aggregated dashboard (this endpoint's full response: KPIs, charts, recent activity) | `GET /dashboard` |
| MANAGER | Team Overview (same `GET /dashboard` call, backend-scoped to managed department) **plus** an embedded "My Summary" section with the manager's own attendance/leave/balance | `GET /dashboard` (team) + `/attendance/me`, `/leave-balances/my`, `/leave/me` (self) |
| EMPLOYEE | Self-only dashboard — today's attendance, leave balance, pending leave, recent records. No team or global data. **Never calls `GET /dashboard`.** No access to the global Employees list either. | `/attendance/me`, `/leave-balances/my`, `/leave/me` only |

MANAGER and EMPLOYEE's personal-summary views share one component
(`PersonalSummaryBody`), fed by the same three self-scoped endpoints — there is
exactly one code path that fetches self-data for either role, which is the
architectural reason EMPLOYEE cannot leak global data: it simply never calls
the guarded endpoint, rather than relying on an additional runtime check.

### Personal Attendance Date Normalization (v1.2.63 fix)

`GET /attendance/me` returns `date` as a full ISO timestamp encoding a Bangkok
business date (see [[Attendance Module]] / `todayBangkok()`), e.g.
`"2026-07-01T00:00:00.000Z"` for business date `2026-07-01` — it is not a real
midnight instant. The web personal-summary component previously compared this
raw ISO string against a plain `YYYY-MM-DD` "today" string, which never
matched, so today's own attendance record was never detected as "today" even
though it appeared correctly in the recent-attendance list.

Fixed by normalizing both sides to the business-date digits before comparing
(`normalizeAttendanceBusinessDate` / `isSameBangkokDate` in
`dashboard/page.tsx`). Recent-attendance list dates now render as `DD/MM/YYYY`
(locale `en-GB`, not `th-TH` — `th-TH` renders a numeric year in the Buddhist
Era, e.g. `2569` instead of `2026`) instead of the raw ISO string. This applies
identically to both MANAGER's "My Summary" and EMPLOYEE's self-dashboard.

### Personal Summary Thai Localization and Pending KPI Rename (v1.2.70 / T-094)

`PersonalSummaryBody`'s attendance and leave-request status badges now use
locale-aware labels instead of the raw enum string, via the previously-unused
`attendanceStatusLabel()` / `leaveStatusLabel()` helpers in `apps/web/lib/i18n.ts`:

| Field | Value | TH | EN |
|---|---|---|---|
| Attendance | `PRESENT` | มาทำงาน | Present |
| Attendance | `LATE` | สาย | Late |
| Attendance | `ABSENT` | ขาดงาน | Absent |
| Leave | `PENDING` | รออนุมัติ | Pending |
| Leave | `APPROVED` | อนุมัติแล้ว | Approved |
| Leave | `REJECTED` | ปฏิเสธ | Rejected |

The `statusBadge(status, label?)` helper gained an optional `label` param —
when omitted (every team-dashboard call site), rendering is unchanged. Only
the two personal-summary call sites (attendance history, leave requests) pass
a translated label, so this is scoped to the personal-summary section only.

The personal-summary pending-requests KPI was renamed to a dedicated key
(`emp_dash_pending_leave`, TH `คำขอรออนุมัติ` / EN `Pending Requests`) rather
than reusing the shared `dash_pending_leave` key, which remains unchanged for
the team-wide dashboard's org-level "Pending Leave" KPI.

### Leave Balance Ring UI (v1.2.70–v1.2.71 / T-094, T-095)

The leave-balance card in `PersonalSummaryBody` replaced its horizontal
progress bar with `LeaveBalanceRing`, a hand-rolled inline SVG
(`stroke-dasharray`/`stroke-dashoffset`) ring — no chart library was added.
Each leave type (SICK/VACATION/PERSONAL/OTHER) renders its own ring showing
`remaining / total`, with color shifting blue → amber → red as remaining
percentage drops (≤50% / ≤20%). Used days are also shown as explicit text
(`emp_dash_leave_used`) for accessibility, not implied by the ring alone.

T-095 enlarged the ring (`size` 64→96, `strokeWidth` 7→10; empty-state ring
56→80) and widened the list-item column (80px→112px) after the initial T-094
size read as too minor for the card's primary visualization.

### Leave Date Formatting (v1.2.71 / T-095)

"My Leave Requests" previously rendered `LeaveRequest.startDate`/`endDate` as
raw ISO timestamps. `formatLeaveDateRange()` now reuses the existing
timezone-safe `formatAttendanceDate()` helper (extracts calendar-date digits
directly from the ISO string, formats `en-GB` → `DD/MM/YYYY`) to collapse
same-day requests to a single date and render multi-day requests as
`DD/MM/YYYY – DD/MM/YYYY`. Output is identical for TH and EN locales.

These three changes (T-094, T-095) are frontend-only: no backend, schema, or
RBAC changes; the team dashboard's own widgets are untouched.

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
- [[ADR-032 Manager Employee Dashboard Scope and Personal Summary]]

## Related Notes

- [[Attendance Rules]]
- [[Attendance Module]]
- [[API Route Index]]

#domain #dashboard #backend-v1
