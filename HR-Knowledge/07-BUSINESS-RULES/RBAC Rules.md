# RBAC Rules

## Role Definitions

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Full system access — all operations across all modules |
| `HR_ADMIN` | Manage employees, leave, attendance, balances; approve and reject leave |
| `MANAGER` | Operational visibility plus leave approval/rejection access; still cannot manage employee master data |
| `EMPLOYEE` | Self-service: clock in/out, view own attendance, submit and view own leave requests |

## Full RBAC Matrix

| Endpoint | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| POST /auth/login | ✅ (public) | ✅ | ✅ | ✅ |
| GET /auth/me | ✅ | ✅ | ✅ | ✅ |
| GET /employees | ✅ | ✅ | ✅ | ✅ |
| GET /employees/:id | ✅ | ✅ | ✅ | ✅ |
| POST /employees | ✅ | ✅ | ❌ | ❌ |
| PATCH /employees/:id | ✅ | ✅ | ❌ | ❌ |
| DELETE /employees/:id | ✅ | ✅ | ❌ | ❌ |
| GET /departments, /positions | ✅ | ✅ | ✅ | ✅ |
| POST/PATCH/DELETE /departments, /positions | ✅ | ✅ | ❌ | ❌ |
| POST /attendance/clock-in\|out | ✅ | ✅ | ✅ | ✅ |
| GET /attendance/me | ✅ | ✅ | ✅ | ✅ |
| GET /attendance (admin list) | ✅ | ✅ | ❌ | ❌ |
| GET /attendance/:id | ✅ | ✅ | owner only | owner only |
| POST /leave/request | ✅ | ✅ | ✅ | ✅ |
| GET /leave/me | ✅ | ✅ | ✅ | ✅ |
| GET /leave (admin list) | ✅ | ✅ | ✅ | ❌ |
| GET /leave/:id | ✅ | ✅ | owner only | owner only |
| PATCH /leave/:id/approve\|reject | ✅ | ✅ | ✅ | ❌ |
| POST /leave-balances | ✅ | ✅ | ❌ | ❌ |
| GET /leave-balances/my | ✅ | ✅ | ✅ | ✅ |
| GET /leave-balances (all) | ✅ | ✅ | ✅ | ❌ |
| GET /leave-balances/:id | ✅ | ✅ | ✅ | owner only |
| PATCH /leave-balances/:id | ✅ | ✅ | ❌ | ❌ |
| GET /dashboard | ✅ | ✅ | ✅ | ❌ |

## Ownership Enforcement

For individual record access, the service layer enforces ownership in addition to role checks:

```typescript
if (userRole !== SUPER_ADMIN && userRole !== HR_ADMIN) {
  const emp = await prisma.employee.findFirst({ where: { userId } });
  if (!emp || record.employee.id !== emp.id) throw new ForbiddenException();
}
```

This pattern is used in: `AttendanceService`, `LeaveService`, `LeaveBalanceService`.

## Implementation Pattern

```typescript
@Controller('resource')
@UseGuards(JwtAuthGuard, RolesGuard)    // class-level — covers all routes
export class ResourceController {
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)  // method-level restriction
  findAll() {}

  @Get('me')    // no @Roles = any authenticated user
  findMy(@CurrentUser() user) {}
}
```

## Current Access Caveat

MANAGER can now view `GET /leave` and approve/reject leave requests, but there is still **no manager-to-subordinate scoping**. A MANAGER can see organization-wide leave requests and leave balances, not only their direct reports.

## Known Limitations

- No per-department scoping for MANAGER — MANAGER sees all balances, not just their team's
- No manager-team scoping for leave approvals or leave list access
- Role changes require re-login (JWT carries the role at login time — changes take effect on next token)

## Related ADRs

- [[ADR-006 RBAC]]
- [[ADR-005 JWT Authentication]]

## Related Notes

- [[Auth Module]]
- [[API Route Index]]
- [[Leave Rules]]

#business-rules #rbac #security #rag-ready
