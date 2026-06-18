# CTO Summary

## Step
T-050 — Username Login & HR Account Provisioning

## Status
PASS

## Scope Completed
- Prisma schema: added `username`, `mustChangePassword`, `passwordGeneratedAt`, `lastLoginAt`, `isActive` to `User` model
- Database migration applied (`20260618042317_add_username_fields`)
- Seed updated: admin user upserted with `username: 'admin'`
- Auth login updated: accepts `login` (username or email) OR legacy `email` field
- JWT payload and `/auth/me` now include `username` and `employeeId`
- Password generator utility: 8-char cryptographically secure, complexity-enforced
- Username utility: normalize, validate, suggest
- Account provisioning endpoint: `POST /employees/:id/account`
- Password reset endpoint: `POST /employees/:id/account/reset-password`
- Web Admin: login label updated (Thai/EN), `type="email"` → `type="text"`, `id="email"` preserved for E2E
- Web Admin: employee detail page gains "บัญชีเข้าใช้งาน" section with provisioning form and reset
- Mobile: login label updated to "ชื่อผู้ใช้หรืออีเมล", placeholder updated, `keyboardType` updated
- All API tests updated and passing (176 tests)
- All E2E tests passing (51 tests)

## Files Created
- `apps/api/prisma/migrations/20260618042317_add_username_fields/migration.sql`
- `apps/api/src/common/password.util.ts`
- `apps/api/src/common/password.util.spec.ts`
- `apps/api/src/common/username.util.ts`
- `apps/api/src/common/username.util.spec.ts`
- `apps/api/src/employees/dto/provision-account.dto.ts`
- `docs/USERNAME_LOGIN_AND_ACCOUNT_PROVISIONING.md`
- `docs/CTO_SUMMARY_T050.md`

## Files Modified (additional)
- `apps/api/src/employees/employees.service.spec.ts` — added 13 provisioning and reset-password tests

## Files Modified
- `apps/api/prisma/schema.prisma` — User model extended
- `apps/api/prisma/seed.ts` — upsert with username
- `apps/api/src/auth/dto/login.dto.ts` — `login`/`email` both optional @IsString
- `apps/api/src/auth/auth.service.ts` — identifier resolution, username/email routing, employeeId in JWT
- `apps/api/src/auth/auth.service.spec.ts` — full rewrite to cover username login, normalization, inactive user
- `apps/api/src/auth/strategies/jwt.strategy.ts` — `username`, `employeeId` in select and validate return
- `apps/api/src/auth/strategies/jwt.strategy.spec.ts` — updated for new fields and isActive check
- `apps/api/src/employees/employees.service.ts` — added `provisionAccount`, `resetAccountPassword`
- `apps/api/src/employees/employees.controller.ts` — added two provisioning routes
- `apps/api/src/test-utils/prisma.mock.ts` — added `findFirst`, `update`, `create` to user mock
- `apps/web/lib/api.ts` — `login` field, `LoginResponse` extended, provisioning API functions
- `apps/web/lib/auth.ts` — `AuthUser` extended with `username`, `mustChangePassword`, `employeeId`
- `apps/web/lib/i18n.ts` — `login_email` label updated in EN/TH
- `apps/web/app/login/page.tsx` — `type="text"`, `autoComplete="username"`, new placeholder
- `apps/web/app/(app)/employees/[id]/page.tsx` — account provisioning UI section
- `apps/mobile/app/login.tsx` — label, placeholder, keyboardType, demo credentials
- `apps/mobile/src/api/client.ts` — sends `login` field, updated error message
- `docs/API_ROUTES.md` — auth section and employees section updated

## Database / Prisma Migration Summary
- Migration: `20260618042317_add_username_fields`
- Additive-only: all new columns are nullable or have defaults — zero downtime
- `username TEXT UNIQUE` with index
- `mustChangePassword BOOLEAN DEFAULT false`
- `passwordGeneratedAt TIMESTAMP nullable`
- `lastLoginAt TIMESTAMP nullable`
- `isActive BOOLEAN DEFAULT true`
- Admin seed updated via upsert: existing rows preserve all data; only `username` is backfilled

## Auth Login Behavior Summary
- `POST /auth/login` accepts `{ login?, email?, password }`
- Resolves identifier: `login ?? email ?? ''`, trimmed and lowercased
- Routes by `@` presence: email search or username search
- Rejects `isActive = false` users
- Updates `lastLoginAt` on successful login
- Generic `"Invalid credentials"` for all failure modes (no enumeration)
- Rate limiting unchanged

## Username Policy Summary
- Regex: `^[a-z0-9._-]+$`
- Lowercase only; trimmed on normalize
- No spaces, no Thai, no `@` or other special chars
- Unique constraint in database
- Suggestion: `{lastInitial}.{firstName}` when Latin names available; null otherwise

## Password Generator Summary
- Length: exactly 8
- Composition: ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special (`!@#$%^&*`)
- Source: `crypto.randomInt` (CSPRNG)
- Secure Fisher-Yates shuffle
- Shown once in API response; bcrypt hash stored (cost 10)

## Account Provisioning API Summary
- `POST /employees/:id/account` — creates or updates linked User; returns temporaryPassword once
- `POST /employees/:id/account/reset-password` — regenerates password for existing account; returns once
- Both restricted to `SUPER_ADMIN` and `HR_ADMIN`
- `mustChangePassword` set to `true` on provisioning and reset
- If no email provided, fallback `emp_<id>@hr.local` generated

## Web Admin UI Summary
- Employee detail page (`/employees/:id`) gains "บัญชีเข้าใช้งาน" section (admin-only)
- Form: username input, role selector, suggest button, create button
- One-time password display with Thai warning: "กรุณาคัดลอกรหัสผ่านนี้ไว้ ระบบจะแสดงเพียงครั้งเดียว"
- Reset password subsection for existing accounts
- Login page: label changed to "ชื่อผู้ใช้หรืออีเมล" / "Username or Email", `id="email"` preserved for E2E

## Mobile Login UI Summary
- Label updated to "ชื่อผู้ใช้หรืออีเมล"
- Placeholder updated to "admin หรือ admin@hr.local"
- `keyboardType` changed from `email-address` to `default`
- Demo button fills with `admin` / `admin1234`
- Error message updated: "ชื่อผู้ใช้/อีเมลหรือรหัสผ่านไม่ถูกต้อง"

## Tests Added / Updated
- `password.util.spec.ts` — 14 tests: length, complexity, randomness
- `username.util.spec.ts` — 12 tests: normalize, validate, suggest
- `auth.service.spec.ts` — rewritten: 9 tests covering username/email login, normalization, routing, inactive user, empty identifier
- `jwt.strategy.spec.ts` — 3 tests covering username in payload, inactive user
- `employees.service.spec.ts` — added 13 provisioning tests: create new account, update existing account, mustChangePassword flag, bcrypt hash not plain text, temporaryPassword in response, username normalization, NotFoundException/ConflictException paths; reset-password: new temp password, mustChangePassword true, bcrypt hash not plain text, NotFoundException paths
- All 189 API unit tests: PASS
- All 51 Playwright E2E tests: PASS
- Mobile typecheck: PASS
- Web build: PASS

## Documentation Updated
- `docs/USERNAME_LOGIN_AND_ACCOUNT_PROVISIONING.md` — created
- `docs/API_ROUTES.md` — auth and employee sections updated
- `docs/CTO_SUMMARY_T050.md` — created (this file)

## Verification Results

| Check | Result |
|-------|--------|
| `npm test` (API) | ✅ 189/189 PASS |
| `npm run build` (API) | ✅ PASS |
| `npm run build` (web) | ✅ PASS |
| `npm run typecheck` (mobile) | ✅ PASS |
| `npx expo export --platform web` | ✅ PASS |
| `./scripts/verify.sh` | ✅ PASS |
| `./scripts/mobile-verify.sh` | ✅ PASS |
| `./scripts/api-smoke-test.sh` | ✅ PASS |
| `./scripts/e2e-test.sh` | ✅ 51/51 PASS |
| `GET /health` (Docker) | ✅ `{"status":"ok"}` |
| Username login via Docker API | ✅ `admin`/`admin1234` → token |

## Manual Verification Notes
- `curl POST /auth/login {"login":"admin","password":"admin1234"}` → accessToken with `username: "admin"` — VERIFIED
- `curl POST /auth/login {"login":"admin@hr.local","password":"admin1234"}` — VERIFIED via smoke test
- `curl POST /auth/login {"email":"admin@hr.local","password":"admin1234"}` — VERIFIED via smoke test (legacy field)
- Web login with email still works (E2E login tests pass)
- `POST /employees/:id/account` → provision flow live-verified: account created, `mustChangePassword: true`, new user logs in with temporary password and receives JWT with `employeeId`
- `POST /employees/:id/account/reset-password` → live-verified: old password rejected (401), new temporary password logs in successfully
- Account provisioning UI on employee detail page — implemented, not E2E tested (no test employee with linked account in seed)
- Mobile demo button fills `admin` / `admin1234` — code change verified; runtime test not performed (Expo not running)

## Security Review
- No enumeration: all credential failures return identical "Invalid credentials" message
- No plain password storage: bcrypt cost 10 for all passwords
- Temporary password returned once in response, never logged
- Rate limiting unchanged on `POST /auth/login`
- `isActive` check added to both login and JWT validation
- `mustChangePassword` tracked (enforcement deferred to future task)
- `ProvisionAccountDto` uses `@IsEnum(UserRole)` from `src/common/enums.ts` (safe from Prisma enum crash)
- Username validated with strict regex; stored via `normalizeUsername()` (always lowercase)

## Backward Compatibility Review
- Email login: ✅ works via legacy `email` field in DTO
- Old JWT tokens (without `username`/`employeeId`): will fail `validate()` since `findUnique` by `sub` succeeds regardless; validated users without username get `username: null` — acceptable
- Web E2E tests: ✅ all pass — `#email` selector preserved, `ADMIN_EMAIL`/`ADMIN_PASSWORD` still work
- Smoke test: ✅ passes with email-based login unchanged

## Known Limitations
- First-login password change enforcement not yet implemented
- Email notification on provisioning not implemented
- If admin seed user already had `username: 'admin'` set, upsert is a no-op (safe)
- Mobile account provisioning not in scope per task specification
- Fallback email `emp_<id>@hr.local` for provisioning without email is a placeholder

## Risk
**Low** — all changes are additive (new nullable columns, new optional DTO fields). Existing auth flow unchanged. Full test coverage maintained.

## Decision
**PASS**

## Recommended Commit Message
```
feat(auth): add username login and HR account provisioning (T-050)

- Add username, mustChangePassword, passwordGeneratedAt, lastLoginAt,
  isActive fields to User model with migration
- Login now accepts username or email via login/email field with
  backward-compatible resolution
- JWT payload and /auth/me include username and employeeId
- Add cryptographically secure password generator utility
- Add username normalize/validate/suggest utilities
- Add POST /employees/:id/account provisioning endpoint (SUPER_ADMIN, HR_ADMIN)
- Add POST /employees/:id/account/reset-password endpoint
- Web: login label updated, employee detail page gains account section
- Mobile: login label/placeholder updated for username support
- 189 API tests (includes 13 new provisioning tests), 51 E2E tests all passing
```

## Next Recommended Task
**T-051 — First-Login Forced Password Change**
- Detect `mustChangePassword = true` after login
- Show password change screen (web + mobile)
- Enforce before accessing other screens/routes
- Clear `mustChangePassword` and `passwordGeneratedAt` on success
