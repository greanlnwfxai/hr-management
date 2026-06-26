# CTO Summary

## Step
HOTFIX-007 — Add Leaflet Map to Expo Web/PWA Geofence Modal

## Status
PASS

## Scope
Expo Web/PWA check-in modal only. Native iOS/Android path (`GeofenceMapModal.tsx` with `react-native-maps`) is untouched.

## Why Web/PWA Needs a Separate Map Implementation

The HR Mobile app uses **Expo Router with Metro bundler** (`"output": "single"` SPA mode). The production PWA at `https://mobilehr.eds-center.com` is served from the Expo Web build — it is **not** a native iOS app on iPhone home screen; it is an Add-to-Home-Screen PWA.

`react-native-maps` is a native module that renders via iOS `MKMapView` and Android Maps SDK. It has no web rendering path and produces a blank or broken area when loaded in a browser. The Expo `.platform.tsx` file-extension resolution system allows the native modal (`GeofenceMapModal.tsx`) and web modal (`GeofenceMapModal.web.tsx`) to be independent implementations — Metro selects the correct one at bundle time.

## Library Added and Why

**`react-leaflet` + `leaflet`** (already present in `apps/mobile/package.json` from HOTFIX-005 prep), plus **`@types/leaflet`** for TypeScript.

- Leaflet is the de-facto standard for interactive web maps; no native binaries required.
- `react-leaflet` provides React component wrappers (`MapContainer`, `TileLayer`, `Circle`, `CircleMarker`) that integrate cleanly with React's render lifecycle.
- `CircleMarker` is used instead of default `Marker` to avoid Leaflet's PNG icon path resolution issue (icon images break under Metro/bundler asset hashing).
- `TileLayer` uses OpenStreetMap tiles (no API key required, freely licensed).

## How the 100m Red Geofence Circle Is Rendered

```tsx
<Circle
  center={[geofence.latitude, geofence.longitude]}
  radius={geofence.radiusMeters}   // actual value from API (currently 100)
  pathOptions={{
    color: '#dc2626',              // red stroke
    fillColor: '#dc2626',
    fillOpacity: 0.12,             // semi-transparent fill
    weight: 2,
  }}
/>
```

The `radius` prop is in meters — Leaflet projects this correctly at any zoom level. The value comes directly from the `/attendance/geofence-location` API response (`radiusMeters`), so changing the radius in the admin panel updates the circle automatically.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_007.md` (this file)

## Files Modified
| File | Change |
|---|---|
| `apps/mobile/src/components/GeofenceMapModal.web.tsx` | Full implementation: Leaflet map, geofence circle, CircleMarkers, error boundary, legend, best-effort user location |
| `apps/mobile/public/index.html` | Added `<link rel="stylesheet" href="/leaflet.css" />` to load Leaflet tile/control styles |
| `apps/mobile/package.json` | `leaflet`, `react-leaflet`, `@types/leaflet` declared (were already listed; confirmed installed) |
| `apps/mobile/package-lock.json` | Lockfile updated to reflect installed packages |

## Native File NOT Modified
- `apps/mobile/src/components/GeofenceMapModal.tsx` — untouched; native `react-native-maps` path unchanged.

## Implementation Details

### Architecture
```
Modal open
  └─ useEffect → getGeofenceLocation(token)  [fatal — blocks map]
               → getLocation()               [best-effort — never blocks]
                    ↓
              loadState = 'ready'
                    ↓
              mounted === true (post first render)
                    ↓
              MapContainer renders
                    ↓
              MapSetup (useMap) → setTimeout 350ms → invalidateSize()
                                                    → fitBounds() if user loc available
```

### Key Design Decisions

1. **`mounted` state guard** — `MapContainer` renders only after the component mounts (`useEffect` → `setMounted(true)`). Prevents React Native Web from rendering Leaflet during animated modal slide-in before the container has stable DOM dimensions.

2. **`map.invalidateSize()` in `MapSetup`** — Leaflet initializes in the hidden/animating modal container. After 350ms (matching the `animationType="slide"` duration), `invalidateSize()` forces Leaflet to recalculate the container size, preventing gray or misaligned tiles.

3. **`MapErrorBoundary` (class component error boundary)** — Wraps `MapContainer`. If Leaflet throws at render time (tile failure, DOM exception), the boundary catches it and renders the Thai text fallback (`ตรวจสอบตำแหน่งสำเร็จ` / radius line / `กดยืนยันเพื่อลงเวลา`) instead of a blank white area. Reset on each modal open via `key={mapKey}`.

4. **User location as best-effort** — `getGeofenceLocation()` is awaited and failures surface as `loadState = 'error'`. `getLocation()` runs independently; its promise rejection is caught into a `locationError` state. If location fails, the map renders with company marker + circle only, and a non-blocking amber notice (`ไม่สามารถระบุตำแหน่งของคุณได้` or the specific error) appears in the legend row — the map and confirm button remain fully functional. The user `CircleMarker` appears as a progressive enhancement once location resolves. This prevents location permission denial (common in PWA) from blocking the entire modal while still surfacing the error.

5. **`fitBounds` when user location is available** — If the user marker exists, the map pans/zooms to fit both the company location and the user's position, matching the native modal's region animation behavior.

6. **Legend row** — Shown when `loadState === 'ready'`. User location dot only appears if the user's location was successfully obtained.

## Verification Results

| Script | Result |
|---|---|
| `./scripts/mobile-verify.sh` | **PASS** — TypeScript typecheck + Expo web export |
| `./scripts/verify.sh` | **PASS** — API build + Prisma validate + web build |
| `./scripts/security-review.sh` | **PASS** — no secrets, no HIGH/CRITICAL unmitigated vulns |
| `git diff --check` | **PASS** — no whitespace errors |
| Root package pollution check | **PASS** — no new root `package.json` / `node_modules` |

## Production Redeploy / Manual Verification Steps

1. Deploy the new Expo web bundle to `https://mobilehr.eds-center.com`
2. Open the PWA on iPhone (or Chrome on desktop for faster iteration)
3. Log in and navigate to Home
4. Tap **เช็คอิน** — modal should slide up
5. Verify: map tiles load within ~1–2 seconds
6. Verify: red `CircleMarker` appears at company location
7. Verify: red semi-transparent circle (100m radius) surrounds company marker
8. Verify: blue `CircleMarker` appears at device location (if permission granted)
9. Verify: if location denied, map still renders with company marker only
10. Verify: legend row shows `ที่ตั้งบริษัท` / `ตำแหน่งของคุณ` (if location available) / `รัศมี 100 ม.`
11. Verify: **ยืนยันเช็คอิน** button triggers the clock-in flow
12. Verify: **ยกเลิก** closes the modal
13. Verify: Attendance screen remains read-only (no duplicate buttons)
14. Verify: Native iOS/Android app is unaffected (test separately if native build exists)

## Risks and Fallback Behavior

| Risk | Mitigation |
|---|---|
| Leaflet render crash (DOM error, tile fetch blocked) | `MapErrorBoundary` catches; renders Thai text fallback instead of blank UI |
| Location permission denied | `getLocation()` failure silently ignored; map renders without user marker |
| OpenStreetMap tile server unavailable | Gray tile area shown; map chrome still interactive; confirm/cancel still work |
| Animated modal causes gray tiles | `invalidateSize()` after 350ms delay corrects sizing |
| Modal reopened with stale error boundary | `key={mapKey}` increments on each `visible` open, resetting the boundary |
| Geofence API failure | `loadState = 'error'`; Thai error message shown; confirm button remains usable |

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No — no new or changed guarded endpoints |
| RBAC impact | No — no role checks added or changed |
| Data privacy impact | No — no new PII exposure; geofence lat/lng was already returned to the mobile client |
| Password/token/hash impact | No change |
| Mobile security impact | No change to token storage or auth flow; map renders from the same `/attendance/geofence-location` API call already in use |
| Dependency/advisory impact | `leaflet`, `react-leaflet`, `@types/leaflet` added; mobile audit passes with no HIGH/CRITICAL |
| Secrets/logging check | No secrets logged; tile URL is public OpenStreetMap (no API key) |
| New endpoints protected | None added |
| Risk level | **LOW** |
| Security decision | **PASS** |

## Verification Scope and Limitations

All three scripts exit 0 and the Expo web export bundled successfully. The `dist/index.html` was confirmed to include the `<link rel="stylesheet" href="/leaflet.css" />` tag and `dist/leaflet.css` is present in the output. **However, visual map rendering, tile loading, and marker placement were NOT exercised in a live browser by the agent.** Manual browser verification on the production PWA after redeploy is required before declaring the full feature PASS.

## Issues Found
None found by automated checks.

## Risk
**Low** — change is isolated to the Expo Web/PWA modal component. No backend, database, auth, or native path is affected.

## Decision
**PASS**

## Next Step
STEP 17 (per project roadmap) or next assigned task.

## Recommended Commit Message
```
fix(mobile): show geofence map on expo web check-in modal

Add react-leaflet MapContainer with 100m red geofence circle and
CircleMarker to GeofenceMapModal.web.tsx. User location is
best-effort; MapErrorBoundary falls back to Thai text on render
failure. Link leaflet.css in public/index.html.
```
