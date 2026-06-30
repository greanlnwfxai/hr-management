# CTO Summary

## Step
REQ-002G-SPEC — Manager-Based Off-site Attendance Approval: Specification

## Status
SPEC ONLY / PASS

## Scope

Business and technical specification for changing off-site attendance approval ownership from HR-only to Manager-first review. Covers both existing off-site attendance flows:

1. **Full off-site:** Employee plans and requests off-site, clocks in outside geofence (`attendanceSource = OFFSITE_PLANNED | OFFSITE_UNPLANNED`).
2. **Mixed checkout exception:** ONSITE employee (geofence check-in) leaves during the day and submits a checkout exception (`attendanceSource = COMPANY_GEOFENCE`, `reviewStatus = PENDING_REVIEW`) per REQ-002F.

This task is documentation only. No runtime code, schema, Docker configuration, or infrastructure was changed.

## Files Created

| File | Purpose |
|------|---------|
| `docs/REQ_002G_MANAGER_BASED_OFFSITE_ATTENDANCE_APPROVAL_SPEC.md` | Full spec: objective, current state, target policy, manager ownership model, review queue behavior, approval status model, API impact, Admin Web impact, mobile impact, audit/privacy, fallback rules, acceptance criteria, risks, non-goals, REQ-002H distinction |
| `docs/CTO_SUMMARY_REQ_002G_SPEC.md` | This document |

## Files Modified

| File | Change |
|------|--------|
| `HR-Knowledge/07-BUSINESS-RULES/Attendance Rules.md` | Added "Off-site Attendance Review — Manager Approval (Planned)" section as a forward reference to REQ-002G spec |

## Runtime Code Changed
None.

## Business Decision

**Manager-first approval for off-site attendance.**

Employees in a department with an assigned Manager should have their off-site attendance reviewed by that Manager, not exclusively by HR. HR retains full visibility and override authority. HR acts as governance and fallback, not as the only normal approver.

This aligns with how leave approval and off-site request approval already work: Manager approves for their department, HR has org-wide authority (ADR-023).

## Current Behavior (Pre-Change)

| Endpoint | Current allowed roles |
|----------|-----------------------|
| `GET /attendance/offsite-review` | SUPER_ADMIN, HR_ADMIN |
| `PATCH /attendance/offsite-review/:id/approve` | SUPER_ADMIN, HR_ADMIN |
| `PATCH /attendance/offsite-review/:id/reject` | SUPER_ADMIN, HR_ADMIN |

- MANAGER: no access to any off-site review endpoint.
- Admin Web review page blocked to MANAGER by `isAdmin()` check.
- Mobile pending card shows "รอ HR ตรวจสอบ" only.

## Recommended Implementation Approach

**Use `Department.managerId` scoping (Option A)** — the established pattern per ADR-023.

| Pattern | Scope check |
|---------|-------------|
| MANAGER approve/reject | `approverEmployee.managedDepartment.id === attendance.employee.departmentId` |
| MANAGER list | WHERE `employee.departmentId = approverEmployee.managedDepartment.id` |
| HR/SUPER_ADMIN | No scope restriction (unchanged) |

No schema migration is required. All needed fields exist:
- `Department.managerId` (FK to Employee, unique per dept)
- `Employee.managedDepartment` (back-relation)
- `Employee.departmentId`
- `Attendance.reviewedById`, `reviewedAt`, `reviewNote`

Reuses the exact mechanism implemented in:
- `LeaveService.approve()` / `LeaveService.reject()` (ADR-023)
- `OffSiteService.approve()` / `OffSiteService.reject()` (ADR-023)

## RBAC Impact

| Role | Before | After |
|------|--------|-------|
| SUPER_ADMIN | Full access | Full access (unchanged) |
| HR_ADMIN | Full access | Full access (unchanged) |
| MANAGER | No access to review | Dept-scoped access: list own dept, approve/reject own dept only |
| EMPLOYEE | No access | No access (unchanged) |

New guard conditions for MANAGER approve/reject:
- 403 if no managed department
- 403 if attendance employee is in a different department
- 403 if attempting to approve/reject own attendance record

## Privacy and Audit Impact

| Area | Assessment |
|------|-----------|
| Raw GPS in review UI | Still excluded — existing `OffsiteReviewRecord` type excludes raw coordinates; MANAGER must not see raw GPS |
| GPS safe fields | Distance (meters) and accuracy (meters) safe to display |
| Reviewer identity | `reviewedById` captures reviewer; `actorRole` in audit log distinguishes Manager from HR approvals |
| Audit event | Existing `ATTENDANCE_OFFSITE_APPROVED` / `ATTENDANCE_OFFSITE_REJECTED` events reused; `actorRole=MANAGER` distinguishes from HR approval |
| HR override auditability | `actorRole=HR_ADMIN` / `SUPER_ADMIN` recorded when HR reviews a Manager-approved record |
| Rejection reason | Still required (≥ 3 chars) for all roles |

## Fallback Rules

| Condition | Result |
|-----------|--------|
| Employee has no department | HR queue |
| Department has no assigned Manager | HR queue |
| Manager user is inactive | HR queue |
| Record is Manager's own attendance | HR queue (no self-review) |
| Manager has no `managedDepartment` | HR queue; 403 if Manager attempts to approve |

HR always sees all records unconditionally. Fallback is implicit: if no Manager has scope, only HR sees the record.

## Risks / Open Decisions

**Open decisions requiring product approval before implementation:**

| # | Decision | Recommendation |
|---|----------|----------------|
| OD-1 | MANAGER list scope: org-wide or dept-only? | Dept-only (tighter privacy for location context) |
| OD-2 | Can Manager approve their own attendance? | No — always routes to HR |
| OD-3 | Is an override reason required when HR overrides a Manager decision? | Yes, for audit clarity |
| OD-4 | Snapshot `departmentId` at submission time? | Defer — no schema migration in this spec |
| OD-5 | Notify Manager when records require review? | Defer to later task |

**Key risks:**

| Risk | Mitigation |
|------|------------|
| Cross-department data exposure | Backend query filter is authoritative — frontend filter alone insufficient |
| Manager approving own attendance | Self-review check at service layer |
| Department transfer after submission | First impl: scope by current `departmentId`; future: snapshot |
| HR override audit trail | Audit `actorRole` distinguishes all reviewer types |
| Raw GPS in MANAGER response | Existing type exclusion covers this; must be verified in implementation |

## Verification Result

```
git diff --check     — run after writing (whitespace only, no trailing spaces)
No build required    — docs-only task; no source code changed
```

## Issues Found
None.

## Risk
Low — specification-only document. No runtime artifacts changed.

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | No endpoints added or changed in this task. Future implementation will extend existing JWT-guarded endpoints. |
| RBAC impact | Spec defines MANAGER scope addition to review endpoints. No RBAC change implemented yet. Future implementation must enforce dept-scope at service layer, not only frontend. |
| Data privacy impact | Spec explicitly prohibits raw GPS in MANAGER review view. Consistent with existing `OffsiteReviewRecord` type exclusion. No new PII exposure in this task. |
| Password/token/hash impact | None. |
| Mobile security impact | No mobile code changes. Mobile text copy update deferred to implementation task. |
| Dependency/advisory impact | No packages added. |
| Secrets/logging check | No credentials, tokens, or GPS coordinates referenced in documentation. |
| New endpoints protected | None (spec only). Future implementation must add MANAGER scope check to three existing endpoints. |
| Self-review risk | Spec defines explicit prohibition: Manager cannot approve own attendance (routes to HR queue). Must be enforced at service layer in implementation. |
| Cross-dept scope risk | Spec defines service-layer scope check as authoritative. Frontend filter is a UX enhancement, not a security control. |
| Risk level | LOW (spec only) |
| Security decision | PASS |

## Decision
PASS

## Next Step

**REQ-002G — Implementation (separate task)**

When approved, the implementation task should:
1. Extend `GET /attendance/offsite-review` to allow MANAGER with dept-scoped filtering.
2. Add MANAGER dept-scope validation to `PATCH .../approve` and `PATCH .../reject`.
3. Update Admin Web to expose the review page to MANAGER with dept-scoped rendering.
4. Update mobile pending text from "รอ HR ตรวจสอบ" to "รอหัวหน้างาน/HR ตรวจสอบ".
5. Write tests covering: MANAGER scope, self-review prohibition, fallback, 403 cases.
6. Verify audit log writes `actorRole=MANAGER` correctly.

Resolve open decisions OD-1 through OD-5 with the product owner before starting implementation.

## Recommended Commit Message
```
docs(attendance): add manager-based off-site approval spec

REQ-002G specification for changing off-site attendance review ownership
from HR-only to Manager-first. Covers both full off-site and mixed
checkout exception flows.

Spec includes: current state, target RBAC policy, Department.managerId
scoping model (consistent with ADR-023), review queue behavior, approval
status model, API/web/mobile impact, fallback rules, acceptance criteria,
risks, open decisions, and REQ-002H distinction.

No runtime code changes. Schema migration not required for first impl.

Files created:
- docs/REQ_002G_MANAGER_BASED_OFFSITE_ATTENDANCE_APPROVAL_SPEC.md
- docs/CTO_SUMMARY_REQ_002G_SPEC.md

Files modified:
- HR-Knowledge/07-BUSINESS-RULES/Attendance Rules.md (forward reference)
```

Recommended tag after PASS:
`v1.2.56-manager-offsite-approval-spec`
