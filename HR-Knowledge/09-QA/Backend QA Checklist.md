# Backend QA Checklist

Source: `docs/BACKEND_QA_CHECKLIST.md` (T-022 Backend Hardening & QA)

## 1. Build Verification

- [x] `npm run build` in `apps/api` exits 0
- [x] No TypeScript compilation errors
- [x] `npx prisma validate` exits 0
- [x] `npm run build` in `apps/web` exits 0
- [x] `./scripts/verify.sh` exits 0

## 2. Docker Health

Historical backend v1 QA snapshot:
- This checklist mirrors the original T-022 verification flow.
- Current agent workflow rules may forbid destructive Docker verification even if the historical backend checklist references it.

- [x] `./scripts/docker-verify.sh` exits 0
- [x] `hr-db` container: healthy
- [x] `hr-api` container: healthy
- [x] `hr-web` container: up
- [x] `GET /health` returns `{"status":"ok"}`

## 3. Auth Smoke Test

- [x] `POST /auth/login` with valid credentials returns `accessToken`
- [x] `POST /auth/login` with wrong password returns 401
- [x] `GET /auth/me` returns `{ id, email, role }` (no password hash)
- [x] `GET /auth/me` without token returns 401

## 4. Module Smoke Test (12 checks via api-smoke-test.sh)

- [x] `GET /health` → status: ok
- [x] `POST /auth/login` → accessToken
- [x] `GET /auth/me` → user id
- [x] `GET /employees` → meta.total
- [x] `GET /departments` → meta.total
- [x] `GET /positions` → meta.total
- [x] `GET /attendance` → meta.total
- [x] `GET /leave` → meta.total
- [x] `GET /leave-balances` → meta.total
- [x] `GET /dashboard` → timezone = Asia/Bangkok
- [x] `GET /dashboard` → employees.totalEmployees
- [x] `GET /dashboard` (no token) → 401

## 5. RBAC Checks

- [x] All protected routes require JWT
- [x] `POST/PATCH/DELETE /employees` — SUPER_ADMIN/HR_ADMIN only
- [x] `GET /attendance` admin list — SUPER_ADMIN/HR_ADMIN only
- [x] `PATCH /leave/:id/approve|reject` — SUPER_ADMIN/HR_ADMIN/MANAGER; MANAGER scoped to managed department (v1.2.0)
- [x] `PATCH /off-site/:id/approve|reject` — SUPER_ADMIN/HR_ADMIN/MANAGER; MANAGER scoped to managed department (v1.2.0)
- [x] `GET /dashboard` — EMPLOYEE returns 403
- [x] Current: MANAGER list access (GET /leave, GET /off-site) is org-wide; approve/reject is department-scoped via Department.managerId

## 6. Ownership Checks

- [x] `POST /attendance/clock-in` — bound to own employee
- [x] `GET /attendance/:id` — ownership enforced in service
- [x] `POST /leave/request` — bound to own employee
- [x] `GET /leave/:id` — ownership enforced in service; admin bypass
- [x] `GET /leave-balances/:id` — ownership enforced; manager/admin bypass

## 7. Error Handling

- [x] Non-existent UUID → 404
- [x] Invalid UUID format → 400 (ParseUUIDPipe)
- [x] DTO validation failure → 400 with field details
- [x] Duplicate email/code → 409
- [x] Overlapping leave request → 409
- [x] Delete department with employees → 409
- [x] No employee linked to user → 400
- [x] Error messages do not expose password hashes or secrets

## 8. Validation

- [x] `@IsEmail()` on email fields
- [x] `ParseUUIDPipe` on UUID path params
- [x] `@IsEnum()` from `src/common/enums.ts` (never from `@prisma/client`)
- [x] `@IsDateString()` on date fields
- [x] GlobalValidationPipe: `whitelist: true, transform: true`

## 9. Timezone Checks

- [x] Attendance LATE rule: strictly after 08:30 Bangkok time
- [x] Exactly 08:30:00 Bangkok time = PRESENT
- [x] Work schedule reference: 08:30–17:30
- [x] Bangkok date computed by shifting UTC +7h
- [x] Dashboard uses `todayBangkok()` with same offset
- [ ] Known: `todayBangkok()` and `todayUtc()` diverge 17:00–23:59 UTC

## 10. Leave Balance Deduction

- [x] Approval requires matching LeaveBalance record
- [x] Approval fails if remaining days < requested days
- [x] Balance deduction + status change are atomic (`$transaction`)
- [x] Reject does not deduct balance
- [x] PATCH /leave-balances rejects negative remaining days (422)

## 11. Dashboard

- [x] Returns all sections: generatedAt, timezone, employees, attendance, leave, recent
- [x] All 19 queries run in parallel via `Promise.all`
- [x] `lowLeaveBalanceCount` threshold = 3 days, current Bangkok year
- [x] Recent records capped at 5 each
- [x] No password or secret fields in response
- [ ] Known: `todayAbsentCount` counts only explicit ABSENT records

## 12. Geofence Config Tests (T-059/T-060)

- [x] `GeofenceConfigService` — DB row present → `source: 'db'` and DB values returned
- [x] `GeofenceConfigService` — no DB row → `source: 'env'` and env-var values returned
- [x] `GeofenceConfigService` — missing/non-numeric env coords → `latitude/longitude: null`
- [x] `AttendanceService.updateGeofenceConfig()` — upserts DB row
- [x] `AttendanceService.updateGeofenceConfig()` — enabling without coords returns 422
- [x] `AttendanceService.updateGeofenceConfig()` — audit metadata contains no raw coordinates
- [x] `AttendanceController` — `@Roles(SUPER_ADMIN, HR_ADMIN)` metadata verified via `Reflect.getMetadata`
- [x] `AttendanceController` — `getGeofenceConfig` delegates to service
- [x] `AttendanceController` — `updateGeofenceConfig` delegates to service with audit context
- [x] security-review.sh PASS for T-060
- [x] verify.sh PASS (336 tests, 20 suites) for T-060
- [ ] docker-verify.sh — NOT RUN per Docker safety rule (requires `docker compose down` internally)

## 14. Known Limitations

| # | Area | Limitation |
|---|---|---|
| 1 | LeaveType | ANNUAL and UNPAID not in schema |
| 2 | LeaveType | UNPAID balance bypass not implemented |
| 3 | RBAC | MANAGER approve/reject is now department-scoped; list access (GET /leave, GET /off-site) remains org-wide |
| 4 | Absent | No automatic absent-marking |
| 5 | rejectReason | Accepted in DTO, not persisted |
| 6 | Security | JWT_SECRET = "change_me" |
| 7 | Security | CORS open |
| 8 | Security | DB credentials plaintext |
| 9 | Balance | `totalDays` vs `entitledDays` naming |
| 10 | Concurrency | Balance TOCTOU window |
| 11 | Audit Log | ~~Specification only~~ — **Implemented** through T-057B-7 (`v1.1.41-admin-audit-log-ui`); see [[Audit Log Module]] |

## Related Notes

- [[Backend v1 Readiness]]
- [[Verification Workflow]]
- [[Current Status]]

#qa #backend-v1
