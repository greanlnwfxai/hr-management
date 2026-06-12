# API Route Inventory — HR Management v1.0

Base URL: `http://localhost:4002`
Auth: All protected routes require `Authorization: Bearer <token>`.
Roles: `SUPER_ADMIN` · `HR_ADMIN` · `MANAGER` · `EMPLOYEE`

---

## Health

| Method | Path      | Auth | Roles | Description              |
|--------|-----------|------|-------|--------------------------|
| GET    | /health   | ❌   | —     | API liveness check       |

Response: `{ "status": "ok", "timestamp": "..." }`

---

## Auth

| Method | Path        | Auth | Roles | Description                                   |
|--------|-------------|------|-------|-----------------------------------------------|
| POST   | /auth/login | ❌   | —     | Authenticate; returns `{ accessToken, user }` |
| GET    | /auth/me    | ✅   | any   | Return currently authenticated user profile   |

### POST /auth/login
Body: `{ "email": string, "password": string }`
Response: `{ "accessToken": string, "user": { id, email, role } }`

### GET /auth/me
Response: `{ "id": string, "email": string, "role": UserRole }`
Note: Never exposes password hash.

---

## Employees

| Method | Path            | Auth | Roles                        | Description                          |
|--------|-----------------|------|------------------------------|--------------------------------------|
| GET    | /employees      | ✅   | any                          | Paginated employee list with filters |
| GET    | /employees/:id  | ✅   | any                          | Single employee by UUID              |
| POST   | /employees      | ✅   | SUPER_ADMIN · HR_ADMIN       | Create employee                      |
| PATCH  | /employees/:id  | ✅   | SUPER_ADMIN · HR_ADMIN       | Update employee fields               |
| DELETE | /employees/:id  | ✅   | SUPER_ADMIN · HR_ADMIN       | Soft-delete (sets status=INACTIVE)   |

Query params (GET /employees): `page`, `limit`, `search`, `status`, `departmentId`, `positionId`
Note: GET endpoints are accessible to all authenticated roles including EMPLOYEE (org directory access by design).

---

## Departments

| Method | Path              | Auth | Roles                  | Description                                       |
|--------|-------------------|------|------------------------|---------------------------------------------------|
| GET    | /departments      | ✅   | any                    | Paginated department list                         |
| GET    | /departments/:id  | ✅   | any                    | Single department by UUID                         |
| POST   | /departments      | ✅   | SUPER_ADMIN · HR_ADMIN | Create department                                 |
| PATCH  | /departments/:id  | ✅   | SUPER_ADMIN · HR_ADMIN | Update department                                 |
| DELETE | /departments/:id  | ✅   | SUPER_ADMIN · HR_ADMIN | Hard delete (blocked if employees/positions exist)|

Query params (GET /departments): `page`, `limit`, `search`

---

## Positions

| Method | Path            | Auth | Roles                  | Description                                    |
|--------|-----------------|------|------------------------|------------------------------------------------|
| GET    | /positions      | ✅   | any                    | Paginated position list                        |
| GET    | /positions/:id  | ✅   | any                    | Single position by UUID                        |
| POST   | /positions      | ✅   | SUPER_ADMIN · HR_ADMIN | Create position                                |
| PATCH  | /positions/:id  | ✅   | SUPER_ADMIN · HR_ADMIN | Update position                                |
| DELETE | /positions/:id  | ✅   | SUPER_ADMIN · HR_ADMIN | Safe delete (blocked if employees still use it)|

Query params (GET /positions): `page`, `limit`, `search`, `departmentId`

---

## Attendance

| Method | Path                | Auth | Roles                  | Description                              |
|--------|---------------------|------|------------------------|------------------------------------------|
| POST   | /attendance/clock-in  | ✅  | any                    | Clock in for today (Asia/Bangkok rules)  |
| POST   | /attendance/clock-out | ✅  | any                    | Clock out for today                      |
| GET    | /attendance/me      | ✅   | any                    | Own attendance history (paginated)       |
| GET    | /attendance         | ✅   | SUPER_ADMIN · HR_ADMIN | All attendance records (paginated)       |
| GET    | /attendance/:id     | ✅   | any (owner or admin)   | Single attendance record                 |

Query params (GET /attendance, GET /attendance/me): `page`, `limit`, `startDate`, `endDate`, `employeeId` (admin list only), `status`

Timezone rule: Clock-in status LATE if wall-clock time in Asia/Bangkok (UTC+7, fixed) is strictly after 09:00.

---

## Leave Requests

| Method | Path                    | Auth | Roles                  | Description                                   |
|--------|-------------------------|------|------------------------|-----------------------------------------------|
| POST   | /leave/request          | ✅   | any                    | Submit a leave request (own employee only)    |
| GET    | /leave/me               | ✅   | any                    | Own leave requests (paginated)                |
| GET    | /leave                  | ✅   | SUPER_ADMIN · HR_ADMIN | All leave requests (paginated)                |
| GET    | /leave/:id              | ✅   | any (owner or admin)   | Single leave request                          |
| PATCH  | /leave/:id/approve      | ✅   | SUPER_ADMIN · HR_ADMIN | Approve PENDING request (deducts balance)     |
| PATCH  | /leave/:id/reject       | ✅   | SUPER_ADMIN · HR_ADMIN | Reject PENDING request                        |

Query params (GET /leave, GET /leave/me): `page`, `limit`, `status`, `leaveType`, `startDate`, `endDate`, `employeeId` (admin only)

Approval rules:
- Only PENDING → APPROVED allowed.
- Requires a matching LeaveBalance record (employeeId + leaveType + year of startDate).
- Requires sufficient remaining days.
- Balance deduction and status change are atomic (single DB transaction).

Rejection rules:
- Only PENDING → REJECTED allowed.
- No balance deduction.
- `rejectReason` accepted in body but not persisted (schema does not have this column).

Note: MANAGER role cannot access `GET /leave` (admin list). This is a known design inconsistency vs `GET /leave-balances`.

---

## Leave Balances

| Method | Path                 | Auth | Roles                          | Description                              |
|--------|----------------------|------|--------------------------------|------------------------------------------|
| POST   | /leave-balances      | ✅   | SUPER_ADMIN · HR_ADMIN         | Create leave balance for an employee     |
| GET    | /leave-balances/my   | ✅   | any                            | Own leave balances (paginated)           |
| GET    | /leave-balances      | ✅   | SUPER_ADMIN · HR_ADMIN · MANAGER | All leave balances (paginated)         |
| GET    | /leave-balances/:id  | ✅   | any (owner, manager, or admin) | Single leave balance                     |
| PATCH  | /leave-balances/:id  | ✅   | SUPER_ADMIN · HR_ADMIN         | Update entitledDays or usedDays          |

Query params (GET /leave-balances, GET /leave-balances/my): `page`, `limit`, `employeeId`, `leaveType`, `year`

Response fields: `id`, `leaveType`, `year`, `totalDays` (= entitled days), `usedDays`, `remainingDays` (computed = totalDays − usedDays), `employee`, `createdAt`, `updatedAt`

Note: DB column is `totalDays`; API create/update DTO accepts `entitledDays` which maps to `totalDays`. `remainingDays` is never accepted from request body.

---

## Dashboard

| Method | Path        | Auth | Roles                              | Description                  |
|--------|-------------|------|------------------------------------|------------------------------|
| GET    | /dashboard  | ✅   | SUPER_ADMIN · HR_ADMIN · MANAGER   | Aggregated HR snapshot       |

Response shape:
```json
{
  "generatedAt": "ISO8601",
  "timezone": "Asia/Bangkok",
  "employees": {
    "totalEmployees": 0,
    "activeEmployees": 0,
    "inactiveEmployees": 0,
    "resignedEmployees": 0,
    "totalDepartments": 0,
    "totalPositions": 0
  },
  "attendance": {
    "todayDate": "YYYY-MM-DD",
    "todayPresentCount": 0,
    "todayLateCount": 0,
    "todayAbsentCount": 0,
    "todayClockedInCount": 0,
    "todayClockedOutCount": 0
  },
  "leave": {
    "totalLeaveRequests": 0,
    "pendingLeaveRequests": 0,
    "approvedLeaveRequests": 0,
    "rejectedLeaveRequests": 0,
    "lowLeaveBalanceCount": 0
  },
  "recent": {
    "employees": [],
    "attendance": [],
    "leaveRequests": []
  }
}
```

`lowLeaveBalanceCount` = leave balances for the current Bangkok year where `remainingDays <= 3`.
`todayAbsentCount` = explicitly created ABSENT attendance records for today (no automatic absent-marking).
Recent lists are capped at 5 records each.

---

## Enum Reference

```
UserRole:       SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE
EmployeeStatus: ACTIVE | INACTIVE | RESIGNED
AttendanceStatus: PRESENT | LATE | ABSENT
LeaveType:      SICK | VACATION | PERSONAL | OTHER
LeaveStatus:    PENDING | APPROVED | REJECTED
```

---

## Common Response Formats

### Paginated list
```json
{
  "data": [...],
  "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0 }
}
```

### Error
```json
{ "statusCode": 4xx, "message": "..." }
```
