# ADR-012: Backend v1.0 Readiness

**Status:** Accepted | **Date:** 2026-06-12

Historical snapshot note:
- This ADR records the backend-v1 readiness decision.
- It is not the full current-platform status after later web, mobile, security, and documentation milestones.

## Decision

**Backend v1.0 is READY for local/dev use.**

All 8 modules implemented, passing all verification gates, limitations documented. Frontend UI development may proceed.

**Production deployment requires additional hardening** (see below).

## Verification Results

| Script | Result |
|---|---|
| `./scripts/verify.sh` | ✅ PASS |
| `./scripts/docker-verify.sh` | ✅ PASS |
| `./scripts/api-smoke-test.sh` | ✅ PASS — 12/12 checks |

## Security Review Summary

| Item | Status |
|---|---|
| All protected routes have `JwtAuthGuard` | ✅ |
| No password hashes exposed | ✅ |
| Admin-only routes role-gated | ✅ |
| EMPLOYEE gets 403 on `/dashboard` | ✅ |
| `JWT_SECRET = "change_me"` in docker-compose | ⚠️ Pre-deploy |
| DB credentials hardcoded | ⚠️ Pre-deploy |
| CORS open | ⚠️ Pre-deploy |

## Required Before Production

1. Rotate `JWT_SECRET` → `openssl rand -hex 32`
2. Move DB credentials to gitignored `.env`
3. Restrict CORS to deployed frontend origin

## Known Limitations (Summary)

12 limitations documented — see [[Current Status]] for the full table. None block core HR workflows in local/dev.

## Next Steps

- Frontend UI Phase 1 (Dashboard, Employee List, Leave Management)
- Pre-deployment hardening
- Backend v1.1 (enum additions, schema migrations, absent-marking job)

## Source

`docs/adr/ADR-012-backend-v1-readiness.md`

## Related Notes

- [[Current Status]]
- [[Backend v1 Readiness]]
- [[ADR Index]]

#adr #backend-v1 #readiness
