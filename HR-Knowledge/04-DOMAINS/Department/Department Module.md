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

## Manager Assignment (v1.2.0)

Departments support a designated manager via `Department.managerId`. The field was in the schema from v1.0; the web UI and API response exposure were added in v1.2.0.

- Web `/departments` page shows a manager column
- Department form includes a manager dropdown (assign or clear)
- `GET /departments` and `GET /departments/:id` responses include `managerId` and `manager` fields
- `PATCH /departments/:id` accepts `managerId` to assign a manager

The designated manager gains department-scoped leave and off-site request approve/reject authority. See [[ADR-023 Department Manager Leave Approval Scope]] and [[RBAC Rules]].

## Known Limitations

- No parent/child department hierarchy — flat structure only

## Related ADRs

- [[ADR-006 RBAC]]
- [[ADR-007 API Standards]]

## Related Notes

- [[Employee Module]]
- [[Position Module]]
- [[API Route Index]]

#domain #department #backend-v1
