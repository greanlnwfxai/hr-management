# ADR-020 — Attendance Geofence and Admin Configuration

**Status:** Accepted
**Date:** 2026-06-21
**Tasks:** T-046 (backend geofence engine), T-047 (mobile GPS wiring), T-059 (gap closure), T-060 (admin DB config UI)
**Supersedes:** —
**Related:** ADR-006 RBAC, ADR-010 Attendance Timezone, ADR-019 Audit Trail

---

## Context

Mobile attendance clock-in/out introduces a location enforcement requirement: employees should only be able to clock in when physically on company premises. Without location enforcement, mobile clock-in is equivalent to unrestricted remote attendance, which defeats the purpose of physical presence tracking.

The system also needed a way for administrators to configure company coordinates and the geofence radius without redeploying the application or editing environment files in production.

---

## Decision

### 1. Backend-Enforced Geofence — Backend is the Source of Truth

The geofence validation decision is made entirely by the backend API. The mobile app sends GPS coordinates; the backend validates them and returns either success or a `422 Unprocessable Entity` with an actionable message.

**The mobile app never decides whether attendance is allowed.** It only receives the result.

This is the only acceptable architecture for an attendance integrity control. A client-side check can be bypassed by a modified app.

### 2. Mobile GPS as Input Only

The mobile clock-in/out request body carries optional location fields:

```json
{
  "source": "mobile",
  "latitude": <number>,
  "longitude": <number>,
  "accuracy": <number>,
  "note": "<optional string>"
}
```

The `source` field discriminates mobile from web/legacy. If `source` is omitted or `"web"`, geofence validation is skipped entirely — preserving backward compatibility for all existing web clients.

Geofence validation fires only when **both** of the following are true:
- `source === "mobile"`
- Geofence is enabled (DB or env config)

### 3. Haversine Formula — No Maps SDK

Distance between the employee's reported location and the configured company location is calculated using the **Haversine formula** (great-circle distance, spherical Earth radius 6,371,000 m). This is implemented in `GeofenceService.calculateDistanceMeters()`.

No third-party geocoding or maps API is used. "Company location" means a numeric latitude/longitude pair, not a named address. The recommended source for these coordinates is a Google Maps pin: right-click a location in Google Maps → "Copy coordinates."

Haversine error for distances under 1 km is well below 1%. This is more than sufficient for a 100 m geofence.

### 4. Validation Sequence

When geofence validation runs, checks are applied in this order:

1. **Missing location fields** → `422 "Location is required for mobile attendance."`
2. **GPS accuracy too poor** (`accuracy > maxAccuracyMeters`) → `422 "GPS accuracy is too low. Please try again near the office."`
3. **Company location not configured** (no coordinates in DB or env) → `422 "Attendance geofence is not configured."`
4. **Outside radius** (`distance > radiusMeters`) → `422 "You are outside the allowed company area."`
5. **Pass** → proceed with normal attendance rules (LATE logic, duplicate check, etc.)

### 5. DB Singleton Config with Env Fallback

Initially (T-046), geofence configuration lived entirely in environment variables:

| Variable | Default | Description |
|---|---|---|
| `ATTENDANCE_GEOFENCE_ENABLED` | `false` | Master geofence switch |
| `COMPANY_LATITUDE` | — | Company latitude |
| `COMPANY_LONGITUDE` | — | Company longitude |
| `COMPANY_GEOFENCE_RADIUS_METERS` | `100` | Allowed radius in meters |
| `ATTENDANCE_GPS_MAX_ACCURACY_METERS` | `100` | Max accepted GPS error radius |

T-060 added a **database-backed singleton** (`geofence_config` table, id = `"default"`). The backend uses **DB-first precedence**:

1. If a DB row exists → use DB values
2. Otherwise → fall back to environment variables

This means operators can update geofence settings at runtime through the admin UI without restarting the API or editing env files. The env fallback remains supported indefinitely for simpler deployments.

The async `GeofenceConfigService.getEffectiveConfig()` method encapsulates this logic. It returns `source: 'db' | 'env'` so the admin UI can show which config is active.

### 6. Admin-Only Config Endpoints

Two new endpoints are added to the `AttendanceController`, declared before `GET /attendance/:id` to prevent NestJS routing the literal path segment `geofence-config` through `ParseUUIDPipe`:

| Method | Path | Guard | Description |
|---|---|---|---|
| `GET` | `/attendance/geofence-config` | JWT + SUPER_ADMIN/HR_ADMIN | Fetch effective config (DB or env) |
| `PATCH` | `/attendance/geofence-config` | JWT + SUPER_ADMIN/HR_ADMIN | Persist config update to DB |

**Cross-field validation:** enabling geofence (`enabled: true`) without latitude and longitude (either in the PATCH body or already in the DB) returns `422`.

### 7. RBAC — SUPER_ADMIN / HR_ADMIN Only

Geofence configuration is an administrative concern. MANAGER and EMPLOYEE roles cannot access geofence config endpoints or the admin settings page.

Clock-in/out geofence *enforcement* applies to all mobile users equally — an employee cannot disable geofence for themselves.

### 8. Admin Web UI

The admin web UI page at `/attendance/geofence-settings` is gated by `isAdmin()` on the client and by `@Roles(SUPER_ADMIN, HR_ADMIN)` on the API. The backend RBAC is authoritative; the frontend check is a UX convenience only.

Non-admin users who navigate to the settings URL directly will see an access-denied message and will never trigger the protected API call (`useEffect` is gated on `isAdmin()` before mounting).

The UI displays the active config source (DB badge in blue, env badge in amber) so admins know whether their edits are being read from the database or from environment defaults.

### 9. Audit Event — Safe Metadata

Every `PATCH /attendance/geofence-config` records `ATTENDANCE_GEOFENCE_CONFIG_UPDATED` in the audit log via `AuditLogService.recordBestEffort()`.

**Privacy constraint on audit metadata:** raw company coordinates (latitude/longitude) are never written into `AuditLog.metadata`. The metadata contains only:

- `previousEnabled`, `newEnabled` (booleans)
- `previousHasCoordinates`, `newHasCoordinates` (booleans — presence flag, not values)
- `previousRadiusMeters`, `newRadiusMeters` (integers)
- `previousMaxAccuracyMeters`, `newMaxAccuracyMeters` (integers)
- `previousSource`, `newSource` (`'db'` or `'env'`)

Company coordinates are admin-only configuration data, but they still must not appear in an append-only append-only audit trail that may be accessible to broader support tooling in the future.

### 10. No Raw Employee GPS Storage

Employee GPS coordinates (latitude, longitude, accuracy) sent in the clock-in/out request body are:

- Used only for geofence validation and then discarded
- Never persisted to the `attendance` table
- Never written to `AuditLog.metadata`
- Never logged to server logs

This is a hard privacy rule. The system records *that* an employee clocked in and *when*, but not *where* in any stored form.

### 11. GPS Spoofing Limitation

A device with root access or a mock location app can send arbitrary coordinates. The geofence provides a reasonable deterrent for accidental or casual abuse but is **not a security control against a determined attacker**. The accuracy threshold (rejecting readings with error radius > `maxAccuracyMeters`) reduces false positives near the boundary; it does not prevent spoofing.

For stronger guarantees, device integrity APIs (SafetyNet/Play Integrity on Android, DeviceCheck on iOS) would be required. This is out of scope for the current version.

### 12. Single-Office Limitation

The current implementation supports a single company location (the `geofence_config` singleton with `id = "default"`). Multiple offices would require a named location table and per-employee or per-attendance-rule assignment. This is architectural future work.

---

## Consequences

**Positive:**
- Mobile attendance integrity is backend-enforced — cannot be bypassed by the mobile app
- Admins can update geofence config at runtime via the web UI without API restarts
- Env-based config continues to work for simpler/legacy deployments
- No external API dependency for location validation (Haversine is pure math)
- Employee GPS coordinates are never stored (privacy by design)
- Audit trail records config changes safely without leaking coordinates

**Negative / Trade-offs:**
- Single-office limitation requires schema change for multi-office support
- GPS spoofing is not preventable at the software layer without device integrity APIs
- DB-first config adds an async call on every mobile clock-in/out (one `findUnique` on the `geofence_config` table)
- Route ordering constraint: geofence-config endpoints must be declared before `/:id` to avoid `ParseUUIDPipe` conflicts

---

## Related Files

| File | Role |
|---|---|
| `apps/api/src/attendance/geofence-config.service.ts` | DB-first config; `getEffectiveConfig()` |
| `apps/api/src/attendance/geofence.service.ts` | Haversine distance calculation |
| `apps/api/src/attendance/attendance.service.ts` | `validateGeofence()`, `updateGeofenceConfig()` |
| `apps/api/src/attendance/dto/patch-geofence-config.dto.ts` | PATCH DTO with cross-field validation |
| `apps/api/prisma/schema.prisma` | `GeofenceConfig` model (singleton) |
| `apps/api/prisma/migrations/20260621000000_add_company_geofence_config/` | DB migration |
| `apps/web/app/(app)/attendance/geofence-settings/page.tsx` | Admin web UI |
| `docs/ATTENDANCE_GEOFENCE_BACKEND.md` | Full backend specification |
| `docs/MOBILE_GEOFENCE_CLOCK.md` | Mobile geofence clock documentation |

---

## See Also

- [[ADR-006 RBAC]] — four-role model; geofence config is SUPER_ADMIN/HR_ADMIN only
- [[ADR-010 Attendance Timezone]] — attendance clock rules
- [[ADR-019 Audit Trail and Admin Review]] — audit event pattern and metadata safety rules
