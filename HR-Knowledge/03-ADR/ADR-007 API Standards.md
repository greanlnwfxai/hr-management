# ADR-007: API Design Standards

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Apply uniform conventions across all 8 backend modules.

## Route Naming

- Plural nouns: `/employees`, `/departments`, `/positions`, `/attendance`, `/leave-balances`
- Exception: Leave Requests use `/leave` (not `/leave-requests`) — established convention, breaking to change
- Action sub-routes: `/leave/request`, `/leave/:id/approve`, `/attendance/clock-in`
- Self-service: `/leave/me`, `/leave-balances/my`, `/attendance/me`

## Authentication

- All routes require `Authorization: Bearer <token>` except `GET /health` and `POST /auth/login`
- `@UseGuards(JwtAuthGuard, RolesGuard)` applied at **controller class level**
- `@Roles(...)` applied at **method level** for role restrictions

## Request Validation

- All bodies validated via DTOs with `class-validator`
- GlobalValidationPipe: `whitelist: true, transform: true`
  - `whitelist: true` — strips undeclared fields silently
  - `transform: true` — coerces query string numbers
- UUID params: `ParseUUIDPipe`
- Enum fields: `@IsEnum()` from `src/common/enums.ts`

## Paginated Response Shape

```json
{
  "data": [...],
  "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0 }
}
```

## HTTP Status Codes

| Code | Usage |
|---|---|
| 200 | GET, PATCH success |
| 201 | POST create |
| 400 | Validation error, business rule violation |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but wrong role or ownership |
| 404 | Not found |
| 409 | Conflict (duplicate, overlap) |
| 422 | Unprocessable (negative balance) |

## Select Projections

Services use named `select` objects (e.g., `EMPLOYEE_SELECT`, `LEAVE_SELECT`) to prevent over-fetching and data leakage.

## Source

`docs/adr/ADR-007-api-standards.md`

## Related Notes

- [[API Route Index]]
- [[Backend v1 Architecture]]
- [[ADR Index]]

#adr #api #backend-v1
