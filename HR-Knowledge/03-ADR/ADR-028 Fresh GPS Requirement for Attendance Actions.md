# ADR-028 — Fresh GPS Requirement for Attendance Actions

**Status:** Accepted
**Date:** 2026-06-27
**Tasks:** HOTFIX-REQ002F-A (v1.2.51)
**Related tags:** `v1.2.51`
**Source file:** `docs/adr/ADR-028-fresh-gps-requirement-for-attendance-actions.md`

---

## Context

Three GPS-related bugs were discovered during REQ-002F production testing:

1. **expo-location web hardcodes `maximumAge: Infinity`** — browser returns positions cached from previous sessions. Symptom: geofence modal showed employee ~142 m from office while they were physically kilometers away.
2. **Mount-time GPS reused at submit time** — `offsite-checkin.tsx`, `offsite-checkout.tsx`, `mixed-checkout.tsx` captured GPS once on mount and used stored state at submit time.
3. **Low-accuracy GPS allowed for off-site submit** — `offsite-checkin/checkout` allowed `gpsStatus === 'low_accuracy'` (accuracy > 100 m), inconsistent with `mixed-checkout.tsx` and the backend `@Max(100)` DTO constraint.

---

## Decision

### Bypass expo-location on web

In `useDeviceLocation.ts`, when `Platform.OS === 'web'`:

```typescript
navigator.geolocation.getCurrentPosition(resolve, reject, {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000,
});
```

Native path (iOS/Android) continues using expo-location. The `Platform.OS` guard isolates the fix.

### Re-acquire GPS fresh at submit time

All three screens call `getLocation()` inside `handleSubmit` immediately before building the API payload. Mount-time state is display-only.

### Enforce accuracy ≤ 100 m on all off-site screens

`canSubmit` on `offsite-checkin.tsx` and `offsite-checkout.tsx` now requires `gpsStatus === 'ready'` only, removing the `low_accuracy` bypass.

### App shell cache-control (complementary)

PWA app shell headers (`no-store, no-cache, must-revalidate`) prevent stale build delivery. This is distinct from GPS freshness — it was set as part of ADR-025 and is documented here as context.

---

## Consequences

**Positive:**
- GPS coordinates submitted for attendance actions are always fresh (acquired at submit time).
- Accuracy gate consistent across all three screens.
- No backend or schema changes required.

**Negative / Trade-offs:**
- ~1–2 s delay on submit while fresh GPS is acquired.
- Poor indoor GPS signal may block submit until employee moves near a window.
- The expo-location bypass applies only to `Platform.OS === 'web'`. Native binary deploys are unaffected (correct behavior; developers must be aware of the guard).

---

## Related Notes

- [[ADR-025 STEP Connect PWA Branding and Standalone Delivery]]
- [[ADR-027 Mixed Attendance Checkout Exception Workflow]]
- [[ADR-020 Attendance Geofence and Admin Configuration]]
- [[Mixed Checkout Exception]]
- [[STEP Connect PWA]]

#adr #mobile #gps #geofence #pwa #v1-2-51
