# HR Account Management Polish

## Task
T-055 — HR Account Management Polish

## Purpose

Improve the Web Admin Employee Detail page so HR/Admin staff can clearly manage employee login accounts: see account status, create accounts for employees who don't have one, and reset temporary passwords with a one-time display and copy UX.

---

## Architecture

### New API Endpoint

```
GET /employees/:id/account
Authorization: Bearer <JWT>
Roles required: SUPER_ADMIN, HR_ADMIN
```

**Response (no account):**
```json
{ "account": null }
```

**Response (account linked):**
```json
{
  "account": {
    "id": "uuid",
    "username": "j.doe",
    "email": "j.doe@hr.local",
    "role": "EMPLOYEE",
    "isActive": true,
    "mustChangePassword": false,
    "passwordGeneratedAt": "2026-06-18T04:44:54.868Z",
    "lastLoginAt": "2026-06-18T04:45:03.773Z",
    "createdAt": "2026-06-18T04:44:38.095Z"
  }
}
```

**Important:** `password` (hash) is never included. Only safe read fields are selected.

This endpoint is deliberately separate from `GET /employees/:id` to:
- Maintain RBAC: `findOne` is accessible by any authenticated user; account info is admin-only
- Limit PII surface: account metadata is not included in the employee list or general detail fetch

---

## UI Behavior

### No Account State

When `account: null` is returned:
- Shows a dashed empty-state card: **ยังไม่มีบัญชีผู้ใช้**
- Explains: พนักงานคนนี้ยังไม่มีบัญชีสำหรับเข้าสู่ระบบ
- Shows create account form:
  - Username input (a-z 0-9 . _ - only)
  - Auto-suggest button for username based on name (e.g., `j.pichai`)
  - Role selector (Employee / Manager / HR Admin / Super Admin)
  - Create Account button (disabled until username is filled)

### Account Exists State

When `account` is non-null:
- Shows account summary card with fields:
  - Username
  - Email
  - Role
  - Account Status (Active / Inactive with colored dot)
  - Must Change Password (Yes/No with detail)
  - Password Generated At (datetime)
  - Last Login (datetime, or `—` if never)
- Shows Reset Password button below the summary

### Create Account Behavior

1. Form submits to `POST /employees/:id/account`
2. Loading state prevents double-submit
3. On success: re-fetches account info, shows one-time temporary password panel
4. On error: shows inline error message

### Reset Password Behavior

1. Click "Reset Password" → shows inline confirmation panel
   - ยืนยันการรีเซ็ตรหัสผ่าน?
   - หลังรีเซ็ต ผู้ใช้จะต้องเปลี่ยนรหัสผ่านใหม่ก่อนใช้งานระบบ
   - Confirm and Cancel buttons
2. On confirm: submits to `POST /employees/:id/account/reset-password`
3. Loading state prevents double-submit
4. On success: re-fetches account info, shows one-time temporary password panel
5. On error: shows inline error message

### Temporary Password One-Time Display

After create or reset, a highlighted amber panel appears with:
- Username
- Temporary password (in red monospace, bold)
- 3 copy buttons:
  - Copy Username
  - Copy Password
  - Copy Login Instruction (Thai text block)
- Warning: แสดงรหัสผ่านชั่วคราวเฉพาะครั้งนี้เท่านั้น...
- Note: ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก
- Done button to dismiss panel

### Security Rules for Temporary Password Display

- Password is stored only in React component state (never in localStorage/sessionStorage)
- Panel disappears on page refresh (React state does not persist)
- Password is never logged to browser console
- Password hash is never returned from the API
- Done button clears the panel (sets provResult/resetResult to null)

---

## Copy Button Behavior

Uses `navigator.clipboard.writeText()` (modern clipboard API).
- Shows checkmark + "Copied!" for 2 seconds after click
- Falls back silently if clipboard API is unavailable (no alert)

---

## Active/Inactive Status

- The account status (`isActive`) is **displayed only** in the account summary card
- There is no toggle UI for `isActive` in this task
- Backend does not have a dedicated endpoint to toggle account active status
- Future task: add `PATCH /employees/:id/account` with `{ isActive }` and display toggle in UI

---

## i18n

New translation keys added (Thai + English) — 33 keys total:

| Key | Thai | English |
|-----|------|---------|
| `acct_section_title` | บัญชีเข้าสู่ระบบ | Login Account |
| `acct_no_account` | ยังไม่มีบัญชีผู้ใช้ | No login account |
| `acct_no_account_detail` | พนักงานคนนี้ยังไม่มีบัญชีสำหรับเข้าสู่ระบบ | This employee does not have a login account yet. |
| `acct_create` | สร้างบัญชี | Create Account |
| `acct_reset_pw` | รีเซ็ตรหัสผ่าน | Reset Password |
| `acct_reset_confirm_title` | ยืนยันการรีเซ็ตรหัสผ่าน? | Confirm Password Reset |
| `acct_temp_pw_panel_title` | รหัสผ่านชั่วคราว (แสดงเพียงครั้งเดียว) | One-Time Temporary Password |
| `acct_copy_username` | คัดลอกชื่อผู้ใช้ | Copy Username |
| `acct_copy_password` | คัดลอกรหัสผ่าน | Copy Password |
| `acct_copy_login_instruction` | คัดลอกข้อความเข้าสู่ระบบ | Copy Login Instruction |
| `acct_must_change_pw` | ต้องเปลี่ยนรหัสผ่าน | Must Change Password |
| `acct_last_login` | เข้าสู่ระบบล่าสุด | Last Login |
| `acct_pw_generated_at` | สร้างรหัสผ่านเมื่อ | Password Generated |
| `acct_status` | สถานะบัญชี | Account Status |

---

## Files Changed

### Created
- `docs/HR_ACCOUNT_MANAGEMENT_POLISH.md` (this file)
- `docs/CTO_SUMMARY_T055.md`
- `apps/web/e2e/employee-account.spec.ts`

### Modified
- `apps/api/src/employees/employees.service.ts` — added `getAccount()` method
- `apps/api/src/employees/employees.controller.ts` — added `GET :id/account` endpoint
- `apps/api/src/employees/employees.service.spec.ts` — added `getAccount` tests
- `apps/api/src/employees/employees.controller.spec.ts` — added controller test
- `apps/web/app/(app)/employees/[id]/page.tsx` — full account section rewrite
- `apps/web/lib/api.ts` — added `EmployeeAccountInfo` type and `getEmployeeAccount()` function
- `apps/web/lib/i18n.ts` — added account management translation keys (EN + TH)

---

## Security Notes

- `GET /employees/:id/account` is guarded by `@Roles(SUPER_ADMIN, HR_ADMIN)` — not accessible to plain EMPLOYEE or MANAGER
- `password` field is never selected in the account info query
- Temporary password is only held in React state; dismissed on page refresh or Done click
- No `console.log()` of password anywhere in the component
- Backend `provisionAccount` and `resetAccountPassword` are unchanged and maintain `mustChangePassword: true` behavior
- T-054 forced mustChangePassword flow is unaffected

---

## Limitations

- Account `isActive` toggle UI is not implemented (display only) — future task
- No bulk account creation
- No email/OTP for temporary password delivery — HR must communicate password manually
- No password expiry scheduler

---

## Future Work

- Add `PATCH /employees/:id/account` with `{ isActive }` to support account deactivation toggle in UI
- Add email delivery for temporary passwords
- Add OTP/MFA
