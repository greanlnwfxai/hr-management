# ADR-012: Backend v1.0 Readiness

## Status
Accepted

## Date
2026-06-12

## Context
The backend-first development strategy (ADR-004) required a clear definition of "done" for the backend before the frontend phase could begin. T-022 (Backend Hardening & QA) was the final backend step, producing a formal QA checklist, API route inventory, and readiness report. This ADR records the readiness decision and the conditions under which it was made.

This ADR remains a historical backend-v1 snapshot. It should not be read as the current full-platform state after later web, mobile, security, and documentation milestones.

## Decision
**Backend v1.0 is READY for local/dev use.**

All eight modules are implemented, passing all verification gates, and their limitations are documented. Frontend UI development may proceed.

**Production deployment requires additional hardening** (listed in Consequences below).

### Completed modules

| Module | Endpoints | Step |
|---|---|---|
| Auth | POST /auth/login, GET /auth/me | T-005–015 |
| Employee | GET, POST, PATCH, DELETE /employees | T-005–015 |
| Department | GET, POST, PATCH, DELETE /departments | T-016 |
| Position | GET, POST, PATCH, DELETE /positions | T-017 |
| Attendance | Clock-in/out, /attendance/me, /attendance | T-018 |
| Leave Request | Submit, list, approve, reject | T-019 |
| Leave Balance | Create, list, update | T-020 |
| Dashboard | GET /dashboard | T-021 |
| Hardening & QA | Docs, expanded smoke test | T-022 |
| ADR Pack | This document | T-023 |

**Historical backend-v1 route count:** thirty routes across eight modules plus `GET /health`.

### Verification results (T-022)

| Script | Result |
|---|---|
| `./scripts/verify.sh` | PASS — API build, Prisma validate, Web build |
| `./scripts/docker-verify.sh` | PASS — all containers healthy |
| `./scripts/api-smoke-test.sh` | PASS — 12/12 checks |

### Smoke test coverage (post T-022 expansion)
`GET /health` · `POST /auth/login` · `GET /auth/me` · `GET /employees` · `GET /departments` · `GET /positions` · `GET /attendance` · `GET /leave` · `GET /leave-balances` · `GET /dashboard` · `GET /dashboard` (timezone field) · `GET /dashboard` (no token → 401)

### Security review summary (T-022)
- All protected routes have `JwtAuthGuard` applied. ✅
- No password hashes exposed in any response. ✅
- Admin-only routes are role-gated. ✅
- `EMPLOYEE` role returns 403 on `GET /dashboard`. ✅
- `JWT_SECRET = "change_me"` in `docker-compose.yml`. ⚠️ Pre-deploy
- DB credentials hardcoded in `docker-compose.yml`. ⚠️ Pre-deploy
- CORS open (`app.enableCors()` with no origin restriction). ⚠️ Pre-deploy

### Known limitations

| # | Area | Limitation | Plan |
|---|---|---|---|
| 1 | LeaveType enum | ANNUAL and UNPAID not in schema | Enum migration in v1.1 |
| 2 | Leave approval | UNPAID balance bypass not implemented | After UNPAID enum added |
| 3 | LeaveRequest | `rejectReason` not persisted | Schema migration in v1.1 |
| 4 | RBAC | Snapshot reflects pre-T-051 manager leave-access policy | Superseded by later RBAC changes |
| 5 | Attendance | No auto-absent marking job | Future scheduled task |
| 6 | Dashboard | `todayAbsentCount` counts only explicit ABSENT records | Acceptable for v1.0 |
| 7 | Dashboard | `todayBangkok()` and `todayUtc()` can differ 17:00–23:59 UTC | Fix in v1.1 |
| 8 | LeaveBalance | `totalDays` vs `entitledDays` naming inconsistency | Column rename in v1.1 |
| 9 | Security | `JWT_SECRET = change_me` | Rotate before production |
| 10 | Security | DB credentials plaintext in docker-compose | Move to .env before production |
| 11 | Security | CORS open | Restrict before production |
| 12 | Frontend | No UI implemented in this historical backend snapshot | Later milestones delivered web and mobile UI |

### Required before production deployment
1. `JWT_SECRET` → strong random value (`openssl rand -hex 32`).
2. DB credentials → gitignored `.env` file or secrets manager.
3. CORS → restrict to deployed frontend origin.
4. TLS → terminate at reverse proxy (nginx/Caddy).
5. Database backup strategy.

### Recommended for v1.1
1. Add `UNPAID` (and `ANNUAL`) to `LeaveType` enum.
2. Persist `rejectReason` in `LeaveRequest`.
3. Rename `LeaveBalance.totalDays` → `entitledDays`.
4. Align `todayUtc()` / `todayBangkok()` across modules.
5. Clarify MANAGER leave-request access.

## Consequences

**Positive**
- Backend is fully verified and documented — safe to hand to a frontend developer.
- API contract is stable; frontend can begin consuming it without expecting breaking changes.
- All limitations are known, bounded, and have clear remediation paths.
- Verification scripts provide regression protection for all future changes.

**Negative**
- Three deployment hardening items block production use.
- Four schema-level limitations require migrations (v1.1).
- Frontend development begins without a complete UI — stakeholder demo will be API-only until T-024+.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Declare NOT READY until all limitations are fixed | All limitations are bounded and documented; none block core workflows; frontend cannot start until backend is declared done |
| Declare READY including production | Three security items (JWT secret, DB credentials, CORS) are not yet resolved |
| Add more modules before declaring v1.0 | Scope of v1.0 was defined upfront (T-016 through T-022); expanding scope delays frontend |

## Follow-up Tasks
- T-024: Frontend UI Phase 1 — historical next step from the backend-v1 milestone.
- T-025: Pre-deployment hardening — JWT_SECRET rotation, .env migration, CORS restriction.
- T-026: Backend v1.1 — enum additions, schema migrations, absent-marking job.
- Document the branching and merge strategy for `feature/department-module` → `main`.
