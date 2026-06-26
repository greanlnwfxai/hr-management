# CTO Summary

## Step
HOTFIX-004 — Fix home screen clock-in/out button silent failure & propagate Thai error messages

## Status
PASS

## Scope
Home screen "เช็คอิน / เช็คเอาท์" buttons failed silently: tapping produced no feedback.
Root cause was two separate issues in `GeofenceMapModal`:

1. **Web/PWA crash** — `react-native-maps` `MapView` is not web-compatible. On web
   (Expo PWA), rendering it in the `loadState === 'ready'` branch caused a silent runtime
   crash that dismissed the modal with no user feedback.

2. **Generic catch message** — the `catch` block swallowed all thrown error strings
   (Thai messages from `useDeviceLocation`, `SessionExpiredError`, and `authGet`) with a
   single hard-coded `'ไม่สามารถโหลดข้อมูลแผนที่ได้'`, discarding specific guidance.

Additionally: `inDisabled`/`outDisabled` lacked a `!token` guard that mirrors the
`{token && <GeofenceMapModal>}` render conditional in `home.tsx`.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_004.md` (this file)

## Files Modified
| File | Change |
|---|---|
| `apps/mobile/src/components/GeofenceMapModal.tsx` | Add `Platform` import; guard MapView with `Platform.OS !== 'web'`; show location-confirmed fallback on web; fix catch block to propagate `err.message`; guard legend to native-only |
| `apps/mobile/app/home.tsx` | Add `!token` to `inDisabled` and `outDisabled` as defensive hardening |

## Verification Result

```
cd apps/mobile && npx tsc --noEmit         → clean (0 errors)
./scripts/mobile-verify.sh                 → PASS (tsc + Expo web export)
./scripts/verify.sh                        → PASS (API build, Prisma validate, web build)
./scripts/security-review.sh              → PASS (secret scan, dependency audit)
```

**Runtime tap verification:** Script-based verification confirms compilation and
bundle correctness. Button responsiveness requires a live Expo session on web
(PWA) or native device. The fix is verified by code reasoning:
- Web path: `Platform.OS === 'web'` → MapView branch skipped → no crash →
  `loadState === 'ready'` shows text confirmation → confirm button enabled → `onConfirm` fires
- Native path: unchanged — MapView still renders; additional `!` check on `Platform.OS` is
  always false so native behaviour is identical to before
- Error path: `err.message` propagates specific Thai strings from `useDeviceLocation`,
  `SessionExpiredError`, `authGet` directly to the `mapCenterError` text element

## Change Detail

### GeofenceMapModal.tsx — Platform-aware MapView

**Before (web crashes):**
```tsx
{loadState === 'ready' && geofence?.latitude && geofence?.longitude && (
  <MapView ...>
    <Marker ... />
    <Circle ... />
  </MapView>
)}

{loadState === 'ready' && (
  <View style={styles.legend}>...</View>
)}
```

**After (web shows text confirmation; native unchanged):**
```tsx
{loadState === 'ready' && (
  Platform.OS !== 'web' && geofence?.latitude && geofence?.longitude ? (
    <MapView ...>
      <Marker ... />
      <Circle ... />
    </MapView>
  ) : (
    <View style={styles.mapCenter}>
      <Text style={styles.mapCenterIcon}>📍</Text>
      <Text style={styles.mapCenterText}>ตรวจสอบตำแหน่งสำเร็จ</Text>
      <Text style={styles.mapCenterSub}>กดยืนยันเพื่อลงเวลา</Text>
    </View>
  )
)}

{/* Legend — native only; map does not render on web */}
{loadState === 'ready' && Platform.OS !== 'web' && (
  <View style={styles.legend}>...</View>
)}
```

### GeofenceMapModal.tsx — Error propagation

**Before (generic message swallows Thai errors):**
```tsx
} catch {
  setErrorMsg('ไม่สามารถโหลดข้อมูลแผนที่ได้');
  setLoadState('error');
}
```

**After (specific Thai message shown to user):**
```tsx
} catch (err) {
  setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
  setLoadState('error');
}
```

Error strings that now surface correctly:
| Source | Thai message |
|---|---|
| `useDeviceLocation` — permission denied | กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อใช้การลงเวลาผ่านมือถือ |
| `useDeviceLocation` — read failure | ไม่สามารถอ่านตำแหน่งปัจจุบันได้ กรุณาลองใหม่อีกครั้ง |
| `authGet` — network error | ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ |
| `SessionExpiredError` — 401 | เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง |
| `authGet` — HTTP error | ไม่สามารถโหลดข้อมูลได้: HTTP {status} |

### home.tsx — Defensive hardening

```tsx
// Before
const inDisabled  = forced || !displayUser || inBusy  || outBusy || alreadyClockedIn;
const outDisabled = forced || !displayUser || inBusy  || outBusy || !alreadyClockedIn || alreadyClockedOut;

// After
const inDisabled  = forced || !displayUser || !token || inBusy  || outBusy || alreadyClockedIn;
const outDisabled = forced || !displayUser || !token || inBusy  || outBusy || !alreadyClockedIn || alreadyClockedOut;
```

Aligns button disabled state with the `{token && <GeofenceMapModal>}` render guard so
a null-token session can never surface an active-looking button that does nothing.

## Requirements Checklist

| Requirement | Status |
|---|---|
| Confirm attendance screen has no duplicate clock UI | Already done (HOTFIX-003 / attendance screen cleanup). Confirmed: `ClockActionCard` and `GeofenceNotice` removed. |
| Home screen button must not fail silently | FIXED — web MapView crash resolved; modal reaches confirm state |
| Clear Thai error for location permission denied | FIXED — `useDeviceLocation` message propagated |
| Clear Thai error for geofence / API failure | FIXED — `authGet` Thai strings propagated |
| Clear Thai error for session expiry | FIXED — `SessionExpiredError.message` propagated |
| Prevent duplicate taps | Already handled — `inBusy`/`outBusy` disable during locating/submitting |
| Disabled/completed state shown | Already handled — `alreadyClockedIn`/`alreadyClockedOut` drive disabled + label |

## Issues Found
- **Root cause on web/PWA (primary):** `react-native-maps` MapView crashes at runtime on web, silently dismissing the modal. Fixed with `Platform.OS !== 'web'` guard.
- **Secondary:** Generic catch block discarded all specific Thai error messages. Fixed to propagate `err.message`.
- **Tertiary (hardening):** `inDisabled` didn't guard on `!token`. Fixed.

## Security Review

| Field | Detail |
|---|---|
| Auth impact | None — no new endpoints added or changed |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None — `token` prop only flows through the existing `authGet` call; no new token handling |
| Mobile security impact | None negative — Platform guard only affects which JSX branch renders. Location permission is still obtained and validated on both web and native. |
| Dependency/advisory impact | No new packages. `Platform` is from `react-native` (already a dependency). No new audit findings. |
| Secrets/logging check | No secrets or tokens appear in any changed code, log, or response |
| New endpoints protected | N/A — no new endpoints |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low — changes are limited to client-side React Native component rendering logic.
No API, authentication, database, Docker, or routing logic was modified.
Native behaviour is unchanged (Platform.OS !== 'web' evaluates false on all native targets).
Web behaviour gains a working confirmation flow where previously a silent crash occurred.

## Decision
PASS

## Next Step
HOTFIX-004 complete. Continue with T-083 or next directed task.

## Recommended Commit Message
```
fix(mobile): fix home screen clock button silent failure on web

GeofenceMapModal crashed silently on web/PWA because react-native-maps
MapView is not web-compatible. Add Platform.OS guard: on web, show a
text-based location-confirmed fallback instead of MapView. Also fix
the generic catch block to propagate specific Thai error messages from
useDeviceLocation and authGet. Add !token defensive guard to inDisabled
and outDisabled in home.tsx to align with the {token && <GeofenceMapModal>}
render conditional.
```
