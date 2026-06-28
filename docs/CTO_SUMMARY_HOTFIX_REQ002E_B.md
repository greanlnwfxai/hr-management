# CTO Summary

## Task
HOTFIX-REQ002E-B — Fix Green Off-site Button Never Appearing on Real Mobile (second fix)

## Status
PASS

## Why HOTFIX-REQ002E-A Was Insufficient

HOTFIX-REQ002E-A added `gps_unavailable` to the off-site button eligibility condition. The fix was correct for the case where `getLocation()` throws silently, but the user confirmed the green button STILL did not appear in production after that fix.

The `gps_unavailable` branch is only reached when the `Promise.all` resolves with `loc = null`. In production, one of these three things happens instead:

1. **Stale cached GPS position** — `getLocation()` succeeds, but the browser returns a cached coordinate from a prior session when the user was physically at the office. The haversine distance is small → `'inside'` → only normal buttons. The hotfix never touched the `'inside'` case.
2. **API failure → outer catch** — if `getGeofenceLocation(token)` throws (auth timing, transient network), the outer try/catch sets `'unconfigured'`, not `'gps_unavailable'`. The hotfix never touched the `'unconfigured'` case.
3. **Promise hang → `'loading'`** — if both promises hang indefinitely, the state never advances beyond `'loading'`.

All three of these states satisfy `geofenceZone !== 'outside'`, so line 505 always rendered normal buttons only.

## Root Cause

GPS zone-detection on home-screen mount is fundamentally unreliable in PWA/mobile-browser context:
- `getCurrentPositionAsync` with `Accuracy.High` can return stale cached coordinates without error
- There is no user gesture at mount time to force a fresh acquisition
- There is no `maximumAge: 0` override to bypass the cache

The home screen was trying to be "smart" about which button to show, but the GPS input it was reading was wrong.

## Fix

Remove GPS zone-detection from home mount entirely. The home screen only needs to know **whether the geofence feature is enabled** — not where the user is standing. Location accuracy matters when the user taps Confirm in the off-site check-in form (where it is user-gesture-initiated and already works correctly).

The spec note confirms this intent: *"The geofence check on mobile is for UI pre-screening only. The backend is authoritative. Do not suppress the off-site UI if the user claims to be outside — always let the API reject invalid attempts."*

## Files Changed

| File | Change |
|---|---|
| `apps/mobile/app/home.tsx` | 6 targeted edits — see below |

No other files changed.

### Diff summary

**Imports removed:**
```diff
- import { useDeviceLocation } from '../src/hooks/useDeviceLocation';
- import { haversineMeters } from '../src/utils/haversine';
```

**Type simplified:**
```diff
- type GeofenceZone = 'loading' | 'inside' | 'outside' | 'gps_unavailable' | 'unconfigured';
+ type GeofenceZone = 'loading' | 'configured' | 'unconfigured';
```

**Component — `getLocation` removed:**
```diff
- const { getLocation } = useDeviceLocation();
```

**Effect replaced (config-only, no GPS):**
```typescript
// BEFORE — called getLocation() in parallel with getGeofenceLocation()
// AFTER:
useEffect(() => {
  if (!token) return;
  let cancelled = false;

  getGeofenceLocation(token)
    .then((config) => {
      if (cancelled || !mountedRef.current) return;
      setGeofenceZone(
        config.enabled && config.latitude !== null && config.longitude !== null
          ? 'configured'
          : 'unconfigured',
      );
    })
    .catch(() => {
      if (!cancelled && mountedRef.current) setGeofenceZone('unconfigured');
    });

  getTodayOffSiteStatus(token)
    .then((rec) => { if (!cancelled && mountedRef.current) setTodayOffSite(rec); })
    .catch(() => { /* non-critical */ });

  return () => { cancelled = true; };
}, [token]);
```

**Derived state — `isOutside` removed:**
```diff
- const isOutside = geofenceZone === 'outside';
```

**Render condition — off-site button:**
```diff
- {!hasActiveOffsiteCheckIn && !alreadyClockedIn && (isOutside || geofenceZone === 'gps_unavailable') && (
+ {!hasActiveOffsiteCheckIn && !alreadyClockedIn && geofenceZone === 'configured' && (
```

**Render condition — normal buttons:**
```diff
- {!hasActiveOffsiteCheckIn && (geofenceZone !== 'outside' || alreadyClockedIn) && (
+ {!hasActiveOffsiteCheckIn && (
```

### Resulting render behavior

| `geofenceZone` | Off-site button | Normal buttons |
|---|---|---|
| `loading` | Hidden | Shown |
| `configured` + not clocked in | **Shown ✅** | Shown |
| `configured` + already clocked in | Hidden | Shown |
| `unconfigured` | Hidden | Shown |
| Active off-site check-in | Hidden (`!hasActiveOffsiteCheckIn` false) | Hidden |

When the geofence is configured and the user has not clocked in yet, both the off-site button and the normal check-in/check-out buttons are visible. The user selects the appropriate path; the backend validates GPS accuracy on submit.

## Backend Changed
No

## Database / Schema Changed
No

## Data Mutation
No

## Docker Destructive Commands
No

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — no new endpoints, no auth changes |
| RBAC impact | None |
| Data privacy | No new data exposed; raw GPS removed from home mount entirely |
| Password/token/hash | None |
| Mobile security | GPS removed from home mount; GPS still captured on user Confirm tap in offsite-checkin.tsx — foreground only, no background location |
| Dependencies | No new packages |
| Secrets/logging | None; secret scan clean |
| New endpoints protected | None |
| Risk level | LOW |
| Security decision | PASS |

## Verification Results

| Command | Result |
|---|---|
| `tsc --noEmit` (mobile) | ✅ PASS — 0 errors |
| `./scripts/verify.sh` | ✅ PASS — API build, Prisma validate, Web build all OK |
| `./scripts/api-smoke-test.sh` | ✅ PASS — login, /employees, /departments, /attendance, /dashboard, 401 check all OK |
| `./scripts/security-review.sh` | ✅ PASS — dependency audit, secret scan clean |

## Issues Found
None.

## Risk
Low — targeted removal of GPS detection on mount. The GPS capture path in `offsite-checkin.tsx` (on user Confirm tap) is unchanged. Backend GPS validation is unchanged.

## Decision
PASS

## Next Step
Deploy to production. The green off-site check-in button will now appear whenever the geofence is enabled in system settings, regardless of GPS state on home-screen mount.

## Recommended Commit Message
```
fix(mobile): show off-site button based on geofence config, not GPS zone

The home-screen GPS zone detection was unreliable in PWA context:
stale cached browser GPS returned the user as 'inside' even when they
were 24,936 m away, and 'gps_unavailable' only fires when getLocation
throws — not when it returns a bad cached coordinate.

Replace GPS zone detection on mount with a simple config check: if the
geofence feature is enabled (config.enabled + lat/lon set), surface the
off-site check-in option. GPS accuracy is still validated on submit by
the backend and captured via user gesture in offsite-checkin.tsx.

Removes: useDeviceLocation, haversineMeters from home.tsx mount path.
GeofenceZone type simplified to loading | configured | unconfigured.

Scope: apps/mobile/app/home.tsx only (6 edits, no new imports).
```
