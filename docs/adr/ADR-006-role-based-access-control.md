# ADR-006: Role-Based Access Control (RBAC)

## Status
Accepted

## Date
2026-06-12

## Context
The HR Management system serves users with different levels of authority: administrators who manage the full system, HR staff who manage employee records and leave, managers who need visibility into their teams, and employees who use self-service features. A simple boolean `isAdmin` flag is insufficient. A structured role system is needed so that each endpoint can be protected at the appropriate level without duplicating logic.

## Decision
Use a **four-role RBAC model** implemented via NestJS guards and metadata decorators, backed by a `UserRole` enum stored on the `User` model.

### Role definitions

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Full system access; can perform all operations across all modules |
| `HR_ADMIN` | Manage employees, leave, attendance, balances; approve/reject leave |
| `MANAGER` | Operational visibility plus leave approval/rejection access; still cannot manage employee master data |
| `EMPLOYEE` | Self-service only: clock in/out, view own attendance, submit and view own leave |

### Implementation pattern

All feature module controllers follow this pattern:

```typescript
@Controller('resource')
@UseGuards(JwtAuthGuard, RolesGuard)           // 1. JWT validates token
export class ResourceController {              //    RolesGuard reads @Roles metadata
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)  // 2. Admin-only list
  findAll() { ... }

  @Get('me')                                   // 3. No @Roles = any authenticated user
  findMy(@CurrentUser() user) { ... }

  @Get(':id')                                  // 4. Ownership check in service layer
  findOne(@CurrentUser() user) { ... }
}
```

### Current RBAC matrix

| Endpoint group | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| POST /auth/login | ✅ (public) | ✅ | ✅ | ✅ |
| GET /auth/me | ✅ | ✅ | ✅ | ✅ |
| GET /employees, /departments, /positions | ✅ | ✅ | ✅ | ✅ |
| POST/PATCH/DELETE /employees, /departments, /positions | ✅ | ✅ | ❌ | ❌ |
| GET /attendance (admin list) | ✅ | ✅ | ❌ | ❌ |
| POST /attendance/clock-in|out | ✅ | ✅ | ✅ | ✅ |
| GET /attendance/me | ✅ | ✅ | ✅ | ✅ |
| POST /leave/request | ✅ | ✅ | ✅ | ✅ |
| GET /leave (admin list) | ✅ | ✅ | ✅ | ❌ |
| GET /leave/me | ✅ | ✅ | ✅ | ✅ |
| PATCH /leave/:id/approve|reject | ✅ | ✅ | ✅ | ❌ |
| POST /leave-balances | ✅ | ✅ | ❌ | ❌ |
| GET /leave-balances (admin list) | ✅ | ✅ | ✅ | ❌ |
| GET /leave-balances/my | ✅ | ✅ | ✅ | ✅ |
| PATCH /leave-balances/:id | ✅ | ✅ | ❌ | ❌ |
| GET /dashboard | ✅ | ✅ | ✅ | ❌ |

### Ownership enforcement
For endpoints that return individual records accessible by owners, the service layer performs an additional ownership check:

```typescript
// Example from AttendanceService / LeaveService
if (userRole !== SUPER_ADMIN && userRole !== HR_ADMIN) {
  const emp = await prisma.employee.findFirst({ where: { userId } });
  if (!emp || record.employee.id !== emp.id) throw new ForbiddenException();
}
```

### Current caveat
MANAGER can now view `GET /leave` and approve or reject leave requests, but there is still no manager-to-subordinate scoping. MANAGER visibility is organization-wide rather than team-scoped.

## Consequences

**Positive**
- Clear separation of capabilities between roles.
- Guard composition (`JwtAuthGuard + RolesGuard`) is reusable across all modules via `AuthModule` exports.
- Metadata-based `@Roles(...)` keeps controller code readable and co-located with the route.
- Ownership checks in the service layer prevent privilege escalation for individual record access.

**Negative**
- No per-department or manager-subordinate scoping: MANAGER sees organization-wide leave requests and leave balances.
- Role changes take effect on the next login (JWT carries the role at login time; live role change requires token refresh).

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Single `isAdmin` boolean | Too coarse; cannot distinguish HR_ADMIN from MANAGER |
| Permission-based (e.g., Casbin) | Correct for highly dynamic permissions; over-engineered at this scale |
| Department-scoped MANAGER role | Correct long-term direction; deferred until department manager relation is fully used |
| ABAC (Attribute-Based Access Control) | Too complex for the current team size and data volume |

## Follow-up Tasks
- Add manager-to-subordinate or department-scoped visibility for MANAGER when reporting-line policy is formalized.
- Consider adding a `POST /auth/refresh` endpoint so role changes propagate without re-login.
- Continue documenting current RBAC changes in route inventory and knowledge docs as later milestones change capabilities.
