# CTO Summary

## Step
T-045 — Mobile Attendance Foundation

## Status
PASS

## Scope
Added a protected Attendance screen to the HR Mobile app using existing backend attendance API endpoints. The screen shows today's attendance card, recent history, and disabled Clock In/Clock Out buttons with a clear placeholder message. Navigation from the Home feature grid to the Attendance screen is wired and working. Clock In/Out actions are intentionally deferred pending geofence backend validation (T-046/T-047). All existing web and API tests remain green.

## Files Created
- `apps/mobile/app/attendance.tsx` — Protected attendance screen with today card, disabled clock action card, geofence notice, history list, pull-to-refresh
- `apps/mobile/src/hooks/useAttendance.ts` — Attendance hook (mirrors useDashboard pattern); fetches today + history in parallel; handles 401 auto sign-out
- `docs/MOBILE_ATTENDANCE_FOUNDATION.md` — Full documentation: endpoints inspected, endpoints used, safety decision, geofence deferral, manual verification steps, future tasks

## Files Modified
- `apps/mobile/src/api/types.ts` — Added `AttendanceStatus`, `AttendanceEmployee`, `AttendanceRecord`, `AttendanceHistoryResponse`
- `apps/mobile/src/api/client.ts` — Added `getMyAttendance()` and `getTodayAttendance()` using existing `authGet<T>()` helper
- `apps/mobile/src/hooks/index.ts` — Exported `useDashboard` and `useAttendance`
- `apps/mobile/app/_layout.tsx` — Added `attendance` screen to Stack with Thai title "ลงเวลา"
- `apps/mobile/app/home.tsx` — Attendance feature card now navigates to `/attendance` via `router.push`; shows green "เปิดใช้งาน" badge; added `featureCardActive` and `activeBadge` styles
- `apps/mobile/README.md` — Added Attendance screen row to Screens table and T-045 section with manual test instructions

## Attendance API Endpoints Inspected
| Method | Path | Notes |
|--------|------|-------|
| POST | `/attendance/clock-in` | Creates today record; LATE if after 09:00 Bangkok |
| POST | `/attendance/clock-out` | Updates checkOut time |
| GET | `/attendance/me` | Own history; filterable by startDate/endDate/status |
| GET | `/attendance` | Admin-only; all records |
| GET | `/attendance/:id` | Owner or admin; single record |

## Attendance API Endpoints Used
| Endpoint | Purpose |
|----------|---------|
| `GET /attendance/me?startDate=TODAY&endDate=TODAY&limit=1` | Today's attendance card |
| `GET /attendance/me?page=1&limit=10` | Recent history list |

## Mobile Attendance Screen Summary
The `/attendance` screen (Expo Router file-based route) includes:
1. **Today Card** — วันที่, เวลาเข้างาน, เวลาออกงาน, สถานะ badge (ตรงเวลา / สาย / ขาดงาน). Shows "ยังไม่ลงเวลาวันนี้" if no record.
2. **Clock Action Card** — Two disabled buttons (ลงเวลาเข้า / ลงเวลาออก) with yellow warning notice.
3. **Geofence Notice** — Blue info card explaining the 100-meter radius requirement and that location validation is in T-046/T-047.
4. **History Section** — Last 10 records with date, check-in/out times, and status badges. Empty state: "ไม่พบประวัติการลงเวลา".
5. **Refresh** — Pull-to-refresh + "อัปเดตข้อมูล" button.

## Clock In / Clock Out Safety Decision
**Decision: DEFERRED — buttons are rendered as disabled UI.**

Rationale: The backend `POST /attendance/clock-in` and `POST /attendance/clock-out` endpoints exist and are functional but do not enforce geofence. Allowing unrestricted mobile clock-in now would create inaccurate attendance records that cannot be auto-corrected. The safe conservative choice is to display the buttons as disabled with a clear Thai-language notice. Real mobile clock-in/out will be wired in T-047 after T-046 adds geofence validation to the backend.

## Geofence Deferral Summary
Company policy requires mobile clock-in/out to be validated within **100 meters of company premises**. This is a two-task effort:
- **T-046** — Backend: accept `lat`/`lng`/`accuracy`, validate against company location pin, return 403 if outside radius.
- **T-047** — Mobile: request location permission, send coordinates, handle geofence rejection.

The Attendance screen displays a blue notice card informing employees that location validation will be added in the next step.

## Hook / API Client Summary
- **New types** added to `types.ts`: `AttendanceStatus` (union), `AttendanceEmployee`, `AttendanceRecord`, `AttendanceHistoryResponse`
- **New API functions** in `client.ts`: `getMyAttendance()` and `getTodayAttendance()` — both use the existing `authGet<T>()` helper which throws `SessionExpiredError` on 401
- **New hook** `useAttendance.ts`: parallel fetch of today + history; `SessionExpiredError` → `signOut()` + `/login` redirect; exposes `loadState`, `today`, `history`, `historyMeta`, `error`, `lastUpdated`, `refresh`

## 401 Session Handling Summary
- `authGet<T>()` throws `SessionExpiredError` on HTTP 401 (unchanged from T-044)
- `useAttendance` catches `SessionExpiredError` → calls `signOut()` + `router.replace('/login')`
- Attendance screen also redirects to `/login` if `isAuthenticated` becomes false (mirrors home screen pattern)
- Session expiry is handled consistently across all protected screens

## Documentation Updated
- `docs/MOBILE_ATTENDANCE_FOUNDATION.md` — Created (endpoints, safety decision, geofence deferral, manual steps, known limitations, future tasks)
- `apps/mobile/README.md` — Updated with Attendance screen row, T-045 section, manual testing instructions

## Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` (apps/mobile) | **PASS** — 0 errors |
| `npm test` (apps/api) | **PASS** — 114 tests, 14 suites |
| `./scripts/verify.sh` | **PASS** — API build, Prisma schema, Web build |
| `./scripts/docker-verify.sh` | **PASS** — all 3 containers healthy |
| `./scripts/api-smoke-test.sh` | **PASS** — all 10 endpoint checks |
| `./scripts/e2e-test.sh` | **PASS** — 51/51 Playwright tests |

## Manual Mobile Verification Notes
Manual verification was performed via `npm run web` (Metro/browser). Confirmed:
- Home screen loads and attendance card shows green "เปิดใช้งาน" badge
- Tapping attendance card navigates to `/attendance` route
- Attendance screen header shows "ลงเวลา"
- Today card displays today's date; if no record → "ยังไม่ลงเวลาวันนี้"
- Clock In / Clock Out buttons appear disabled with yellow warning notice
- Blue geofence notice card is visible
- History section shows records or empty state
- Pull-to-refresh and "อัปเดตข้อมูล" button work
- Back navigation returns to Home
- Logout from Home still works; session expiry redirects to login

## Existing Web/API Impact
- No backend changes. All API routes, DTOs, and Prisma schema are unchanged.
- Web Next.js app is unmodified. All 51 E2E tests pass.
- API unit tests: 114/114 pass.
- No Docker configuration changes.

## Known Limitations
- Clock In / Clock Out are disabled — deferred to T-047.
- History shows only 10 records; no pagination UI in mobile.
- No real-time auto-refresh interval (refresh is manual only).
- `admin@hr.local` is `SUPER_ADMIN` — the attendance display defaults to "ยังไม่ลงเวลาวันนี้" unless the admin user has an employee profile with a clock-in record for today.

## Risk
**Low** — Mobile-only changes. No backend modifications. All CI checks pass. Clock-in/out are disabled so no risk of incorrect attendance data.

## Decision
**PASS**

## Next Recommended Task
**T-046 — Attendance Geofence Backend**
Add geofence validation to `POST /attendance/clock-in` and `POST /attendance/clock-out`:
- Accept `lat`, `lng`, `accuracy` fields in request body
- Store company location pin (lat/lng) in config or DB
- Validate employee is within 100-meter radius
- Return 403 with clear message if outside radius

## Recommended Commit Message
```
feat(mobile): add attendance screen foundation (T-045)

- Add /attendance screen: today card, history, disabled clock-in/out
- Add useAttendance hook with 401 auto sign-out handling
- Add getMyAttendance and getTodayAttendance API functions
- Add AttendanceRecord, AttendanceStatus mobile types
- Wire Home attendance card to navigate to /attendance
- Add geofence deferral notice (clock-in/out deferred to T-047)
- Document attendance API endpoints and safety decision
```
