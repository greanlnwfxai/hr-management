# API Route Inventory — HR Management v1.0

Base URL: `http://localhost:4002`
Auth: All protected routes require `Authorization: Bearer <token>`.
Roles: `SUPER_ADMIN` · `HR_ADMIN` · `MANAGER` · `EMPLOYEE`

> **Living API reference:** Swagger UI is available at `http://localhost:4002/docs` (local/dev).
> OpenAPI JSON at `http://localhost:4002/docs-json`. See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for auth and production guidance.

---

## Health

| Method | Path      | Auth | Roles | Description              |
|--------|-----------|------|-------|--------------------------|
| GET    | /health   | ❌   | —     | API liveness check       |

Response: `{ "status": "ok", "timestamp": "..." }`

---

## Auth

| Method | Path                    | Auth | Roles | Description                                             |
|--------|-------------------------|------|-------|---------------------------------------------------------|
| POST   | /auth/login             | ❌   | —     | Authenticate; returns `{ accessToken, user }`           |
| GET    | /auth/me                | ✅   | any   | Return current user profile with employee details       |
| POST   | /auth/change-password   | ✅   | any   | Change current user password                            |

### POST /auth/login
Body: `{ "login": string, "password": string }` — `login` may be username or email. Legacy `email` field also accepted.
If identifier contains `@` → searched by email; otherwise searched by username.
Response: `{ "accessToken": string, "user": { id, email, username, role, mustChangePassword, employeeId } }`

### GET /auth/me
Response:
```json
{
  "id": "uuid",
  "email": "admin@hr.local",
  "username": "admin",
  "role": "SUPER_ADMIN",
  "mustChangePassword": false,
  "employeeId": "emp-uuid-or-null",
  "employee": {
    "id": "emp-uuid",
    "firstName": "John",
    "lastName": "Doe",
    "employeeCode": "EMP001",
    "department": "Engineering",
    "position": "Developer"
  }
}
```
Note: `employee` is `null` for users not linked to an employee record. Never exposes password hash.

### POST /auth/change-password
Body: `{ "currentPassword": string, "newPassword": string, "confirmPassword": string }`
Password policy: min 8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special char (`!@#$%^&*`).
- Returns `{ "success": true, "mustChangePassword": false }` on success
- Sets `mustChangePassword = false` in the database
- Returns `401` if `currentPassword` is wrong
- Returns `400` if passwords don't match, new password same as current, or policy violation

---

## Employees

| Method | Path                                | Auth | Roles                        | Description                                      |
|--------|-------------------------------------|------|------------------------------|--------------------------------------------------|
| GET    | /employees                          | ✅   | any                          | Paginated employee list with filters             |
| GET    | /employees/:id                      | ✅   | any                          | Single employee by UUID                          |
| POST   | /employees                          | ✅   | SUPER_ADMIN · HR_ADMIN       | Create employee                                  |
| PATCH  | /employees/:id                      | ✅   | SUPER_ADMIN · HR_ADMIN       | Update employee fields                           |
| DELETE | /employees/:id                      | ✅   | SUPER_ADMIN · HR_ADMIN       | Soft-delete (sets status=INACTIVE)               |
| POST   | /employees/:id/account              | ✅   | SUPER_ADMIN · HR_ADMIN       | Provision login account; returns temporaryPassword once |
| POST   | /employees/:id/account/reset-password | ✅ | SUPER_ADMIN · HR_ADMIN       | Reset account password; returns temporaryPassword once  |

Query params (GET /employees): `page`, `limit`, `search`, `status`, `departmentId`, `positionId`
Note: GET endpoints are accessible to all authenticated roles including EMPLOYEE (org directory access by design).

**POST /employees/:id/account** body: `{ "username": string, "role": UserRole, "email"?: string }`
Response: `{ userId, employeeId, username, email, role, mustChangePassword, temporaryPassword }`

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
| POST   | /attendance/clock-out         | ✅  | any                    | Clock out for today                      |
| GET    | /attendance/geofence-config   | ✅  | SUPER_ADMIN · HR_ADMIN | Get effective geofence config (DB or env)|
| PATCH  | /attendance/geofence-config   | ✅  | SUPER_ADMIN · HR_ADMIN | Update geofence config in DB             |
| GET    | /attendance/me                | ✅  | any                    | Own attendance history (paginated)       |
| GET    | /attendance                   | ✅  | SUPER_ADMIN · HR_ADMIN | All attendance records (paginated)       |
| GET    | /attendance/:id               | ✅  | any (owner or admin)   | Single attendance record                 |

Query params (GET /attendance, GET /attendance/me): `page`, `limit`, `startDate`, `endDate`, `employeeId` (admin list only), `status`

Timezone rule: Clock-in status LATE if wall-clock time in Asia/Bangkok (UTC+7, fixed) is strictly after 08:30. Exactly 08:30:00 remains PRESENT. Current schedule reference: `08:30–17:30`.

### POST /attendance/clock-in and POST /attendance/clock-out — Body

All fields are optional. Web clients may omit location fields entirely.

```json
{
  "source": "mobile",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "accuracy": 25,
  "note": "optional note (max 500 chars)"
}
```

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `source` | `"web"` \| `"mobile"` | optional | Omit or `"web"` → no geofence check |
| `latitude` | number | -90 to 90 | Required for mobile when geofence enabled |
| `longitude` | number | -180 to 180 | Required for mobile when geofence enabled |
| `accuracy` | number | > 0 | GPS error radius in meters; rejected if > `ATTENDANCE_GPS_MAX_ACCURACY_METERS` |
| `note` | string | max 500 chars | Optional attendance note |

**Geofence behavior (T-046):** When `source = "mobile"` and `ATTENDANCE_GEOFENCE_ENABLED=true`, the backend validates that the supplied coordinates are within `COMPANY_GEOFENCE_RADIUS_METERS` (default 100 m) of the configured company location. Out-of-range or poorly-accurate requests receive `422 Unprocessable Entity`. See [ATTENDANCE_GEOFENCE_BACKEND.md](ATTENDANCE_GEOFENCE_BACKEND.md) for full policy details.

---

## Leave Requests

| Method | Path                    | Auth | Roles                  | Description                                   |
|--------|-------------------------|------|------------------------|-----------------------------------------------|
| POST   | /leave/request          | ✅   | any                    | Submit a leave request (own employee only)    |
| GET    | /leave/me               | ✅   | any                    | Own leave requests (paginated)                |
| GET    | /leave                  | ✅   | SUPER_ADMIN · HR_ADMIN · MANAGER | All leave requests (paginated)                   |
| GET    | /leave/:id              | ✅   | any (owner or admin)             | Single leave request                              |
| PATCH  | /leave/:id/approve      | ✅   | SUPER_ADMIN · HR_ADMIN · MANAGER | Approve PENDING request (deducts balance)         |
| PATCH  | /leave/:id/reject       | ✅   | SUPER_ADMIN · HR_ADMIN · MANAGER | Reject PENDING request                            |

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

## Audit Logs

| Method | Path              | Auth | Roles                    | Description                                   |
|--------|-------------------|------|--------------------------|-----------------------------------------------|
| GET    | /audit-logs       | ✅   | SUPER_ADMIN · HR_ADMIN   | Paginated, filterable audit log list          |
| GET    | /audit-logs/:id   | ✅   | SUPER_ADMIN · HR_ADMIN   | Single audit log record by UUID               |

Read-only. No POST, PATCH, or DELETE endpoints exist.
MANAGER and EMPLOYEE receive `403 Forbidden`. Unauthenticated requests receive `401 Unauthorized`.

### Query params (GET /audit-logs)

| Param        | Type        | Description                                   |
|--------------|-------------|-----------------------------------------------|
| `page`       | integer ≥ 1 | Page number (default: 1)                      |
| `limit`      | integer 1–100 | Items per page (default: 20, max: 100)      |
| `action`     | string      | Exact match on `action` field                 |
| `targetType` | string      | Exact match on `targetType` field             |
| `targetId`   | string      | Exact match on `targetId` field               |
| `actorUserId`| string      | Exact match on `actorUserId` field            |
| `actorRole`  | string      | Exact match on `actorRole` field              |
| `result`     | string      | Exact match on `result` field (e.g. SUCCESS)  |
| `dateFrom`   | ISO 8601    | Return records where `createdAt >= dateFrom`  |
| `dateTo`     | ISO 8601    | Return records where `createdAt <= dateTo`    |

Results are sorted by `createdAt DESC`.

### Response (GET /audit-logs)
```json
{
  "data": [
    {
      "id": "uuid",
      "actorUserId": "uuid-or-null",
      "actorRole": "HR_ADMIN",
      "action": "LEAVE_REQUEST_APPROVED",
      "targetType": "LEAVE_REQUEST",
      "targetId": "uuid",
      "targetLabel": "Leave #42",
      "result": "SUCCESS",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0 ...",
      "metadata": {},
      "createdAt": "2026-06-21T10:00:00.000Z"
    }
  ],
  "meta": { "total": 150, "page": 1, "limit": 20, "totalPages": 8 }
}
```

Note: `metadata` may contain contextual data recorded at write time. Sensitive keys (password, token, hash, etc.) are redacted to `[REDACTED]` at write time and never stored raw.

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
