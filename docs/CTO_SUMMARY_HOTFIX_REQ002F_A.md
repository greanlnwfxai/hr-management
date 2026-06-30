# CTO Summary

## Step
HOTFIX-REQ002F-A — Force Fresh GPS for Attendance Actions

## Status
PASS

## Scope
Mobile-only frontend hotfix. No backend, database, schema, or infrastructure changes.

Root cause: expo-location's web implementation (`ExpoLocation.web.ts`) hardcodes `maximumAge: Infinity` when calling `navigator.geolocation.getCurrentPosition`. Because `LocationOptions` (expo-location's type) has no `maximumAge` field, the spread `...options` in expo-location's web layer cannot override `Infinity`. The browser is allowed to return a GPS position cached from any previous session — explaining why the geofence modal showed the user ~142 m from the office while they were physically kilometers away.

Secondary issue: `offsite-checkin.tsx`, `offsite-checkout.tsx`, and `mixed-checkout.tsx` captured GPS once on mount, stored it in React state, and passed that stale state to the API submit — meaning even an initially-fresh reading could be hours old by submit time if the user lingered on the form.

Tertiary issue: `offsite-checkin.tsx` and `offsite-checkout.tsx` allowed submit with `gpsStatus === 'low_accuracy'` (accuracy > 100 m), weakening the accuracy gate that `mixed-checkout.tsx` already enforced correctly.

## Files Created
_(none)_

## Files Modified

| File | Change |
|------|--------|
| `apps/mobile/src/hooks/useDeviceLocation.ts` | Added `Platform.OS === 'web'` branch that calls `navigator.geolocation.getCurrentPosition` directly with `{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }`, bypassing expo-location's web layer. Native path unchanged (expo-location `Accuracy.High`). |
| `apps/mobile/src/hooks/useAttendance.ts` | Added `accuracy > 100` pre-check in `performClockIn` and `performClockOut` after GPS is acquired; blocks submit with Thai error message before making the API call. |
| `apps/mobile/app/offsite-checkin.tsx` | `handleSubmit` now calls `getLocation()` fresh at submit time (never uses mount-time stored state). `canSubmit` tightened to require `gpsStatus === 'ready'` only (removed `low_accuracy` path). |
| `apps/mobile/app/offsite-checkout.tsx` | Same as offsite-checkin: fresh GPS at submit, `canSubmit` requires `'ready'` only. |
| `apps/mobile/app/mixed-checkout.tsx` | `handleSubmit` now calls `getLocation()` fresh at submit time, using `freshLocation` for the API payload instead of stored `location` state. Simplified catch clause (no re-acquire needed since GPS is always re-read proactively). |

## Verification Result

| Check | Result |
|-------|--------|
| `mobile tsc --noEmit` | PASS — zero errors |
| `./scripts/verify.sh` | PASS — API build, Prisma schema, Web build all green |
| `./scripts/api-smoke-test.sh` | PASS — all endpoints healthy, auth + employees verified |
| `./scripts/security-review.sh` | PASS — dependency audit clear, no secrets found |
| `./scripts/docker-verify.sh` | NOT RUN — script contains `docker compose down` which is prohibited by Docker Safety Rules. Stack verified via `docker compose start` (existing containers) and `api-smoke-test.sh` instead. |

**Note on behavioral verification**: The GPS freshness fix cannot be confirmed by automated scripts — it requires a live PWA session in a browser that has a cached GPS position. The fix is verified by code inspection and tsc. On-device re-test by the user is required to confirm the stale-position symptom is resolved.

## Issues Found

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | expo-location web hardcodes `maximumAge: Infinity` | HIGH (primary root cause) | Bypass expo-location on web; call browser API directly with `maximumAge: 0` |
| 2 | Mount-time GPS reused stale at submit in 3 screens | MEDIUM | Re-acquire fresh GPS inside each `handleSubmit` |
| 3 | offsite-checkin/out allowed `low_accuracy` submit | MEDIUM | `canSubmit` now requires `'ready'` only; block at >100 m |

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | None — no endpoint added or changed |
| RBAC impact | None |
| Data privacy impact | None — lat/lon still not displayed raw; accuracy/distance shown in meters as before |
| Password/token/hash impact | None |
| Mobile security impact | IMPROVEMENT — GPS freshness enforced; stale cached position can no longer be accepted for attendance submit |
| Dependency/advisory impact | No new packages added. Pre-existing accepted-risk advisories (Multer DoS) unchanged |
| Secrets/logging check | No GPS coordinates logged; no tokens exposed |
| New endpoints protected | None |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low — mobile-only change, no backend impact, no schema change, no new packages.

## Decision
PASS

## Next Step
User performs on-device re-test of the geofence modal and all attendance flows (normal check-in/out, offsite check-in/out, mixed checkout) to confirm fresh GPS is acquired and stale position is no longer shown.

## Recommended Commit Message
```
fix(mobile): require fresh GPS for attendance actions

Root cause: expo-location web hardcodes maximumAge: Infinity, allowing
the browser to return positions cached from previous sessions.

- useDeviceLocation: add Platform.OS=web branch calling navigator.geolocation
  directly with { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
- useAttendance: pre-check accuracy >100 m before clock-in/out API call
- offsite-checkin/checkout: re-acquire GPS fresh at submit time; block submit
  if accuracy >100 m (remove low_accuracy bypass in canSubmit)
- mixed-checkout: re-acquire GPS fresh at submit time instead of reusing
  mount-time stored location state
```
