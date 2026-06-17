# Mobile Auth (T-043)

## Auth Architecture

```
AuthProvider (React Context)
  ├── restoreSession()  — reads SecureStore on app mount
  ├── signIn(email, pw) — POST /auth/login → saves token + user to SecureStore
  └── signOut()         — clears SecureStore, resets state

Screens consume useAuth()
  ├── index.tsx    — loading spinner → Redirect based on isAuthenticated
  ├── login.tsx    — calls signIn(); useEffect redirects to /home on success
  └── home.tsx     — useEffect redirects to /login if auth lost; calls signOut()
```

## Token Storage

- Package: **expo-secure-store**
- Keychain (iOS) / Keystore (Android) / Encrypted localStorage (web dev only)
- JWT is **never** stored in AsyncStorage
- Two keys: `hr_auth_token` (JWT string) and `hr_auth_user` (JSON)
- Stored in `src/auth/storage.ts`: `saveToken`, `getToken`, `clearToken`, `saveUser`, `getUser`, `clearUser`

## Login Endpoint

```
POST /auth/login
Content-Type: application/json

{ "email": "admin@hr.local", "password": "admin1234" }
```

Response:
```json
{
  "accessToken": "<JWT>",
  "user": { "id": "...", "email": "admin@hr.local", "role": "SUPER_ADMIN" }
}
```

## Session Restoration

On app start, `AuthProvider.useEffect` calls `restoreSession()`:
1. Reads `hr_auth_token` and `hr_auth_user` from SecureStore in parallel
2. If both exist → `isAuthenticated = true`, sets user/token in state
3. If missing or error → `isAuthenticated = false`
4. Sets `isLoading = false` in both cases

No network call is made on startup. If the stored token is expired, the next authenticated API call will return 401 — that case will be handled in T-044.

## Route Protection

| Route | Behavior |
|---|---|
| `/` (index) | Shows spinner while loading; redirects to `/home` or `/login` |
| `/login` | Public; redirects to `/home` if already authenticated |
| `/home` | Protected; `useEffect` redirects to `/login` if not authenticated |

## Error Messages (Thai)

| Condition | Message |
|---|---|
| Wrong credentials (401) | อีเมลหรือรหัสผ่านไม่ถูกต้อง |
| Network failure | ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ |
| Other server error | เกิดข้อผิดพลาด: HTTP {status} |

## Demo Credentials (local seed)

```
Email:    admin@hr.local
Password: admin1234
```

The login screen has a **"ใช้บัญชีทดสอบ (Demo)"** button that pre-fills these values.

## API Base URL

Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env`:

| Platform | Value |
|---|---|
| iOS Simulator | `http://localhost:4002` |
| Android Emulator | `http://10.0.2.2:4002` |
| Physical device | `http://<LAN-IP>:4002` |

## Manual Verification Steps

```bash
# 1. Start backend
docker compose up -d

# 2. Start mobile (web mode for quick test)
cd apps/mobile
npm run web
# or: npm run ios / npm run android

# 3. Open http://localhost:8081
```

Verify:
- [ ] Login form appears at `/login`
- [ ] "ใช้บัญชีทดสอบ" fills credentials
- [ ] Submit → loading spinner → redirects to `/home`
- [ ] Home shows user email and role
- [ ] "ออกจากระบบ" → redirects back to `/login`
- [ ] Reload app after login → stays on `/home` (session persisted)
- [ ] Wrong password → shows error message in Thai

## Known Limitations

- Session is restored from SecureStore only (no network validation on startup). Expired tokens won't be detected until the first protected API call fails — handled in T-044.
- SecureStore on web uses encrypted localStorage; for production, native builds use Keychain/Keystore.
- No token refresh mechanism yet; JWT expires in 8 hours (`JWT_EXPIRES_IN=8h`).
- No role-based UI yet; role is displayed as text only.

## Future Tasks

| Task | Scope |
|---|---|
| **T-044** | Mobile Dashboard & Profile — fetch real employee data with auth token |
| **T-045** | Mobile Attendance Foundation — attendance history and UI |
| **T-046** | Attendance Geofence Backend — API-side GPS validation |
| **T-047** | Mobile Geofence Clock In/Out — GPS-gated attendance |
| **T-048** | Mobile Leave Request — submit and view leave requests |
