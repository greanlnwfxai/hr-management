# Employee Module

## Purpose

Manages the employee directory — the central HR data record. Employees are linked 1-to-1 with `User` accounts via `Employee.userId`. All attendance and leave modules reference `Employee.id`.

## Module Path

`apps/api/src/employees/`

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /employees | ✅ | Any | Paginated employee list with filters |
| GET | /employees/:id | ✅ | Any | Single employee by UUID |
| POST | /employees | ✅ | SUPER_ADMIN, HR_ADMIN | Create employee |
| PATCH | /employees/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update employee fields |
| DELETE | /employees/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Soft delete (sets status=INACTIVE) |

## Query Parameters (GET /employees)

`page` · `limit` · `search` (name/code) · `status` · `departmentId` · `positionId`

## Business Rules

- **Soft delete only**: `DELETE /employees/:id` sets `status = INACTIVE`, does not remove the record
- **Employee code and email are unique**: duplicate returns 409
- **Org directory access**: `GET /employees` and `GET /employees/:id` are accessible to all authenticated roles including `EMPLOYEE` — this is by design (org directory)
- **User link**: an `Employee` record is linked to a `User` via `Employee.userId`. Many features (leave request, clock-in) require this link

## Status Enum

`ACTIVE` · `INACTIVE` · `RESIGNED`

## Known Limitations

- No hard delete — records are never purged from the database
- Any authenticated role can read all employee data (including across departments)
- No department-scoped filtering for MANAGER role

## Related ADRs

- [[ADR-006 RBAC]]
- [[ADR-007 API Standards]]

## Related Notes

- [[Department Module]]
- [[Position Module]]
- [[API Route Index]]
- [[RBAC Rules]]

#domain #employee #backend-v1
