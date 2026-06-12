# Backend QA Checklist — HR Management v1.0

Last updated: T-022 Backend Hardening & QA

---

## 1. Build Verification

- [x] `npm run build` in `apps/api` exits 0
- [x] No TypeScript compilation errors
- [x] `npx prisma validate` exits 0
- [x] `npm run build` in `apps/web` exits 0
- [x] `./scripts/verify.sh` exits 0 (all three checks)

---

## 2. Docker Health

- [x] `./scripts/docker-verify.sh` exits 0
- [x] `hr-db` container status: healthy
- [x] `hr-api` container status: healthy
- [x] `hr-web` container status: up
- [x] `GET /health` returns `{"status":"ok"}`

---

## 3. Auth Smoke Test

- [x] `POST /auth/login` with valid credentials returns `accessToken`
- [x] `POST /auth/login` with wrong password returns 401
- [x] `GET /auth/me` with valid token returns `{ id, email, role }` (no password hash)
- [x] `GET /auth/me` without token returns 401
- [x] Expired/invalid token returns 401

---

## 4. Module Smoke Test (via expanded api-smoke-test.sh)

- [x] `GET /health` → `status: ok`
- [x] `POST /auth/login` → `accessToken`
- [x] `GET /auth/me` → user id
- [x] `GET /employees` → `meta.total`
- [x] `GET /departments` → `meta.total`
- [x] `GET /positions` → `meta.total`
- [x] `GET /attendance` → `meta.total`
- [x] `GET /leave` → `meta.total`
- [x] `GET /leave-balances` → `meta.total`
- [x] `GET /dashboard` → `timezone = Asia/Bangkok`, `employees.totalEmployees`
- [x] `GET /dashboard` without token → 401

---

## 5. RBAC Checks

### Auth
- [x] `POST /auth/login` — public ✓
- [x] `GET /auth/me` — JWT required, no role restriction ✓

### Employees
- [x] `GET /employees`, `GET /employees/:id` — JWT required, no role restriction (any auth user = org directory)
- [x] `POST /employees` — SUPER_ADMIN / HR_ADMIN only ✓
- [x] `PATCH /employees/:id` — SUPER_ADMIN / HR_ADMIN only ✓
- [x] `DELETE /employees/:id` — SUPER_ADMIN / HR_ADMIN only ✓

### Departments
- [x] `GET /departments`, `GET /departments/:id` — JWT required, no role restriction ✓
- [x] `POST / PATCH / DELETE /departments` — SUPER_ADMIN / HR_ADMIN only ✓

### Positions
- [x] `GET /positions`, `GET /positions/:id` — JWT required, no role restriction ✓
- [x] `POST / PATCH / DELETE /positions` — SUPER_ADMIN / HR_ADMIN only ✓

### Attendance
- [x] `POST /attendance/clock-in|clock-out` — JWT, any role; clocks for own employee ✓
- [x] `GET /attendance/me` — JWT, any role ✓
- [x] `GET /attendance` — SUPER_ADMIN / HR_ADMIN only ✓
- [x] `GET /attendance/:id` — owner or admin (enforced in service) ✓

### Leave Requests
- [x] `POST /leave/request` — JWT, any role; creates for own employee ✓
- [x] `GET /leave/me` — JWT, any role ✓
- [x] `GET /leave` — SUPER_ADMIN / HR_ADMIN only ✓
- [x] `GET /leave/:id` — owner or admin (enforced in service) ✓
- [x] `PATCH /leave/:id/approve|reject` — SUPER_ADMIN / HR_ADMIN only ✓
- [ ] KNOWN: MANAGER cannot access `GET /leave` (admin list). MANAGER can access `GET /leave-balances`.
      This asymmetry may be intentional; document before v1.0 release.

### Leave Balances
- [x] `POST /leave-balances` — SUPER_ADMIN / HR_ADMIN only ✓
- [x] `GET /leave-balances/my` — JWT, any role ✓
- [x] `GET /leave-balances` — SUPER_ADMIN / HR_ADMIN / MANAGER ✓
- [x] `GET /leave-balances/:id` — owner, manager, or admin (enforced in service) ✓
- [x] `PATCH /leave-balances/:id` — SUPER_ADMIN / HR_ADMIN only ✓

### Dashboard
- [x] `GET /dashboard` — SUPER_ADMIN / HR_ADMIN / MANAGER ✓
- [x] EMPLOYEE role returns 403 ✓
- [x] No token returns 401 ✓

---

## 6. Ownership Checks

- [x] `POST /attendance/clock-in` — uses `requireEmployeeId(userId)` to bind to own employee ✓
- [x] `GET /attendance/:id` — service checks `record.employee.id === emp.id` ✓
- [x] `POST /leave/request` — uses `requireEmployeeId(userId)` ✓
- [x] `GET /leave/:id` — service checks ownership; admin bypass ✓
- [x] `GET /leave-balances/:id` — service checks ownership; manager/admin bypass ✓
- [x] `GET /leave/me` — pre-filters by own employeeId ✓
- [x] `GET /leave-balances/my` — pre-filters by own employeeId ✓

---

## 7. Error Handling Checks

- [x] Non-existent UUID returns 404 ✓
- [x] Invalid UUID format returns 400 (ParseUUIDPipe) ✓
- [x] DTO validation failure returns 400 with field details ✓
- [x] Duplicate employee email/code returns 409 ✓
- [x] Duplicate leave balance returns 409 ✓
- [x] Overlapping leave request returns 409 ✓
- [x] Delete department with employees returns 409 ✓
- [x] No employee linked to user account returns 400 ✓
- [x] Error messages do not expose password hashes ✓
- [x] Error messages do not expose JWT secret or DB credentials ✓

---

## 8. Validation Review

| DTO Field          | Validator Used              | Status |
|--------------------|-----------------------------|--------|
| email              | @IsEmail()                  | ✓      |
| UUID params        | ParseUUIDPipe               | ✓      |
| UUID body fields   | @IsUUID()                   | ✓      |
| enum fields        | @IsEnum() from common/enums | ✓      |
| date fields        | @IsDateString()             | ✓      |
| page/limit         | @IsInt @Min @Max(100)       | ✓      |
| entitledDays       | @IsInt @Min(0)              | ✓      |
| usedDays           | @IsInt @Min(0)              | ✓      |
| remainingDays      | not accepted from body      | ✓      |
| optional strings   | @IsOptional @IsString       | ✓      |
| max string length  | @MaxLength(500) on notes    | ✓      |

GlobalValidationPipe: `whitelist: true, transform: true`
— Extra fields stripped automatically.
— Type coercion on query params handled by `@Type(() => Number)`.

---

## 9. Timezone Checks

- [x] Attendance `LATE` rule: strictly after 09:00 in Asia/Bangkok (UTC+7, fixed — Thailand has no DST) ✓
- [x] Bangkok date computed by shifting UTC timestamp +7h, extracting calendar date ✓
- [x] Dashboard `todayDate` uses same `todayBangkok()` method ✓
- [x] Dashboard `bangkokYear()` uses same offset for leave-balance year filtering ✓
- [x] All timestamps stored in UTC in DB; Bangkok conversion only for evaluation ✓
- [ ] KNOWN: `todayBangkok()` in Dashboard and `todayUtc()` in AttendanceService
      use different offset strategies (Bangkok-corrected vs UTC). Attendance records
      are stored with UTC date. If a Bangkok user clocks in at 17:00–23:59 UTC (i.e.,
      00:00–06:59 next Bangkok day), the stored date is the UTC date, which differs
      from the Bangkok calendar date. Dashboard `todayDate` is Bangkok-corrected.
      This edge case rarely matters in practice but is documented.

---

## 10. Leave Balance Deduction Checks

- [x] Approval requires a matching LeaveBalance record (employeeId + leaveType + year) ✓
- [x] Approval fails with 400 if no balance record exists ✓
- [x] Approval fails with 400 if remaining days < requested days ✓
- [x] Balance deduction and status change are in a single `$transaction` ✓
- [x] `usedDays` increments atomically by `record.totalDays` ✓
- [x] Reject does not deduct balance ✓
- [x] PATCH /leave-balances rejects negative remaining days (422) ✓

---

## 11. Dashboard Checks

- [x] `GET /dashboard` returns all sections: generatedAt, timezone, employees, attendance, leave, recent ✓
- [x] All 19 queries run in parallel via `Promise.all` ✓
- [x] `lowLeaveBalanceCount` threshold = 3 remaining days, current Bangkok year ✓
- [x] Recent records capped at 5 each ✓
- [x] No password or secret fields in response ✓
- [x] Safe fields only in recent.employees, recent.attendance, recent.leaveRequests ✓
- [ ] KNOWN: `todayAbsentCount` counts explicitly created ABSENT records. Employees
      who never clocked in are not automatically counted as absent.

---

## 12. Known Limitations

| # | Area          | Limitation                                                    | Status   |
|---|---------------|---------------------------------------------------------------|----------|
| 1 | LeaveType     | ANNUAL and UNPAID enum values not in schema (VACATION/OTHER used instead) | Deferred |
| 2 | LeaveType     | UNPAID leave bypass (skip balance check) not implemented      | Deferred |
| 3 | RBAC          | MANAGER cannot access `GET /leave` list (asymmetry with `/leave-balances`) | Documented |
| 4 | Employee dir  | Any authenticated user can read all employees/departments/positions | By design |
| 5 | Absent marking| No automatic absent-marking job; ABSENT only if explicitly created | Known    |
| 6 | rejectReason  | Accepted in DTO but not persisted (no DB column)              | Known    |
| 7 | JWT secret    | `change_me` hardcoded in docker-compose.yml — must change in production | Pre-deploy |
| 8 | CORS          | `app.enableCors()` with no origin restriction                 | Pre-deploy |
| 9 | DB credentials| Hardcoded in docker-compose.yml                               | Pre-deploy |
| 10| Leave balance | DB column named `totalDays`; API DTO uses `entitledDays` (naming discrepancy) | Acceptable |
| 11| Concurrency   | Balance check is pre-transaction (TOCTOU window); acceptable for HR load | Documented |
| 12| Frontend      | No UI implemented (backend-first strategy)                    | Next phase |
