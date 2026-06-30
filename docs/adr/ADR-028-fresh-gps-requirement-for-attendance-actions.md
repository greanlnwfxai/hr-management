# ADR-028 — Fresh GPS Requirement for Attendance Actions

**Status:** Accepted
**Date:** 2026-06-27
**Tasks:** HOTFIX-REQ002F-A (v1.2.51)
**Related tags:** `v1.2.51`
**Implementation reference:** `docs/CTO_SUMMARY_HOTFIX_REQ002F_A.md`

---

## Context

The STEP Connect mobile PWA (Expo on web) uses `expo-location` to acquire GPS coordinates for attendance clock-in, clock-out, and the mixed checkout exception.

Three separate bugs were discovered in production during REQ-002F testing:

### Bug 1 — expo-location web hardcodes `maximumAge: Infinity`

`expo-location`'s web implementation (`ExpoLocation.web.ts`) calls `navigator.geolocation.getCurrentPosition` with a hardcoded `maximumAge: Infinity`. The `LocationOptions` type exported by expo-location has no `maximumAge` field, so no caller can override this value. The browser is permitted to return a GPS position cached from any previous browsing session — potentially hours or days old.

**Observed symptom:** The geofence modal showed an employee approximately 142 m from the office while they were physically kilometers away. The stale cached position reported the last known office-area location.

### Bug 2 — Mount-time GPS reused at submit time

The off-site check-in (`offsite-checkin.tsx`), off-site check-out (`offsite-checkout.tsx`), and mixed checkout (`mixed-checkout.tsx`) screens acquired GPS once on component mount and stored it in React state. The stored state was then passed to the API at submit time. If the user lingered on the form for an extended period, the GPS reading could be significantly older than the submit action.

### Bug 3 — Low-accuracy GPS allowed for off-site submit

`offsite-checkin.tsx` and `offsite-checkout.tsx` allowed form submission when `gpsStatus === 'low_accuracy'` (accuracy > 100 m). The `mixed-checkout.tsx` screen already correctly blocked submit at > 100 m. The inconsistency weakened the accuracy gate that the backend enforces via `@Max(100)` on the accuracy DTO field.

---

## Decision

### Bypass expo-location on web for GPS acquisition

In `useDeviceLocation.ts`, when `Platform.OS === 'web'`, bypass expo-location entirely and call `navigator.geolocation.getCurrentPosition` directly with:

```typescript
{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
```

`maximumAge: 0` forces the browser to acquire a fresh GPS position. The native (iOS/Android) path continues to use expo-location with `Accuracy.High` — the bug only affects the web implementation.

**Rationale:** Patching expo-location itself is out of scope. The web branch is a well-contained workaround that does not alter the native path.

### Re-acquire GPS fresh at submit time in all three screens

Each attendance screen (`offsite-checkin.tsx`, `offsite-checkout.tsx`, `mixed-checkout.tsx`) now calls `getLocation()` inside `handleSubmit` immediately before building the API payload. The mount-time stored state is used only for UI display (accuracy pill, map hint); the actual coordinates sent to the API are always acquired at the moment of submit.

### Enforce accuracy ≤ 100 m on all off-site screens

`canSubmit` on `offsite-checkin.tsx` and `offsite-checkout.tsx` was tightened to require `gpsStatus === 'ready'` only, removing the `low_accuracy` bypass. This aligns with `mixed-checkout.tsx` (already correct) and with the backend `@Max(100)` DTO constraint.

### App shell cache-control (complementary, not a GPS fix)

The mobile PWA app shell (`http://172.16.2.31:3004/`) serves with:

```
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
```

These headers prevent browser and CDN from serving a stale build of the JavaScript application. This is distinct from GPS freshness — it ensures employees run the current code version, not a cached older build. This header was set as part of the PWA standalone delivery work (see ADR-025); it is documented here because it is complementary to the GPS freshness requirement.

---

## Consequences

**Positive:**
- GPS positions submitted for attendance actions are always acquired within seconds of the user tapping the submit button.
- Stale cached positions from previous browser sessions cannot be accepted.
- Accuracy gate is now consistent across all three attendance submission screens.
- No backend or schema changes were required.

**Negative / Trade-offs:**
- Users experience a ~1–2 second delay on submit while fresh GPS is acquired (mitigated by the existing GPS loading indicator in the form UI).
- On devices with poor GPS signal indoors, the fresh acquisition may time out (15 s) or return > 100 m accuracy, blocking submit. Users are instructed to move near a window and retry.
- The `expo-location` bypass applies only to the web (PWA) path. If the app is ever deployed as a native binary, the bypass branch will not execute — this is correct behavior, but developers must be aware of the Platform.OS guard when modifying location logic.

---

## Related ADRs

- ADR-025 — STEP Connect PWA Branding and Standalone Delivery (app shell cache-control)
- ADR-027 — Mixed Attendance Checkout Exception Workflow (attendance flow this fix protects)
- ADR-020 — Attendance Geofence and Admin Configuration (backend geofence this GPS data feeds)
