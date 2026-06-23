# ADR-024 — Mobile Employee Self-Service v1.2.0 UI Refresh

**Status:** Accepted
**Date:** 2026-06-23
**Tasks:** T-071
**Related tags:** `v1.2.0-employee-self-service-offsite`
**Implementation reference:** commit `b611f95`

---

## Context

The mobile app's Home screen and key feature screens (attendance, leave, calendar, profile) had accumulated incremental changes across milestones T-044 through T-066 without a holistic UI pass. By v1.1.49, the screens had functional coverage but inconsistent visual hierarchy, no summary cards, and limited localization for Thai-speaking users.

v1.2.0 introduced two new workflows (off-site work requests and department-scoped leave approval) that required new mobile screens. The release was used as an opportunity to refresh all major screens to a consistent self-service UX standard.

Additionally, the Expo SDK and key dependencies required upgrading to support new features (`react-native-svg` for DonutRing charts, `react-native-maps` for geofence/off-site map UI) and to maintain compatibility with Expo web.

## Decision

### Home Screen Redesign

The Home screen was redesigned around summary cards and self-service actions:

- Employee name/greeting hero header retained
- Leave summary cards added:
  - `สรุปการลา (ปีนี้)` — year-to-date leave summary
  - `ลาป่วย (30 วันแรก)` — sick leave quota (first 30 days, statutory entitlement)
  - `ลาป่วย (เกิน 30 วัน)` — sick leave quota (beyond 30 days, unpaid tier indicator)
  - `ลาพักร้อน` — annual/vacation leave balance
- Overtime summary card added:
  - `สรุปการทำงานล่วงเวลา (เดือนนี้)` — current-month overtime summary
- Summary data fetched via the new `useHomeSummaries` hook

### Screen Refreshes

| Screen | Scope |
|---|---|
| Home | Full redesign — summary cards, overtime card, localized greeting |
| Attendance | Refreshed UI; attendance-detail route added |
| Calendar | Refreshed calendar presentation |
| Leave | Refreshed leave list and form UI; localization updates |
| Profile | Minor refinements |

New screen: `offsite-request.tsx` — employee off-site work request submission and history.
New screen: `attendance-detail.tsx` — detailed view for a single attendance record.

### Navigation

- Bottom navigation labels and icons refined for Thai/English bilingual clarity
- `MobileBottomNav.tsx` and `MobileScreenHeader.tsx` updated

### Components Added

| Component | Purpose |
|---|---|
| `GeofenceMapModal.tsx` | Native map modal for viewing off-site location during clock-in |
| `GeofenceMapModal.web.tsx` | Web-safe stub — renders placeholder on Expo Web (no native maps) |

The `.web.tsx` extension convention is used for platform-specific files in Expo Router. The web stub ensures the app builds cleanly for Expo Web without the native `react-native-maps` module.

### Dependency Changes

| Package | Change |
|---|---|
| Expo SDK | Upgraded (version bumped as part of release) |
| `react-native-svg` | Added — required for DonutRing summary chart components |
| `react-native-maps` | Added — required for `GeofenceMapModal` native map display |
| `metro.config.js` | Added — Expo web compatibility configuration |

### Data Layer

New hook: `useHomeSummaries.ts` — fetches leave balances and overtime data for the home summary cards. Consolidates API calls for the redesigned Home screen.

New hook: `useOffSiteRequests.ts` — fetches and manages off-site request state for the `offsite-request` screen.

New types: `apps/mobile/src/api/types.ts` extended with `OffSiteRequest` and related types.

### API Client

`apps/mobile/src/api/client.ts` updated to include off-site request API calls (`getOffSiteRequests`, `createOffSiteRequest`) and new attendance fields (`workMode`).

## Consequences

Positive consequences:

- Employees see leave balance summary and overtime status immediately on Home
- Off-site request workflow is accessible from the mobile app without web admin intervention for the employee-submission step
- Consistent visual language across all major mobile screens
- Expo web compatibility maintained via platform-specific stub

Accepted tradeoffs:

- `react-native-maps` adds native dependency complexity; the `.web.tsx` stub is required to keep Expo Web builds clean
- Summary cards on Home depend on API calls in `useHomeSummaries`; slow networks will show loading states
- The overtime summary card is display-only — overtime management is not yet a backend feature; the card reflects available data from leave/attendance endpoints

## Alternatives Considered

### 1. Defer UI refresh to a separate release

Rejected because the new off-site and approval screens needed to follow the same visual pattern as existing screens. Introducing new screens in a different style would worsen inconsistency.

### 2. Use a web view or PWA wrapper instead of native maps

Rejected in favor of `react-native-maps` to align with Expo's native ecosystem and provide a native map experience. The web stub ensures no regression on Expo Web.

## Security Considerations

- Mobile security impact: no changes to token storage or auth flow
- New screens (`offsite-request`, `attendance-detail`) are protected by the existing `AuthProvider` — unauthenticated users are redirected to login
- `GeofenceMapModal` does not transmit GPS data independently — it only displays location context during the existing clock-in flow
- `useHomeSummaries` calls standard authenticated API endpoints; no new data access patterns

## Operational Notes

- Verified with `./scripts/mobile-verify.sh` PASS
- Expo SDK upgrade: review Expo changelog for breaking changes if upgrading further
- `metro.config.js` must remain in `apps/mobile/` for Expo web compatibility
- `GeofenceMapModal.web.tsx` must remain alongside `GeofenceMapModal.tsx` — deleting the stub will break Expo Web builds

## Related Notes

- [[ADR-017 Mobile Expo Router]]
- [[ADR-022 Off-site Work Request Workflow]]
- [[ADR-023 Department Manager Leave Approval Scope]]
- [[Attendance Geofence]]

#adr #mobile #ui #expo #off-site #self-service
