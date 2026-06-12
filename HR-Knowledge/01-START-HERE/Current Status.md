# Current Status

Last updated: 2026-06-12

## Backend v1.0 — COMPLETE ✅

All 8 modules implemented, all three verification scripts pass. The backend API is stable and ready for frontend consumption.

## ADR Pack — COMPLETE ✅

12 Architecture Decision Records written in `docs/adr/`. See [[ADR Index]].

## Completed Modules

| Module | Endpoints | Step | Status |
|---|---|---|---|
| Auth | POST /auth/login, GET /auth/me | T-005–015 | ✅ Done |
| Employee | GET, POST, PATCH, DELETE /employees | T-005–015 | ✅ Done |
| Department | GET, POST, PATCH, DELETE /departments | T-016 | ✅ Done |
| Position | GET, POST, PATCH, DELETE /positions | T-017 | ✅ Done |
| Attendance | Clock-in/out, /me, admin list | T-018 | ✅ Done |
| Leave Request | Submit, list, approve, reject | T-019 | ✅ Done |
| Leave Balance | Create, list, update | T-020 | ✅ Done |
| Dashboard | GET /dashboard (19 parallel queries) | T-021 | ✅ Done |
| Backend Hardening | Expanded smoke test, docs | T-022 | ✅ Done |
| ADR Pack | ADR-001 through ADR-012 | T-023 | ✅ Done |

Total: **30 endpoints** + `GET /health`

## Verification Results (T-022)

| Script | Result |
|---|---|
| `./scripts/verify.sh` | ✅ PASS |
| `./scripts/docker-verify.sh` | ✅ PASS |
| `./scripts/api-smoke-test.sh` | ✅ PASS (12/12 checks) |

## Known Limitations

| # | Area | Limitation | Plan |
|---|---|---|---|
| 1 | LeaveType enum | ANNUAL and UNPAID not in schema | Enum migration in v1.1 |
| 2 | Leave approval | UNPAID balance bypass not implemented | After UNPAID enum added |
| 3 | LeaveRequest | `rejectReason` accepted in DTO but not persisted | Schema migration v1.1 |
| 4 | RBAC | MANAGER cannot access `GET /leave` (asymmetry with balances) | Stakeholder clarification |
| 5 | Attendance | No auto-absent marking job | Future scheduled task |
| 6 | Dashboard | `todayAbsentCount` counts only explicit ABSENT records | Acceptable for v1.0 |
| 7 | Dashboard | `todayBangkok()` vs `todayUtc()` can differ 17:00–23:59 UTC | Fix in v1.1 |
| 8 | LeaveBalance | DB column `totalDays` vs API field `entitledDays` | Column rename in v1.1 |
| 9 | Security | JWT_SECRET = "change_me" in docker-compose | Rotate before production |
| 10 | Security | DB credentials plaintext in docker-compose | Move to .env before production |
| 11 | Security | CORS open (`app.enableCors()` with no restriction) | Restrict before production |
| 12 | Frontend | No UI implemented | Next phase |

## Next Recommended Task

**Frontend UI Phase 1** — Build Next.js pages for:
- Dashboard page (connected to `GET /dashboard`)
- Employee list page
- Leave management page (submit, view, approve/reject)

See [[Backend v1 Architecture]] for the stable API contract.

## Pre-Deployment Hardening Required

Before any external or production deployment:
1. Set `JWT_SECRET` to a cryptographically strong random value (`openssl rand -hex 32`)
2. Move DB credentials out of `docker-compose.yml` into a gitignored `.env`
3. Restrict CORS to the deployed frontend origin

## Related Notes

- [[Project Overview]]
- [[Backend v1 Readiness]]
- [[Backend QA Checklist]]
- [[ADR Index]]

#hr-management #backend-v1 #status
