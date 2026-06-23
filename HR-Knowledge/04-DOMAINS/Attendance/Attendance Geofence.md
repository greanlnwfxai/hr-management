# Attendance Geofence

> Implemented: T-046 (backend engine), T-047 (mobile GPS wiring), T-059 (gap closure), T-060 (admin DB config).
> See `docs/ATTENDANCE_GEOFENCE_BACKEND.md` for the full backend spec.

---

## Business Rule

Mobile clock-in and clock-out are only allowed when the employee is physically within the configured company area.

**The backend is the source of truth.** The mobile app sends GPS coordinates; the backend validates them and returns either success or a 422 error. The mobile app never makes the allow/deny decision.

---

## Mobile Clock-In/Out Request Fields

The existing `POST /attendance/clock-in` and `POST /attendance/clock-out` endpoints accept optional location fields:

| Field | Type | Description |
|---|---|---|
| `source` | `"web"` \| `"mobile"` | Discriminator. Omitting = treated as web (no geofence check). |
| `latitude` | number | −90 to 90 |
| `longitude` | number | −180 to 180 |
| `accuracy` | number | GPS error radius in meters (>0) |
| `note` | string | Optional (max 500 chars) |

**Web / legacy behavior:** When `source` is omitted or `"web"`, geofence validation is skipped entirely. All web clock-in/out behavior is preserved unchanged.

---

## Off-site Work Mode (OFFSITE)

When `workMode === "OFFSITE"` is sent in the clock-in request, the geofence radius check is **bypassed**, but GPS coordinates are still required. This path is only available during **clock-in**; clock-out always validates geofence regardless of work mode.

Off-site bypass requires a prior approved `OffSiteRequest` for the employee and today's date. See [[Off-site Work Mode]] for the full workflow.

## Geofence Validation Sequence (ONSITE / default)

Runs when `source === "mobile"` AND `workMode` is `ONSITE` (or absent) AND geofence is enabled:

1. **Missing location fields** → `422 "Location is required for mobile attendance."`
2. **GPS accuracy too poor** (accuracy > `maxAccuracyMeters`) → `422 "GPS accuracy is too low. Please try again near the office."`
3. **Company location not configured** (no coordinates in DB or env) → `422 "Attendance geofence is not configured."`
4. **Outside radius** (distance > `radiusMeters`) → `422 "You are outside the allowed company area."`
5. **Pass** → proceed with normal clock-in/out business rules (LATE rule, duplicate check, etc.)

---

## Distance Calculation

Haversine formula (spherical Earth radius 6,371,000 m). Implemented in `GeofenceService.calculateDistanceMeters()`. No external maps or geocoding API is used.

"Company location" means a numeric latitude/longitude pair. The recommended source is a **Google Maps pin**: right-click the office location in Google Maps and select "Copy coordinates."

---

## Configuration — DB-First with Env Fallback

### Precedence

```
getEffectiveConfig():
  1. DB row (id = "default") exists → source: 'db'
  2. No DB row → read environment variables → source: 'env'
```

### Environment Variables (fallback)

| Variable | Default | Description |
|---|---|---|
| `ATTENDANCE_GEOFENCE_ENABLED` | `false` | Master switch |
| `COMPANY_LATITUDE` | — | Company latitude |
| `COMPANY_LONGITUDE` | — | Company longitude |
| `COMPANY_GEOFENCE_RADIUS_METERS` | `100` | Allowed radius in meters |
| `ATTENDANCE_GPS_MAX_ACCURACY_METERS` | `100` | Max accepted GPS error radius in meters |

Local development: `ATTENDANCE_GEOFENCE_ENABLED=false` is the safe default. Geofence is completely bypassed.

### Database Config (T-060)

The `geofence_config` table stores a singleton row (`id = "default"`). Fields:

| Field | Type | Description |
|---|---|---|
| `enabled` | boolean | Master switch |
| `latitude` | float? | Company latitude |
| `longitude` | float? | Company longitude |
| `radiusMeters` | int | Allowed radius (10–10,000) |
| `maxAccuracyMeters` | int | Max GPS accuracy (5–1,000) |
| `updatedByUserId` | string? | Last admin to update |

---

## Admin API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /attendance/geofence-config | JWT + SUPER_ADMIN/HR_ADMIN | Fetch effective config (DB or env) |
| PATCH | /attendance/geofence-config | JWT + SUPER_ADMIN/HR_ADMIN | Update config in DB |

**Route ordering:** These routes are declared before `GET /attendance/:id` to prevent NestJS from routing the literal string `geofence-config` through `ParseUUIDPipe`.

**PATCH body fields:**

| Field | Type | Constraints |
|---|---|---|
| `enabled` | boolean | optional |
| `latitude` | number | −90 to 90 |
| `longitude` | number | −180 to 180 |
| `radiusMeters` | integer | 10–10,000 |
| `maxAccuracyMeters` | integer | 5–1,000 |

**Cross-field rule:** Enabling geofence (`enabled: true`) without coordinates (neither in the PATCH body nor already in the DB) returns `422`.

---

## Admin Web UI

Available at `/attendance/geofence-settings` for SUPER_ADMIN and HR_ADMIN.

- Shows whether config is read from DB or env (source badge)
- Displays the production notice: "use real company coordinates in production"
- Hints for lat/lon fields: copy from Google Maps
- Hint for radius: default is 100 m
- Non-admin users who navigate directly see access denied without triggering any API call

---

## RBAC

| Operation | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| View geofence config (GET) | ✅ | ✅ | ❌ | ❌ |
| Update geofence config (PATCH) | ✅ | ✅ | ❌ | ❌ |
| Clock-in/out with geofence enforcement | ✅ (mobile) | ✅ (mobile) | ✅ (mobile) | ✅ (mobile) |

Backend RBAC is authoritative. Web UI gating is UX-only.

---

## Audit Event

Every `PATCH /attendance/geofence-config` records `ATTENDANCE_GEOFENCE_CONFIG_UPDATED`.

**Safe metadata (no coordinates):**

```json
{
  "previousEnabled": false,
  "previousHasCoordinates": false,
  "previousRadiusMeters": 100,
  "previousMaxAccuracyMeters": 100,
  "previousSource": "env",
  "newEnabled": true,
  "newHasCoordinates": true,
  "newRadiusMeters": 150,
  "newMaxAccuracyMeters": 50,
  "newSource": "db"
}
```

Raw company coordinates are never written to `AuditLog.metadata`.

---

## Privacy Rules

- Employee GPS (latitude, longitude, accuracy) is used only for validation and is **never persisted** to any table, audit log entry, or application log.
- Company coordinates are admin-only configuration; they appear in the `GET /attendance/geofence-config` response to authorized admins, but are never written into the audit trail.

---

## Failed Geofence Audit (Implemented in T-065)

Failed mobile geofence clock-in and clock-out attempts now emit `ATTENDANCE_GEOFENCE_REJECTED`.

Implemented behavior:

- Event is emitted only for failed mobile geofence attempts
- Covered attempts: `CLOCK_IN`, `CLOCK_OUT`
- Covered rejection reasons: `MISSING_LOCATION`, `POOR_ACCURACY`, `GEOFENCE_NOT_CONFIGURED`, `OUTSIDE_RADIUS`
- Audit write is best-effort and does not change the user-facing response
- Existing `422` behavior is preserved
- No attendance record is created for rejected attempts
- Web and legacy attendance requests remain unaffected
- Successful inside-radius mobile attendance does not emit this rejection event

Safe metadata fields:

| Field | Description |
|---|---|
| `attemptType` | `CLOCK_IN` or `CLOCK_OUT` |
| `source` | always `"mobile"` |
| `reason` | `MISSING_LOCATION` / `POOR_ACCURACY` / `GEOFENCE_NOT_CONFIGURED` / `OUTSIDE_RADIUS` |
| `hasCoordinates` | boolean — whether lat/lon was present |
| `hasAccuracy` | boolean — whether accuracy was present |
| `accuracyBucket` | `UNKNOWN` / `ACCEPTABLE` / `POOR` (coarse GPS quality signal; no raw number) |
| `configSource` | `"db"` or `"env"` |
| `geofenceEnabled` | boolean |
| `result` | always `REJECTED` |

**Privacy exclusions:** `latitude`, `longitude`, raw `accuracy`, exact `distance`, company coordinates, free-form `note`, bearing, offsets, and derived location fields are excluded from metadata.

The audit sanitizer denylist now also redacts exact-key matches for:

- `latitude`
- `longitude`
- `accuracy`
- `distance`

`accuracyBucket` is preserved because sanitizer matching is exact-key based.

See `docs/SPEC_T064_FAILED_GEOFENCE_ATTEMPT_AUDIT.md`, `docs/CTO_SUMMARY_T065.md`, and [[ADR-021 Failed Geofence Attempt Audit]].

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Single office only | Multi-office requires schema redesign |
| GPS spoofing undetectable | Device integrity APIs (SafetyNet / DeviceCheck) not implemented |
| No per-role or per-office radius | Global radius applies to all users |
| Elevation ignored | Haversine is 2D distance only |

---

## Related Notes

- [[Attendance Module]]
- [[Off-site Work Mode]]
- [[ADR-020 Attendance Geofence and Admin Configuration]]
- [[ADR-021 Failed Geofence Attempt Audit]]
- [[ADR-022 Off-site Work Request Workflow]]
- [[ADR-006 RBAC]]
- [[ADR-010 Attendance Timezone]]
- [[RBAC Rules]]
- [[API Route Index]]

#domain #attendance #geofence #mobile #privacy #admin
