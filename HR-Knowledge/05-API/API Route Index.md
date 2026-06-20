# API Route Index

Base URL: `http://localhost:4002`  
Auth: All protected routes require `Authorization: Bearer <token>`

## Health

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /health | ❌ | — | API liveness check → `{ status: "ok" }` |

---

## Auth → [[Auth Module]]

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /auth/login | ❌ | — | Login → `{ accessToken, user }` |
| GET | /auth/me | ✅ | Any | Current user profile (no password) |
| POST | /auth/change-password | ✅ | Any | Change current user password |

---

## Employees → [[Employee Module]]

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /employees | ✅ | Any | Paginated list (search, status, dept, position) |
| GET | /employees/:id | ✅ | Any | Single employee |
| POST | /employees | ✅ | SUPER_ADMIN, HR_ADMIN | Create employee |
| PATCH | /employees/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update fields |
| DELETE | /employees/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Soft delete (status=INACTIVE) |
| GET | /employees/:id/account | ✅ | SUPER_ADMIN, HR_ADMIN | Read linked login account summary |
| POST | /employees/:id/account | ✅ | SUPER_ADMIN, HR_ADMIN | Provision login account; returns one-time temporary password |
| POST | /employees/:id/account/reset-password | ✅ | SUPER_ADMIN, HR_ADMIN | Reset linked account password; returns one-time temporary password |

---

## Departments → [[Department Module]]

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /departments | ✅ | Any | Paginated list (search) |
| GET | /departments/:id | ✅ | Any | Single department |
| POST | /departments | ✅ | SUPER_ADMIN, HR_ADMIN | Create |
| PATCH | /departments/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update |
| DELETE | /departments/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Hard delete (blocked if in use) |

---

## Positions → [[Position Module]]

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /positions | ✅ | Any | Paginated list (search, departmentId) |
| GET | /positions/:id | ✅ | Any | Single position |
| POST | /positions | ✅ | SUPER_ADMIN, HR_ADMIN | Create |
| PATCH | /positions/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update |
| DELETE | /positions/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Safe delete (blocked if in use) |

---

## Attendance → [[Attendance Module]]

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /attendance/clock-in | ✅ | Any | Clock in (LATE if strictly after 08:30 Bangkok) |
| POST | /attendance/clock-out | ✅ | Any | Clock out |
| GET | /attendance/me | ✅ | Any | Own history (paginated) |
| GET | /attendance | ✅ | SUPER_ADMIN, HR_ADMIN | All records (paginated) |
| GET | /attendance/:id | ✅ | Any (owner or admin) | Single record |

---

## Leave Requests → [[Leave Request Module]]

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /leave/request | ✅ | Any | Submit leave (own employee) |
| GET | /leave/me | ✅ | Any | Own requests (paginated) |
| GET | /leave | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | All requests (paginated) |
| GET | /leave/:id | ✅ | Any (owner or admin) | Single request |
| PATCH | /leave/:id/approve | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | Approve PENDING (deducts balance) |
| PATCH | /leave/:id/reject | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | Reject PENDING |

---

## Leave Balances → [[Leave Balance Module]]

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| POST | /leave-balances | ✅ | SUPER_ADMIN, HR_ADMIN | Create balance |
| GET | /leave-balances/my | ✅ | Any | Own balances (paginated) |
| GET | /leave-balances | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | All balances (paginated) |
| GET | /leave-balances/:id | ✅ | Any (owner, manager, admin) | Single balance |
| PATCH | /leave-balances/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update entitledDays or usedDays |

---

## Dashboard → [[Dashboard Module]]

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /dashboard | ✅ | SUPER_ADMIN, HR_ADMIN, MANAGER | Aggregated HR snapshot |

---

## Enum Reference

```
UserRole:         SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE
EmployeeStatus:   ACTIVE | INACTIVE | RESIGNED
AttendanceStatus: PRESENT | LATE | ABSENT
LeaveType:        SICK | VACATION | PERSONAL | OTHER
LeaveStatus:      PENDING | APPROVED | REJECTED
```

## Paginated Response Shape

```json
{
  "data": [...],
  "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0 }
}
```

## Error Response Shape

```json
{ "statusCode": 400, "message": "Human-readable message" }
```

## Related Notes

- [[Backend v1 Architecture]]
- [[Platform State v1.1.31]]
- [[RBAC Rules]]
- [[ADR-007 API Standards]]

#api #backend-v1 #rag-ready
