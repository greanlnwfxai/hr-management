# CTO Summary

## Step
HOTFIX-005 — Fix home check-in button still not responding after HOTFIX-004

## Status
PASS

## Why HOTFIX-004 Was Not Enough

HOTFIX-004 added a `Platform.OS !== 'web'` guard to `GeofenceMapModal.tsx` to skip `MapView`
on web. This fix was in the right direction but targeted the wrong file.

Expo's Metro bundler applies **platform-specific file resolution**: when the bundler processes
a web build, it prefers `<component>.web.tsx` over `<component>.tsx` for any imported module.
This means on web (PWA), `GeofenceMapModal.web.tsx` is loaded — and `GeofenceMapModal.tsx`
is never touched.

`GeofenceMapModal.web.tsx` was a placeholder stub created during the native-first implementation
phase:

```tsx
// GeofenceMapModal.web.tsx  (before this fix)
export function GeofenceMapModal(_props: { ... }) {
  return null;
}
```

Every tap on the home screen "เช็คอิน" button succeeded in calling
`setMapModalVisible(true)`, but the modal returned `null` unconditionally.
No UI appeared. No error was raised. Silent failure.

HOTFIX-004 compiled and bundled correctly (TypeScript saw `GeofenceMapModal.tsx`;
the `.web.tsx` stub typed the same contract), so build-time verification could not
catch it. Runtime was the only observable surface, and the symptom was
the same as before.

## Actual Root Cause

**`GeofenceMapModal.web.tsx` was a `return null` stub.** On web/PWA, this file
takes precedence over `GeofenceMapModal.tsx`. The confirmation modal never appeared;
all HOTFIX-004 Platform guards in `GeofenceMapModal.tsx` were dead code on web.

Tap flow on web before this fix:
1. User taps "เช็คอิน" → `inDisabled` is false → handler calls `setMapModalVisible(true)`
2. `{token && <GeofenceMapModal visible={true} .../>}` renders
3. Metro loads `GeofenceMapModal.web.tsx` → `return null`
4. Nothing renders → silent failure

## Scope
Mobile app only. One file changed.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_005.md` (this file)

## Files Modified
| File | Change |
|---|---|
| `apps/mobile/src/components/GeofenceMapModal.web.tsx` | Replace `return null` stub with a full working web modal implementation |

## Before / After Behaviour

### Before (stub — all web/PWA taps silently failed)

```tsx
export function GeofenceMapModal(_props: { ... }) {
  return null;  // ← stub, nothing ever rendered on web
}
```

### After (functional web implementation)

`GeofenceMapModal.web.tsx` is now a complete modal:

| State | What the user sees |
|---|---|
| `loading` | Spinner + "กำลังตรวจสอบตำแหน่ง..." |
| `error` | ⚠️ + specific Thai error from `useDeviceLocation` / `authGet` / `SessionExpiredError` |
| `no-config` | 📍 + "ยังไม่ได้ตั้งค่าตำแหน่งบริษัท / ติดต่อ HR เพื่อตั้งค่า geofence" |
| `ready` | 📍 + "ตรวจสอบตำแหน่งสำเร็จ" + radius info + "กดยืนยันเพื่อลงเวลา" |

- No `react-native-maps` import — uses only React Native core components (Modal, View,
  Text, Pressable, ActivityIndicator, StyleSheet), all web-compatible in Expo.
- Same `getGeofenceLocation(token)` + `getLocation()` pair as native, so location
  validation still runs; backend remains the authoritative geofence enforcer.
- Confirm button disabled only during `loading`; enabled in `ready`, `error`, and
  `no-config` states (matching native behavior).
- Specific Thai error strings propagate: location permission denied, read failure,
  network error, session expiry, HTTP errors.

## Implementation Notes

- The `index.ts` barrel export (`export { GeofenceMapModal } from './GeofenceMapModal'`)
  is correct as-is. Metro resolves to `.web.tsx` automatically on web builds; no import
  path changes needed.
- HOTFIX-004's `Platform.OS` guards in `GeofenceMapModal.tsx` remain but are now
  permanently dead code on web (native always sees `Platform.OS !== 'web'`). They
  are harmless on native and provide a safety net if the `.web.tsx` split is ever
  removed. No functional regression.
- `home.tsx` `!token` guard added by HOTFIX-004 is retained.

## Verification Result

```
git status --short                → M apps/mobile/src/components/GeofenceMapModal.web.tsx
git diff --check                  → (no whitespace issues)

cd apps/mobile && npx tsc --noEmit → clean (0 errors)
./scripts/mobile-verify.sh        → PASS (TypeScript + Expo web export)
./scripts/verify.sh               → PASS (API build, Prisma validate, web build)
./scripts/security-review.sh     → PASS (secret scan, dependency audit)
```

## Manual Production Verification Steps

1. Build and serve the Expo web export (or use the deployed PWA):
   ```bash
   cd apps/mobile
   npx expo start --web       # dev mode
   # or: npx expo export --platform web && serve dist/
   ```
2. Open in a mobile browser or add to home screen as PWA.
3. Log in as an employee who has **not** checked in today.
4. On the Home screen:
   - Confirm "เช็คอิน" button is blue and fully opaque (not greyed out).
   - Tap "เช็คอิน".
   - **Expected:** A bottom-sheet modal slides up. It shows:
     - Header: "เช็คอิน — ตรวจสอบตำแหน่ง"
     - Content: spinner → then either "ตรวจสอบตำแหน่งสำเร็จ" or a Thai error message
     - Two buttons: "ยกเลิก" and "ยืนยันเช็คอิน"
   - **Must NOT:** Nothing appearing (the old silent failure)
5. Grant location permission when prompted.
6. Tap "ยืนยันเช็คอิน" → check-in executes → "ลงเวลาเข้าสำเร็จ" message appears on home screen.
7. Confirm "เช็คอินแล้ว" label on the check-in button (greyed out, disabled).
8. Verify Attendance screen (ลงเวลา tab) shows no duplicate clock-in/clock-out buttons.

## Remaining Limitations

- **`GeofenceMapModal.tsx` Platform guards are dead code on web** — harmless but could
  be cleaned up in a future chore commit.
- **Browser geolocation requires HTTPS in production** — on HTTP, `expo-location`'s web
  implementation will get a permission denial, which now surfaces as a Thai error
  "กรุณาอนุญาตการเข้าถึงตำแหน่ง..." rather than silently failing. Serve the PWA over
  HTTPS to allow location.
- **Script-based verification does not tap a button** — `mobile-verify.sh` confirms the
  bundle compiles and exports. Runtime behavior requires the manual steps above.

## Security Review

| Field | Detail |
|---|---|
| Auth impact | None — no new endpoints. Token passed unchanged to existing `getGeofenceLocation`. |
| RBAC impact | None |
| Data privacy impact | None — geofence data (lat/lng/radius) was already returned to mobile. No new PII. |
| Password/token/hash impact | None — token only used in `getGeofenceLocation(token)` (existing call). |
| Mobile security impact | Location permission flow unchanged. Web version calls same `getLocation()` + `getGeofenceLocation()` pair as native; backend enforces geofence. |
| Dependency/advisory impact | No new packages. `Modal`, `View`, `Text`, `Pressable`, `ActivityIndicator`, `StyleSheet` are existing react-native dependencies. |
| Secrets/logging check | No secrets, tokens, or PII in component code. No console.log added. |
| New endpoints protected | N/A — no new endpoints |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low — single file replaced (previously a null stub). No API, auth, database, Docker,
or routing logic changed. Web modal uses only existing hooks and API calls, with no
new network surface. Native behavior is entirely unaffected.

## Decision
PASS

## Next Step
HOTFIX-005 complete. Consider a chore to clean up dead `Platform.OS` guards in
`GeofenceMapModal.tsx`. Else continue with next directed task.

## Recommended Commit Message
```
fix(mobile): replace GeofenceMapModal web stub with working implementation

GeofenceMapModal.web.tsx was a return-null stub. On web/PWA, Expo's
platform-specific file resolution loads .web.tsx instead of .tsx, so
all HOTFIX-004 changes (Platform.OS guards in GeofenceMapModal.tsx)
were dead code. The modal never rendered and every tap failed silently.

Replace the stub with a functional bottom-sheet modal: loading spinner,
Thai error messages from useDeviceLocation/authGet/SessionExpiredError,
location-confirmed ready state, and cancel/confirm buttons. No
react-native-maps dependency — web-safe React Native core only.
```
