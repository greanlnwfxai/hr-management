# CTO Summary

## Step
T-083 — Geofence Map Status Visualization

## Status
PASS

## Scope
UI-only improvement to the HR Mobile check-in/check-out geofence modal.
No backend, schema, auth, or Docker changes.

## Files Created
- `apps/mobile/src/utils/haversine.ts` — Haversine distance helper (8 lines)
- `docs/CTO_SUMMARY_T083.md` — this file

## Files Modified
- `apps/mobile/src/components/GeofenceMapModal.web.tsx` — Web/PWA Leaflet modal
- `apps/mobile/src/components/GeofenceMapModal.tsx` — Native (react-native-maps) modal

## Problem / UX Improvement
Previously, the geofence circle was always red regardless of the user's position,
the confirm button was always enabled even when clearly outside the radius, and no
distance readout was shown. Users had no visual indication of whether they were
allowed to check in.

## Reference Behavior Implemented
Matches the provided design mockup:
- Inside radius: green geofence circle, green status banner "✅ คุณอยู่ในพื้นที่ลงเวลา",
  distance shown, confirm button enabled.
- Outside radius: red geofence circle, orange/red status banner "⚠️ คุณอยู่นอกพื้นที่ลงเวลา",
  distance shown, confirm button disabled (grayed out).
- Location unavailable: neutral/red circle kept, no status banner, confirm enabled
  (backend is final authority).

## Distance Calculation Approach
Added `haversineMeters(lat1, lng1, lat2, lng2)` in `apps/mobile/src/utils/haversine.ts`.
Both modal files import it and compute:
```ts
const distanceMeters = Math.round(haversineMeters(...));
const isInsideRadius = distanceMeters <= (geofence.radiusMeters ?? 100);
```
No backend calls required — purely client-side using already-fetched geofence and
device location data.

## Inside-Radius Behavior
- Leaflet `<Circle>` color: `#16a34a` (green), fill opacity 12%
- Status banner: green background, "✅ คุณอยู่ในพื้นที่ลงเวลา" + "ระยะห่างจากบริษัท X เมตร"
- Confirm button: enabled (full opacity)
- Legend radius circle: green border + green fill

## Outside-Radius Behavior
- Leaflet `<Circle>` color: `#dc2626` (red), fill opacity 12%
- Status banner: warm background, "⚠️ คุณอยู่นอกพื้นที่ลงเวลา" + "ระยะห่างจากบริษัท X เมตร"
- Confirm button: `disabled={true}`, `opacity: 0.5` — client-side block only
  (backend geofence check remains in place as final authority)
- Legend radius circle: red border + red fill

## Web/PWA Behavior
- Leaflet `<Circle>` `pathOptions.color` and `pathOptions.fillColor` dynamically set
  to `#16a34a` or `#dc2626` based on `isInsideRadius`.
- Company marker (red `CircleMarker`) always red — unaffected.
- User location marker (blue `CircleMarker`) unchanged.
- `MapSetup` / `fitBounds` / `invalidateSize` behavior unchanged (HOTFIX-008 preserved).
- Legend labels updated: "ตำแหน่งปัจจุบัน" (was "ตำแหน่งของคุณ"), "รัศมีที่อนุญาต X เมตร".
- Status banner rendered between legend and button row.

## Native Behavior
- `react-native-maps` `<Circle>` `strokeColor` and `fillColor` dynamically set
  to green or red rgba strings based on `isInsideRadius`.
- `showsUserLocation` (built-in blue dot) unchanged.
- Company `<Marker>` with `pinColor="#dc2626"` unchanged.
- Status banner added below legend.
- Legend labels updated to match web: "ตำแหน่งปัจจุบัน", "รัศมีที่อนุญาต X เมตร".
- Same `confirmDisabled` logic applied to button.

## Verification Result
```
./scripts/mobile-verify.sh   → PASS (typecheck + Expo web export)
./scripts/verify.sh          → PASS (API build + Prisma validate + Web build)
./scripts/security-review.sh → PASS (dependency audit + secret scan)
git diff --stat:
  apps/mobile/src/components/GeofenceMapModal.tsx      61 +++++ 
  apps/mobile/src/components/GeofenceMapModal.web.tsx  57 +++++
  2 files changed, 100 insertions(+), 18 deletions(-)
```

## Issues Found
None. All three verification scripts exit 0.

## Risks / Limitations
- **Client-side disable only**: The confirm button is disabled on the client when
  outside radius, but the actual clock-in is blocked by the backend geofence check.
  This is intentional — the backend is the security boundary.
- **Location accuracy**: Device GPS accuracy varies. A user at exactly the boundary
  could see flickering green/red. This is a known UX limitation of GPS-based geofencing.
- **Native path**: `showsUserLocation` renders the built-in blue dot, but the dot
  position comes from the OS location service and may not match the `userLocation`
  state used for distance calculation if the device has moved. Acceptable for this task.
- **No haversine server-side change**: Backend still uses its own distance calculation
  for final validation. Client-side haversine is purely for UX display.

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | None — no endpoint changes |
| RBAC impact | None |
| Data privacy impact | None — no new PII exposed |
| Password/token/hash impact | None |
| Mobile security impact | None — no token storage changes |
| Dependency/advisory impact | No new packages added |
| Secrets/logging check | No secrets or tokens in new code |
| New endpoints protected | No new endpoints |
| Risk level | LOW |
| Security decision | PASS |

## Production Redeploy Checklist
1. `git add` / `git commit` with recommended message (user performs manually)
2. `git push` to trigger CI/CD (user performs manually)
3. Redeploy `mobile` service (Expo web export served as static files)
4. Smoke test: open HR Mobile PWA → tap Check-in → confirm modal opens, map renders,
   green/red circle visible, distance text visible, confirm button behavior correct
5. No API, DB, or Docker changes required — backend redeploy NOT needed

## Risk
Low

## Decision
PASS

## Next Step
Manual git operations by user, then production deploy of mobile PWA.

## Recommended Commit Message
```
feat(mobile): visualize geofence status on check-in map

Show dynamic green/red geofence circle, Thai status banner with distance
readout, and client-side confirm-button disabling when user is outside
the allowed radius. Adds shared haversine utility for distance calculation.
```
