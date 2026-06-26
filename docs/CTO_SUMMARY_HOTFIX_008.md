# CTO Summary

## Step
HOTFIX-008 — Center Geofence Check-in Modal as Popup Dialog

## Status
PASS

## Problem

The geofence check-in/check-out modal was presented as a bottom sheet (docked to the lower edge of the screen). While functional, the layout was less polished than expected for production use and did not match the intended popup-dialog UX that centers the card in the viewport.

## Root Cause / UX Issue

The `overlay` style used `justifyContent: 'flex-end'`, which causes the inner card to dock to the bottom of the screen — the standard React Native bottom-sheet pattern. The `sheet` card used only top-corner border radius (`borderTopLeftRadius` / `borderTopRightRadius`) and the `Modal` used `animationType="slide"`, both consistent with a bottom-sheet. None of these are appropriate for a centered popup.

## Files Changed

| File | Change |
|---|---|
| `apps/mobile/src/components/GeofenceMapModal.web.tsx` | Layout-only: overlay centering, card border radius, card sizing/shadow, fade animation |
| `apps/mobile/src/components/GeofenceMapModal.tsx` | Layout-only: identical overlay/card changes for native path |
| `docs/CTO_SUMMARY_HOTFIX_008.md` | Created |

No backend, database, auth, API, Docker, or attendance logic was changed.

## Before Behavior

- Modal slid up from the bottom of the screen.
- Card had top-only rounded corners.
- Card filled full width of the screen.
- No card shadow/elevation.
- Dark overlay was present but content was bottom-anchored.

## After Behavior

- Modal fades in centered in the viewport.
- Card has fully rounded corners (`borderRadius: 16`).
- Card is `width: 92%`, `maxWidth: 700px` — comfortable on mobile and desktop.
- Card is `maxHeight: 88%` — won't overflow screen on small devices.
- Card has drop shadow (iOS: `shadowOpacity: 0.22`, Android: `elevation: 8`).
- Overlay is slightly darker (`rgba(0,0,0,0.55)`) for better contrast with centered popup.
- All map, legend, button, and error-handling behavior is unchanged.

## Style Changes Summary

```diff
  overlay: {
    flex: 1,
-   backgroundColor: 'rgba(0,0,0,0.5)',
-   justifyContent: 'flex-end',
+   backgroundColor: 'rgba(0,0,0,0.55)',
+   justifyContent: 'center',
+   alignItems: 'center',
+   padding: 16,
  },
  sheet: {
    backgroundColor: '#ffffff',
-   borderTopLeftRadius: 20,
-   borderTopRightRadius: 20,
-   paddingBottom: 32,
+   borderRadius: 16,
+   width: '92%',
+   maxWidth: 700,
+   maxHeight: '88%',
+   paddingBottom: 24,
+   shadowColor: '#000',
+   shadowOffset: { width: 0, height: 6 },
+   shadowOpacity: 0.22,
+   shadowRadius: 14,
+   elevation: 8,
    overflow: 'hidden',
  },

- <Modal animationType="slide" ...>
+ <Modal animationType="fade" ...>
```

Applied identically to both `GeofenceMapModal.tsx` (native) and `GeofenceMapModal.web.tsx` (web/PWA).

## Leaflet / Map Timing Notes

The `MapSetup` component inside `MapContainer` calls `map.invalidateSize()` after a 350ms delay. This delay was designed to allow the bottom-sheet slide animation to complete before Leaflet reads container dimensions. With the change to `fade` animation (which completes in ~300ms), the 350ms delay is still sufficient. No change to `invalidateSize()` timing was required.

## Verification Commands and Results

| Script | Result |
|---|---|
| `./scripts/mobile-verify.sh` | **PASS** — TypeScript typecheck + Expo web export |
| `./scripts/verify.sh` | **PASS** — API build + Prisma validate + web build |
| `./scripts/security-review.sh` | **PASS** — no secrets, no new HIGH/CRITICAL vulns |
| `git diff --check` | **PASS** — no whitespace errors |
| `git diff --name-only` | Exactly the 2 expected component files |

## Manual Verification Notes

Agent-level verification confirms compile, typecheck, and web export pass. **Visual rendering — centered popup position, map tile layout, and shadow appearance — requires manual browser verification** on the production PWA after redeploy. The agent did not exercise a live browser session.

Manual steps:
1. Open HR Mobile Web/PWA (or Expo web dev server).
2. Go to Home screen.
3. Tap **เช็คอิน** — modal should fade in centered in the screen.
4. Confirm card is centered (not bottom-docked).
5. Confirm dark dimmed overlay visible behind card.
6. Confirm map appears with tiles, red circle, and company marker.
7. Confirm **ยกเลิก** closes the modal.
8. Reopen modal, confirm **ยืนยันเช็คอิน** triggers the clock-in flow.
9. Go to Attendance screen — confirm no duplicate clock-in/out buttons.
10. On native app (if applicable): confirm same centered layout with `react-native-maps`.

## Risk Assessment

**Low.** All changes are presentation-only CSS/style properties. No logic, API calls, state management, or data flow was modified. The `animationType` change from `slide` to `fade` is the highest-risk change — it could theoretically affect Leaflet tile initialization timing — but the 350ms `invalidateSize()` delay accommodates both animation types.

## Production Redeploy Checklist

1. Commit changes with recommended message below.
2. Push to branch, CI passes.
3. Merge and tag.
4. Redeploy Expo web bundle via Portainer / CI pipeline.
5. Open `https://mobilehr.eds-center.com`.
6. If Cloudflare is caching, purge:
   - `https://mobilehr.eds-center.com/`
   - `https://mobilehr.eds-center.com/leaflet.css`
   - `https://mobilehr.eds-center.com/_expo/static/js/web/entry-*.js`
7. Hard refresh / reopen app.
8. Verify centered popup per manual steps above.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No — no endpoints added or changed |
| RBAC impact | No |
| Data privacy impact | No |
| Password/token/hash impact | No |
| Mobile security impact | No — only presentation layout changed |
| Dependency/advisory impact | No new dependencies |
| Secrets/logging check | No secrets or tokens in changed code |
| New endpoints protected | None |
| Risk level | **LOW** |
| Security decision | **PASS** |

## Issues Found
None. All verification scripts exit 0.

## Next Step
STEP 17 (per project roadmap) or next assigned hotfix.

## Recommended Commit Message
```
fix(mobile): center geofence check-in modal as popup dialog
```
