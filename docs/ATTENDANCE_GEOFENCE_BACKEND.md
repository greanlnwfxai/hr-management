# Attendance Geofence — Backend Documentation

> Added in T-046. Mobile wiring (GPS UI + real clock-in/out) is T-047.

---

## Business Rule

Mobile Clock In and Clock Out are only allowed when the employee is physically within company premises.

**Backend is the source of truth.** The mobile app must not decide whether attendance is allowed — it sends coordinates and the backend validates them.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ATTENDANCE_GEOFENCE_ENABLED` | `false` | Master switch. Set `true` in production to enforce geofence. |
| `COMPANY_LATITUDE` | — | Company location latitude (e.g. `13.7563`). Required if enabled. |
| `COMPANY_LONGITUDE` | — | Company location longitude (e.g. `100.5018`). Required if enabled. |
| `COMPANY_GEOFENCE_RADIUS_METERS` | `100` | Allowed radius in meters from company location. |
| `ATTENDANCE_GPS_MAX_ACCURACY_METERS` | `100` | Maximum GPS accuracy error radius accepted. Requests with worse accuracy are rejected. |

**Local development:** `ATTENDANCE_GEOFENCE_ENABLED=false` is the safe default. Geofence is entirely bypassed.

**Production:** Set `ATTENDANCE_GEOFENCE_ENABLED=true` and provide real `COMPANY_LATITUDE` / `COMPANY_LONGITUDE` in the server `.env` (never committed to source control).

If geofence is enabled but company coordinates are missing or invalid, the backend returns 422 with `"Attendance geofence is not configured."`.

---

## Distance Calculation

Uses the **Haversine formula** for great-circle distance on a spherical Earth (radius 6,371,000 m).

**Implementation:** `apps/api/src/attendance/geofence.service.ts`

```typescript
calculateDistanceMeters(lat1, lon1, lat2, lon2): number
isWithinRadius(userLat, userLon, companyLat, companyLon, radiusMeters): boolean
```

Pure math — no external maps or geocoding API. Deterministic, fully unit-tested.

**Accuracy:** Haversine error is < 0.5% for distances under a few kilometers. More than sufficient for a 100 m geofence.

---

## Mobile Payload Contract

Clock-in and clock-out endpoints accept optional location fields. The `source` field discriminates mobile vs. web/legacy traffic.

**Endpoint:** `POST /attendance/clock-in` or `POST /attendance/clock-out`

```json
{
  "source": "mobile",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "accuracy": 25,
  "note": "optional"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `source` | `"web"` \| `"mobile"` | No | Omitting = treated as web/legacy |
| `latitude` | number | No* | -90 to 90 |
| `longitude` | number | No* | -180 to 180 |
| `accuracy` | number | No* | > 0 (GPS accuracy radius in meters) |
| `note` | string | No | Max 500 chars |

*Required when `source = "mobile"` and `ATTENDANCE_GEOFENCE_ENABLED=true`.

**Web / legacy behavior:** If `source` is omitted or set to `"web"`, geofence validation is skipped entirely. Existing web clock-in/out behavior is fully preserved.

---

## Validation Rules

Geofence validation runs when `source === "mobile"` AND `ATTENDANCE_GEOFENCE_ENABLED=true`.

In order:

1. **Missing location fields** → `422` — `"Location is required for mobile attendance."`
2. **GPS accuracy too poor** (`accuracy > ATTENDANCE_GPS_MAX_ACCURACY_METERS`) → `422` — `"GPS accuracy is too low. Please try again near the office."`
3. **Company location not configured** (env vars missing/invalid) → `422` — `"Attendance geofence is not configured."`
4. **Outside radius** (`distance > COMPANY_GEOFENCE_RADIUS_METERS`) → `422` — `"You are outside the allowed company area."`
5. **Pass** → proceed with normal attendance business rules (duplicate check, LATE logic, etc.)

---

## Error Response Behavior

| Condition | HTTP | Message |
|---|---|---|
| Missing lat/lon/accuracy (mobile) | 422 | Location is required for mobile attendance. |
| GPS accuracy too poor | 422 | GPS accuracy is too low. Please try again near the office. |
| Company location not configured | 422 | Attendance geofence is not configured. |
| Outside allowed radius | 422 | You are outside the allowed company area. |
| Invalid lat/lon values | 400 | class-validator error (from DTO) |
| Already clocked in | 409 | Already clocked in for today |
| No clock-in found | 404 | No clock-in found for today |

---

## Security Notes

- **Backend is authoritative.** The mobile app receives the error and displays it; it never makes the allow/deny decision.
- **GPS spoofing cannot be fully prevented by software alone.** A device with root access or a mock location app can send arbitrary coordinates. This geofence provides a reasonable deterrent for accidental or casual abuse, not a security control against a determined attacker.
- **Accuracy threshold** acts as a signal of reliability. Poor accuracy GPS readings (> 100 m error radius) are rejected to reduce false positives near the boundary.
- **Company coordinates** must never be committed to source control. Store in production `.env` only.
- The geofence feature flag (`ATTENDANCE_GEOFENCE_ENABLED=false`) allows safe local development and staging without requiring real coordinates.

---

## Known Limitations

- Single office location only. Multiple offices require schema changes and config refactoring.
- Geofence radius is global — no per-office or per-role radius.
- No audit log of geofence rejection events (planned: T-future).
- GPS spoofing is undetectable without additional device integrity checks (SafetyNet/Play Integrity on Android, DeviceCheck on iOS).
- No admin UI for configuring company location — env var only in this version.
- Backend uses a fixed spherical Earth radius. Elevation is not considered.

---

## Future Improvements

| Improvement | Notes |
|---|---|
| Office location management UI | Admin CRUD for office lat/lon/radius, stored in DB |
| Multiple office locations | Allow employees at branch offices to clock in |
| Geofence audit log | Record each rejection with coordinates, distance, accuracy |
| Device integrity checks | SafetyNet (Android) / DeviceCheck (iOS) to detect mock GPS |
| Admin override workflow | HR admin can approve out-of-range attendance manually |
| Mobile T-047 integration | Wire real GPS to clock-in/out buttons in the mobile app |

---

## Related Files

| File | Purpose |
|---|---|
| `apps/api/src/attendance/geofence.service.ts` | Haversine distance + radius check |
| `apps/api/src/attendance/geofence-config.service.ts` | Reads env vars |
| `apps/api/src/attendance/attendance.service.ts` | `validateGeofence()` method |
| `apps/api/src/attendance/dto/clock-in.dto.ts` | Location fields + validation |
| `apps/api/src/attendance/dto/clock-out.dto.ts` | Location fields + validation |
| `apps/api/src/attendance/geofence.service.spec.ts` | Haversine unit tests |
| `apps/api/src/attendance/attendance.service.spec.ts` | Geofence integration tests |
| `.env.example` | Geofence env var placeholders |
| `docs/API_ROUTES.md` | Updated clock-in/out payload docs |

---

## T-047 Integration Plan (Next Step)

When T-047 is ready:

1. Mobile app requests GPS permission via Expo `expo-location`.
2. On clock-in/out tap, reads current position (`latitude`, `longitude`, `accuracy`).
3. Sends payload with `source: "mobile"` plus location fields.
4. Backend validates and returns success or 422 with an actionable message.
5. Mobile displays backend error message directly to the user.
6. No GPS decision logic in the mobile app — only UI for the backend result.
