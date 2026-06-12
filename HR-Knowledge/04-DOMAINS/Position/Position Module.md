# Position Module

## Purpose

Manages job positions within departments. A Position belongs to a Department and can be held by multiple employees. It is a reference entity used by the Employee module.

## Module Path

`apps/api/src/positions/`

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /positions | ✅ | Any | Paginated position list |
| GET | /positions/:id | ✅ | Any | Single position by UUID |
| POST | /positions | ✅ | SUPER_ADMIN, HR_ADMIN | Create position |
| PATCH | /positions/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update position title/department |
| DELETE | /positions/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Safe delete (blocked if employees use it) |

## Query Parameters (GET /positions)

`page` · `limit` · `search` · `departmentId`

## Business Rules

- **Safe delete**: `DELETE /positions/:id` is blocked (409) if any employees still hold this position
- **Position belongs to a department**: every position has a `departmentId`
- **Position title + departmentId should be unique**: enforced at application layer
- **Read access to all roles**: all authenticated users can browse positions (org directory)

## Known Limitations

- No seniority levels or position hierarchy
- No salary band or grade attached to position

## Related ADRs

- [[ADR-006 RBAC]]
- [[ADR-007 API Standards]]

## Related Notes

- [[Department Module]]
- [[Employee Module]]
- [[API Route Index]]

#domain #position #backend-v1
