# CTO Summary

## Step
REQ-002F-2 — Mobile Mixed Checkout UX

## Status
PASS

## Scope
Implements the mobile UX for ONSITE employees who are outside the company geofence at checkout time. The primary path surfaces an "เช็คเอาท์นอกสถานที่" CTA inside the geofence modal when `isInsideRadius === false` on checkout. A new `/mixed-checkout` screen collects GPS, work location name, and reason, then submits to `POST /attendance/offsite/mixed-checkout-exception`. After submission the home screen shows a "รอ HR ตรวจสอบ" PENDING_REVIEW banner. A secondary 422-path fallback (rare GPS coordinate mismatch) is handled via `ApiCodedError` in `useAttendance`. No backend, database, or Admin Web changes.

## Files Created
- `apps/mobile/app/mixed-checkout.tsx` — new screen for mixed checkout exception

## Files Modified
- `apps/mobile/src/api/types.ts` — added `ApiCodedError` class, `MixedCheckoutExceptionPayload` interface
- `apps/mobile/src/api/client.ts` — `authPost` now throws `ApiCodedError` when body contains `code`; added `submitMixedCheckoutException`
- `apps/mobile/src/hooks/useAttendance.ts` — added `clockOutOutsideGeofence` state; `performClockOut` detects `ApiCodedError` with `code === 'OUTSIDE_GEOFENCE'`
- `apps/mobile/src/components/GeofenceMapModal.tsx` — added `onMixedCheckout?` prop; renders teal "เช็คเอาท์นอกสถานที่" button when `action === 'out'` AND `isInsideRadius === false` AND `loadState === 'ready'`
- `apps/mobile/src/components/GeofenceMapModal.web.tsx` — same changes as native modal
- `apps/mobile/app/home.tsx` — added `useFocusEffect` for attendance refresh on focus; wired `onMixedCheckout` to modal; added PENDING_REVIEW banner; added `clockOutOutsideGeofence` fallback CTA

## Verification Result
```
./scripts/verify.sh         → PASS  (API build + prisma validate + web build)
./scripts/docker-verify.sh  → not run (backend and schema unchanged; Docker stack not affected)
./scripts/api-smoke-test.sh → PASS  (login + GET /employees + all standard endpoints)
./scripts/security-review.sh → PASS (automated checks clear)
Mobile TypeScript (npx tsc --noEmit) → PASS (zero errors)
```

## Issues Found
**Critical path gap (caught before implementation):** The geofence modal's `confirmDisabled = loadState === 'loading' || isInsideRadius === false` prevents `onConfirm` from being called when the employee is genuinely outside the geofence — making a pure 422-catch approach miss the main scenario. Resolution: the primary CTA is placed inside the modal footer (replacing the disabled confirm button for `action === 'out'` + outside). The 422 `ApiCodedError` path is retained as fallback for the rare server-side coordinate mismatch case.

**Dual modal files:** Both `GeofenceMapModal.tsx` (native) and `GeofenceMapModal.web.tsx` required the same prop addition to prevent web divergence.

**Accuracy constraint:** Backend DTO has `@Max(100)` on accuracy. The `mixed-checkout.tsx` screen gates submission at `accuracy <= 100` (stricter than offsite-checkin which allows `low_accuracy`). GPS status `poor_accuracy` blocks submit and shows an instructional message.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints added; `submitMixedCheckoutException` calls an existing JWT-guarded endpoint (`@Post('offsite/mixed-checkout-exception')` behind `JwtAuthGuard`) |
| RBAC impact | No role-check changes; endpoint accessible to any authenticated user (correct — employees submit their own checkout) |
| Data privacy impact | GPS coordinates sent to backend but **never displayed** in the UI (only label shown); no raw lat/lng in any rendered text |
| Password/token/hash impact | None |
| Mobile security impact | Token passed via `Authorization: Bearer` header as per existing pattern; no token storage changes |
| Dependency/advisory impact | No new packages added; no new audit findings |
| Secrets/logging check | `ApiCodedError` carries structured `code` + `message` only; no GPS values in error messages or logs |
| New endpoints protected | `submitMixedCheckoutException` → `POST /attendance/offsite/mixed-checkout-exception` (existing endpoint, JWT-guarded, unchanged) |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Next Step
REQ-002F-3 — Admin Web HR review UI for mixed checkout exception records (or next roadmap item as directed)

## Recommended Commit Message
```
feat(mobile): add mixed checkout exception flow

Primary UX: geofence modal shows "เช็คเอาท์นอกสถานที่" CTA when
isInsideRadius === false on checkout. New /mixed-checkout screen
collects GPS + workLocationName + reason + note and submits to
POST /attendance/offsite/mixed-checkout-exception. Home shows
PENDING_REVIEW banner after successful submission. ApiCodedError
handles 422 OUTSIDE_GEOFENCE fallback via performClockOut path.
useFocusEffect refreshes attendance on home screen re-focus.
```
