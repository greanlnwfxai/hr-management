# RBAC Rules

## Role Definitions

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Full system access — all operations across all modules |
| `HR_ADMIN` | Manage employees, leave, attendance, balances; approve and reject leave |
| `MANAGER` | Read-only visibility into operational data (balances, dashboard); cannot approve leave or manage employees |
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
| GET /leave (admin list) | ✅ | ✅ | ❌ | ❌ |
| GET /leave/:id | ✅ | ✅ | owner only | owner only |
| PATCH /leave/:id/approve\|reject | ✅ | ✅ | ❌ | ❌ |
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

## Known Asymmetry

MANAGER can view `GET /leave-balances` (all employee balances) but **cannot** view `GET /leave` (all leave requests). This inconsistency was documented during T-022 hardening and requires stakeholder clarification. No MANAGER department scoping exists — MANAGER sees all employees' data.

## Known Limitations

- No per-department scoping for MANAGER — MANAGER sees all balances, not just their team's
- MANAGER role has limited utility currently (dashboard + balance list only)
- Role changes require re-login (JWT carries the role at login time — changes take effect on next token)
- MANAGER cannot access `GET /leave` (leave request admin list)

## Related ADRs

- [[ADR-006 RBAC]]
- [[ADR-005 JWT Authentication]]

## Related Notes

- [[Auth Module]]
- [[API Route Index]]
- [[Leave Rules]]

#business-rules #rbac #security #rag-ready
