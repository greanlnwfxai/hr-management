# CTO Summary

## Task
HOTFIX-REQ002E-A — Show Off-site Attendance Option When Home GPS Auto-detect Is Unavailable

## Status
PASS

## Problem Found in Real Mobile Testing

During production testing on STEP Connect mobile (PWA), the user was physically 24,936 meters from the company office. The GeofenceMapModal (opened from the normal check-in button) correctly detected and displayed this distance. However, the green "ลงเวลาเข้า (นอกสถานที่)" off-site button never appeared in the Home hero. Only the normal blue on-site check-in button was visible, which opened the geofence warning modal instead of allowing an off-site clock-in.

## Root Cause

Home screen mount silently runs `detectZone()`, which calls `getLocation()` from `useDeviceLocation`. In PWA/mobile browser context, `getLocation()` calls `expo-location`'s `requestForegroundPermissionsAsync()` followed by `getCurrentPositionAsync({ accuracy: High })`. This background call can fail, time out, or be deferred when no user gesture has granted permission yet. When it fails, `.catch(() => null)` returns `loc = null`, and `geofenceZone` is set to `'gps_unavailable'`.

The prior render logic treated **only** `geofenceZone === 'outside'` as eligible for the off-site button:

```typescript
// BEFORE (broken for gps_unavailable):
{!hasActiveOffsiteCheckIn && isOutside && !alreadyClockedIn && (
  // off-site button
)}
{!hasActiveOffsiteCheckIn && (!isOutside || alreadyClockedIn) && (
  // normal buttons
)}
```

With `geofenceZone === 'gps_unavailable'`, `isOutside` is `false`, so the second condition was always true and only normal buttons rendered — even for users clearly outside the geofence.

The GeofenceMapModal works separately because it uses a different location flow, triggered by an explicit user tap, after which the browser grants the permission.

## Files Changed

| File | Change |
|---|---|
| `apps/mobile/app/home.tsx` | 2 render condition lines updated |

### Exact diff

**Line 472** — off-site block condition:
```typescript
// BEFORE:
{!hasActiveOffsiteCheckIn && isOutside && !alreadyClockedIn && (

// AFTER:
{!hasActiveOffsiteCheckIn && !alreadyClockedIn && (isOutside || geofenceZone === 'gps_unavailable') && (
```

**Line 505** — normal buttons block condition:
```typescript
// BEFORE:
{!hasActiveOffsiteCheckIn && (!isOutside || alreadyClockedIn) && (

// AFTER:
{!hasActiveOffsiteCheckIn && (geofenceZone !== 'outside' || alreadyClockedIn) && (
```

## Runtime Code Changed
Yes — 2 conditional expressions in `apps/mobile/app/home.tsx`.

## Backend Changed
No

## Database / Schema Changed
No

## Data Mutation
No

## Docker Destructive Commands
No

## Behavior Before / After

| `geofenceZone` | Before hotfix | After hotfix |
|---|---|---|
| `inside` | Normal buttons only | Normal buttons only ✅ |
| `outside` + not clocked in | Off-site button | Off-site button ✅ |
| `loading` | Normal buttons only | Normal buttons only ✅ |
| `unconfigured` | Normal buttons only | Normal buttons only ✅ |
| **`gps_unavailable`** | Normal buttons only ❌ | **Off-site button + normal buttons** ✅ |
| Any + already clocked in | Normal buttons only | Normal buttons only ✅ |
| Active off-site check-in | Off-site checkout card | Off-site checkout card ✅ |

When `gps_unavailable`, **both** the off-site button and the normal check-in button are visible. This lets a user who is genuinely outside pick the off-site flow, while a user inside the office (whose GPS silently failed) can still use the normal check-in. The backend is the authoritative gate for both paths.

## Backend Still Validates GPS on Submit
**Confirmed.** This hotfix changes only the Home screen render condition — which button is shown. The `offsite-checkin.tsx` screen captures a fresh GPS fix via `getLocation()` when the user taps Confirm, and sends `latitude`, `longitude`, and `accuracy` to `POST /attendance/offsite/clock-in`. The backend validates accuracy (≤ 100 m) and rejects with 422 if too poor. No backend validation was weakened or bypassed.

## Raw GPS Not Displayed
**Confirmed.** `latitude`, `longitude`, and raw `accuracy` values are never rendered in any UI element. Only the bucketed GPS status label ("📍 พร้อมใช้งาน" / "📍 ความแม่นยำต่ำ") is shown in the off-site check-in form.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — no new endpoints, no auth changes |
| RBAC impact | None |
| Data privacy | No new data exposed; no raw GPS in UI |
| Password/token/hash | None |
| Mobile security | No background location; GPS only on user Confirm tap |
| Dependencies | No new packages |
| Secrets/logging | None; secret scan clean |
| Risk level | LOW |
| Security decision | PASS |

## Verification Results

| Command | Result |
|---|---|
| `tsc --noEmit` (mobile) | ✅ PASS — 0 errors |
| `./scripts/verify.sh` | ✅ PASS — API build, Prisma validate, Web build all OK |
| `./scripts/api-smoke-test.sh` | ✅ PASS — login, /employees, /dashboard, 401 check all OK |
| `./scripts/security-review.sh` | ✅ PASS — dependency audit, secret scan clean |

## Risk
Low — 2 boolean expression changes in a single render block. No new components, no new API calls, no new state. All existing behavior for `inside`, `outside`, `loading`, and `unconfigured` zones is unchanged.

## Decision
PASS

## Next Step
Deploy to production. Monitor off-site check-in success rate from users with GPS permission delays. REQ-002F (Admin Web off-site review UI) can proceed in parallel.

## Recommended Commit Message
```
fix(mobile): show off-site option when GPS auto-detect is unavailable

When home screen background GPS detection fails (gps_unavailable),
the off-site check-in button was not shown. Users physically outside
the office could not access the off-site clock-in flow.

Fix: treat gps_unavailable as eligible for the off-site option.
Both off-site and normal buttons are shown, letting the user pick
the correct path. Backend GPS validation on submit is unchanged.

Scope: apps/mobile/app/home.tsx only (2 render condition lines).
```
