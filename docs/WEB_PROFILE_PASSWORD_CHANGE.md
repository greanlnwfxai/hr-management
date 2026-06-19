# Web Profile & Password Change

**Task:** T-053 — Web Profile & Password Change
**Status:** Complete

---

## Overview

All authenticated users can view their profile and change their password on the `/profile` page in the web admin app. The page is accessible from the sidebar nav (visible to all roles).

Key features:
- Account info: email, username, role badge
- Employee info (if linked): full name, employee code, department, position
- `mustChangePassword` warning banner — visible on the profile page and in the AppLayout header (all pages)
- Password change form with inline validation and show/hide toggles
- Inline password rule checklist (✓/✗) matching the server DTO policy exactly

---

## Who Can Access

All authenticated roles: `SUPER_ADMIN`, `HR_ADMIN`, `MANAGER`, `EMPLOYEE`.  
No role gate — the profile page is universal.

---

## Entry Points

1. **Sidebar nav** — "My Profile" / "โปรไฟล์" link at the bottom of the navigation (all roles, all screen sizes).
2. **Mobile menu** — same link visible in the collapsible mobile nav.
3. **mustChangePassword banner** — informational yellow bar that appears at the top of every page (below the mobile header) when `user.mustChangePassword` is true. Not a hard block.

---

## Profile Page (`/profile`)

File: `apps/web/app/(app)/profile/page.tsx`

### Layout

1. Page title: "โปรไฟล์ของฉัน"
2. `mustChangePassword` warning card (amber) — appears when flag is true
3. **Account Information** card — email, username, role
4. **Employee Information** card — full name, employee code, department, position (only shown when user is linked to an employee record)
5. **Change Password** card — password change form (always shown)

### Password Change Form

- 3 password inputs: รหัสผ่านปัจจุบัน, รหัสผ่านใหม่, ยืนยันรหัสผ่านใหม่
- Show/hide toggle on each input (👁 / 🙈)
- Inline password rules shown while typing new password:
  - ✓/✗ อย่างน้อย 8 ตัวอักษร
  - ✓/✗ ตัวพิมพ์ใหญ่ (A-Z)
  - ✓/✗ ตัวพิมพ์เล็ก (a-z)
  - ✓/✗ ตัวเลข (0-9)
  - ✓/✗ อักขระพิเศษ (!@#$%^&*)
- Confirm mismatch error shown inline
- Submit button disabled until all rules pass and passwords match
- Success/error banner (non-dismissible, replaces each other)
- On success: fields reset, mustChangePassword warning clears, AppLayout banner removes, profile re-fetched

---

## API Client Changes (`apps/web/lib/api.ts`)

### `no401Redirect` option

Added `no401Redirect?: boolean` to `FetchOptions`. When set, the fetch helper sends the Authorization header (normal session auth) but does NOT redirect to `/login` on a 401 response. Instead it throws `ApiError(401, message)` from the server — allowing the profile page to display the server's Thai error message inline.

This is necessary because wrong current password returns 401 from `POST /auth/change-password`, which would otherwise clear auth and redirect to the login page.

### `getMe()` type updated

Return type updated to `MeResponse` which includes `mustChangePassword`, and `employee { id, firstName, lastName, employeeCode, department: string|null, position: string|null }` matching the `GET /auth/me` response exactly.

### `changePassword()` added

```typescript
changePassword({ currentPassword, newPassword, confirmPassword })
// POST /auth/change-password — uses no401Redirect: true
// Returns { success: boolean; mustChangePassword: boolean }
```

---

## Auth State Refresh

After successful password change:
1. Profile page calls `setUser()` (from auth.ts) to update `mustChangePassword: false` in localStorage.
2. Profile page dispatches `hr-user-change` custom event.
3. `AppLayout` listens for `hr-user-change` and re-reads the user — the mustChangePassword banner disappears immediately without page reload.
4. Profile page re-fetches `GET /auth/me` so the warning card also clears.

---

## i18n Keys Added

Both `en` and `th` blocks in `apps/web/lib/i18n.ts` received these new keys:

| Key | EN | TH |
|---|---|---|
| `nav_profile` | My Profile | โปรไฟล์ |
| `page_profile` | My Profile | โปรไฟล์ของฉัน |
| `profile_account_info` | Account Information | ข้อมูลบัญชี |
| `profile_employee_info` | Employee Information | ข้อมูลพนักงาน |
| `profile_username` | Username | ชื่อผู้ใช้ |
| `profile_email` | Email | อีเมล |
| `profile_role` | Role | บทบาท |
| `profile_emp_code` | Employee Code | รหัสพนักงาน |
| `profile_dept` | Department | แผนก |
| `profile_position` | Position | ตำแหน่ง |
| `profile_must_change_pw` | Password change required | ต้องเปลี่ยนรหัสผ่าน |
| `profile_must_change_pw_banner` | Please change your temporary password before continuing. | กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนดำเนินการต่อ |
| `profile_change_password` | Change Password | เปลี่ยนรหัสผ่าน |
| `profile_current_password` | Current Password | รหัสผ่านปัจจุบัน |
| `profile_new_password` | New Password | รหัสผ่านใหม่ |
| `profile_confirm_password` | Confirm New Password | ยืนยันรหัสผ่านใหม่ |
| `profile_change_submit` | Change Password | เปลี่ยนรหัสผ่าน |
| `profile_change_success` | Password changed successfully. | เปลี่ยนรหัสผ่านสำเร็จ |
| `profile_changing` | Changing… | กำลังเปลี่ยน… |
| `profile_pw_mismatch` | New password and confirm password do not match. | รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน |
| `profile_pw_rules_min8` | At least 8 characters | อย่างน้อย 8 ตัวอักษร |
| `profile_pw_rules_upper` | Uppercase letter (A-Z) | ตัวพิมพ์ใหญ่ (A-Z) |
| `profile_pw_rules_lower` | Lowercase letter (a-z) | ตัวพิมพ์เล็ก (a-z) |
| `profile_pw_rules_digit` | Number (0-9) | ตัวเลข (0-9) |
| `profile_pw_rules_special` | Special character (!@#$%^&*) | อักขระพิเศษ (!@#$%^&*) |
| `profile_loading` | Loading profile… | กำลังโหลดโปรไฟล์… |
| `profile_error` | Failed to load profile | โหลดข้อมูลโปรไฟล์ล้มเหลว |

---

## Password Policy

Matches `apps/api/src/auth/dto/change-password.dto.ts` exactly:

- Minimum 8 characters
- At least one uppercase letter `[A-Z]`
- At least one lowercase letter `[a-z]`
- At least one digit `[0-9]`
- At least one special character from `[!@#$%^&*]`

---

## E2E Tests

File: `apps/web/e2e/profile.spec.ts`

Tests (smoke-level, no actual password submission):
1. Renders profile page title and nav-profile link in sidebar
2. Shows account info card with admin email
3. Shows password change form with all three fields
4. Submit button is disabled when form is empty
5. Password rules indicator appears when typing new password
6. Mismatch error shown when passwords differ
7. Clicking nav-profile link navigates to /profile

---

## Security Notes

- Passwords are held only in ephemeral React state — not persisted, not logged.
- `no401Redirect` sends the JWT token — wrong current password errors surface as inline messages, not session logouts.
- `POST /auth/change-password` is guarded by `JwtAuthGuard` — no auth bypass possible.
- No new endpoints added (using existing `/auth/change-password` and `/auth/me`).
