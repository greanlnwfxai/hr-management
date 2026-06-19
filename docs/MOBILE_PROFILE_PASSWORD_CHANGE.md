# Mobile Profile & Password Change

**Task:** T-052 — Mobile Profile & Password Change
**Status:** Complete

---

## Overview

All authenticated users can view their profile and change their password via the `/profile` screen on the mobile app. This screen is accessible from the Home screen "โปรไฟล์ของฉัน" card (previously a coming-soon placeholder).

Key features:
- Account info: email, username, role badge, account status
- Employee info (if linked): full name, employee code, department, position
- `mustChangePassword` warning — visible on both the profile screen and the Home screen
- Password change form with inline validation, show/hide toggle, and feedback banners

---

## Who Can Access

All authenticated roles can access `/profile`. There is no role gate.

---

## Mobile Entry Point

**Home screen** (`apps/mobile/app/home.tsx`):
- "โปรไฟล์ของฉัน" card in the **เมนูหลัก** section — now active for all roles, navigates to `/profile`.
- `mustChangePassword` tappable warning banner shown on Home if `profile.mustChangePassword` or `user.mustChangePassword` is `true`. Tapping it navigates to `/profile`.

---

## Profile Screen (`/profile`)

File: `apps/mobile/app/profile.tsx`

### Layout

1. Back navigation (← กลับ)
2. `mustChangePassword` warning card (amber, appears when flag is true)
3. **ข้อมูลบัญชี** card — email, username (if set), role badge, account status badge
4. **ข้อมูลพนักงาน** card — full name, employee code, department, position (only shown if user is linked to an employee record)
5. **เปลี่ยนรหัสผ่าน** card — password change form (always shown)

### Password Change Form

- 3 secure text inputs: รหัสผ่านปัจจุบัน, รหัสผ่านใหม่, ยืนยันรหัสผ่านใหม่
- Show/hide toggle on each input (👁 / 🙈)
- Inline password rules (shown while typing new password):
  - ✓/✗ อย่างน้อย 8 ตัวอักษร
  - ✓/✗ ตัวพิมพ์ใหญ่ (A-Z)
  - ✓/✗ ตัวพิมพ์เล็ก (a-z)
  - ✓/✗ ตัวเลข (0-9)
  - ✓/✗ อักขระพิเศษ (!@#$%^&*)
- Confirm mismatch error shown inline ("รหัสผ่านไม่ตรงกัน")
- Submit button disabled until all rules pass and passwords match
- Success/error banner (dismissible tap-to-close) — no `Alert.alert` (web-compatible)
- On success: fields reset, `mustChangePassword` warning clears, auth context updated via `refreshUser()`

---

## Backend API

### GET /auth/me (enhanced)

Now calls `AuthService.getMe(userId)` which fetches the full user + employee + department + position:

```json
{
  "id": "uuid",
  "email": "admin@hr.local",
  "username": "admin",
  "role": "SUPER_ADMIN",
  "mustChangePassword": false,
  "employeeId": "emp-uuid-or-null",
  "employee": {
    "id": "emp-uuid",
    "firstName": "John",
    "lastName": "Doe",
    "employeeCode": "EMP001",
    "department": "Engineering",
    "position": "Developer"
  }
}
```

`employee` is `null` for users (such as the admin seed user) not linked to an Employee record.

### POST /auth/change-password (new)

JWT-protected. Body:

```json
{
  "currentPassword": "OldPass1!",
  "newPassword": "NewPass9!",
  "confirmPassword": "NewPass9!"
}
```

Behavior:
1. Validates DTO fields with `class-validator` (`@MinLength`, `@Matches`)
2. Finds user by ID (from JWT)
3. Verifies `currentPassword` with `bcrypt.compare`
4. Rejects if `newPassword === currentPassword`
5. Hashes `newPassword` with `bcrypt.hash(pw, 10)`
6. Updates DB: `password = hash, mustChangePassword = false`
7. Returns `{ success: true, mustChangePassword: false }`

Error responses:
- `400` — DTO validation failure, passwords don't match, new = current
- `401` — wrong current password

---

## API Client

File: `apps/mobile/src/api/client.ts`

| Function | Method | Endpoint |
|----------|--------|----------|
| `getProfile(token)` | GET | `/auth/me` |
| `changePassword(token, payload)` | POST | `/auth/change-password` |

`changePassword` uses the existing `authPost` helper (throws `SessionExpiredError` on 401, throws `Error` with API message on other errors).

---

## Hook

File: `apps/mobile/src/hooks/useProfile.ts`

| State / Action | Description |
|----------------|-------------|
| `loadState` | `'idle' \| 'loading' \| 'success' \| 'error'` |
| `profile` | `MobileUserProfile` with full employee sub-object |
| `error` | Error message or null |
| `actionLoading` | True while password change is in-flight |
| `refresh()` | Re-fetches profile |
| `changePassword(current, new, confirm)` | Calls API, refreshes auth context, updates local profile state |

After a successful password change, `refreshUser(token)` is called on the `AuthContext` so the `mustChangePassword` flag is updated in storage and React state — the warning banner on the Home screen disappears without requiring re-login.

---

## Auth Context Changes

File: `apps/mobile/src/auth/AuthProvider.tsx`

`refreshUser(token: string)` added to `AuthProvider`:
1. Calls `getProfile(token)` to fetch fresh user data
2. Maps to `AuthUser` shape
3. Calls `saveUser(updated)` to persist to secure storage
4. Updates React state `user`

`AuthContextValue` interface updated to declare `refreshUser`.

---

## Type Changes

### `apps/mobile/src/auth/types.ts`

```typescript
export interface AuthUser {
  id: string;
  email: string;
  username: string | null;      // new
  role: string;
  mustChangePassword: boolean;  // new
  employeeId: string | null;    // new
}

export interface AuthContextValue {
  // ... existing fields ...
  refreshUser: (token: string) => Promise<void>;  // new
}
```

### `apps/mobile/src/api/types.ts`

`MobileUserProfile` extended with `username`, `mustChangePassword`, `employeeId`, and `employee` sub-object.

New types added:
- `ChangePasswordPayload` — `{ currentPassword, newPassword, confirmPassword }`
- `ChangePasswordResponse` — `{ success, mustChangePassword }`

---

## Password Utility Fix

File: `apps/api/src/common/password.util.ts`

`validatePasswordComplexity` fixed: `length !== 8` → `length < 8`.

Before: passwords longer than 8 characters would fail the validation (only exactly-8-char passwords passed).
After: any password with at least 8 characters passes the length check. The 8-char generated password still passes; user-set passwords of any length ≥ 8 also pass.

---

## Security Notes

- Plain passwords are never logged, stored, or returned in any response
- Current password verified before any change is accepted
- No hash is returned in the response
- Wrong current password returns `401` (not `400`) to be consistent with auth errors
- `mustChangePassword` is cleared on first successful self-change
- Rate limiting from `@nestjs/throttler` still applies globally to all auth endpoints

---

## Known Limitations

1. **No forced redirect** — `mustChangePassword` is surfaced as a warning banner but does not block navigation to other screens. Future work: enforce redirect to `/profile` until password is changed.
2. **No email notification** — No email is sent on password change; this is an authenticated self-service action.
3. **Admin user has no employee record** — The seed `admin@hr.local` account is not linked to an Employee record, so the "ข้อมูลพนักงาน" card is not shown for admin.

---

## Future Improvements

- Forced redirect on `mustChangePassword = true` (block other screens until changed)
- Password change history / last-changed timestamp
- Account lockout after N failed change attempts
- Admin "force password reset" toggle
- Web profile page (currently web app has no profile page — this is mobile-only)
