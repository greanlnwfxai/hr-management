# ADR-020 — Attendance Geofence and Admin Configuration

**Status:** Accepted
**Date:** 2026-06-21
**Tasks:** T-046, T-047, T-059, T-060
**Source file:** `docs/adr/ADR-020-attendance-geofence-and-admin-configuration.md`

---

## Summary

The attendance geofence pack enforces that mobile employees can only clock in/out when physically on company premises. The backend is the sole source of truth for the allow/deny decision; the mobile app sends coordinates and displays the backend's response.

## Key Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Backend-enforced geofence** | Client-side check can be bypassed by a modified app |
| 2 | **`source` field discriminates mobile/web** | Web and legacy clock-in/out must be preserved unchanged |
| 3 | **Haversine formula, no Maps SDK** | No external dependency; deterministic; lat/lon copied from Google Maps pin |
| 4 | **DB singleton config, env fallback** | Allows runtime config changes without redeployment; env remains supported |
| 5 | **SUPER_ADMIN / HR_ADMIN for geofence config** | Administrative control, not employee self-service |
| 6 | **No raw employee GPS stored or logged** | Privacy by design; coordinates are validated and discarded |
| 7 | **Safe audit metadata (no coordinates)** | Company lat/lon must not appear in the append-only audit trail |
| 8 | **Single-office limitation accepted** | Multi-office requires schema redesign; deferred |

## Geofence Config Precedence

```
getEffectiveConfig():
  1. DB row (id = "default") exists → use DB values  (source: 'db')
  2. No DB row → read env vars                        (source: 'env')
```

## Admin Endpoints

| Method | Path | Roles |
|---|---|---|
| GET | /attendance/geofence-config | SUPER_ADMIN, HR_ADMIN |
| PATCH | /attendance/geofence-config | SUPER_ADMIN, HR_ADMIN |

## Privacy Rule

> Employee GPS (latitude, longitude, accuracy) is used only for validation and is never persisted to any table, audit log, or application log.

## Audit Event

`ATTENDANCE_GEOFENCE_CONFIG_UPDATED` — metadata contains only boolean flags and integer values, never raw coordinates.

## Known Limitations

- Single office location only
- GPS spoofing not preventable without device integrity APIs (SafetyNet / DeviceCheck)
- Elevation not considered in distance calculation

## Related Notes

- [[ADR-006 RBAC]]
- [[ADR-010 Attendance Timezone]]
- [[ADR-019 Audit Trail and Admin Review]]
- [[Attendance Module]]
- [[Attendance Geofence]]

#adr #attendance #geofence #mobile #security #privacy
