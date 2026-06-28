# CTO Summary

## Step
REQ-002E — STEP Connect Off-site Attendance UI (Mobile PWA)

## Status
PASS

## Scope
Mobile app (`apps/mobile/`) only. No backend, database, Admin Web, or schema changes.

Implements the user-facing off-site clock-in / clock-out flow for the STEP Connect mobile PWA:
- Geofence-aware home screen (inside / outside office area)
- Off-site clock-in form screen with GPS capture, work location + reason fields
- Off-site clock-out form screen with GPS capture
- Attendance history display showing `reviewStatus` badge and `workLocationName`
- Removal of the deprecated `workMode: 'OFFSITE'` injection from the regular clock-in path

## Files Created

| File | Purpose |
|---|---|
| `apps/mobile/app/offsite-checkin.tsx` | Off-site clock-in form screen — GPS indicator, info banners (planned / unplanned), workLocationName + reason + optional note inputs, teal Confirm button |
| `apps/mobile/app/offsite-checkout.tsx` | Off-site clock-out form screen — GPS indicator, optional note input, teal Confirm button |
| `apps/mobile/src/hooks/useOffsiteAttendance.ts` | Reusable hook for off-site clock-in/out state machine, GPS handling, error translation |

## Files Modified

| File | Change |
|---|---|
| `apps/mobile/src/api/types.ts` | Added `AttendanceSource`, `AttendanceReviewStatus` union types; added `OffsiteClockInPayload`, `OffsiteClockOutPayload` interfaces; extended `AttendanceRecord` with optional `attendanceSource?`, `reviewStatus?`, `workLocationName?` fields |
| `apps/mobile/src/api/client.ts` | Added imports for new payload types; added `clockInOffsite()` → `POST /attendance/offsite/clock-in`; added `clockOutOffsite()` → `POST /attendance/offsite/clock-out` |
| `apps/mobile/src/hooks/useAttendance.ts` | Removed `isOffSiteApproved` variable and `...(isOffSiteApproved && { workMode: 'OFFSITE' })` injection from `performClockIn`; regular clock-in now sends ONSITE-only payload; removed stale `todayOffSite` dependency from `useCallback` |
| `apps/mobile/app/home.tsx` | Added geofence detection state machine (`loading / inside / outside / gps_unavailable / unconfigured`); added `reviewStatusLabel()` / `reviewStatusColor()` helpers; conditionally renders: (a) active off-site card with clock-out button when `today.workMode === 'OFFSITE'`, (b) off-site clock-in button + pre-approval banner when outside geofence, (c) normal on-site buttons otherwise |
| `apps/mobile/app/attendance.tsx` | Added `AttendanceReviewStatus` import; added `reviewStatusLabel()` / `reviewStatusColor()` helpers; extended `HistoryTimeline` to show `reviewStatus` badge alongside "นอกสถานที่" badge and `workLocationName` subtitle for off-site records |

## Verification Result

| Check | Result |
|---|---|
| `./scripts/verify.sh` (API build + Prisma validate + Web build) | ✅ PASS |
| Mobile TypeScript (`tsc --noEmit` in `apps/mobile/`) | ✅ PASS — 0 errors |
| `./scripts/docker-verify.sh` (full stack build + health) | ✅ PASS — all services healthy |
| `./scripts/api-smoke-test.sh` (login + GET /employees) | ✅ PASS |
| `./scripts/security-review.sh` | ✅ PASS |

Docker stack after verify: `hr-api`, `hr-web`, `hr-mobile`, `hr-db` all Up/healthy.

## Issues Found

**TypeScript dead-code error:** Inside the `!hasActiveOffsiteCheckIn && isOutside && !alreadyClockedIn` render block, an inner `geofenceZone === 'loading'` comparison was flagged as impossible (TS2367) because `isOutside` being true already implies `geofenceZone === 'outside'`. Fixed by removing the redundant loading branch — when the zone is `loading`, `isOutside` is `false` so the block is never entered.

No other issues.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new API endpoints added; new mobile screens call existing protected endpoints (`POST /attendance/offsite/clock-in`, `POST /attendance/offsite/clock-out`) via `authPost` with JWT Bearer token — same pattern as all other authenticated calls |
| RBAC impact | No RBAC changes; off-site endpoints are accessible to all authenticated roles (same as standard clock-in/out) |
| Data privacy impact | Raw GPS coordinates (`latitude`, `longitude`, `accuracy`) are captured silently and sent to the API only — never displayed in any UI element. `workLocationName` is employee-entered free text, not a GPS reverse-geocode. No new PII fields exposed in UI. |
| Password/token/hash impact | None. No changes to auth, JWT, or password handling. |
| Mobile security impact | GPS captured via `requestForegroundPermissionsAsync` (foreground only). No background location permission requested at any point. Token storage unchanged (existing `expo-secure-store` pattern). `clockInOffsite` / `clockOutOffsite` use same `authPost` helper as all other API calls. |
| Dependency/advisory impact | No new npm packages added. Mobile dependency audit: no HIGH/CRITICAL. API: two existing Multer advisories with documented accepted risk (unchanged). |
| Secrets/logging check | No tokens, passwords, or secrets in source. Raw GPS values not logged or displayed. `secret-scan.sh` passed with no findings. |
| New endpoints protected | `POST /attendance/offsite/clock-in` and `POST /attendance/offsite/clock-out` — both require JWT Bearer token (`JwtAuthGuard`), implemented in REQ-002C backend, unchanged here. |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Next Step
REQ-002F — Admin Web off-site review UI (review PENDING_REVIEW off-site attendance records from the web dashboard)

## Recommended Commit Message
```
feat(mobile): implement REQ-002E off-site attendance UI

- Add offsite-checkin screen: GPS capture, workLocationName + reason
  form, planned/unplanned info banners, teal confirm button
- Add offsite-checkout screen: GPS capture, optional note, confirm
- Add useOffsiteAttendance hook with state machine and error translation
- Extend AttendanceRecord type with attendanceSource, reviewStatus,
  workLocationName (optional, backward-compatible)
- Add clockInOffsite / clockOutOffsite API client functions
- Remove deprecated workMode:'OFFSITE' injection from regular clock-in;
  regular POST /attendance/clock-in is now ONSITE-only
- Home screen geofence detection: shows off-site button when outside
  geofence, active off-site card with checkout button when clocked in
- Attendance history: reviewStatus badge + workLocationName subtitle
  for off-site records

Scope: apps/mobile/ only. No backend/DB/Admin Web changes.
```
