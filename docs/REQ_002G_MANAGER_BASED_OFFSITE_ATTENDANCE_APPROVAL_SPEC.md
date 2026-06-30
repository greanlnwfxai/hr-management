# REQ-002G — Manager-Based Off-site Attendance Approval
## Specification Document

**Status:** SPEC ONLY — no implementation
**Depends on:** REQ-002C (off-site backend), REQ-002D (review API), REQ-002E (mobile UI), REQ-002F (mixed checkout exception)
**Date:** 2026-06-30
**Relationship:** See §15 for distinction from REQ-002H (Manager Flexible Attendance).

---

## 1. Objective

Change off-site attendance review ownership from HR-only to Manager-first approval.

**Scope of change:**
- Both off-site attendance flows are covered: full off-site check-in/out and mixed checkout exception.
- Manager is the primary approver for off-site attendance records belonging to employees under their department.
- HR_ADMIN and SUPER_ADMIN retain full visibility and override capability.
- HR acts as governance, audit, and fallback — not as the only normal approver.

**Non-goals for this spec:** No runtime code is implemented here. See §14 for explicit exclusions.

---

## 2. Current State

### 2.1 Off-site Attendance Flows Implemented

**Flow 1 — Full Off-site (OFFSITE_PLANNED / OFFSITE_UNPLANNED)**

| Stage | Behavior |
|-------|----------|
| Pre-approval | Employee submits `POST /off-site/request`; Manager or HR approves. |
| Clock-in | Employee clocks in from outside geofence with `workMode=OFFSITE`. |
| Clock-out | `POST /attendance/clock-out` with GPS still required even for OFFSITE. |
| Review trigger | `attendanceSource IN [OFFSITE_PLANNED, OFFSITE_UNPLANNED]` → placed in review queue. |
| Reviewer | HR_ADMIN or SUPER_ADMIN only. |

**Flow 2 — Mixed Checkout Exception (REQ-002F)**

| Stage | Behavior |
|-------|----------|
| Entry | ONSITE employee (geofence check-in) leaves office during the day. |
| Exception | Normal checkout blocked (outside geofence). Employee submits `POST /attendance/offsite/mixed-checkout-exception`. |
| Record state | `attendanceSource=COMPANY_GEOFENCE`, `reviewStatus=PENDING_REVIEW`. |
| Reviewer | HR_ADMIN or SUPER_ADMIN only. |

### 2.2 Current Review Endpoint RBAC

| Endpoint | Current allowed roles |
|----------|-----------------------|
| `GET /attendance/offsite-review` | SUPER_ADMIN, HR_ADMIN |
| `PATCH /attendance/offsite-review/:id/approve` | SUPER_ADMIN, HR_ADMIN |
| `PATCH /attendance/offsite-review/:id/reject` | SUPER_ADMIN, HR_ADMIN |

MANAGER and EMPLOYEE cannot access these endpoints. The Admin Web `/attendance/offsite-review` page is gated by `isAdmin()` which blocks both MANAGER and EMPLOYEE roles.

### 2.3 Current Mobile Text

Mobile state card for mixed checkout pending review currently shows:
> "การเช็คเอาท์นอกสถานที่ถูกส่งแล้ว — รอ HR ตรวจสอบ"

This must be updated in a future implementation task to mention Manager as well.

### 2.4 Current Data Model (Relevant Fields)

From `apps/api/prisma/schema.prisma`:

```
Department
  managerId        String? @unique       ← FK to Employee.id
  manager          Employee?             ← the employee who manages this dept

Employee
  departmentId     String                ← the dept this employee belongs to
  managerId        String?               ← direct line manager (person-to-person, NOT used for approval scope)
  managedDepartment Department?          ← back-relation: dept this employee manages (via Department.managerId)

Attendance
  attendanceSource  AttendanceSource     ← COMPANY_GEOFENCE | OFFSITE_PLANNED | OFFSITE_UNPLANNED
  reviewStatus      AttendanceReviewStatus? ← PENDING_REVIEW | APPROVED | REJECTED | AUTO_ACCEPTED | MISSING_CHECKOUT
  reviewedById      String?              ← FK to Employee (the reviewer)
  reviewedAt        DateTime?
  reviewNote        String?
```

**Key distinction:** `Department.managerId` identifies who manages a department (used for ADR-023 approval scoping). `Employee.managerId` is a person-to-person hierarchy link — NOT used for approval scope in this system.

### 2.5 RBAC Context

| Role | Current attendance review access |
|------|----------------------------------|
| SUPER_ADMIN | Full access to all review records |
| HR_ADMIN | Full access to all review records |
| MANAGER | No access to offsite-review endpoints |
| EMPLOYEE | No access to review endpoints; can only view own records |

---

## 3. Target Policy

### 3.1 Approval Ownership Model

When an employee submits an off-site attendance record (either flow), the review is routed as follows:

| Condition | Reviewer |
|-----------|----------|
| Employee has a valid department with an assigned Manager | Primary reviewer: that Manager |
| Employee has no department or department has no assigned Manager | Routed to HR queue |
| Manager is inactive or no matching Manager user | Routed to HR queue |
| Record belongs to the Manager themselves | Routed to HR queue (no self-review) |

HR_ADMIN and SUPER_ADMIN always retain override authority regardless of primary reviewer assignment.

### 3.2 Role Visibility Table

| Role | Can see records | Can approve/reject | Scope |
|------|-----------------|-------------------|-------|
| SUPER_ADMIN | All | Yes | Org-wide |
| HR_ADMIN | All | Yes | Org-wide |
| MANAGER | Own scope only | Yes | Employees in managed department only |
| EMPLOYEE | Own records only (via `/attendance/me`) | No | Own only |

### 3.3 Review Queue Routing (conceptual)

```
Employee submits off-site attendance (OFFSITE_PLANNED, OFFSITE_UNPLANNED, or mixed checkout exception)
         │
         ├── Has valid department with active Manager?
         │          YES → MANAGER_REVIEW queue (visible to that manager)
         │          NO  → HR_REVIEW queue (visible to HR_ADMIN / SUPER_ADMIN)
         │
         ├── HR_ADMIN / SUPER_ADMIN always see all records regardless of routing
         │
         └── Manager sees only their department's pending records
```

---

## 4. Manager Ownership Model

### 4.1 Options Evaluated

**Option A — Department-based manager scope via `Department.managerId`**

- MANAGER sees/reviews employees in the department they manage.
- Scope check: `approverEmployee.managedDepartment.id === targetEmployee.departmentId`
- Already implemented in schema and service layer for leave and off-site request approval (ADR-023).
- No schema migration required.
- **Recommended for first implementation.**

**Option B — Direct manager relation via `Employee.managerId`**

- `Employee.managerId` points to the employee's line manager.
- More granular (one employee may have a different line manager than the department manager).
- Already exists in schema but NOT used for approval scope in any existing feature.
- Would require a different scoping mechanism from the established ADR-023 pattern.
- Higher migration/complexity risk.
- **Not recommended for first implementation.**

**Option C — `Department.managerId` with list scoping**

- Same as Option A but extends list visibility scoping to the manager's department.
- Consistent with an enhanced future version of Option A.
- Can be implemented as a follow-up after the write-path (approve/reject) is delivered.

### 4.2 Recommendation

**Use Option A (`Department.managerId`) for first implementation.**

Rationale:
- This is the established pattern per ADR-023 (leave approval, off-site request approval).
- No schema migration is required.
- The scoping mechanism is already proven at the service layer.
- Lower risk than introducing `Employee.managerId`-based scoping for the first time.
- Consistency: a manager approved leave and off-site requests for their department; they should also approve attendance review for that same department.

### 4.3 Scoping Mechanism (for future implementation reference)

At approve/reject time:

```typescript
const approverEmp = await this.prisma.employee.findFirst({
  where: { userId },
  select: { id: true, managedDepartment: { select: { id: true } } },
});

if (!approverEmp?.managedDepartment) {
  throw new ForbiddenException('คุณไม่มีแผนกที่รับผิดชอบ กรุณาติดต่อ HR');
}

// Check: does the attendance record belong to an employee in the manager's department?
if (attendance.employee.departmentId !== approverEmp.managedDepartment.id) {
  throw new ForbiddenException('คุณสามารถอนุมัติได้เฉพาะพนักงานในแผนกของคุณเท่านั้น');
}
```

At list time (`GET /attendance/offsite-review` for MANAGER):

```typescript
where: {
  AND: [
    { /* off-site filter: OFFSITE_PLANNED/UNPLANNED or mixed checkout */ },
    { employee: { departmentId: approverEmp.managedDepartment.id } },
  ]
}
```

### 4.4 Future Option — Snapshot Department at Submission Time

If an employee changes departments after submitting an off-site exception, the review scope should be based on the employee's current department unless a future implementation snapshots the department at submission time. The first implementation should scope by current `employee.departmentId`. A future enhancement may add a `submitterDepartmentId` snapshot field to the Attendance record for audit accuracy.

---

## 5. Review Queue Behavior

### 5.1 For MANAGER

- See only pending off-site records for employees in their managed department.
- See review history (approved/rejected) for their managed department.
- Cannot see records from other departments.
- Cannot review their own attendance records (self-review is prohibited; those route to HR queue).
- GPS data must not be displayed: show distance from company (meters) and accuracy (meters) only — no raw latitude/longitude.
- Cannot access geofence config endpoints.

**MANAGER list visibility scope (two options for implementation):**

| Approach | Description | Tradeoff |
|----------|-------------|----------|
| Full org-wide list (read), dept-scoped approve/reject (write) | Matches leave/off-site pattern in ADR-023 | MANAGER sees other dept records but cannot act on them |
| Dept-scoped list and write | Tighter — MANAGER only sees their dept's records | More work to implement a separate query branch |

Recommended for first implementation: **dept-scoped list and write** — off-site attendance is more sensitive than leave requests (contains location data), so limiting read access aligns with the privacy-first principle.

### 5.2 For HR_ADMIN

- See all pending and reviewed records (org-wide).
- Filter by: department, employee, attendance type, status, date range.
- Can approve, reject, or override any record regardless of manager assignment.
- HR approval and Manager approval are both valid — they use the same status transition but the reviewer role is captured in `reviewedById`.

### 5.3 For SUPER_ADMIN

- Same as HR_ADMIN with full org-wide access.

### 5.4 For EMPLOYEE

- No access to the review list endpoints.
- Can view own attendance status via `GET /attendance/me`.
- Sees `reviewStatus` field: PENDING_REVIEW, APPROVED, REJECTED.
- Sees reviewer note on mobile when available.
- No approval controls.

---

## 6. Approval Status Model

### 6.1 Status Lifecycle

```
                  ┌────────────────────────┐
                  │      PENDING_REVIEW     │
                  └────────────┬───────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
     Manager approves                   Manager / HR rejects
     HR approves                               │
     SUPER_ADMIN approves                      │
              │                                 │
              ▼                                 ▼
          APPROVED                          REJECTED
```

### 6.2 Reviewer Identity

The `Attendance.reviewedById` field records the reviewing employee. After this change:

| Action | `reviewedById` | `reviewNote` content |
|--------|----------------|---------------------|
| Manager approves | Manager's employee ID | Optional note |
| HR approves | HR employee ID | Optional note |
| SUPER_ADMIN approves | SUPER_ADMIN employee ID | Optional note |
| Manager rejects | Manager's employee ID | Required reason (≥ 3 chars) |
| HR rejects | HR employee ID | Required reason (≥ 3 chars) |
| HR overrides a Manager-approved record | HR employee ID | Override reason |

HR/SUPER_ADMIN override must be distinguishable from Manager approval. The `reviewedById` already captures the reviewer's identity. The reviewer's role is captured in the audit log (`actorRole` field). No additional schema field is required for the first implementation.

### 6.3 Rejection Requirement

Rejection must include a reason (minimum 3 characters). This is already enforced by the existing `PATCH /attendance/offsite-review/:id/reject` endpoint. The requirement applies equally to Manager, HR_ADMIN, and SUPER_ADMIN rejection.

### 6.4 Existing `reviewStatus` Enum Reuse

The existing `AttendanceReviewStatus` enum covers the required states:
- `PENDING_REVIEW` — awaiting review (Manager or HR)
- `APPROVED` — approved by Manager, HR, or SUPER_ADMIN
- `REJECTED` — rejected (requires reason)

`AUTO_ACCEPTED` and `MISSING_CHECKOUT` are not relevant to this workflow.

---

## 7. API Impact (Spec — No Implementation)

### 7.1 `GET /attendance/offsite-review`

**Current:** SUPER_ADMIN, HR_ADMIN only.

**Target:**

| Role | Behavior |
|------|----------|
| SUPER_ADMIN | Org-wide results (unchanged) |
| HR_ADMIN | Org-wide results (unchanged) |
| MANAGER | Results filtered to managed department only |
| EMPLOYEE | 403 Forbidden |

**Expected filter additions:**
- `status` — filter by PENDING_REVIEW / APPROVED / REJECTED
- `department` — for HR; filter by department UUID
- `employeeId` — for HR; filter by employee UUID
- `type` — `offsite` (OFFSITE_PLANNED/UNPLANNED) | `mixed` (mixed checkout) | `all`

### 7.2 `PATCH /attendance/offsite-review/:id/approve`

**Current:** SUPER_ADMIN, HR_ADMIN only.

**Target:** Add MANAGER with department scope validation.

Guard sequence for MANAGER:
1. Verify caller is MANAGER with a `managedDepartment`.
2. Load the attendance record and its employee's `departmentId`.
3. Verify `employee.departmentId === approverEmployee.managedDepartment.id`.
4. Verify the record is not the Manager's own attendance.
5. Proceed with approval; record reviewer as Manager.

HR_ADMIN and SUPER_ADMIN bypass steps 2–4.

**Error responses:**

| HTTP | Condition |
|------|-----------|
| 403 | MANAGER with no managed department |
| 403 | MANAGER attempting to approve outside their department |
| 403 | MANAGER attempting to approve their own record |
| 403 | EMPLOYEE attempting to approve |
| 404 | Record not found |
| 409 | Record is not PENDING_REVIEW |

### 7.3 `PATCH /attendance/offsite-review/:id/reject`

Same RBAC changes and guard sequence as approve. Rejection reason required (≥ 3 chars).

### 7.4 Endpoint Security Rules Summary

| Rule | Enforcement |
|------|-------------|
| MANAGER cannot approve/reject outside their department | Service-layer scope check |
| MANAGER cannot approve/reject their own record | Service-layer self-review check |
| EMPLOYEE cannot call review APIs | Role guard (403) |
| Unauthenticated access | JWT guard (401) |
| Cross-department scope exposure | Service-layer query filter |
| Rejection without reason | DTO validation (400) |
| Missing record | Service-layer 404 |

---

## 8. Admin Web Impact (Spec — No Implementation)

### 8.1 Review Page Access

**Current:** `/attendance/offsite-review` is gated by `isAdmin()` — MANAGER cannot see it.

**Target:** Extend access to MANAGER. The page behavior differs by role:

| Role | Page behavior |
|------|--------------|
| MANAGER | Shows "รายการรออนุมัติของทีม/แผนก" — records scoped to their department |
| HR_ADMIN | Shows all records — org-wide view |
| SUPER_ADMIN | Same as HR_ADMIN |

### 8.2 Sidebar

The "ตรวจสอบนอกสถานที่" sidebar item (currently visible only to SUPER_ADMIN/HR_ADMIN) should become visible to MANAGER as well.

### 8.3 Filters

Add the following filters to the review page UI:
- Status: PENDING_REVIEW / APPROVED / REJECTED / ALL
- Department (HR/SUPER_ADMIN only)
- Employee name / code search
- Attendance type: Off-site full day / Company check-in → off-site checkout / All
- Date range

### 8.4 Reviewer Column

After implementation, the review table should display:
- Reviewer name (from `reviewedBy` relation)
- Reviewer role (from audit log or a future `reviewerRole` enrichment)
- Review timestamp (`reviewedAt`)

### 8.5 Privacy Constraint

Raw GPS coordinates (`checkInLatitude`, `checkInLongitude`, `checkOutLatitude`, `checkOutLongitude`) must never be displayed in the review UI — not for HR, not for MANAGER. Only distance (meters) and accuracy (meters) may be shown. This is already implemented in the existing `OffsiteReviewRecord` TypeScript type which excludes raw coordinates.

### 8.6 Approve/Reject UI for MANAGER

- Show "อนุมัติ" and "ปฏิเสธ" action buttons for PENDING_REVIEW records in MANAGER view.
- Rejection requires a reason (modal prompt).
- MANAGER sees only their department's records; approve/reject buttons for out-of-scope records must never appear (frontend scope filter matches backend scope filter).

---

## 9. Mobile Impact (Spec — No Implementation)

### 9.1 Employee Submission Flow

No change to the employee-facing submission flow. The same `POST /attendance/offsite/mixed-checkout-exception` endpoint is used. Full off-site clock-in/out flow is unchanged.

### 9.2 Pending Status Text

**Current text (State C mobile card):**
> "การเช็คเอาท์นอกสถานที่ถูกส่งแล้ว — รอ HR ตรวจสอบ"

**Target text:**
> "การเช็คเอาท์นอกสถานที่ถูกส่งแล้ว — รอหัวหน้างาน/HR ตรวจสอบ"

Or if the reviewer is known (future enhancement):
> "รอ [ชื่อหัวหน้างาน] ตรวจสอบ"

### 9.3 No Mobile Runtime Changes in This Spec

The mobile submission, GPS capture, and status card rendering flows do not require changes in this specification. The text update mentioned in §9.2 is a minor copy change, scoped to a future implementation task.

---

## 10. Audit and Privacy Impact

### 10.1 Audit Events

The following audit events must be written on every review action:

| Event | Trigger | Actor | Required metadata |
|-------|---------|-------|-------------------|
| `ATTENDANCE_OFFSITE_APPROVED` | Approve action succeeds | HR_ADMIN / SUPER_ADMIN / MANAGER | `attendanceId`, `actorRole`, `reviewerEmployeeId`, `employeeId`, `attendanceSource`, `date` |
| `ATTENDANCE_OFFSITE_REJECTED` | Reject action succeeds | HR_ADMIN / SUPER_ADMIN / MANAGER | same + `hasRejectReason: true` |

Both events already exist in the system (used by the existing HR approval flow). Extending them to include MANAGER actors requires no new event names.

### 10.2 Reviewer Role in Audit

The audit log already captures `actorRole` (the role of the user who performed the action). When a MANAGER approves, `actorRole = MANAGER` is recorded. This allows HR to distinguish Manager approvals from HR/SUPER_ADMIN approvals without requiring an additional database column.

### 10.3 Privacy Rules

| Data | Rule |
|------|------|
| Raw GPS coordinates | Never in audit log metadata, never in review UI |
| Distance from company (meters) | Safe to display and log |
| GPS accuracy (meters) | Safe to display and log |
| Work location name | Safe to display and log (employee-supplied text) |
| Off-site reason text | Safe to display and log (employee-supplied text) |
| Rejection reason | Safe to display and log |
| Reviewer identity (name, role) | Safe to display after review |

### 10.4 MANAGER Access to Location Data

MANAGER, when reviewing a record, may see:
- Distance from company at checkout (meters)
- GPS accuracy bucket at checkout (ACCEPTABLE / POOR)
- Work location name (human text, e.g., "สำนักงานลูกค้า / BTS พระโขนง")
- Off-site reason text

MANAGER must NOT see:
- Raw latitude/longitude
- Exact GPS coordinates

This is consistent with the privacy policy established in REQ-002C and carried through REQ-002F.

---

## 11. Fallback Rules

| Condition | Routing |
|-----------|---------|
| Employee has no `departmentId` set | Route to HR queue |
| Employee's department has no `managerId` assigned | Route to HR queue |
| The manager user is inactive (`isActive = false`) | Route to HR queue |
| Record belongs to the Manager themselves | Route to HR queue (no self-review) |
| MANAGER user has no `managedDepartment` | Route to HR queue (Manager receives 403 on attempt) |
| Department changes after submission | Scope review by employee's **current** `departmentId` at time of review |

### 11.1 Fallback Behavior in Practice

"Route to HR queue" means:
- The record appears in HR_ADMIN and SUPER_ADMIN review lists.
- No MANAGER sees the record.
- HR acts as the primary and only reviewer.

No special `routedTo` field is required in the schema for the first implementation. HR visibility is unconditional — they always see all records. Fallback is implicit: if no Manager has scope over the record, only HR sees it.

### 11.2 Recommendation — Future Snapshot

A future implementation should consider adding `submitterDepartmentId` to the `Attendance` model, snapshotted at submission time. This would:
- Ensure the review scope remains stable even if an employee is transferred.
- Provide a clean audit trail linking the record to the department/manager at the time of submission.
- Prevent edge cases where a transfer routes a record to a new manager who has no context.

This is deferred to a follow-up task.

---

## 12. Acceptance Criteria (for Future Implementation Task)

### 12.1 MANAGER Access

- [ ] MANAGER with a managed department can call `GET /attendance/offsite-review` and receive records for their department only.
- [ ] MANAGER with a managed department can approve `PATCH .../approve` for records in their department.
- [ ] MANAGER with a managed department can reject `PATCH .../reject` for records in their department.
- [ ] MANAGER receives HTTP 403 when attempting to approve/reject records in another department.
- [ ] MANAGER receives HTTP 403 when attempting to approve/reject their own attendance record.
- [ ] MANAGER with no managed department receives HTTP 403 on all approve/reject actions.
- [ ] MANAGER sees the off-site review page in the Admin Web sidebar.
- [ ] MANAGER review page is scoped to their department (no cross-department records shown).

### 12.2 HR_ADMIN / SUPER_ADMIN Access

- [ ] HR_ADMIN can view all pending and reviewed records (org-wide), unchanged.
- [ ] HR_ADMIN can approve/reject all records, unchanged.
- [ ] SUPER_ADMIN same as HR_ADMIN.
- [ ] HR can override or re-review a Manager-approved or rejected record.

### 12.3 EMPLOYEE Isolation

- [ ] EMPLOYEE cannot call `GET /attendance/offsite-review` (receives 403).
- [ ] EMPLOYEE cannot call `PATCH .../approve` or `PATCH .../reject` (receives 403).
- [ ] EMPLOYEE can still view own records via `GET /attendance/me` with `reviewStatus`.

### 12.4 Existing Flow Integrity

- [ ] Full off-site check-in/out flow (OFFSITE_PLANNED, OFFSITE_UNPLANNED) still works end-to-end.
- [ ] Mixed checkout exception flow (REQ-002F) still works end-to-end.
- [ ] Normal ONSITE attendance (check-in and check-out inside geofence) is unchanged.
- [ ] Mobile pending status card still renders correctly.
- [ ] Existing HR admin approval flow still works (no regression).

### 12.5 Audit and Privacy

- [ ] Audit log records `actorRole=MANAGER` when a Manager approves or rejects.
- [ ] Audit log records `actorRole=HR_ADMIN` when HR approves or rejects.
- [ ] Raw GPS coordinates are not exposed in the review UI (neither Manager view nor HR view).
- [ ] Rejection requires a reason of at least 3 characters.

### 12.6 Fallback

- [ ] A record whose employee has no department is visible only to HR/SUPER_ADMIN.
- [ ] A record whose department has no assigned Manager is visible only to HR/SUPER_ADMIN.
- [ ] A Manager cannot see or act on records that fall into the HR queue.

---

## 13. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| MANAGER incorrectly sees cross-department records | Medium | Backend query filter applied at service layer before data is returned; frontend filter alone is not sufficient |
| MANAGER approves own attendance | Low | Service-layer self-review check: compare `attendance.employeeId === approverEmployee.id` → 403 |
| Employee transferred after submission, creating ambiguous scope | Low-Medium | First implementation: scope by current `departmentId`; future: snapshot `departmentId` at submission time |
| Department has no assigned Manager — record silently stays in backlog | Medium | Fallback to HR queue is explicit; HR always sees all records; monitoring/alert on long-pending records deferred |
| Manager inactive after assignment | Low | Fallback to HR queue; HR visibility is unconditional |
| HR needs to override a Manager decision | Low | HR_ADMIN and SUPER_ADMIN can always approve/reject regardless of prior decision |
| Confusion between HR approval and Manager approval in reporting | Medium | Audit log captures `actorRole`; reviewer identity captured in `reviewedById`; downstream reports must use `actorRole` to distinguish |
| Raw GPS exposure through API response | Low | Existing `OffsiteReviewRecord` TypeScript type excludes GPS fields; backend must not add them for MANAGER responses either |
| MANAGER role misused to access attendance across org | Low | Service-layer scope check enforced; list endpoint returns only managed-department records |
| Rejection reason not captured for Manager rejections | Low | Existing validation enforces ≥ 3 chars reason; applies equally to MANAGER, HR_ADMIN, SUPER_ADMIN |
| Privacy risk: Manager learning employee's exact GPS location | Low | Only distance and accuracy displayed; raw coordinates excluded from all review responses |

---

## 14. Explicit Non-Goals

The following are explicitly out of scope for REQ-002G:

- **No runtime implementation in this task.** All changes above are specification only.
- **No database migration.** No new columns, tables, or enum values are introduced.
- **No backend code changes.** AttendanceService, AttendanceController, and guards are not modified.
- **No Admin Web code changes.** The React/Next.js off-site review page is not modified.
- **No mobile code changes.** The mobile status text update is deferred to implementation.
- **No approval notification system.** Push/email notification for Manager when a record needs review is out of scope.
- **No direct manager relation implementation.** `Employee.managerId` scoping is evaluated but not implemented.
- **No payroll integration.** Attendance approval status and payroll reporting linkage is out of scope.
- **No background GPS tracking.** GPS is captured only at submission time (unchanged).
- **No change to REQ-002H.** REQ-002H covers Manager flexible attendance policy, which is a separate concern.
- **No resubmission logic for employees.** If rejected, employee must contact HR (unchanged from REQ-002F behavior).

---

## 15. Relationship to REQ-002H

**REQ-002G** (this spec) and **REQ-002H** (Manager Flexible Attendance Policy) are separate requirements:

| | REQ-002G | REQ-002H |
|--|----------|----------|
| **Who is being reviewed** | Employee's off-site attendance | Manager's own attendance |
| **Who approves** | Manager approves employee's records | HR reviews Manager's own records |
| **Direction** | Manager → Employee | HR → Manager |
| **Flows covered** | Full off-site, mixed checkout exception | Manager-specific flexible clock-in/out |
| **RBAC impact** | Add MANAGER to review endpoints (dept-scoped) | Manager-specific review endpoint or HR visibility |
| **Status** | SPEC ONLY (this document) | Not yet specified |

The two requirements do not conflict. REQ-002G changes who reviews employee records. REQ-002H will define a policy for reviewing Manager's own attendance — that is a separate workflow.

---

## 16. Implementation Approach Summary

When implementation begins (in a separate task), the recommended sequence is:

| Subtask | Scope | Risk | Reuses |
|---------|-------|------|--------|
| T-001: Backend — extend role guard | Add MANAGER to `GET /attendance/offsite-review` with dept-scoped WHERE | LOW | ADR-023 scoping pattern |
| T-002: Backend — manager scope in approve | Add dept-scope check to `PATCH .../approve` | LOW | ADR-023 service pattern |
| T-003: Backend — manager scope in reject | Add dept-scope check to `PATCH .../reject` | LOW | ADR-023 service pattern |
| T-004: Admin Web — expose page to MANAGER | Update `isAdmin()` gate; add MANAGER-scoped list | MEDIUM | Existing review page |
| T-005: Admin Web — UI filters | Department/type/status filters | LOW | Existing filter patterns |
| T-006: Mobile — update text copy | "รอหัวหน้างาน/HR ตรวจสอบ" | LOW | State C card |
| T-007: Tests — backend | Manager scope, self-review, fallback, 403 cases | MEDIUM | Existing test patterns |
| T-008: Audit verification | Confirm `actorRole=MANAGER` written on approval | LOW | Existing audit service |

Safe order: T-001 → T-002 → T-003 (backend) → T-007 (tests) → T-004 → T-005 (web) → T-006 (mobile) → T-008 (audit)

---

## Open Decisions (for product/user approval before implementation)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| OD-1 | MANAGER list scope: org-wide (read) or dept-only (read)? | (a) Org-wide list, dept-scoped approve/reject — matches leave/off-site pattern; (b) Dept-only list — tighter privacy | (b) Dept-only list for off-site attendance given location context |
| OD-2 | Self-review: can Manager approve their own attendance? | (a) Yes if they are also in a dept they manage; (b) No — always routes to HR | (b) No self-review for integrity |
| OD-3 | HR override: require a reason when overriding Manager decision? | (a) Yes, mandatory override reason; (b) Optional | (a) Require reason for audit trail clarity |
| OD-4 | Department snapshot: snapshot `departmentId` at submission time? | (a) Defer — scope by current dept; (b) Implement now — add `submitterDepartmentId` | (a) Defer — no schema migration in this spec |
| OD-5 | Notification: notify Manager when a record requires their review? | (a) No (first impl); (b) In-app badge; (c) Push notification | (a) Defer notification to a later task |
