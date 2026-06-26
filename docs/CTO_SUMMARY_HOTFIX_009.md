# CTO Summary

## Step
HOTFIX-009 — Restore Geofence Modal Footer Buttons

## Status
PASS

## Regression Root Cause
T-083 added a status banner (~68px) between the legend and the button row.
The `sheet` card had `maxHeight: '88%'` and `overflow: 'hidden'`. With all
children stacking vertically, the cumulative height on mobile browsers exceeded
the viewport-constrained sheet height:

```
Header:        ~53px
Map:           300px (web) / 320px (native)
Legend:        ~40px
Status banner: ~68px   ← added by T-083
Buttons + pad: ~100px
─────────────────────
Total:         ~561px
```

Mobile browsers reduce the usable viewport by ~114px (address bar, navigation
bar). On a 667px-tall device: 88% × (667 − 114) ≈ 487px. The 561px of content
exceeded this, and `overflow: 'hidden'` silently clipped the button row
from the bottom of the card.

## Files Changed
- `apps/mobile/src/components/GeofenceMapModal.web.tsx`
- `apps/mobile/src/components/GeofenceMapModal.tsx`

## Layout Fix Approach

Restructured both modals to a **fixed header + scrollable body + fixed footer** pattern:

```
sheet (maxHeight: '88%', overflow: 'hidden')
  header     (flexShrink: 0)  — fixed, never scrolls
  ScrollView (flexShrink: 1)  — contains map + legend + status banner
    mapArea  (height: 260px)
    legend
    statusBanner
  footer     (flexShrink: 0)  — fixed, never scrolls
    ยกเลิก  |  ยืนยันเช็คอิน
```

`flexShrink: 1` on the `ScrollView` body allows the layout engine to compress
the scrollable area when the sheet hits its `maxHeight` cap. The footer has
`flexShrink: 0`, so it is never compressed or pushed off-screen.

The map height was also reduced from 300→260px (web) and 320→260px (native)
as belt-and-suspenders to give more usable scroll room on small screens.

**Why this is safe for Leaflet:** The `mapArea` retains an explicit `height: 260`
so Leaflet always has a fixed-pixel container. `invalidateSize()` / `fitBounds()`
inside `MapSetup` continue to fire on the same timer. No Leaflet regression.

## Before / After

| | Before HOTFIX-009 | After HOTFIX-009 |
|---|---|---|
| Map | ✅ visible | ✅ visible |
| Company marker | ✅ visible | ✅ visible |
| User marker | ✅ visible | ✅ visible |
| Green/red circle | ✅ working | ✅ working |
| Status banner | ✅ visible | ✅ visible |
| Footer buttons | ❌ clipped off-screen | ✅ always visible |
| Cancel button | ❌ not reachable | ✅ closes modal |
| Confirm button | ❌ not reachable | ✅ enabled / disabled per radius |

## Verification Commands Passed

```
./scripts/mobile-verify.sh   → PASS (typecheck + Expo web export)
./scripts/verify.sh          → PASS (API build + Prisma validate + Web build)
./scripts/security-review.sh → PASS (dependency audit + secret scan)

git diff --stat:
  apps/mobile/src/components/GeofenceMapModal.tsx      180 +++/---
  apps/mobile/src/components/GeofenceMapModal.web.tsx  213 +++/---
  2 files changed, 216 insertions(+), 177 deletions(-)
```

## Manual Production Verification Steps

1. Open HR Mobile PWA on a mobile browser (not desktop)
2. Log in → tap **เช็คอิน** on the home screen
3. Confirm modal opens **centered** over the dimmed overlay
4. Confirm **map renders** with OpenStreetMap tiles
5. Confirm **company red dot** is visible on the map
6. Confirm **user blue dot** is visible (if location permission granted)
7. Confirm geofence **circle is green** when device is inside radius
8. Confirm **status banner** shows `✅ คุณอยู่ในพื้นที่ลงเวลา` and distance
9. Confirm **ยกเลิก** button is visible without any scrolling
10. Confirm **ยืนยันเช็คอิน** button is visible without any scrolling
11. Confirm tapping **ยกเลิก** dismisses the modal
12. Confirm tapping **ยืนยันเช็คอิน** proceeds to clock-in (when inside radius)
13. Move device outside radius → confirm circle turns **red**, confirm button grays out
14. Confirm Attendance screen has **no duplicate buttons**

## Risks / Limitations

- **Map height reduction (300→260px):** The map is slightly shorter. Sufficient
  for geofence visualization at typical zoom. No functional impact.
- **ScrollView body on native:** `flexShrink: 1` on the ScrollView body shrinks
  it when the sheet hits `maxHeight`. On very tall content, user may need to
  scroll to see the status banner — but buttons are always visible.
- **No layout changes to web admin or backend:** This hotfix is isolated to the
  two mobile modal component files. No other surfaces affected.

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | None |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None |
| Dependency/advisory impact | No new packages |
| Secrets/logging check | None |
| New endpoints protected | No new endpoints |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Next Step
Manual git operations by user, then production deploy of mobile PWA.

## Recommended Commit Message
```
fix(mobile): keep geofence modal action buttons visible

Restructure modal to sticky header + scrollable body + sticky footer so
the cancel/confirm buttons are never clipped by maxHeight overflow when
the T-083 status banner is present on constrained mobile viewports.
```
