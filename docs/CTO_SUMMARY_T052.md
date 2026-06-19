# CTO Summary

## Step
T-052 — Mobile Profile & Password Change

## Status
PASS

## Scope
Implemented authenticated self-service password change and full profile view for all mobile roles. Backend adds `POST /auth/change-password` (JWT-protected, bcrypt-verified, complexity-enforced) and enhances `GET /auth/me` to return employee sub-object. Mobile `/profile` screen shows account info, employee info (if linked), `mustChangePassword` warning, and a password change form with inline validation. Home screen "โปรไฟล์ของฉัน" card activated. Fixed a bug in `validatePasswordComplexity` that rejected passwords longer than 8 characters.

## Files Created
- `apps/api/src/auth/dto/change-password.dto.ts` — `ChangePasswordDto` with class-validator decorators
- `apps/mobile/src/hooks/useProfile.ts` — profile/password change hook
- `apps/mobile/app/profile.tsx` — profile screen (account info, employee info, password form)
- `docs/MOBILE_PROFILE_PASSWORD_CHANGE.md` — full feature documentation
- `docs/CTO_SUMMARY_T052.md` — this file

## Files Modified
- `apps/api/src/common/password.util.ts` — fixed `length !== 8` → `length < 8` (allow min-8, not exactly-8)
- `apps/api/src/common/password.util.spec.ts` — updated test to reflect correct min-8 semantics
- `apps/api/src/auth/auth.service.ts` — added `getMe(userId)` and `changePassword(userId, dto)` methods
- `apps/api/src/auth/auth.controller.ts` — `me()` now delegates to `getMe()`; added `POST /auth/change-password` endpoint
- `apps/api/src/auth/auth.service.spec.ts` — added `getMe` and `changePassword` describe blocks (13 new tests)
- `apps/api/src/auth/auth.controller.spec.ts` — updated `me()` test; added `change-password` test; switched mock to include `getMe`/`changePassword`
- `apps/mobile/src/auth/types.ts` — `AuthUser` extended with `username`, `mustChangePassword`, `employeeId`; `AuthContextValue` extended with `refreshUser`
- `apps/mobile/src/auth/AuthProvider.tsx` — added `refreshUser(token)` method; imports `getProfile`
- `apps/mobile/src/api/types.ts` — `MobileUserProfile` extended with employee sub-object; added `ChangePasswordPayload`, `ChangePasswordResponse`
- `apps/mobile/src/api/client.ts` — added `changePassword(token, payload)` function; imported new types
- `apps/mobile/app/home.tsx` — enabled "โปรไฟล์ของฉัน" card with navigation to `/profile`; added `mustChangePassword` tappable warning banner
- `docs/API_ROUTES.md` — added `POST /auth/change-password` row; updated `GET /auth/me` response schema; updated leave endpoint MANAGER access (T-051 follow-up)
- `docs/USERNAME_LOGIN_AND_ACCOUNT_PROVISIONING.md` — added T-052 password change section; removed "first-login not implemented" limitation
- `docs/AUTH_SECURITY_HARDENING.md` — added Password Change Security section
- `docs/MOBILE_ROLE_BASED_UX.md` — added Profile & Password Change (T-052) section
- `apps/mobile/README.md` — added `/approvals` and `/profile` to screens table

## Backend Changes Summary

### POST /auth/change-password (new)
- `JwtAuthGuard` — JWT required
- `ChangePasswordDto` — `currentPassword`, `newPassword` (complexity enforced), `confirmPassword`
- Verifies current password with bcrypt
- Rejects `newPassword === currentPassword`
- Rejects `newPassword !== confirmPassword`
- Stores `bcrypt.hash(newPassword, 10)` and clears `mustChangePassword`
- Returns `{ success: true, mustChangePassword: false }`
- `401` for wrong current password; `400` for DTO violations

### GET /auth/me (enhanced)
Now calls `AuthService.getMe(userId)` which runs a richer Prisma query:
- Fetches `employee` with `department.name` and `position.title`
- Returns full profile including `employee: { id, firstName, lastName, employeeCode, department, position }`
- `employee` is `null` for users not linked to an Employee record

### password.util.ts fix
- `validatePasswordComplexity`: `length !== 8` → `length < 8`
- Generated 8-char passwords still pass; user-set passwords ≥8 chars now also accepted

## Mobile Changes Summary

### `/profile` screen
- Back nav, account info card, employee info card (if linked), mustChangePassword warning, password form
- 3 secure text inputs with show/hide toggle
- Inline password rules (real-time: ✓/✗ per rule)
- Submit disabled until all rules pass and passwords match
- Inline feedback banners (no `Alert.alert`)
- On success: inputs cleared, `refreshUser(token)` called → `mustChangePassword` flag updates in auth context/storage without re-login

### Home screen
- "โปรไฟล์ของฉัน" card enabled (navigates to `/profile`)
- `mustChangePassword` warning banner added (amber, tappable → `/profile`)

### Mobile types
- `AuthUser`: `username`, `mustChangePassword`, `employeeId` added
- `AuthContextValue`: `refreshUser` added
- `MobileUserProfile`: `username`, `mustChangePassword`, `employeeId`, `employee` added
- New: `ChangePasswordPayload`, `ChangePasswordResponse`

### `refreshUser(token)` on AuthProvider
Calls `getProfile(token)` after successful password change → maps to `AuthUser` → persists to SecureStore → updates React state. `mustChangePassword` warning clears without re-login.

## Tests Added / Updated
- `auth.service.spec.ts`: +6 tests in `changePassword` describe, +3 tests in `getMe` describe
- `auth.controller.spec.ts`: updated `me()` test (now asserts `getMe` delegation); +1 `changePassword` test; mock now includes `getMe` and `changePassword`
- `password.util.spec.ts`: "rejects password longer than 8" → "accepts password longer than 8 chars that meets all rules" + 1 additional 12-char acceptance test

| Suite | Before | After |
|-------|--------|-------|
| Total API tests | 190 | 202 |

## Verification Results

| Check | Result |
|-------|--------|
| `npm test` (API — 202 tests) | ✅ PASS |
| `npm run typecheck` (mobile) | ✅ PASS |
| `npx expo export --platform web` | ✅ PASS |
| `npm run build` (web — via verify.sh) | ✅ PASS |
| `./scripts/verify.sh` (API build + prisma + web build) | ✅ PASS |
| `./scripts/api-smoke-test.sh` | ✅ PASS |
| `./scripts/mobile-verify.sh` | ✅ PASS |
| `./scripts/e2e-test.sh` (51/51) | ✅ PASS |
| `docker compose ps` (all healthy) | ✅ PASS |
| `curl http://localhost:4002/health` | ✅ `{"status":"ok"}` |

## Issues Found During Implementation

1. **Position field is `title` not `name`** — The Prisma `Position` model uses `title`, not `name`. The `select` in `getMe()` was initially written with `{ name: true }` and the test mock had `{ name: 'Developer' }`. Fixed both: `select: { title: true }`, mock `{ title: 'Developer' }`, and return mapping `position?.title`.

2. **Existing `password.util.spec.ts` test for exactly-8** — A test "rejects password longer than 8" existed to verify the old (buggy) behavior. Updated to "accepts password longer than 8 chars that meets all rules" (2 new acceptance tests replace the 1 old rejection test, net +1 test).

## Security / RBAC Review
- No security regression introduced.
- `POST /auth/change-password` is JWT-protected — cannot be called unauthenticated.
- Password hash is never returned in any response.
- Current password must be verified before any change is accepted.
- `mustChangePassword` flag cleared on first successful self-change.
- No new public routes added.
- Rate limiting from `@nestjs/throttler` still applies globally.
- Existing admin@hr.local / admin1234 demo login remains unchanged.

## Backward Compatibility Review
- No breaking changes to existing API response shapes for `GET /auth/login` or `GET /auth/me` — the `me()` endpoint now returns MORE fields, not fewer.
- Existing mobile `AuthUser` type was extended (new optional-like fields); `login()` response still matches `AuthUser` because the login response includes `mustChangePassword`, `username`, and `employeeId` (already present in T-050).
- No Prisma schema changes; no migrations.
- Existing web app login and navigation unchanged (E2E: 51/51 pass).
- Existing mobile screens (attendance, leave, home, approvals, login) unchanged.
- 190 → 202 API tests (+12 net).

## Known Limitations
1. **No forced redirect on `mustChangePassword`** — The warning banner and profile warning are informational only. A user with `mustChangePassword = true` can still navigate to other screens. Forced enforcement is a future task.
2. **Docker container not rebuilt** — The running Docker container uses the pre-T-052 binary. `POST /auth/change-password` returns 404 on the Docker API. A `docker compose up -d --build` (user-approved) is required to deploy to Docker.
3. **Web app has no profile page** — Profile and password change are mobile-only. The web app has no equivalent screen.
4. **admin user employee sub-object** — The `admin@hr.local` seed user IS linked to an employee (`employeeId` is present), but the employee's department/position names will be populated based on seed data.
5. **No email notification** — No email is sent on successful password change.

## Risk
**Low**
- Additive-only backend changes (new endpoint, enhanced `me()` response)
- No schema changes; no migrations; no data mutations beyond user-initiated password changes
- Password security rules enforced at both DTO validation (backend) and UI (mobile form)
- All 202 API tests pass; all mobile and E2E checks pass

## Decision
**PASS**

## Recommended Commit Message
```
feat(mobile): add profile and password change flow (T-052)
```

## Next Recommended Task
**T-053** — Web Profile & Password Change (mirror the mobile profile/password flow in the Next.js web app), OR implement forced `mustChangePassword` redirect on mobile, OR begin HR admin employee management screens.
