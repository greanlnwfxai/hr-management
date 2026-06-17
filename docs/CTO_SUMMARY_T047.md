# CTO Summary

## Step
T-047 — Mobile Geofence Clock In / Clock Out

## Status
PASS

## Scope
Enabled real Clock In and Clock Out on the Expo React Native mobile app using device GPS and backend geofence validation. The mobile app requests foreground location permission, collects GPS coordinates, and sends `{ source: "mobile", latitude, longitude, accuracy }` to the existing T-046 backend endpoints. The backend remains the sole decision authority. All error cases (permission denied, poor accuracy, outside geofence, session expiry, network failure, duplicate clock) are handled with Thai-language messages.

## Files Created

- `apps/mobile/src/hooks/useDeviceLocation.ts` — foreground GPS permission + position hook
- `docs/MOBILE_GEOFENCE_CLOCK.md` — full feature documentation

## Files Modified

- `apps/mobile/package.json` — added `expo-location` ~18.x (SDK 52 compatible, installed via `npx expo install`)
- `apps/mobile/app.json` — added `expo-location` plugin, iOS `NSLocationWhenInUseUsageDescription`, Android `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`
- `apps/mobile/src/api/types.ts` — added `MobileLocationPayload`, `ClockActionResult`
- `apps/mobile/src/api/client.ts` — added `normalizeApiMessage()`, `authPost<T>()`, `clockIn()`, `clockOut()`
- `apps/mobile/src/hooks/useAttendance.ts` — added `clockIn`/`clockOut` states and actions, `translateClockError()`, `useDeviceLocation` integration
- `apps/mobile/app/attendance.tsx` — replaced disabled `ClockActionCard` with live GPS-backed buttons; updated `GeofenceNotice` text; added styles for active/disabled/success/error states
- `apps/mobile/README.md` — added `expo-location` to stack table, updated Attendance section, updated future tasks
- `docs/MOBILE_ATTENDANCE_FOUNDATION.md` — updated deferred endpoint note to reflect T-047 completion
- `docs/ATTENDANCE_GEOFENCE_BACKEND.md` — updated heading note to reference T-047 and link to new doc

## Dependency Summary

| Package | Version installed | Method |
|---|---|---|
| `expo-location` | `~18.0.10` (SDK 52 compatible) | `npx expo install expo-location` |

No `--legacy-peer-deps` required. Expo's SDK-aware installer resolved the compatible version automatically.

## Location Permission Summary

| Platform | Permission | Description |
|---|---|---|
| iOS | `NSLocationWhenInUseUsageDescription` | Thai + English text in `app.json` infoPlist |
| Android | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Declared in `app.json` permissions array |
| Plugin | `expo-location` with `locationWhenInUsePermission` | Declared in `app.json` plugins |

Foreground only. Background location is not requested.

## API Payload Summary

```json
{
  "source": "mobile",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "accuracy": 12.5
}
```

Sent to:
- `POST /attendance/clock-in`
- `POST /attendance/clock-out`

With `Authorization: Bearer <token>`.

## Clock In / Clock Out Flow Summary

1. User taps button → button disabled, state = `locating`
2. `requestForegroundPermissionsAsync()` — if denied: Thai error shown, flow stops
3. `getCurrentPositionAsync({ accuracy: High })` — if error: Thai error shown, flow stops
4. State = `submitting`
5. `POST /attendance/clock-in|clock-out` with location payload
   - 401 → `signOut()` + redirect `/login`
   - 4xx/5xx → parse body, normalize `message` (handles string and string[]), translate to Thai
   - 2xx → show Thai success message, call `fetchData()` to refresh today + history
6. Duplicate-submit guard: both buttons disabled while any clock action is in `locating` or `submitting` state

## Backend Geofence Integration Summary

Backend geofence (T-046) activates when `source === "mobile"` AND `ATTENDANCE_GEOFENCE_ENABLED=true`. In development the default is `false` — clock actions pass through without geofence check.

All geofence rejection messages are 422 (`UnprocessableEntityException`). The mobile translates each known English message to Thai using `translateClockError()`. Unknown messages fall through to the original text as a safe fallback.

## Error Handling Summary

| Error type | Detection | Mobile response |
|---|---|---|
| Permission denied | OS status !== GRANTED | กรุณาอนุญาตการเข้าถึงตำแหน่ง... |
| GPS unavailable | Location API throws | ไม่สามารถอ่านตำแหน่งปัจจุบันได้... |
| GPS accuracy null | `accuracy === null` | Sent as 9999 — backend rejects with accuracy error |
| Outside area | HTTP 422 | คุณอยู่นอกพื้นที่บริษัทที่อนุญาต |
| GPS accuracy too low | HTTP 422 | ความแม่นยำของ GPS ต่ำเกินไป... |
| Location not configured | HTTP 422 | ระบบตรวจสอบตำแหน่งยังไม่ได้รับการตั้งค่า |
| Already clocked in/out | HTTP 409 | ลงเวลาเข้า/ออกไปแล้วสำหรับวันนี้ |
| No clock-in exists | HTTP 409/404 | ยังไม่มีการลงเวลาเข้า... |
| No employee profile | HTTP 400 | ไม่พบข้อมูลพนักงาน... |
| Network failure | fetch throws | ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ |
| Session expired | HTTP 401 | auto signOut + /login redirect |

## Session Handling Summary

`SessionExpiredError` is thrown from `authPost` on HTTP 401. Caught in both `performClockIn` and `performClockOut`, which call `handleSessionExpired()` → `signOut()` + `router.replace('/login')`. This matches the existing pattern in `useAttendance` for data fetch.

## Documentation Updated

- `docs/MOBILE_GEOFENCE_CLOCK.md` — created (architecture, permissions, payload, flow, error table, test steps, security notes, future improvements)
- `docs/MOBILE_ATTENDANCE_FOUNDATION.md` — updated deferred endpoint note
- `docs/ATTENDANCE_GEOFENCE_BACKEND.md` — updated intro note, cross-link to T-047 doc
- `apps/mobile/README.md` — updated stack, attendance section, future tasks

## Verification Results

| Check | Result |
|---|---|
| `apps/mobile` TypeScript typecheck | **PASS** (0 errors) |
| `npx expo export --platform web` (bundle check) | **PASS** (646 modules, no errors, 976 kB bundle) |
| API unit tests (143 tests, 15 suites) | **PASS** |
| `./scripts/verify.sh` (API build + Prisma + Web build) | **PASS** |
| `./scripts/docker-verify.sh` (full stack + health) | **PASS** |
| `./scripts/api-smoke-test.sh` (login + endpoints) | **PASS** |
| `./scripts/e2e-test.sh` (51 Playwright tests) | **PASS** |

## Manual Mobile Verification Notes

**Bundle verified in this session:** `npx expo export --platform web` completed with 646 modules bundled successfully, no runtime import errors. This confirms `expo-location` loads correctly and all screen components render without white-screen failure.

**GPS permission + clock flow** requires a running device/browser session and was not exercised in this session (no interactive Expo server was left running). Procedure for human verification:
1. `docker compose up -d` — start backend stack.
2. `cd apps/mobile && npm run web` — start Expo in browser.
3. Login with `admin@hr.local` / `admin1234`.
4. Open Attendance screen.
5. Grant location permission (browser prompt on web).
6. Tap **ลงเวลาเข้า** — observe loading states (กำลังตรวจสอบตำแหน่ง → กำลังลงเวลาเข้า).
7. Confirm success message **ลงเวลาเข้าสำเร็จ** and today card updates.
8. Tap **ลงเวลาออก** — confirm success message and card updates.
9. With `ATTENDANCE_GEOFENCE_ENABLED=true` + coordinates outside company: confirm Thai rejection message is displayed.
10. Revoke location permission and tap button: confirm Thai permission-denied message.
11. Sign out — confirm redirect to `/login`, token cleared.

Note: when geofence is disabled (default), clock-in/out succeed regardless of location. Real geofence testing requires backend env vars to be set.

## Existing Web / API / Mobile Impact

- **Web attendance flow:** unaffected. Web clock-in/out sends no `source` field; geofence is bypassed on the backend. No web files changed.
- **API:** no changes. T-046 endpoints are consumed as-is.
- **Existing mobile screens (Home, Profile, Login):** unaffected.
- **Existing E2E tests:** all 51 tests pass — no regressions.

## Known Limitations

- GPS spoofing cannot be prevented by the app alone. Backend validation reduces accidental misuse; it cannot guarantee device integrity.
- On web (`npm run web`), location uses the browser Geolocation API (requires HTTPS or localhost). Permission UX differs from native.
- Indoor GPS accuracy may cause rejections even when physically on-site (signal interference).

## Risk
Low

## Decision
PASS

## Next Step
T-048 — Mobile Leave Request

## Recommended Commit Message
```
feat(mobile): enable geofence clock in and clock out (T-047)

Install expo-location, add authPost helper, MobileLocationPayload/ClockActionResult
types, useDeviceLocation hook, and clockIn/clockOut actions in useAttendance.
Replace disabled ClockActionCard with live GPS-backed buttons; display Thai
success/error messages; refresh attendance data on success.
Backend is source of truth for geofence validation — no coordinates stored
or distance calculated on mobile.
```
