# ADR-006: Role-Based Access Control (RBAC)

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Use a **four-role RBAC model** backed by the `UserRole` enum on the `User` model.

## Role Definitions

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Full system access; all operations across all modules |
| `HR_ADMIN` | Manage employees, leave, attendance, balances; approve/reject leave |
| `MANAGER` | Read-only visibility into operational data (balances, dashboard); cannot approve |
| `EMPLOYEE` | Self-service: clock in/out, own attendance, own leave |

## RBAC Matrix (Summary)

| Endpoint Group | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| GET /employees, /departments, /positions | ✅ | ✅ | ✅ | ✅ |
| POST/PATCH/DELETE (employees, depts, positions) | ✅ | ✅ | ❌ | ❌ |
| POST /attendance/clock-in|out | ✅ | ✅ | ✅ | ✅ |
| GET /attendance (admin list) | ✅ | ✅ | ❌ | ❌ |
| POST /leave/request | ✅ | ✅ | ✅ | ✅ |
| GET /leave (admin list) | ✅ | ✅ | ❌ | ❌ |
| PATCH /leave/approve|reject | ✅ | ✅ | ❌ | ❌ |
| GET /leave-balances | ✅ | ✅ | ✅ | ❌ |
| GET /dashboard | ✅ | ✅ | ✅ | ❌ |

## Known Asymmetry

MANAGER can view `GET /leave-balances` (all employees) but cannot view `GET /leave` (all leave requests). This was identified in T-022 and requires stakeholder clarification.

## Ownership Enforcement

For individual record access, the service layer enforces ownership:

```typescript
if (userRole !== SUPER_ADMIN && userRole !== HR_ADMIN) {
  if (record.employee.id !== requestingEmployee.id) throw new ForbiddenException();
}
```

## Source

`docs/adr/ADR-006-role-based-access-control.md`

## Related Notes

- [[RBAC Rules]]
- [[Auth Module]]
- [[ADR Index]]

#adr #security #rbac
