# Mobile Attendance Foundation — T-045

## Overview

T-045 adds the first real Attendance screen to the HR Mobile app, using existing backend API endpoints. Clock In / Clock Out actions are intentionally deferred pending geofence backend validation (T-046 / T-047).

---

## Attendance API Endpoints Inspected

All routes inspected from `apps/api/src/attendance/attendance.controller.ts` and `docs/API_ROUTES.md`:

| Method | Path | Auth | Roles | Notes |
|--------|------|------|-------|-------|
| POST | `/attendance/clock-in` | ✅ Bearer | any | Creates record; LATE if after 09:00 Bangkok |
| POST | `/attendance/clock-out` | ✅ Bearer | any | Updates checkOut time |
| GET | `/attendance/me` | ✅ Bearer | any | Own history, paginated, filterable by date |
| GET | `/attendance` | ✅ Bearer | SUPER_ADMIN, HR_ADMIN | All records |
| GET | `/attendance/:id` | ✅ Bearer | owner or admin | Single record |

Query params for `GET /attendance/me`: `page`, `limit`, `startDate`, `endDate`, `status`

---

## Endpoints Used in T-045

| Endpoint | Mobile Usage |
|----------|-------------|
| `GET /attendance/me?startDate=TODAY&endDate=TODAY&limit=1` | Fetch today's attendance record |
| `GET /attendance/me?page=1&limit=10` | Fetch recent history (last 10 records) |

**Endpoints NOT used:**
- `POST /attendance/clock-in` — deferred to T-047 (geofence required)
- `POST /attendance/clock-out` — deferred to T-047 (geofence required)
- `GET /attendance` — admin-only, not applicable to mobile employee view
- `GET /attendance/:id` — not needed for this screen

---

## Mobile Attendance Screen Summary

**Route:** `/attendance` (file: `apps/mobile/app/attendance.tsx`)

**Sections:**

1. **Today Card** — Shows today's date, check-in time, check-out time, and status badge (ตรงเวลา / สาย / ขาดงาน). If no record exists: "ยังไม่ลงเวลาวันนี้".
2. **Clock Action Card** — Clock In and Clock Out buttons rendered as disabled with the message: "ฟีเจอร์ลงเวลาจะเปิดใช้งานหลังจากเพิ่มการตรวจสอบตำแหน่งบริษัท".
3. **Geofence Notice** — Blue info card explaining the 100-meter radius requirement and that location validation is in T-046/T-047.
4. **History Section** — Last 10 attendance records with date, check-in/out times, and status badges. Empty state: "ไม่พบประวัติการลงเวลา".
5. **Refresh** — Pull-to-refresh and "อัปเดตข้อมูล" button.

**Navigation:** Home feature card for "การลงเวลา" navigates to `/attendance` via `router.push('/attendance')`. The card shows a green "เปิดใช้งาน" badge (other cards remain "เร็วๆ นี้").

---

## Clock In / Clock Out Safety Decision

**Decision: DEFERRED — buttons disabled in T-045.**

Rationale:
- The backend `POST /attendance/clock-in` and `POST /attendance/clock-out` endpoints exist and work, but they do not enforce geofence.
- The project's stated future requirement is that mobile clock-in/out **must** validate the employee is within 100 meters of company premises.
- Enabling real clock-in/out now without geofence would allow employees to clock in from any location, creating incorrect attendance records that are hard to retro-correct.
- Buttons are rendered as disabled UI with a clear Thai-language notice.
- T-047 will wire real clock-in/out once T-046 adds geofence backend validation.

---

## Geofence Deferral Summary

The company requires that mobile clock-in/out be restricted to within 100 meters of company premises. This requires:

1. **T-046** — Backend geofence validation: accept `lat`, `lng`, `accuracy` from mobile; validate against stored company location pin and 100m radius; return 403 if outside radius.
2. **T-047** — Mobile geofence clock-in/out: request location permission, send coordinates with clock-in/out request, handle geofence rejection gracefully.

**Thailand timezone note:** Attendance status (PRESENT vs LATE) uses Asia/Bangkok (UTC+7, no DST). The backend evaluates this server-side; mobile does not need to implement timezone logic.

---

## Hook / API Client Summary

**New types** (`apps/mobile/src/api/types.ts`):
- `AttendanceStatus` — `'PRESENT' | 'LATE' | 'ABSENT'`
- `AttendanceEmployee` — id, employeeCode, firstName, lastName
- `AttendanceRecord` — full record shape matching backend `ATTENDANCE_SELECT`
- `AttendanceHistoryResponse` — `{ data: AttendanceRecord[], meta: PaginatedMeta }`

**New API functions** (`apps/mobile/src/api/client.ts`):
- `getMyAttendance(token, page, limit)` — GET `/attendance/me`
- `getTodayAttendance(token)` — GET `/attendance/me` filtered to today; returns `AttendanceRecord | null`

**New hook** (`apps/mobile/src/hooks/useAttendance.ts`):
- Mirrors `useDashboard` pattern
- Fetches `getTodayAttendance` and `getMyAttendance` in parallel
- Exposes: `loadState`, `today`, `history`, `historyMeta`, `error`, `lastUpdated`, `refresh`
- Handles `SessionExpiredError` → sign out + redirect to `/login`

---

## 401 / Session Expiry Behavior

The `authGet<T>()` helper in `apps/mobile/src/api/client.ts` throws `SessionExpiredError` on HTTP 401. The `useAttendance` hook catches this and calls `signOut()` + `router.replace('/login')`, matching the behavior in `useDashboard`. The attendance screen also redirects to login if `isAuthenticated` becomes false.

---

## Manual Verification Steps

```bash
# 1. Start backend
docker compose up -d

# 2. Start mobile web
cd apps/mobile
npm run web

# 3. Open http://localhost:8081

# 4. Login: admin@hr.local / admin1234

# 5. Confirm /home loads with dashboard data

# 6. Tap "การลงเวลา" card — it should navigate to /attendance

# 7. Confirm Attendance screen loads:
#    - Today card shows date
#    - If clocked in today: shows check-in time and status
#    - If not clocked in: shows "ยังไม่ลงเวลาวันนี้"
#    - Clock In / Clock Out buttons appear disabled
#    - Yellow notice: ฟีเจอร์ลงเวลาจะเปิดใช้งานหลังจากเพิ่มการตรวจสอบตำแหน่งบริษัท
#    - Blue geofence notice visible

# 8. Confirm History section:
#    - Shows recent records if any exist
#    - Shows "ไม่พบประวัติการลงเวลา" if empty

# 9. Tap "อัปเดตข้อมูล" — data refreshes

# 10. Pull to refresh — same behavior

# 11. Confirm logout still works from /home
```

---

## Known Limitations

- No clock-in/out via mobile — deferred to T-047.
- No real-time status auto-refresh (only on load / manual refresh).
- History shows only the first 10 records; no pagination in mobile view yet.
- Admin-only views (`GET /attendance`) are not exposed in mobile.

---

## Future Tasks

| Task | Description |
|------|-------------|
| T-046 | Attendance Geofence Backend — add lat/lng/accuracy to clock-in/out API, validate 100m radius |
| T-047 | Mobile Geofence Clock In/Out — request location permission, send coords, handle 403 |
| T-048 | Mobile Leave Request — view and submit leave requests |
