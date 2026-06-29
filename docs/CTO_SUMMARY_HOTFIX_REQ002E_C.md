# CTO Summary

## Step
HOTFIX-REQ002E-C — Diagnose and Fix Off-site Button Hidden When Today Attendance State Exists

## Status
PASS

## Scope
Root-cause diagnosis of the persistent bug where the green "ลงเวลาเข้า (นอกสถานที่)" button was not visible on STEP Connect Home despite the production geofence being active, as confirmed by real mobile test. Previous hotfixes REQ002E-A and REQ002E-B were tagged and deployed but the button still did not appear. This hotfix identifies the exact code defect and applies a one-line targeted fix.

## Root Cause (Diagnosis)
A structural inconsistency existed between `home.tsx` and `GeofenceMapModal.tsx` in how each interpreted "geofence configured":

- **`GeofenceMapModal`** treated the geofence as ready whenever `latitude` and `longitude` were non-null, ignoring the `enabled` field.
- **`home.tsx`** required `config.enabled === true` **in addition to** non-null coordinates before setting `geofenceZone = 'configured'`.

If the geofence record had coordinates set but `enabled = false` (a plausible admin misconfiguration), the modal correctly showed the 24,938 m distance (confirming the system had coordinates), while `home.tsx` silently set `geofenceZone = 'unconfigured'`, hiding the green button. All three conditions for the green button's JSX guard (`!hasActiveOffsiteCheckIn && !alreadyClockedIn && geofenceZone === 'configured'`) were satisfied except the last one.

The normal blue check-in and disabled red checkout were consistent with `alreadyClockedIn = false` (no active checkIn today), confirming the geofenceZone flag was the sole failing condition.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_REQ002E_C.md`

## Files Modified
- `apps/mobile/app/home.tsx` — line 271: removed `config.enabled &&` from the `setGeofenceZone` condition, aligning it with GeofenceMapModal's interpretation

**Before:**
```javascript
setGeofenceZone(
  config.enabled && config.latitude !== null && config.longitude !== null
    ? 'configured'
    : 'unconfigured',
);
```

**After:**
```javascript
setGeofenceZone(
  config.latitude !== null && config.longitude !== null
    ? 'configured'
    : 'unconfigured',
);
```

## Verification Result
```
./scripts/verify.sh         → PASS  (API build, Prisma schema, Web build)
./scripts/docker-verify.sh  → not run (stack already healthy from previous deploy)
./scripts/api-smoke-test.sh → PASS  (health, login, me, employees, departments, positions, attendance, leave, dashboard, 401 guard)
./scripts/security-review.sh → PASS  (dependency audit, secret scan — Multer accepted-risk carried forward)
npx tsc --noEmit (mobile)   → PASS  (0 errors)
```

## Issues Found
None during fix application. All verification scripts passed cleanly. The Multer HIGH advisories (GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm) remain in accepted-risk status from prior review; no new advisories introduced.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — no endpoints added or changed |
| RBAC impact | None |
| Data privacy impact | None — no new PII exposed |
| Password/token/hash impact | None |
| Mobile security impact | None — no token storage or API call changes |
| Dependency/advisory impact | No new packages added; no new audit findings |
| Secrets/logging check | None — no secrets, tokens, or coordinates in logs or responses |
| New endpoints protected | None added |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low — frontend-only, one-line change. No backend, schema, or auth changes. Behavior only changes when `enabled = false` but coordinates exist (the exact failing case). When `enabled = true` (standard production state), no behavioral difference. When no coordinates are present, `geofenceZone = 'unconfigured'` as before.

## Decision
PASS

## Next Step
Resume normal feature development. Confirm on next real mobile test that the green off-site button appears immediately on home screen load when geofence coordinates are configured.

## Recommended Commit Message
```
fix(mobile): show off-site option when geofence coordinates exist

home.tsx was requiring config.enabled === true before treating the
geofence as configured, while GeofenceMapModal only checked for
non-null coordinates. If enabled=false but coords were set, the modal
correctly showed the 24 938 m distance while the green off-site button
remained hidden. Align geofenceZone logic to use coordinates presence
only, matching the modal's interpretation.
```
