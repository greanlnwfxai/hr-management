# CTO Summary

## Task
REQ-002E-SPEC — STEP Connect Off-site Attendance UI Specification

## Status
PASS

## Scope
Docs / specification only.

No runtime code changed. No backend changed. No schema changed. No data mutated.
No destructive Docker commands run.

## Files Changed

| File | Type | Notes |
|---|---|---|
| `docs/REQ_002E_STEP_CONNECT_OFFSITE_UI_SPEC.md` | Created | Full UI spec — 18 sections |
| `docs/CTO_SUMMARY_REQ_002E_SPEC.md` | Created | This document |

## Runtime Code Changed
No

## Database / Schema Changed
No

## Data Mutation
No

## Docker Destructive Commands
No

---

## Summary of Proposed UI

The spec defines all UI changes needed in `apps/mobile/` (STEP Connect) to support the deployed off-site attendance backend (REQ-002C + REQ-002D). Key design decisions:

### Primary interaction changes

| Component | Change |
|---|---|
| `home.tsx` | Detects outside-geofence state at mount; replaces normal clock-in button with off-site button when outside |
| `app/offsite-checkin.tsx` | New screen: GPS status, planned/unplanned banner, workLocationName + reason form, confirm |
| `app/offsite-checkout.tsx` | New screen: GPS status, optional note, confirm |
| `useAttendance.ts` | Remove `workMode: 'OFFSITE'` injection from `performClockIn` (migration from old path) |
| `useOffsiteAttendance.ts` | New hook: off-site clock action state machine, GPS management, error translation |
| `attendance.tsx` HistoryTimeline | Add `reviewStatus` badge + `workLocationName` subtitle to OFFSITE history cards |
| `types.ts` | Add `AttendanceSource`, `AttendanceReviewStatus`; extend `AttendanceRecord` |
| `client.ts` | Add `clockInOffsite()`, `clockOutOffsite()` functions |

### Geofence detection on home screen

App fetches `GET /attendance/geofence-location` and calls `getLocation()` on mount. Uses existing `haversineMeters()` utility to determine inside/outside state. The check is for UI pre-screening only — the backend remains authoritative.

### Hybrid path UX

The app shows a green info banner when an approved `OffSiteRequest` exists for today (planned path → AUTO_ACCEPTED after clock-in). Shows an amber banner when no approved request exists (unplanned path → PENDING_REVIEW). The mobile app does not explicitly select the path — the backend detects it automatically.

### Privacy

Raw GPS coordinates and accuracy metres are never displayed in the UI. GPS is captured via `requestForegroundPermissionsAsync` only, at the moment the user taps Confirm. No background tracking. No continuous polling.

---

## Acceptance Criteria

Reproduced from §13 of the spec:

- Outside geofence → off-site clock-in button shown in teal
- Planned path → green "อนุมัติแล้ว (ตามคำขอ)" badge after clock-in
- Unplanned path → amber "รอ HR ตรวจสอบ" badge after clock-in
- Off-site clock-out succeeds from any location (no geofence check)
- Form validates: GPS required, workLocationName required (≥ 1 char), reason required (≥ 3 chars)
- API 422 (accuracy > 100m) shows amber error; form preserved
- Location denied → red inline error; no API call
- History timeline: reviewStatus badge + workLocationName shown for OFFSITE records
- Old `workMode: 'OFFSITE'` injection removed from `useAttendance.ts`
- Normal ONSITE clock-in via GeofenceMapModal unchanged

---

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints. All existing endpoints already guarded. Mobile calls use existing `authPost` helper with Bearer JWT. |
| RBAC impact | No new guards. Off-site clock-in/out endpoints are open to all roles (employee can clock their own attendance). No role bypass possible. |
| Data privacy impact | No new PII exposure. Raw GPS coordinates never displayed. No background location. `requestForegroundPermissionsAsync` only. `workLocationName` and `reason` are submitted by the employee themselves. |
| Password/token/hash impact | None. |
| Mobile security impact | GPS permission model unchanged (foreground only). `expo-secure-store` usage unchanged. No new token storage. |
| Dependency/advisory impact | No new packages. Existing expo-location already in use. |
| Secrets/logging check | No secrets or tokens in UI. GPS not logged in audit (backend-enforced). |
| New endpoints protected | None — no new endpoints in this task. |
| Risk level | LOW |
| Security decision | PASS |

---

## Issues Found
None.

## Risk
Low. Docs/spec task only. No code changes in this step.

The spec identifies one migration risk: removal of the `workMode: 'OFFSITE'` injection in `useAttendance.ts`. This is intentional and safe — the backend now has a dedicated endpoint; the old path in `POST /attendance/clock-in` is deprecated. The migration is tracked as a required Phase 2 step in the implementation phases.

## Decision
PASS

## Deferred Implementation Tasks

| Task | Description |
|---|---|
| REQ-002E | Actual STEP Connect mobile implementation (follows this spec) |
| REQ-002F | Admin Web off-site review UI |
| REQ-002G | Runtime QA / end-to-end verification |
| REQ-002H | HR-Knowledge / ADR sync |

## Next Step
REQ-002E — Implement STEP Connect off-site attendance UI per this specification.

## Recommended Commit Message
```
docs(req): add STEP Connect off-site attendance UI spec REQ-002E

Specify mobile UX for off-site clock-in/out (REQ-002E) including:
user journeys (planned/unplanned/clock-out/error paths), button and
badge design, form fields (workLocationName + reason), GPS status
indicator, Thai/English copy, privacy rules, edge cases, acceptance
criteria, 8-phase implementation plan, and test plan. Identifies
useAttendance.ts workMode injection removal as required migration step.
Backend (REQ-002C + REQ-002D) already deployed.
```
