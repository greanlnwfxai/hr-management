# Backend v1 Readiness

Source: `docs/BACKEND_V1_READINESS.md` (T-022 Backend Hardening & QA)  
Generated: 2026-06-12 | Branch: `feature/department-module`

Historical snapshot note:
- This note captures the backend v1 readiness decision at the time of T-022.
- It should not be mistaken for the full current-platform status through `v1.1.31`.
- For current product scope, see [[Platform State v1.1.31]].

## Verdict

> **Backend v1.0: READY** for local/dev use. Production deployment requires hardening.

## Completed Modules

| Module | Endpoints | Status |
|---|---|---|
| Auth | POST /auth/login, GET /auth/me | ✅ |
| Employees | CRUD + soft delete | ✅ |
| Departments | CRUD + safe hard delete | ✅ |
| Positions | CRUD + safe delete | ✅ |
| Attendance | Clock-in/out, list, Bangkok timezone | ✅ |
| Leave Request | Submit, list, approve (with balance), reject | ✅ |
| Leave Balance | Create, list, update, ownership-aware view | ✅ |
| Dashboard | 19 parallel queries aggregated snapshot | ✅ |

**Historical backend v1 total: 30 endpoints + /health**

## Verification Status

| Check | Result |
|---|---|
| `./scripts/verify.sh` | ✅ PASS |
| `./scripts/docker-verify.sh` | ✅ PASS |
| `./scripts/api-smoke-test.sh` | ✅ PASS (12/12) |

## Security Review

| Item | Status |
|---|---|
| JWT guard on all protected routes | ✅ |
| Role guard on admin routes | ✅ |
| Password hash never in response | ✅ |
| JWT payload: only sub/email/role | ✅ |
| EMPLOYEE gets 403 on /dashboard | ✅ |
| Unauthenticated gets 401 | ✅ |
| JWT_SECRET = "change_me" | ⚠️ Pre-deploy |
| DB credentials plaintext | ⚠️ Pre-deploy |
| CORS open | ⚠️ Pre-deploy |

## Required Before Production

1. `JWT_SECRET` → strong random value (`openssl rand -hex 32`)
2. DB credentials → gitignored `.env` or secrets manager
3. CORS → restrict to deployed frontend origin

## Recommended for v1.1

1. Add `UNPAID` (and `ANNUAL`) to `LeaveType` enum
2. Persist `rejectReason` in `LeaveRequest`
3. Rename `LeaveBalance.totalDays` → `entitledDays`
4. Align `todayUtc()` / `todayBangkok()` across modules
5. Clarify MANAGER access to leave request list

## Next Phase

**Frontend UI implementation** (Next.js App Router):
- Dashboard page
- Employee list page
- Leave management page (submit, view, approve/reject)

## Related Notes

- [[Current Status]]
- [[Backend QA Checklist]]
- [[Verification Workflow]]
- [[ADR-012 Backend v1 Readiness]]

#qa #backend-v1 #readiness
