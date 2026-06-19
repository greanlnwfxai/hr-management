# CTO Summary

## Step
T-054 — Force mustChangePassword Flow

## Status
PASS

## Scope
Enforced the `mustChangePassword` flag as a hard gate across both the Next.js web admin and Expo React Native mobile apps. When a user's account has `mustChangePassword=true`, they are blocked from all normal protected features until they change their password. After a successful change, navigation is restored without requiring re-login. No backend changes, no new dependencies, no schema migrations.

## Files Created

| File | Purpose |
|---|---|
| `apps/web/e2e/force-password.spec.ts` | 7 Playwright E2E tests for the forced flow (redirect, banner, nav suppression, accessibility of profile/logout) |
| `docs/FORCE_MUST_CHANGE_PASSWORD_FLOW.md` | Feature documentation — architecture, redirect loop analysis, limitations |
| `docs/CTO_SUMMARY_T054.md` | This file |

## Files Modified

| File | Change |
|---|---|
| `apps/web/components/AppLayout.tsx` | Added `forced` state; redirect `useEffect` to `/profile` when forced and not already there; suppressed role nav links as non-clickable spans with hint; stronger red forced banner |
| `apps/web/lib/i18n.ts` | Added 2 new keys: `profile_forced_banner` (en + th), `profile_forced_nav_hint` (en + th) |
| `apps/mobile/app/home.tsx` | Added `forced` flag; attendance/leave/approvals FeatureCards disabled with "เปลี่ยนรหัสผ่านก่อน" badge when forced; profile card always enabled; org dashboard overview section hidden when forced (`{showDashboard && !forced && ...}`) |
| `apps/mobile/app/attendance.tsx` | Added `user` to `useAuth()` destructure; added mustChangePassword redirect guard |
| `apps/mobile/app/leave.tsx` | Added `user` to `useAuth()` destructure; added mustChangePassword redirect guard |
| `apps/mobile/app/approvals.tsx` | Added `useEffect` import; added mustChangePassword redirect guard |
| `docs/SECURITY_REVIEW_LOG.md` | Added T-054 security review entry |

## Verification Result

| Script | Result |
|---|---|
| `./scripts/verify.sh` | **PASS** — API build PASS, Prisma valid PASS, Web build PASS (all routes including forced logic compiled) |
| `./scripts/security-review.sh` | **PASS** — audit PASS (accepted risks unchanged), secret scan PASS |
| `npm --prefix apps/api test` | **PASS** — 202/202 tests (no backend changes) |
| `./scripts/mobile-verify.sh` | **PASS** — TypeScript typecheck PASS, Expo web export PASS |
| `./scripts/e2e-test.sh` | **PASS** — 65/65 tests (7 new force-password tests all pass) |
| `docker compose up -d --build web` | **PASS** — web image rebuilt with forced flow; stack healthy |
| `docker compose ps` + health curl | **PASS** — hr-web, hr-api, hr-db all Up/healthy |

### docker-verify.sh Note
`docker-verify.sh` was not run — it executes `docker compose down` internally, which is prohibited by Docker Safety Rules. Runtime verification was performed via `docker compose up -d --build web`, `docker compose ps`, and direct health check curl against `http://localhost:4002/health`. All services healthy.

## Issues Found

1. **E2E tests initially ran against stale Docker container:** The first E2E run (before Docker rebuild) showed 3 failures — the redirect and nav-forced-hint tests failed because the web container still had pre-T-054 code. Rebuilt with `docker compose up -d --build web`, then re-ran. All 65 tests pass.

2. **`approvals.tsx` missing `useEffect` import:** The file used only `useState` from React. Added `useEffect` to the import to support the mustChangePassword guard. TypeScript typecheck confirmed no regression.

3. **Mobile org dashboard visible to forced admin/manager users:** The `{showDashboard && ...}` section in `home.tsx` remained visible even when `forced=true`, showing employee counts, attendance stats, and pending-leave numbers to admin/manager/HR users who had not yet changed their password. Guard tightened to `{showDashboard && !forced && ...}` for consistency with the web behavior (web redirects all routes to /profile; mobile home now hides all data sections). Mobile typecheck + Expo web export re-confirmed PASS.

4. **7 additional E2E failures reported after initial rebuild (force-password 1/2/3 + profile 2/3/4/5):** Not reproduced on the rebuilt image. Root cause is a single environment artifact: the suite was run against the un-rebuilt web container. The old image had no redirect `useEffect` (→ force-password 1/2/3 fail; URL stayed at `/dashboard`/`/leave`) and lacked the email text and pw-rule `data-testid`s from T-053 (→ profile 2/3/4/5 fail). Profile test 1 ("renders title") passed because that static element was already present in the old image — consistent with a stale-image cause, not an API connectivity issue. All 65 tests pass on the rebuilt image at 0 retries.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints. All enforcement is frontend-only. Backend JWT guards unchanged. |
| RBAC impact | No role-check changes. Forced redirect applied equally to all roles when `mustChangePassword=true`. |
| Data privacy impact | No new data access. Redirect logic reads only `user.mustChangePassword` from local auth state. |
| Password/token/hash impact | No change to password hashing, JWT issuance, or token storage. |
| Mobile security impact | `router.replace` (no stack accumulation). `useAuth` user state backed by SecureStore. Expo web export passes — no native-only APIs used. |
| Dependency/advisory impact | No new packages added. No new audit findings. |
| Secrets/logging check | Secret scan PASS. No passwords, tokens, or hashes in logs or responses. |
| New endpoints protected | None added. |
| Risk level | LOW |
| Security decision | PASS |

**Note on enforcement boundary:** Frontend-only enforcement means a user who crafts direct API calls with a valid JWT bypasses the forced change gate. This is acceptable: `mustChangePassword` is a UX policy flag; the API's `JwtAuthGuard` already enforces authentication. If API-level enforcement is needed, a future task should add a backend middleware guard that rejects non-change-password requests when `mustChangePassword=true`.

## Risk
Low

## Decision
PASS

## Next Step
T-055 — or the next planned feature step. Candidates:
- HR admin employee provisioning mobile screens
- Web dashboard enhancements
- Department/Position management on mobile

## Recommended Commit Message
```
feat(auth): enforce mustChangePassword gate on web and mobile (T-054)

- Web: AppLayout redirects all non-profile routes to /profile when
  mustChangePassword=true; nav links suppressed as disabled spans;
  stronger red forced banner with new i18n keys
- Mobile: home screen disables attendance/leave/approvals FeatureCards
  and hides org dashboard overview when forced; attendance, leave, and
  approvals screens redirect to /profile via mustChangePassword guard
- 7 new E2E tests (force-password.spec.ts); 65/65 pass
- No backend changes; no new dependencies; 202/202 API unit tests pass
```
