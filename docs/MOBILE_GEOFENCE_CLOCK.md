# Mobile Geofence Clock In / Clock Out

## Feature Overview

T-047 enables real Clock In and Clock Out on the mobile app (Expo React Native). Before clocking, the device collects GPS coordinates and sends them to the backend. The backend — not the mobile app — decides whether the employee is within company premises.

## Architecture: Backend Is Source of Truth

The mobile app:
1. Requests foreground location permission from the OS.
2. Reads the current GPS position.
3. Sends `{ source: "mobile", latitude, longitude, accuracy }` to the backend.
4. Displays the backend's response (success or rejection).

The mobile app **never** calculates distance to the office and **never** decides locally whether the employee is allowed in. Company coordinates are stored only on the backend.

## Mobile Location Permission

- **Type:** Foreground only (`expo-location` / `requestForegroundPermissionsAsync`).
- **iOS:** `NSLocationWhenInUseUsageDescription` — configured in `app.json` via the `expo-location` plugin.
- **Android:** `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` — configured in `app.json`.
- **No background location** is requested or used.

## Payload Sent to Backend

```json
{
  "source": "mobile",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "accuracy": 12.5
}
```

Endpoints:
- `POST /attendance/clock-in`
- `POST /attendance/clock-out`

All requests include `Authorization: Bearer <token>`.

## Backend Geofence Integration

Geofence enforcement on the backend (T-046) activates only when:
- `source === "mobile"`, AND
- `ATTENDANCE_GEOFENCE_ENABLED=true` (env var).

Enforcement checks (in order):
1. Location fields (`latitude`, `longitude`, `accuracy`) must be present.
2. `accuracy` must be ≤ `ATTENDANCE_GPS_MAX_ACCURACY_METERS` (default 100 m).
3. `COMPANY_LATITUDE` / `COMPANY_LONGITUDE` must be configured.
4. Distance from company must be ≤ `COMPANY_GEOFENCE_RADIUS_METERS` (default 100 m).

All rejections return HTTP 422 with a plain-text `message`.

## Error Handling

| Scenario | Backend message | Thai shown on mobile |
|---|---|---|
| Outside company area | `You are outside the allowed company area.` | คุณอยู่นอกพื้นที่บริษัทที่อนุญาต |
| GPS accuracy too low | `GPS accuracy is too low. Please try again near the office.` | ความแม่นยำของ GPS ต่ำเกินไป กรุณาลองใหม่ใกล้อาคารสำนักงาน |
| Location fields missing | `Location is required for mobile attendance.` | ต้องระบุตำแหน่งสำหรับการลงเวลาผ่านมือถือ |
| Geofence not configured | `Attendance geofence is not configured.` | ระบบตรวจสอบตำแหน่งยังไม่ได้รับการตั้งค่า |
| Already clocked in | `Already clocked in for today` | ลงเวลาเข้าไปแล้วสำหรับวันนี้ |
| Already clocked out | `Already clocked out for today` | ลงเวลาออกไปแล้วสำหรับวันนี้ |
| No clock-in yet | `No clock-in found for today` | ยังไม่มีการลงเวลาเข้าสำหรับวันนี้ |
| No employee profile | `No employee profile linked to this account` | ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้ |
| Network unreachable | _(fetch throws)_ | ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ |
| Permission denied (iOS/Android) | _(OS rejects)_ | กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อใช้การลงเวลาผ่านมือถือ |
| Cannot read GPS | _(location error)_ | ไม่สามารถอ่านตำแหน่งปัจจุบันได้ กรุณาลองใหม่อีกครั้ง |
| Session expired | HTTP 401 | auto sign-out → redirect to /login |

## Clock In / Clock Out Flow

```
Tap button
  → Disable button (set state: locating)
  → requestForegroundPermissionsAsync()
      ↳ denied? → show Thai error, stop
  → getCurrentPositionAsync({ accuracy: High })
      ↳ error? → show Thai error, stop
  → set state: submitting
  → POST /attendance/clock-in (or clock-out) with location payload
      ↳ 401 → signOut() + redirect to /login
      ↳ 4xx/5xx → parse message → translate to Thai → show error
      ↳ 2xx → show success message + refresh today & history
```

Duplicate submit protection: buttons are disabled while any clock action is in `locating` or `submitting` state.

## Accuracy Handling

- `expo-location` returns `accuracy` in meters (may be `null` on some web platforms).
- If `accuracy` is null, the mobile sends `9999` as a safe fallback — the backend will reject it for poor accuracy.
- The mobile does not perform its own accuracy threshold check.

## Manual Test Steps

1. Start backend: `docker compose up -d`
2. Set geofence env (`.env` or `docker-compose.override.yml`):
   ```
   ATTENDANCE_GEOFENCE_ENABLED=true
   COMPANY_LATITUDE=<test lat>
   COMPANY_LONGITUDE=<test lon>
   COMPANY_GEOFENCE_RADIUS_METERS=100
   ATTENDANCE_GPS_MAX_ACCURACY_METERS=100
   ```
3. Start mobile: `cd apps/mobile && npm run web` (or `npm run start` for native).
4. Log in with the seeded dev admin account (`<admin-email>` / `<admin-password>` — see `apps/api/prisma/seed.ts` for local/dev-only credentials).
5. Open the **Attendance** screen.
6. Grant location permission when prompted.
7. Tap **ลงเวลาเข้า**. Confirm loading state and result.
8. Verify today card updates with clock-in time after success.
9. Tap **ลงเวลาออก**. Confirm loading state and result.
10. Test permission denied: revoke location in device settings → tap button → confirm Thai error.
11. Test geofence rejection: use coordinates outside configured radius → confirm Thai rejection message.

## Known Limitations

- GPS spoofing cannot be prevented by the app alone. The backend validates coordinates but cannot verify device integrity.
- On web (`npm run web`), location uses the browser Geolocation API — requires HTTPS or localhost. Permission UX differs from native.
- Accuracy readings vary by device hardware and signal environment. Poor indoor GPS accuracy may cause rejections even when physically on site.
- The mobile app does not currently show the employee's GPS accuracy reading to the user (only sent to backend for transparency in validation).

## Security Notes

- Company coordinates are stored server-side only and never sent to the mobile app.
- The mobile app is the location collector; the backend is the authorization decision point.
- Backend geofence validation reduces accidental misuse (clocking from home). It does not guarantee device integrity against deliberate GPS spoofing tools.

## Future Improvements

- Geofence audit log (who clocked in from where, by time).
- Admin UI for setting company latitude/longitude without env vars.
- Multiple office location support (multi-branch).
- Device integrity checks (SafetyNet/App Attest).
- Employee-specific attendance policy (e.g., remote-work flag bypasses geofence).
- Show current accuracy reading on mobile for employee transparency.
