# Department Module

## Purpose

Manages the organisational unit structure. Departments group employees and positions. They are a reference entity used by Employees, Positions, and the Dashboard.

## Module Path

`apps/api/src/departments/`

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /departments | ✅ | Any | Paginated department list |
| GET | /departments/:id | ✅ | Any | Single department by UUID |
| POST | /departments | ✅ | SUPER_ADMIN, HR_ADMIN | Create department |
| PATCH | /departments/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update department name/description |
| DELETE | /departments/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Hard delete (safe — blocked if in use) |

## Query Parameters (GET /departments)

`page` · `limit` · `search`

## Business Rules

- **Safe hard delete**: `DELETE /departments/:id` is blocked (409) if any employees or positions still reference the department. The department must be empty before deletion.
- **Department name is unique**: duplicate returns 409
- **Read access to all roles**: all authenticated users can view departments (org directory by design)

## Known Limitations

- No parent/child department hierarchy — flat structure only
- No manager assignment on department (future: `Department.managerId`)

## Related ADRs

- [[ADR-006 RBAC]]
- [[ADR-007 API Standards]]

## Related Notes

- [[Employee Module]]
- [[Position Module]]
- [[API Route Index]]

#domain #department #backend-v1
