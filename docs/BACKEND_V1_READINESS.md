# Backend v1.0 Readiness Report — HR Management

Generated: T-022 Backend Hardening & QA
Branch: feature/department-module

---

## 1. Completed Modules

| Module         | Endpoints                                                | Status    |
|----------------|----------------------------------------------------------|-----------|
| Auth           | POST /auth/login, GET /auth/me                          | ✅ DONE   |
| Employees      | CRUD + soft delete (status=INACTIVE)                    | ✅ DONE   |
| Departments    | CRUD + safe hard delete                                 | ✅ DONE   |
| Positions      | CRUD + safe delete                                      | ✅ DONE   |
| Attendance     | Clock-in/out, list (own/admin), Bangkok timezone         | ✅ DONE   |
| Leave Request  | Submit, list, approve (w/ balance), reject              | ✅ DONE   |
| Leave Balance  | Create, list, update, ownership-aware view              | ✅ DONE   |
| Dashboard      | Aggregated HR summary (19 parallel queries)             | ✅ DONE   |

Total endpoints: 30 across 8 modules + /health.

---

## 2. Verification Status

| Check                        | Result |
|------------------------------|--------|
| API build (`nest build`)     | ✅ PASS |
| Prisma schema validate       | ✅ PASS |
| Web build (`next build`)     | ✅ PASS |
| `./scripts/verify.sh`        | ✅ PASS |
| `./scripts/docker-verify.sh` | ✅ PASS |
| hr-db container healthy      | ✅ PASS |
| hr-api container healthy     | ✅ PASS |

---

## 3. Smoke Test Status

All 12 checks in `./scripts/api-smoke-test.sh` pass:

| Check                                   | Result |
|-----------------------------------------|--------|
| GET /health → status=ok                 | ✅     |
| POST /auth/login → accessToken          | ✅     |
| GET /auth/me → user id (no password)    | ✅     |
| GET /employees → meta.total             | ✅     |
| GET /departments → meta.total           | ✅     |
| GET /positions → meta.total             | ✅     |
| GET /attendance → meta.total            | ✅     |
| GET /leave → meta.total                 | ✅     |
| GET /leave-balances → meta.total        | ✅     |
| GET /dashboard → timezone=Asia/Bangkok  | ✅     |
| GET /dashboard → employees.totalEmployees | ✅   |
| GET /dashboard (no token) → 401         | ✅     |

---

## 4. Security Review Summary

| Area                          | Finding                                                  | Action     |
|-------------------------------|----------------------------------------------------------|------------|
| JWT guard on protected routes | Applied on all non-public endpoints                      | ✅ OK      |
| Role guard on admin routes    | Applied correctly via @Roles + RolesGuard                | ✅ OK      |
| Password hash exposure        | Never returned in any endpoint response                  | ✅ OK      |
| JWT payload                   | Contains only { sub, email, role } — no secrets          | ✅ OK      |
| Dashboard EMPLOYEE access     | Returns 403                                              | ✅ OK      |
| Unauthenticated access        | Returns 401 on all protected routes                      | ✅ OK      |
| JWT_SECRET in docker-compose  | Set to "change_me" — must be rotated before production   | ⚠️ Pre-deploy |
| DB credentials in docker-compose | Plaintext — move to .env or secrets manager          | ⚠️ Pre-deploy |
| CORS configuration            | app.enableCors() with no origin restriction              | ⚠️ Pre-deploy |
| ValidationPipe                | whitelist:true, transform:true globally applied          | ✅ OK      |

---

## 5. Known Limitations (Backend)

### Functional Limitations

1. **ANNUAL / UNPAID leave types not in schema**
   The Prisma enum has `SICK | VACATION | PERSONAL | OTHER`. The T-020 spec referenced ANNUAL and UNPAID, which would require an enum migration. Decision: VACATION covers annual leave; UNPAID deferred. A migration can be applied safely when needed.

2. **UNPAID leave bypass not implemented**
   When UNPAID is eventually added, the approval flow will need a type-specific bypass for balance check. Currently all leave types require a balance record.

3. **rejectReason not persisted**
   The `RejectLeaveRequestDto` accepts a `rejectReason` field but the schema has no such column. Field is silently ignored. Schema migration needed to persist rejection reasons.

4. **MANAGER cannot list all leave requests**
   `GET /leave` (admin list) is restricted to SUPER_ADMIN and HR_ADMIN. MANAGER can see balances (`GET /leave-balances`) but not requests. Intentionality unclear — review before v1.0 release.

5. **No automatic absent-marking**
   `todayAbsentCount` in the dashboard only counts explicitly created ABSENT records. Employees who didn't clock in are not automatically marked absent.

6. **TOCTOU on balance approval**
   Balance sufficiency check happens before the transaction. Under extreme concurrent approval, two approvals could slip through. Acceptable for HR load; `SELECT FOR UPDATE` can harden this if needed.

### Field Naming Inconsistency

7. **`totalDays` vs `entitledDays`**
   LeaveBalance DB column is `totalDays` (representing entitled days). API DTO input uses `entitledDays`. API response exposes `totalDays`. A future column rename migration would align the names.

### Deployment Concerns (not code bugs)

8. **JWT_SECRET = "change_me"** — must be replaced with a cryptographically strong secret before any production deployment.

9. **DB credentials in docker-compose.yml** — should be moved to `.env` (gitignored) or a secrets manager.

10. **CORS open** — `app.enableCors()` allows all origins. Restrict to known frontend origin(s) before production.

---

## 6. Architecture Notes

- Flat feature-module layout: `src/<feature>/` — consistent across all 8 modules.
- Enums: `src/common/enums.ts` holds runtime-safe enum definitions (mirrors Prisma schema; safe if `prisma generate` hasn't run).
- Services use `as unknown as Prisma<Enum>` casts to map common enums to Prisma types — type-safe at design time, zero-overhead at runtime.
- All paginated endpoints return `{ data: [], meta: { total, page, limit, totalPages } }`.
- Bangkok timezone: UTC+7 constant (no DST) applied in AttendanceService and DashboardService.

---

## 7. Remaining Backend Risks

| Risk                           | Likelihood | Impact | Mitigation                              |
|-------------------------------|------------|--------|-----------------------------------------|
| JWT_SECRET weak in production  | High       | High   | Rotate secret before first deployment   |
| DB password leaked via env     | Medium     | High   | Move to .env / secrets manager          |
| CORS misconfiguration          | Medium     | Medium | Lock to specific origin(s) in prod      |
| MANAGER leave-request gap      | Low        | Low    | Clarify with stakeholder; fix if needed |
| Balance TOCTOU under load      | Very low   | Low    | Add SELECT FOR UPDATE if concurrent HR  |

---

## 8. Recommendation

> **BACKEND v1.0: READY** (subject to pre-deployment security hardening)

All 8 modules are implemented, tested, and passing verification. The 30 API endpoints cover the complete HR operational workflow from authentication through leave approval. No critical bugs were found during T-022 hardening review.

**Required before any external/production deployment:**
1. Set `JWT_SECRET` to a strong random value (≥ 32 chars).
2. Move DB credentials out of docker-compose.yml into a gitignored `.env`.
3. Restrict CORS to the deployed frontend origin.

**Recommended before v1.1:**
1. Clarify MANAGER access to leave request list.
2. Add UNPAID leave type to schema (enum migration) with bypass logic.
3. Persist `rejectReason` (schema migration).
4. Rename `totalDays` → `entitledDays` in LeaveBalance (schema migration).

**Next phase:** Frontend UI implementation (Next.js App Router).
