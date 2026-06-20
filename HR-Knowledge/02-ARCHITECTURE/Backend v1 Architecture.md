# Backend v1 Architecture

Historical snapshot note:
- This note describes the original backend v1 architecture baseline.
- It is not the full current-platform inventory for `v1.1.31`.
- For the current cross-platform state, see [[Platform State v1.1.31]] and [[API Route Index]].

## Completed Modules

| Module | Path | Endpoints | Step |
|---|---|---|---|
| Auth | `src/auth/` | 2 | T-005–015 |
| Employee | `src/employees/` | 5 | T-005–015 |
| Department | `src/departments/` | 5 | T-016 |
| Position | `src/positions/` | 5 | T-017 |
| Attendance | `src/attendance/` | 5 | T-018 |
| Leave Request | `src/leave/` | 6 | T-019 |
| Leave Balance | `src/leave-balance/` | 5 | T-020 |
| Dashboard | `src/dashboard/` | 1 | T-021 |
| Health | `health.controller.ts` | 1 | — |

**Historical backend v1 total: 30 endpoints + GET /health**

## Module Responsibility Summary

| Module | Responsibility |
|---|---|
| **Auth** | JWT login, token validation, `@CurrentUser()` decorator, guards |
| **Employee** | Employee CRUD, soft delete (status=INACTIVE), org directory |
| **Department** | Department CRUD, safe hard delete (blocked if employees exist) |
| **Position** | Position CRUD, safe delete (blocked if employees use it) |
| **Attendance** | Clock-in/out with Bangkok timezone LATE rule, paginated history |
| **Leave Request** | Submit leave, overlap check, approve (with balance deduction), reject |
| **Leave Balance** | Per-employee leave quota, entitlement tracking, used/remaining days |
| **Dashboard** | Aggregated read-only HR snapshot via 19 parallel Prisma queries |

## Guard Pattern

All controllers follow this pattern:

```typescript
@Controller('resource')
@UseGuards(JwtAuthGuard, RolesGuard)     // class-level: covers all routes
export class ResourceController {
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)  // method-level role restriction
  findAll() {}

  @Get('me')   // no @Roles = any authenticated user
  findMy() {}
}
```

## Paginated Response Shape

All list endpoints return:

```json
{
  "data": [...],
  "meta": {
    "total": 10,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

## Dashboard Design (Read-Only)

The dashboard is intentionally read-only. It runs 19 Prisma queries in parallel via `Promise.all` and aggregates:

- Employee counts by status (ACTIVE, INACTIVE, RESIGNED)
- Department + position counts
- Today's attendance counts (PRESENT, LATE, ABSENT, clocked-in, clocked-out) using Bangkok date
- Leave request counts by status (PENDING, APPROVED, REJECTED)
- Low leave balance count (remaining ≤ 3 days)
- Recent 5 records from employees, attendance, and leave requests

`LOW_BALANCE_THRESHOLD = 3` days remaining.

## API Contract Stability

As of Backend v1.0, the API contract is **stable**:

- Route paths, HTTP methods, and response shapes are documented in `docs/API_ROUTES.md`
- No breaking changes expected before frontend development completes
- The 3 pending security hardening items (JWT secret, CORS, DB credentials) do not change the API contract

## Known Design Patterns to Follow

1. **Flat module layout** — new features go in `src/<feature>/`, not `src/modules/`
2. **Runtime-safe enums** — import from `src/common/enums.ts`, never from `@prisma/client` in DTOs
3. **Explicit select objects** — name them `FEATURE_SELECT` to prevent over-fetching and data leakage
4. **Route ordering** — declare `/me` or `/my` before `/:id` to prevent NestJS routing conflicts
5. **Ownership checks in service layer** — not in guards, not in controllers

## Related Notes

- [[System Architecture]]
- [[API Route Index]]
- [[Database Overview]]
- [[ADR Index]]

#hr-management #backend-v1 #architecture
