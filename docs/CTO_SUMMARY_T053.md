# CTO Summary

## Step
T-053 — Web Profile & Password Change

## Status
PASS

## Scope
Added a `/profile` page to the Next.js web admin app. All authenticated roles (SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE) can view their account/employee information and change their password. Includes a mustChangePassword warning banner across all pages, inline password-rule validation, and a custom event pattern to refresh auth state without page reload.

## Files Created

| File | Purpose |
|---|---|
| `apps/web/app/(app)/profile/page.tsx` | Profile page — account info, employee info, password change form |
| `apps/web/e2e/profile.spec.ts` | Playwright E2E smoke tests for profile page (7 tests) |
| `docs/WEB_PROFILE_PASSWORD_CHANGE.md` | Feature documentation |
| `docs/CTO_SUMMARY_T053.md` | This file |

## Files Modified

| File | Change |
|---|---|
| `apps/web/lib/api.ts` | Added `no401Redirect` option to `FetchOptions`; updated `getMe()` type to `MeResponse`; added `changePassword()` function |
| `apps/web/lib/i18n.ts` | Added 27 new translation keys (en + th) for profile/password-change UI |
| `apps/web/components/AppLayout.tsx` | Added profile nav link for all roles (desktop sidebar + mobile menu); added `hr-user-change` event listener; added `mustChangePassword` banner |
| `docs/SECURITY_REVIEW_LOG.md` | Added T-053 security review entry |

## Verification Result

| Script | Result |
|---|---|
| `./scripts/verify.sh` | **PASS** — API build PASS, Prisma valid PASS, Web build PASS (/profile route included) |
| `./scripts/security-review.sh` | **PASS** — audit PASS, secret scan PASS |
| `npm --prefix apps/api test` | **PASS** — 202/202 tests |
| `./scripts/api-smoke-test.sh` | **PASS** — all endpoints healthy |
| `./scripts/e2e-test.sh` | **PASS** — 58/58 tests (7 new profile tests all pass) |
| `./scripts/mobile-verify.sh` | **PASS** — typecheck and Expo export |
| `./scripts/docker-verify.sh` | First run: FAIL (transient `npm ci` network failure in Docker Alpine build for web — unrelated to code changes); Second run: web image build succeeded; stack healthy |

### Docker Build Note
The first `docker-verify.sh` run failed at the `RUN npm ci --frozen-lockfile` step for the web image — a transient network failure during npm package installation inside the Alpine container. The local `npm ci` (locally installed) and `verify.sh` (local build) succeeded. Running `docker compose build web` separately succeeded and produced a healthy image. The full stack was brought up via `docker compose up -d` and `api-smoke-test.sh` passed cleanly.

## Issues Found

1. **E2E strict mode violation (fixed inline):** Initial E2E test `shows account info section with email` used `getByText('admin@hr.local')` which matched both the sidebar user widget and the profile email field. Fixed by using `{ exact: true }` on the locator — the sidebar element contains additional role text so it doesn't match exactly.

2. **Docker transient failure (not introduced by this task):** `npm ci` inside the web Alpine Docker image failed on first attempt (network timeout). Rebuilt successfully on second attempt. No lockfile or package.json changes were made in this task.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new guards added. `GET /auth/me` and `POST /auth/change-password` are existing `@UseGuards(JwtAuthGuard)` endpoints. |
| RBAC impact | Profile page is accessible to all authenticated roles — no role gate. No admin-only data exposed. |
| Data privacy impact | `GET /auth/me` returns only the authenticated user's own data. No cross-user data access. |
| Password/token/hash impact | Passwords held only in ephemeral React `useState`, never persisted or logged. Cleared on success. `no401Redirect` sends the JWT token normally — only prevents logout-on-401 for the change-password case (wrong current password). |
| Mobile security impact | No mobile code changed. |
| Dependency/advisory impact | No new packages added. No new audit findings. |
| Secrets/logging check | `secret-scan.sh` PASS. No password values, tokens, or hashes appear in source. |
| New endpoints protected | None added. Both endpoints pre-existed with JwtAuthGuard. |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Next Step
T-054 — Forced Password Change Redirect (if a user has mustChangePassword=true, redirect all non-profile routes to /profile until changed) — or the next planned feature step.

## Recommended Commit Message
```
feat(web): add profile page and password change (T-053)

- Add /profile route visible to all authenticated roles
- Show account info (email, username, role) and employee info if linked
- Password change form with inline rule validation and show/hide toggles
- mustChangePassword warning banner on all pages (dismisses on success)
- Add no401Redirect option to apiFetch to handle wrong-password 401 inline
- Add 27 i18n keys (en + th) for profile/password-change UI
- 7 new E2E tests; 58/58 pass; 202/202 API unit tests pass
```
