# ADR-022 — Off-site Work Request Workflow

**Status:** Accepted
**Date:** 2026-06-23
**Tasks:** T-071
**Related tags:** `v1.2.0-employee-self-service-offsite`
**Implementation reference:** `docs/CTO_SUMMARY_T071.md`, commit `b611f95`

---

## Context

The geofence system enforces that mobile clock-in and clock-out occur from within the company's configured radius. Before v1.2.0, there was no mechanism for an employee to legitimately clock in while working off-site (client visit, field work, remote assignment). Any mobile clock-in outside the radius was rejected with 422, regardless of whether the absence from the office was pre-approved.

The implementation needed to satisfy several constraints simultaneously:

- The geofence must remain fully enforced for ordinary (ONSITE) work
- The bypass must not be a unilateral employee decision — it requires prior admin or manager approval
- An approved off-site bypass must be scoped to a specific employee and a specific calendar date
- GPS is still required for off-site clock-in (the location is captured; only the radius check is bypassed)
- Clock-out must remain geofence-enforced regardless of work mode

## Decision

Introduce an `OffSiteRequest` model and an `off-site` API module that allows employees to pre-request off-site work for a given date. Admins and department managers can approve or reject these requests.

When a mobile clock-in is submitted with `workMode: "OFFSITE"`, the attendance service looks up an `APPROVED` `OffSiteRequest` for the current employee and the current date. If one exists, the geofence radius check is skipped and the clock-in proceeds. If no approved request exists for that date, the clock-in is rejected with 403.

**Clock-out is not affected.** `clockOut()` always calls `validateGeofence()` unconditionally. Off-site approval does not grant a geofence bypass for clock-out.

### Off-site Request Lifecycle

```
[PENDING] ──approve──► [APPROVED]
[PENDING] ──reject──►  [REJECTED]
```

Only `PENDING` requests can be approved or rejected. `REJECTED` requests can be resubmitted for the same date.

### Off-site Clock-in Validation Sequence (OFFSITE work mode)

1. GPS fields (`latitude`, `longitude`, `accuracy`) **must be present** — 422 if missing
2. Look up an `APPROVED` `OffSiteRequest` for `(employeeId, today)` — 403 if absent
3. Skip radius check — proceed directly to normal clock-in rules (LATE, duplicate check)

### Off-site Approval Scope

| Role | Can approve? | Scope |
|---|---|---|
| SUPER_ADMIN | Yes | All employees |
| HR_ADMIN | Yes | All employees |
| MANAGER | Yes | Only employees whose department this manager manages (via `Department.managerId`) |

MANAGER approval is scoped by the `managedDepartment` relation on `Employee`. If a MANAGER does not manage any department, or the request employee is in a different department, the approval attempt returns 403.

### Schema Changes

New enum: `OffSiteStatus` — `PENDING | APPROVED | REJECTED`
New enum: `WorkMode` — `ONSITE | OFFSITE`

New model: `OffSiteRequest`

| Field | Type | Description |
|---|---|---|
| `id` | String (UUID) | Primary key |
| `employeeId` | String | Employee submitting the request |
| `date` | Date | Target work-off-site date |
| `reason` | String? | Optional reason text |
| `status` | OffSiteStatus | PENDING → APPROVED or REJECTED |
| `approvedById` | String? | Employee ID of approver |
| `approvedAt` | DateTime? | Approval timestamp |
| `rejectReason` | String? | Optional rejection reason |

Attendance model extended: `workMode WorkMode @default(ONSITE)` added as a new column.

### Off-site API Endpoints

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | /off-site/request | Any | Submit off-site request for a date |
| GET | /off-site/me | Any | Own off-site requests (paginated) |
| GET | /off-site | SUPER_ADMIN, HR_ADMIN, MANAGER | All off-site requests (paginated) — org-wide |
| GET | /off-site/:id | Any (owner or admin) | Single request |
| PATCH | /off-site/:id/approve | SUPER_ADMIN, HR_ADMIN, MANAGER | Approve PENDING request (MANAGER: own-dept only) |
| PATCH | /off-site/:id/reject | SUPER_ADMIN, HR_ADMIN, MANAGER | Reject PENDING request (MANAGER: own-dept only) |

**Note:** `GET /off-site` (list) has no manager-department filter — a MANAGER sees org-wide requests. Only approve/reject are department-scoped.

### Overlap Guard

One PENDING or APPROVED off-site request per employee per date. A second submission for the same `(employeeId, date)` while one is PENDING or APPROVED returns 409. REJECTED requests can be resubmitted for the same date.

### Audit Events

| Event | Trigger |
|---|---|
| `OFFSITE_APPROVED` | PATCH /off-site/:id/approve success |
| `OFFSITE_REJECTED` | PATCH /off-site/:id/reject success |

Audit writes are best-effort. A failed audit write does not affect the approval/rejection response.

### Web UI

Admins and managers access off-site request management at `/offsite` in the web app. The page supports listing and approve/reject actions. This is the only web admin surface for off-site requests.

### Mobile UI

Employees can submit off-site requests from the mobile `offsite-request` screen. The mobile `GeofenceMapModal` component shows a map view during off-site clock-in for location context.

## Privacy Decision

GPS coordinates provided during off-site clock-in are used only for presence confirmation and are never stored in `Attendance`, `OffSiteRequest`, or `AuditLog.metadata`. The off-site approval does not record coordinates; it records only the request ID, employee ID, and date.

## Consequences

Positive consequences:

- Employees with pre-approved off-site assignments can clock in from their actual location
- The geofence enforcement for ONSITE work is entirely unchanged
- The bypass is narrowly scoped: specific employee, specific date, requires prior approval
- Clock-out geofence enforcement is preserved regardless of work mode

Accepted tradeoffs:

- MANAGER can view the org-wide off-site request list; only approve/reject is department-scoped
- An employee could submit an off-site request without a legitimate reason — the approval workflow is the only enforcement mechanism
- Off-site clock-out is geofence-enforced, which may cause friction for truly remote employees; this is an accepted asymmetry to preserve clock-out integrity

## Alternatives Considered

### 1. Allow geofence bypass via a per-employee setting

Rejected because it would give employees or admins a persistent, undated bypass. The per-date approval model is more auditable.

### 2. Separate the geofence bypass from attendance work mode

Considered, but using `workMode` as the signal at clock-in time avoids a separate boolean field and aligns clock-in records with the actual work mode. Attendance records now carry the `workMode` for reporting.

### 3. Bypass clock-out geofence for OFFSITE employees too

Rejected because the clock-out location (end of working day) is a distinct event from clock-in and does not need the same bypass. Preserving clock-out geofence enforcement limits the surface area of the bypass.

## Security Considerations

- The bypass is locked to `APPROVED` status for the requesting employee's own date — cannot be triggered by another employee or for a future/past date
- MANAGER cannot approve their own off-site request (they are the employee and the approver in the same department — but they need to be assigned as `Department.managerId` to approve anyone else)
- GPS data is never persisted; the off-site bypass does not change GPS privacy guarantees
- Approval and rejection are audit-logged for visibility
- Web UI approval page is protected by JWT and RBAC; EMPLOYEE receives 403 on admin routes

## Operational Notes

- The off-site module is at `apps/api/src/off-site/`
- Migration: `20260622081126_add_offsite_work_request`
- `workMode` on Attendance defaults to `ONSITE` — no migration impact on existing attendance records
- The web off-site management page is at `/offsite` and is guarded by `isAdmin()` on the client (MANAGER sees it too via role check); backend RBAC is authoritative

## Related Notes

- [[ADR-020 Attendance Geofence and Admin Configuration]]
- [[ADR-021 Failed Geofence Attempt Audit]]
- [[ADR-023 Department Manager Leave Approval Scope]]
- [[Attendance Geofence]]
- [[Attendance Module]]
- [[Department Module]]
- [[RBAC Rules]]

#adr #attendance #off-site #geofence #mobile #rbac #security
