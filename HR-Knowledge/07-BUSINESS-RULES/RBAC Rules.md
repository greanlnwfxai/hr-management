# RBAC Rules

## Role Definitions

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Full system access — all operations across all modules |
| `HR_ADMIN` | Manage employees, leave, attendance, balances; approve and reject leave |
| `MANAGER` | Operational visibility plus department-scoped leave and off-site request approval/rejection; still cannot manage employee master data |
| `EMPLOYEE` | Self-service: clock in/out (mobile only as of v1.2.66 — see note below), view own attendance, submit and view own leave requests; has a self-only dashboard (v1.2.61) but no access to `GET /dashboard` or the global Employees list |

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
| GET /attendance/geofence-config | ✅ | ✅ | ❌ | ❌ |
| PATCH /attendance/geofence-config | ✅ | ✅ | ❌ | ❌ |
| GET /attendance/me | ✅ | ✅ | ✅ | ✅ |
| GET /attendance (admin list) | ✅ | ✅ | ❌ | ❌ |
| GET /attendance/:id | ✅ | ✅ | owner only | owner only |
| POST /leave/request | ✅ | ✅ | ✅ | ✅ |
| GET /leave/me | ✅ | ✅ | ✅ | ✅ |
| GET /leave (admin list) | ✅ | ✅ | ✅ | ❌ |
| GET /leave/:id | ✅ | ✅ | owner only | owner only |
| PATCH /leave/:id/approve\|reject | ✅ | ✅ | own-dept only | ❌ |
| POST /off-site/request | ✅ | ✅ | ✅ | ✅ |
| GET /off-site/me | ✅ | ✅ | ✅ | ✅ |
| GET /off-site (all) | ✅ | ✅ | ✅ (org-wide) | ❌ |
| GET /off-site/:id | ✅ | ✅ | ✅ | owner only |
| PATCH /off-site/:id/approve\|reject | ✅ | ✅ | own-dept only | ❌ |
| POST /leave-balances | ✅ | ✅ | ❌ | ❌ |
| GET /leave-balances/my | ✅ | ✅ | ✅ | ✅ |
| GET /leave-balances (all) | ✅ | ✅ | ✅ | ❌ |
| GET /leave-balances/:id | ✅ | ✅ | ✅ | owner only |
| PATCH /leave-balances/:id | ✅ | ✅ | ❌ | ❌ |
| GET /dashboard | ✅ | ✅ | ✅ | ❌ |
| GET /audit-logs | ✅ | ✅ | ❌ | ❌ |
| GET /audit-logs/:id | ✅ | ✅ | ❌ | ❌ |

## Web Clock-In/Out Removal Is a UX Policy, Not an RBAC Change (v1.2.66)

The RBAC matrix row `POST /attendance/clock-in|out` above is **unchanged**:
these endpoints remain open to any authenticated role at the API level. As of
`v1.2.66`, the Web/Admin `/attendance` page no longer renders clock-in/out
buttons — this is a frontend-only removal of a UI affordance, not a backend
permission change. STEP Connect Mobile continues to call the same endpoints
unchanged. See [[ADR-029 Web vs Mobile Attendance Clock Policy]] and
[[Attendance Module]].

## Employee/Manager Dashboard Scope Is a UX Policy, Not an RBAC Change (v1.2.61–v1.2.63)

The RBAC matrix row `GET /dashboard` above is also **unchanged** — EMPLOYEE
still cannot call it, and MANAGER's call is still scoped exactly as before.
EMPLOYEE's self-dashboard and MANAGER's "My Summary" section are both built
from the already-open `/attendance/me`, `/leave-balances/my`, and `/leave/me`
endpoints, not from a new or widened `GET /dashboard` permission. See
[[ADR-032 Manager Employee Dashboard Scope and Personal Summary]].

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

## Manager Department Scoping (v1.2.0)

MANAGER approve/reject for leave and off-site requests is now scoped to the department they manage via `Department.managerId` (the `managedDepartment` back-relation on `Employee`). This is distinct from `Employee.managerId` (the person-to-person reporting hierarchy).

**Scoped (write path):**
- `PATCH /leave/:id/approve|reject` — MANAGER may only act on leave for employees in their managed department
- `PATCH /off-site/:id/approve|reject` — MANAGER may only act on off-site requests for employees in their managed department

**Not scoped (read path):**
- `GET /leave` — MANAGER sees org-wide leave requests
- `GET /off-site` — MANAGER sees org-wide off-site requests
- `GET /leave-balances` — MANAGER sees org-wide balances

A MANAGER with no managed department (not set as `Department.managerId` on any department) will receive 403 on all approve/reject actions.

## Geofence Config Access

- `GET /attendance/geofence-config` and `PATCH /attendance/geofence-config` are restricted to SUPER_ADMIN and HR_ADMIN.
- MANAGER and EMPLOYEE receive `403 Forbidden` from these endpoints.
- Mobile geofence *enforcement* (validation at clock-in/out time) applies to all roles when `source === "mobile"` and geofence is enabled. Employees cannot disable the geofence for themselves.
- The admin web page at `/attendance/geofence-settings` is gated by `isAdmin()` on the client, but backend RBAC is the authoritative control.

## Known Limitations

- MANAGER list access for leave, off-site, and balances is org-wide — scoping is approve/reject only
- Role changes require re-login (JWT carries the role at login time — changes take effect on next token)

## Related ADRs

- [[ADR-006 RBAC]]
- [[ADR-005 JWT Authentication]]
- [[ADR-020 Attendance Geofence and Admin Configuration]]
- [[ADR-022 Off-site Work Request Workflow]]
- [[ADR-023 Department Manager Leave Approval Scope]]
- [[ADR-029 Web vs Mobile Attendance Clock Policy]]
- [[ADR-032 Manager Employee Dashboard Scope and Personal Summary]]

## Related Notes

- [[Auth Module]]
- [[API Route Index]]
- [[Leave Rules]]
- [[Attendance Geofence]]

#business-rules #rbac #security #rag-ready
