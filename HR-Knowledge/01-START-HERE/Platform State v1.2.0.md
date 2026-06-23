# Platform State v1.2.0

Last updated: 2026-06-23
Latest tag: `v1.2.0-employee-self-service-offsite`
Commit: `b611f95`

## Overview

v1.2.0 is a feature release on top of v1.1.49. It adds employee self-service off-site work requests, department-scoped manager leave approval, mobile UI refresh, and the web department manager UI.

---

## New in v1.2.0

### Off-site Work Request Module

- New `OffSiteRequest` model: employee can request off-site work for a specific date
- Off-site requests go through PENDING → APPROVED / REJECTED lifecycle
- When an approved off-site request exists for today, mobile clock-in with `workMode: "OFFSITE"` bypasses the geofence radius check
- GPS is still required for off-site clock-in; only the radius check is skipped
- Clock-out is not affected — geofence validation remains unconditional at clock-out
- API module: `apps/api/src/off-site/` (6 new endpoints)
- Web UI: `/offsite` page for admins and managers to manage off-site requests
- Mobile UI: `offsite-request` screen for employees to submit and track requests

### Department Manager Leave Approval Scope

- MANAGER leave approve/reject is now scoped to the department the manager manages
- Scoping key: `Department.managerId` → `managedDepartment` back-relation on `Employee`
- SUPER_ADMIN and HR_ADMIN retain org-wide approve/reject authority
- The constraint applies to leave AND off-site request approve/reject
- List visibility (`GET /leave`, `GET /off-site`) remains org-wide for MANAGER

### Department Manager UI

- Web `/departments` page now shows manager column and assignment form
- `PATCH /departments/:id` response now includes `managerId` and `manager` fields
- `Department.managerId` was always in the schema; web UI now exposes it

### Mobile Employee Self-Service UI Refresh

- Home screen redesigned with leave summary cards and overtime card
- Attendance, calendar, leave, profile screens visually refreshed
- New screens: `attendance-detail.tsx`, `offsite-request.tsx`
- New components: `GeofenceMapModal.tsx` (native map), `GeofenceMapModal.web.tsx` (Expo web stub)
- New hooks: `useHomeSummaries.ts`, `useOffSiteRequests.ts`
- New dependencies: `react-native-svg`, `react-native-maps`, `metro.config.js`

### DATA-001 Sandbox Attendance Repair

- Sandbox seed: `apps/api/prisma/seed-data-001-attendance.ts`
- Guard: `ALLOW_SANDBOX_ATTENDANCE_SEED=true` env var must be set
- Reconstructs sandbox attendance for test employees: พิชัย ใจจิต (SVR-001) and กาศิ จั่นอุไร (SVR-002)
- Sandbox/demo use only — never run in production

---

## New Schema Models and Enums

| Addition | Description |
|---|---|
| `OffSiteStatus` enum | `PENDING | APPROVED | REJECTED` |
| `WorkMode` enum | `ONSITE | OFFSITE` |
| `OffSiteRequest` model | Off-site work request per employee per date |
| `Attendance.workMode` | New column (default `ONSITE`); all existing rows unaffected |

---

## Endpoint Count

API surface: **49 endpoints including `GET /health`** (v1.1.49 had 43; off-site adds 6).

New endpoints:

| Method | Path |
|---|---|
| POST | /off-site/request |
| GET | /off-site/me |
| GET | /off-site |
| GET | /off-site/:id |
| PATCH | /off-site/:id/approve |
| PATCH | /off-site/:id/reject |

---

## Verification

| Check | Result |
|---|---|
| `./scripts/verify.sh` | PASS |
| `npm test` | PASS — 351/351 tests |
| `./scripts/mobile-verify.sh` | PASS |
| `./scripts/security-review.sh` | PASS |
| `git diff --check` | Clean |
| CI (commit `b611f95`) | Green |
| Tag pushed | `v1.2.0-employee-self-service-offsite` |

---

## Current Operational Rules (unchanged from v1.1.49)

- Work schedule: `08:30–17:30`
- LATE threshold: strictly after `08:30` Asia/Bangkok
- Backend RBAC remains the source of truth; UI role gating is UX-only
- `mustChangePassword` is enforced in current web/mobile UX flows
- Audit writes are best-effort (try/catch)
- Mobile geofence enforcement is backend-authoritative for ONSITE mode
- Off-site bypass requires a prior approved `OffSiteRequest` for the employee and date

---

## ADR Pack — v1.2.0

24 Architecture Decision Records. ADR-022, ADR-023, and ADR-024 added in this release.

---

## Related Notes

- [[Current Status]]
- [[ADR Index]]
- [[Off-site Work Mode]]
- [[Department Module]]
- [[Leave Request Module]]
- [[RBAC Rules]]
- [[Attendance Geofence]]

#hr-management #current-state #v1-2-0
