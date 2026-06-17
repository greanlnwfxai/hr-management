# CTO Summary

## Step
T-043 — Mobile Auth (JWT Authentication Flow)

## Status
PASS

## Scope Completed
Implemented real JWT authentication in `apps/mobile`. Users can log in via `POST /auth/login`, the token is stored securely using `expo-secure-store`, session is restored on app restart, protected routes redirect unauthenticated users to login, and logout clears storage and returns to the login screen. No backend code was changed.

## Files Created

- `apps/mobile/src/auth/types.ts` — `AuthUser` and `AuthContextValue` interfaces
- `apps/mobile/src/auth/storage.ts` — SecureStore helpers: `saveToken`, `getToken`, `clearToken`, `saveUser`, `getUser`, `clearUser`
- `apps/mobile/src/auth/AuthProvider.tsx` — `AuthProvider` React context + `useAuth` hook (signIn, signOut, restoreSession)
- `apps/mobile/src/auth/useAuth.ts` — re-export of `useAuth` for clean imports
- `docs/MOBILE_AUTH.md` — auth architecture, SecureStore details, route protection, error messages, manual verification guide

## Files Modified

- `apps/mobile/src/api/client.ts` — added `login()`, `getMe()`, typed `LoginResponse`
- `apps/mobile/app/_layout.tsx` — wrapped Stack with `<AuthProvider>`
- `apps/mobile/app/index.tsx` — shows loading spinner; redirects based on `isAuthenticated`
- `apps/mobile/app/login.tsx` — replaced placeholder with real form (email, password, error display, demo button)
- `apps/mobile/app/home.tsx` — added user card (email, role, avatar initial), logout button; protected route redirect
- `apps/mobile/app.json` — `expo-secure-store` plugin added automatically by `npx expo install`
- `apps/mobile/package.json` — `expo-secure-store` and `react-native-web` added to dependencies
- `apps/mobile/README.md` — updated with auth info, demo credentials, updated screen table

## Dependency Summary

| Package | Version | Reason |
|---|---|---|
| `expo-secure-store` | SDK 52 compatible | Keychain/Keystore JWT storage |
| `react-native-web` | ~0.19.13 | Web platform support (added T-042 web test) |

Install command: `npx expo install expo-secure-store` (auto-pinned to SDK 52 version)
Note: `npm install --legacy-peer-deps` still required due to react-native 0.76.5 peer dep version string mismatch.

## Auth Flow Summary

```
App launch
  → AuthProvider.restoreSession()
      → SecureStore: read hr_auth_token + hr_auth_user
      → if both present: isAuthenticated=true
      → set isLoading=false

/index
  → isLoading=true  → spinner
  → isLoading=false → <Redirect href="/home" | "/login">

/login (signIn)
  → POST /auth/login { email, password }
  → 401 → "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
  → fetch error → "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้"
  → 200 → SecureStore.save(token + user) → isAuthenticated=true → /home

/home (signOut)
  → SecureStore.clear(token + user) → isAuthenticated=false → /login
```

## Secure Storage Summary

- Library: `expo-secure-store`
- iOS: Keychain Services
- Android: Android Keystore
- Web (dev): AES-encrypted localStorage
- JWT never stored in AsyncStorage
- Keys: `hr_auth_token` (string), `hr_auth_user` (JSON)
- Helper file: `src/auth/storage.ts`

## Routing / Protected Route Summary

| Route | Protection | Behavior |
|---|---|---|
| `/` | — | Spinner while loading; `<Redirect>` based on auth |
| `/login` | Public | `useEffect` redirects to `/home` if already authenticated |
| `/home` | Protected | `useEffect` redirects to `/login` if not authenticated |

## API Client Summary

New functions in `src/api/client.ts`:

| Function | Endpoint | Auth |
|---|---|---|
| `login(email, pw)` | `POST /auth/login` | None |
| `getMe(token)` | `GET /auth/me` | Bearer token |

Error handling:
- Network failure → Thai error string
- HTTP 401 → Thai error string
- Other HTTP error → generic Thai + status code

## Screens Updated

**Login screen** — replaced placeholder with:
- Email + password fields (Thai labels)
- Error display (red left-border card)
- Loading spinner in button
- "ใช้บัญชีทดสอบ (Demo)" fills `admin@hr.local / admin1234`

**Home screen** — added:
- User card: avatar initial circle, email, role (formatted)
- "ออกจากระบบ" logout button
- Protected redirect guard

**Index screen** — replaced `<Redirect>` with auth-aware loading + conditional redirect

**Root layout** — wrapped with `<AuthProvider>`

## Documentation Updated

- `docs/MOBILE_AUTH.md` — new: auth architecture, SecureStore, route protection, error messages, manual verification, known limitations, future tasks
- `apps/mobile/README.md` — updated: auth section, demo credentials, screen table

## Verification Results

| Check | Result |
|---|---|
| `apps/mobile npm run typecheck` | **PASS** (zero errors) |
| `./scripts/verify.sh` (API build + Prisma + Web build) | **PASS** |
| `./scripts/docker-verify.sh` (all services healthy) | **PASS** |
| `./scripts/api-smoke-test.sh` | **PASS** |
| `./scripts/e2e-test.sh` (51 Playwright tests) | **PASS** |
| `apps/api npm test` (114 unit tests) | **PASS** |

## Manual Mobile Verification Notes

Run manually (non-interactive, cannot be automated in CI):

```bash
docker compose up -d
cd apps/mobile && npm run web   # opens http://localhost:8081
```

Expected flow:
1. App loads → spinner → redirects to `/login`
2. Tap "ใช้บัญชีทดสอบ (Demo)" → fills credentials
3. Tap "เข้าสู่ระบบ" → spinner → redirects to `/home`
4. Home shows user email (`admin@hr.local`) and role (`SUPER ADMIN`)
5. Tap "ตรวจสอบ API / Check API Health" → green `API: ok`
6. Reload browser → stays on `/home` (SecureStore persisted session — note: web uses encrypted localStorage)
7. Tap "ออกจากระบบ" → redirects to `/login`
8. Enter wrong password → red error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
9. No API → red error: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้"

Note on demo credentials: the task brief states `admin123` but the actual seeded password is `admin1234` (per CLAUDE.md). T-043 uses `admin1234`.

## Existing Web / API Impact

None. No changes to `apps/api`, `apps/web`, Prisma schema, migrations, API contracts, Docker Compose, or CI.

## Known Limitations

- Session is restored from SecureStore without network token validation. An expired JWT won't be caught until the first protected API request fails (T-044 to handle).
- No token refresh / auto-logout on expiry (JWT expires in 8h).
- No role-based route gating yet.
- `expo-secure-store` on web platform uses encrypted localStorage — less secure than native Keychain/Keystore.
- Thai i18n is hardcoded strings (no i18n library yet).
- Dark mode color tokens exist but are not wired to a theme provider.

## Risk
Low — all changes confined to `apps/mobile`; no backend or web app changes.

## Decision
**PASS**

## Recommended Commit Message

```
feat(mobile): add JWT authentication flow (T-043)

- Real login form: email/password, loading state, Thai error messages
- POST /auth/login → JWT stored via expo-secure-store (Keychain/Keystore)
- AuthProvider: signIn, signOut, restoreSession on app mount
- Protected routes: home redirects to login if unauthenticated
- Index routes based on auth state (loading spinner + Redirect)
- Home shows user email, role, avatar initial, logout button
- Demo button pre-fills admin@hr.local / admin1234
- All existing checks green: verify, docker, smoke, E2E (51), API tests (114)
```

## Next Recommended Task
**T-044 — Mobile Dashboard & Profile**
Fetch real employee/dashboard data using the stored JWT token. Display user profile (name, department, position) and summary stats. Handle 401 token expiry → auto sign-out.
