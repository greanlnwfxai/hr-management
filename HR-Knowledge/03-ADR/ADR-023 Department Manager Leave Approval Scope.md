# ADR-023 — Department Manager Leave Approval Scope

**Status:** Accepted
**Date:** 2026-06-23
**Tasks:** T-071
**Related tags:** `v1.2.0-employee-self-service-offsite`
**Implementation reference:** commit `b611f95`

---

## Context

Before v1.2.0, MANAGER could access `GET /leave`, `PATCH /leave/:id/approve`, and `PATCH /leave/:id/reject` without any department-level filtering. A MANAGER could view all organization leave requests and approve or reject leave for any employee in any department. This was a known limitation documented in `Current Status.md`, `RBAC Rules.md`, and `Leave Rules.md` as "no manager-to-subordinate scoping."

The same unconstrained access applied to the new off-site request workflow introduced in the same release.

The risk: a MANAGER in Department A could approve (and thus deduct balance from) leave for an employee in Department B.

## Decision

Scope MANAGER leave approval and rejection by the department the manager manages, identified via the `Department.managerId` relation (the `managedDepartment` back-relation on `Employee`).

The scope check applies to:
- `PATCH /leave/:id/approve`
- `PATCH /leave/:id/reject`
- `PATCH /off-site/:id/approve`
- `PATCH /off-site/:id/reject`

The scope check does **not** apply to:
- `GET /leave` (list) — MANAGER still sees org-wide leave requests
- `GET /leave/:id` — MANAGER can read any leave request
- `GET /off-site` (list) — MANAGER still sees org-wide off-site requests
- `GET /off-site/:id` — MANAGER can read any off-site request

### Scoping Mechanism

At approve/reject time, the service fetches the approving employee's `managedDepartment`:

```ts
const approverEmp = await this.prisma.employee.findFirst({
  where: { userId },
  select: { id: true, managedDepartment: { select: { id: true } } },
});
```

The key is `Department.managerId` — the field on the Department model, not `Employee.managerId` (the employee-to-employee reporting hierarchy). The two relations are distinct:
- `Employee.managerId` → employee's line manager (person-to-person hierarchy)
- `Department.managerId` → the employee who is designated manager of that department

Approval proceeds only if:

```
approverEmp.managedDepartment.id === requestEmployee.departmentId
```

If a MANAGER does not manage any department (`managedDepartment` is null), or the request employee belongs to a different department, the operation returns `403 Forbidden` with the appropriate Thai message.

### Forbidden Messages (exact)

| Context | Message |
|---|---|
| Leave approve, MANAGER scope fail | `คุณสามารถอนุมัติลาได้เฉพาะพนักงานในแผนกของคุณเท่านั้น` |
| Leave reject, MANAGER scope fail | `คุณสามารถปฏิเสธลาได้เฉพาะพนักงานในแผนกของคุณเท่านั้น` |
| Off-site approve, MANAGER scope fail | `คุณสามารถอนุมัติได้เฉพาะพนักงานในแผนกของคุณเท่านั้น` |
| Off-site reject, MANAGER scope fail | `คุณสามารถปฏิเสธได้เฉพาะพนักงานในแผนกของคุณเท่านั้น` |

### SUPER_ADMIN and HR_ADMIN

The scope check is only applied to `MANAGER` role. SUPER_ADMIN and HR_ADMIN can approve and reject leave and off-site requests for any employee across all departments.

### Department Manager Assignment

The `Department.managerId` field was present in the schema from v1.0, but the web UI for assigning it was not previously exposed. v1.2.0 adds:
- Manager column in the web `/departments` list
- Manager dropdown in the department form (PATCH /departments/:id)
- API: `GET /departments` and `GET /departments/:id` responses now include `managerId` and `manager` fields

## Consequences

Positive consequences:

- MANAGER cannot approve or reject leave (or off-site requests) for employees outside their department
- The check is enforced at the service layer, not only the UI — backend RBAC remains authoritative
- SUPER_ADMIN and HR_ADMIN retain full cross-department approval authority
- The department manager assignment is now visible and editable in the web UI

Accepted tradeoffs:

- List visibility (`GET /leave`, `GET /off-site`) remains org-wide for MANAGER — scoping is approval/rejection only
- A MANAGER with no managed department cannot approve any leave or off-site request at all (they will always receive 403)
- There is still no per-department scoping for the leave list or leave balance list

## Alternatives Considered

### 1. Also scope GET /leave list by manager's department

Considered for a future iteration. For v1.2.0, the priority was scoping the write path (approve/reject) which has financial and compliance impact (balance deduction). The read path can be scoped in a follow-up.

### 2. Use Employee.managerId (reporting hierarchy) for scoping

Rejected. `Employee.managerId` is an employee-to-employee link that does not necessarily reflect organizational authority. The correct authority signal is `Department.managerId`, which designates who manages that department.

### 3. Dedicated MANAGERs-only leave list endpoint

Deferred. Would require a separate query branch filtering by `managedDepartment`. Low priority compared to the approve/reject constraint.

## Security Considerations

- Auth impact: existing guarded endpoints extended with department-ownership check
- RBAC impact: MANAGER role no longer has org-wide approve/reject authority; now department-scoped
- Data privacy impact: none — no new PII exposed
- Approval scope check happens in the service before any state mutation
- The forbidden response does not reveal the target employee's department to the unauthorized approver

## Operational Notes

- `Department.managerId` must be assigned in the web `/departments` UI for a MANAGER to be able to approve leave/off-site for their employees
- A MANAGER user whose linked employee is not set as `managedDepartment` on any department will receive 403 on all approve/reject actions
- The scope check is implemented in both `LeaveService.approve()`, `LeaveService.reject()`, `OffSiteService.approve()`, and `OffSiteService.reject()`

## Related Notes

- [[ADR-006 RBAC]]
- [[ADR-011 Leave Workflow]]
- [[ADR-022 Off-site Work Request Workflow]]
- [[Department Module]]
- [[Leave Request Module]]
- [[Leave Rules]]
- [[RBAC Rules]]

#adr #rbac #leave #manager #department #security
