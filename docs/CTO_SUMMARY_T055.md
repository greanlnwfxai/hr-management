# CTO Summary — T-055: HR Account Management Polish

## Step
T-055 — HR Account Management Polish

## Status
PASS

---

## Scope Completed

- Added `GET /employees/:id/account` API endpoint (SUPER_ADMIN, HR_ADMIN only) returning safe account fields excluding password hash
- Rewrote Employee Detail page account management section with proper no-account / has-account states
- One-time temporary password display panel with Copy Username / Copy Password / Copy Login Instruction buttons
- Reset password inline confirmation dialog before executing
- Account info card showing username, email, role, isActive, mustChangePassword, passwordGeneratedAt, lastLoginAt
- Create account form only shows when no account exists; reset button only shows when account exists
- State refresh after create/reset (re-fetches account info from API)
- No-password-persistence rule: temp password is React state only, dismissed on refresh or Done
- Added all required i18n keys in Thai and English (33 keys total)
- **Fixed i18n bug**: replaced module-scope `const lang = DEFAULT_LANGUAGE` with `useLanguage()` hook inside each sub-component so English labels display correctly when user switches language
- Added E2E smoke tests for account management section
- Docker rebuild verified PASS

---

## Files Created

| File | Description |
|------|-------------|
| `docs/HR_ACCOUNT_MANAGEMENT_POLISH.md` | Full feature documentation |
| `docs/CTO_SUMMARY_T055.md` | This CTO Summary |
| `apps/web/e2e/employee-account.spec.ts` | E2E smoke tests for account section |

---

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/employees/employees.service.ts` | Added `getAccount()` method |
| `apps/api/src/employees/employees.controller.ts` | Added `GET :id/account` endpoint with `@Roles` guard |
| `apps/api/src/employees/employees.service.spec.ts` | Added 4 tests for `getAccount` |
| `apps/api/src/employees/employees.controller.spec.ts` | Added `getAccount` controller test, added mock to service stub |
| `apps/web/app/(app)/employees/[id]/page.tsx` | Full account section rewrite (`AccountCard` component); i18n bug fix (useLanguage hook) |
| `apps/web/lib/api.ts` | Added `EmployeeAccountInfo` type and `getEmployeeAccount()` |
| `apps/web/lib/i18n.ts` | Added 33 account management keys (EN + TH) |

---

## Web Employee Account UI Summary

| State | UI Shown |
|-------|----------|
| Loading account | Loading indicator text |
| No account | Dashed empty-state card + create account form with username input + role selector |
| Account linked | Summary card (username/email/role/isActive/mustChangePassword/passwordGeneratedAt/lastLoginAt) + Reset Password button |
| After create | One-time amber panel with username, temporary password, 3 copy buttons, warning text |
| After reset | Same one-time amber panel |
| Reset confirmation | Inline red panel with confirm/cancel buttons |

Language toggles between Thai and English correctly in all states (fixed via `useLanguage()` hook).

---

## API Impact

- **New endpoint:** `GET /employees/:id/account`
  - Role guard: `SUPER_ADMIN`, `HR_ADMIN` (same as provision/reset endpoints)
  - Returns: `{ account: AccountInfo | null }`
  - Never returns `password` field — confirmed by unit test assertion + live curl
- **No changes** to existing endpoints (`POST /employees/:id/account`, `POST /employees/:id/account/reset-password`, `GET /employees/:id`, `GET /employees`)
- **No Prisma schema changes**
- **No new migrations**

---

## i18n Summary

Added 33 translation keys in `apps/web/lib/i18n.ts` (Thai + English):

| Key | Description |
|-----|-------------|
| `acct_section_title` | Login Account / บัญชีเข้าสู่ระบบ |
| `acct_no_account` | No login account / ยังไม่มีบัญชีผู้ใช้ |
| `acct_no_account_detail` | Explanatory text for no-account state |
| `acct_create_prompt` | Prompt to create account |
| `acct_username` | Username / ชื่อผู้ใช้ |
| `acct_email` | Email |
| `acct_role` | Role / บทบาท |
| `acct_role_label` | Role selector label |
| `acct_status` | Account Status / สถานะบัญชี |
| `acct_status_active` | Active / ใช้งานได้ |
| `acct_status_inactive` | Inactive / ระงับการใช้งาน |
| `acct_must_change_pw` | Must Change Password / ต้องเปลี่ยนรหัสผ่าน |
| `acct_must_change_pw_yes` | Yes (must change) |
| `acct_must_change_pw_no` | No (normal) |
| `acct_last_login` | Last Login / เข้าสู่ระบบล่าสุด |
| `acct_pw_generated_at` | Password Generated / สร้างรหัสผ่านเมื่อ |
| `acct_create` | Create Account / สร้างบัญชี |
| `acct_creating` | Creating... / กำลังสร้าง... |
| `acct_reset_pw` | Reset Password / รีเซ็ตรหัสผ่าน |
| `acct_resetting` | Resetting... / กำลังรีเซ็ต... |
| `acct_reset_confirm_title` | Confirm Password Reset / ยืนยันการรีเซ็ตรหัสผ่าน? |
| `acct_reset_confirm_detail` | Warning text before reset |
| `acct_reset_confirm_yes` | Confirm / ยืนยัน |
| `acct_temp_pw_panel_title` | One-Time Temporary Password / รหัสผ่านชั่วคราว |
| `acct_temp_pw_warning` | One-time display warning |
| `acct_temp_pw_must_change` | mustChangePassword notice |
| `acct_copy_username` | Copy Username / คัดลอกชื่อผู้ใช้ |
| `acct_copy_password` | Copy Password / คัดลอกรหัสผ่าน |
| `acct_copy_login_instruction` | Copy Login Instruction / คัดลอกข้อความเข้าสู่ระบบ |
| `acct_copied` | Copied! / คัดลอกแล้ว |
| `acct_temp_pw_done` | Done / เสร็จสิ้น |
| `acct_loading` | Loading... / กำลังโหลด... |
| `acct_load_error` | Failed to load account / โหลดข้อมูลบัญชีล้มเหลว |

---

## Tests Added / Updated

### API Unit Tests (apps/api)
- `employees.service.spec.ts` — 4 new tests for `getAccount`:
  - Returns account info when employee has linked user
  - Returns `{ account: null }` when no linked user
  - Throws NotFoundException when employee not found
  - Never selects `password` field (security assertion)
- `employees.controller.spec.ts` — 1 new test: `getAccount` delegates to service

### E2E Tests (apps/web/e2e)
- `employee-account.spec.ts` — 6 new smoke tests:
  1. Account management section is visible for admin on employee detail page
  2. Direct navigation to employee detail shows account section
  3. No-account state or account info card is present (either/or)
  4. Create account form elements visible in no-account state
  5. Reset password button visible when account exists
  6. Reset password confirmation panel appears on button click

All tests include graceful skip when no employees exist (CI fresh database safety). Tests 4 and 5 skip each other — they target mutually exclusive account states (no-account vs has-account); whichever state the first employee is in determines which branch runs.

### Test Results
- API unit tests: **207 passed, 17 test suites** ✅
- E2E tests: **69 passed, 2 skipped** ✅

---

## Documentation Updated

- `docs/HR_ACCOUNT_MANAGEMENT_POLISH.md` — Created (full feature doc)
- `docs/CTO_SUMMARY_T055.md` — Created (this file)
- `docs/USERNAME_LOGIN_AND_ACCOUNT_PROVISIONING.md` — Not updated (no backend provisioning behavior changed)
- `docs/FORCE_MUST_CHANGE_PASSWORD_FLOW.md` — Not updated (T-054 flow unaffected)
- `docs/API_ROUTES.md` — Not updated (new endpoint follows same pattern, documented in feature doc)

---

## Verification Results

| Check | Result |
|-------|--------|
| `./scripts/verify.sh` | ✅ PASS |
| `npm --prefix apps/api test` | ✅ PASS (207 tests) |
| `npm --prefix apps/web run build` | ✅ PASS |
| `./scripts/api-smoke-test.sh` | ✅ PASS |
| `./scripts/e2e-test.sh` | ✅ PASS (69 passed, 2 skipped) |
| `./scripts/secret-scan.sh` | ✅ PASS — no findings |
| `docker compose up -d --build` | ✅ PASS |
| `docker compose ps` | ✅ All services Up/healthy |
| `GET /health` | ✅ `{"status":"ok"}` |
| `GET /employees/:id/account` (live) | ✅ Returns account info, `password` key absent |

---

## Targeted Security Notes

| Field | Assessment |
|-------|-----------|
| **Auth impact** | New `GET /employees/:id/account` is guarded by JWT + `@Roles(SUPER_ADMIN, HR_ADMIN)` — no unprotected endpoints added |
| **RBAC impact** | `GET /employees/:id` (any authenticated user) is NOT modified — account data is isolated to the new RBAC-guarded endpoint. `findOne` and `findAll` remain unchanged. |
| **Temporary password handling** | Temporary password held in React state only. Not in localStorage/sessionStorage. Not logged to console. Panel dismissed on refresh or Done click. |
| **Password/token/hash exposure** | `password` field is never in the `select` for `getAccount`. Password hash never returned to frontend. Confirmed by unit test asserting `selectArg` does not have `password` property, and by live curl verifying `password` key absent from response. |
| **Data privacy impact** | Account endpoint exposes: username, email, role, isActive, mustChangePassword, passwordGeneratedAt, lastLoginAt. All within expected HR admin scope. No new PII beyond what provisioning already returns. |
| **Mobile security impact** | No mobile files changed. T-054 mobile forced-change flow unaffected. |
| **Dependency/advisory impact** | No new packages added. `security-audit.sh` not required. |
| **Secrets/logging check** | Secret scan passed with no findings. No `console.log()` of passwords in new code. |
| **New endpoints protected** | `GET /employees/:id/account` — JWT guard + HR_ADMIN/SUPER_ADMIN role guard ✅ |
| **Risk level** | **LOW** — read-only endpoint addition + frontend display polish. No auth/password/migration changes. |
| **Security decision** | **PASS** |

---

## Docker Safety Compliance

- ✅ `docker compose up -d --build` used for rebuild (allowed)
- ❌ `docker compose down` — NOT used
- ❌ `docker compose down -v` — NOT used
- ❌ Volume destruction — NOT performed
- ❌ `docker system prune` — NOT used

---

## Known Limitations

- Account `isActive` toggle UI not implemented (display only) — future task
- No email delivery for temporary passwords — HR must communicate manually through secure channel
- No OTP/MFA, SSO, or password expiry scheduler
- No bulk account creation
- Copy button falls back silently if `navigator.clipboard` is unavailable (non-HTTPS context)

---

## Risk

**LOW** — UI polish and a read-only API endpoint. No schema changes, no migration, no new auth flows, no packages added. Existing T-050/T-053/T-054 behavior preserved.

---

## Overall Decision

**PASS**

---

## Recommended Commit Message

```
feat(web): polish HR account management (T-055)

- Add GET /employees/:id/account endpoint (SUPER_ADMIN, HR_ADMIN only)
  returning safe account fields without password hash
- Rewrite Employee Detail account section with no-account / has-account states
- Add one-time temp password panel with copy buttons (username, password, instruction)
- Add reset password inline confirmation dialog
- Add account info card (username, email, role, isActive, mustChangePassword,
  passwordGeneratedAt, lastLoginAt)
- Add 33 i18n keys (Thai + English) for account management UI
- Fix: use useLanguage() hook in account sub-components so English
  labels display correctly when user switches language
- Add 6 E2E smoke tests for account management section
- Add unit tests for getAccount service method and controller delegation
```

---

## Next Recommended Task

**T-056 — Account Active/Inactive Toggle**

Add `PATCH /employees/:id/account` endpoint accepting `{ isActive: boolean }` with HR_ADMIN/SUPER_ADMIN guard, and UI toggle in the account info card with confirmation before deactivation. Guard against self-deactivation (backend: compare request user ID with account ID).
