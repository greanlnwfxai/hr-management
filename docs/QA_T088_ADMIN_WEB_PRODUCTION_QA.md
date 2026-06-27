# T-088 — Admin Web Production QA Checklist

**Version:** 1.0
**Task:** T-088
**Date created:** 2026-06-27
**Baseline commit:** `18cc9b6 style(mobile): polish STEP Connect PWA interface`
**Tester:** _______________
**Test date:** _______________

---

## Legend

| Mark | Meaning |
|------|---------|
| `[ ]` | Not yet tested |
| `[x]` | PASS — confirmed working |
| `[!]` | DEFECT — document in Bugs Found table |
| `[-]` | Not testable in this environment |

**Read-only (RO):** Safe to run against production — no data mutation.
**Mutating (MUT):** Creates, updates, or deletes data. Run against local or staging unless explicitly prepared to clean up a test record in production.

---

## Pre-Flight

Before testing, confirm each pre-condition:

```bash
# 1. Confirm services are up
docker compose ps
# Expected: web, api, db — all "healthy" / "Up"

# 2. API health check
curl -s http://localhost:4002/health
# Expected: {"status":"ok"} or similar 200 response

# 3. Admin web reachable
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/
# Expected: 200 or 301/302 redirect to /login

# 4. Confirm working tree is clean
git status --short
# Expected: no output (clean)
```

**Production target:** `http://172.16.2.31:3002` — confirm with system admin before running prod tests. Substitute for localhost in all curl checks above.

**Default admin credentials (rotate before production):** `admin@hr.local` / `admin1234` (or username `admin`).

- [ ] `docker compose ps` — all services healthy `(RO)`
- [ ] API health check returns 200 `(RO)`
- [ ] Admin web reachable at target URL `(RO)`
- [ ] Working tree is clean `(RO)`
- [ ] Test account and role matrix prepared (see RBAC section) `(RO)`

---

## A. Authentication / Session

### A1. Login — happy path (RO)

- [ ] Navigate to `/login` — page renders without errors `(RO)`
- [ ] Login with email `admin@hr.local` + correct password → redirected to `/dashboard` `(RO)`
- [ ] Login with username `admin` + correct password → redirected to `/dashboard` `(RO)`
- [ ] JWT token stored in `localStorage` under key `hr_access_token` `(RO)`
- [ ] User object stored in `localStorage` under key `hr_user` `(RO)`
- [ ] Token value is NOT visible in page source, DOM, or visible to the browser history/console `(RO)`

### A2. Login — error handling (RO)

- [ ] Wrong password → error message shown, no redirect `(RO)`
- [ ] Unknown email → error message shown `(RO)`
- [ ] Empty fields → form validation fires before submit `(RO)`

### A3. Session persistence and protection (RO)

- [ ] Refresh the browser at `/dashboard` while logged in → stays on dashboard (token survives page load) `(RO)`
- [ ] Navigate to `/login` while already authenticated → immediately redirected to `/dashboard` (no double login) `(RO)`
- [ ] Manually delete `hr_access_token` from localStorage → visit `/dashboard` → redirected to `/login` `(RO)`
- [ ] Expired or tampered token in localStorage → visit protected route → redirected to `/login` `(RO)`

### A4. Logout (RO)

- [ ] Logout action (if available in nav) clears `hr_access_token` and `hr_user` from localStorage `(RO)`
- [ ] After logout, visiting `/dashboard` redirects to `/login` `(RO)`

### A5. Language / theme toggles (RO)

- [ ] Language toggle on login page works without causing a JS error `(RO)`
- [ ] Theme toggle on login page works without causing a JS error `(RO)`

---

## B. Layout / Navigation / RBAC

### B1. SUPER_ADMIN nav (RO)

Login as a SUPER_ADMIN account and verify the following nav items are ALL visible:

- [ ] Dashboard `(RO)`
- [ ] Employees `(RO)`
- [ ] Departments `(RO)`
- [ ] Positions `(RO)`
- [ ] Attendance `(RO)`
- [ ] Leave `(RO)`
- [ ] Off-site `(RO)`
- [ ] Audit Logs `(RO)`
- [ ] Geofence Settings `(RO)`

### B2. MANAGER nav (RO)

Login as a MANAGER account and verify:

- [ ] Visible: Dashboard, Employees, Attendance, Leave, Off-site `(RO)`
- [ ] NOT visible: Departments, Positions, Audit Logs, Geofence Settings `(RO)`
- [ ] Direct URL `/audit-logs` → blocked (redirect to `/login` or access denied) `(RO)`
- [ ] Direct URL `/departments` → blocked `(RO)`
- [ ] Direct URL `/positions` → blocked `(RO)`
- [ ] Direct URL `/attendance/geofence-settings` → blocked `(RO)`

### B3. EMPLOYEE nav (RO)

Login as an EMPLOYEE account and verify:

- [ ] Visible: Attendance, Leave `(RO)`
- [ ] NOT visible: Dashboard, Employees, Departments, Positions, Off-site, Audit Logs, Geofence Settings `(RO)`
- [ ] Direct URL `/dashboard` → blocked `(RO)`
- [ ] Direct URL `/employees` → blocked `(RO)`
- [ ] Direct URL `/leave` (own leave only) → accessible but shows only own records `(RO)`
- [ ] Direct URL `/audit-logs` → blocked `(RO)`

### B4. mustChangePassword flow (RO)

If an account with `mustChangePassword = true` exists:

- [ ] After login, redirected to `/profile` `(RO)`
- [ ] All nav items are rendered as disabled spans (not clickable links) `(RO)`
- [ ] Attempting to navigate away (back button, direct URL) still lands on `/profile` `(RO)`
- [ ] After changing password successfully → nav items re-enable `(RO)`

---

## C. Dashboard

### C1. KPI Cards (RO)

- [ ] Page loads without JS errors `(RO)`
- [ ] All 6 KPI cards render with numeric values: Total Employees, Active Employees, Attendance Rate, Pending Leave, Pending Off-site, Low Leave Balance `(RO)`
- [ ] KPI values appear reasonable (not 0 across all if data exists, not negative) `(RO)`

### C2. Date range filter (RO)

- [ ] 7-day preset → KPIs and charts update `(RO)`
- [ ] This Month preset → KPIs and charts update `(RO)`
- [ ] Last Month preset → KPIs and charts update `(RO)`
- [ ] Refresh button triggers reload of all dashboard data `(RO)`

### C3. Charts (RO)

- [ ] Attendance trend line chart renders without blank/broken state `(RO)`
- [ ] Leave status donut chart renders `(RO)`
- [ ] Leave by department stacked bar chart renders `(RO)`
- [ ] Overtime trend line chart renders `(RO)`
- [ ] Off-site status donut chart renders `(RO)`
- [ ] Top leave requesters bar chart renders `(RO)`

### C4. Recent panels (RO)

- [ ] Recent Employees panel shows entries `(RO)`
- [ ] Recent Attendance panel shows entries `(RO)`
- [ ] Recent Leave Requests panel shows entries `(RO)`
- [ ] Recent Off-site Requests panel shows entries `(RO)`

---

## D. Employee Management

### D1. List view (RO)

- [ ] `/employees` loads with employee list `(RO)`
- [ ] Search by name filters the list `(RO)`
- [ ] Status filter (ACTIVE / INACTIVE / RESIGNED) works `(RO)`
- [ ] Pagination controls advance through pages `(RO)`
- [ ] Employee detail link `/employees/[id]` loads correctly `(RO)`

### D2. RBAC — create/edit/delete (RO)

- [ ] As SUPER_ADMIN: Create, Edit, Delete buttons visible `(RO)`
- [ ] As MANAGER: Create, Edit, Delete buttons NOT visible `(RO)`
- [ ] As EMPLOYEE: Create, Edit, Delete buttons NOT visible `(RO)`

### D3. Create employee (MUT)

> **Environment:** Local or staging. Use a clearly labeled test record (e.g. name "QA Test User").

- [ ] Open create modal — form renders all fields (name, email, role, department, position, status) `(MUT)`
- [ ] Submit with all required fields → employee created, appears in list `(MUT)`
- [ ] Submit with missing required field → validation error shown, no record created `(MUT)`
- [ ] Duplicate email → error returned from API, not a crash `(MUT)`
- [ ] After test: delete the test employee (see D5) `(MUT)`

### D4. Edit employee (MUT)

> **Environment:** Local or staging. Edit the QA test record created in D3.

- [ ] Open edit modal for an existing employee → fields pre-populated `(MUT)`
- [ ] Change a field and save → change persists on refresh `(MUT)`
- [ ] Department / position assignment updates correctly `(MUT)`

### D5. Delete employee (MUT)

> **Environment:** Local or staging. Delete the QA test record only.

- [ ] Delete confirmation prompt appears `(MUT)`
- [ ] After confirm, employee removed from list `(MUT)`
- [ ] Attempting to re-navigate to deleted employee's detail URL → handled gracefully (404 or redirect) `(MUT)`

---

## E. Department Management

### E1. List view (RO)

- [ ] `/departments` loads with department list `(RO)`
- [ ] Search filters departments `(RO)`
- [ ] Manager assignment shown per department `(RO)`
- [ ] Pagination works `(RO)`

### E2. RBAC (RO)

- [ ] As MANAGER: direct URL `/departments` is blocked `(RO)`
- [ ] As EMPLOYEE: direct URL `/departments` is blocked `(RO)`

### E3. Create / Edit / Delete department (MUT)

> **Environment:** Local or staging.

- [ ] Create: required name field validated; department created and appears in list `(MUT)`
- [ ] Edit: fields pre-populated; change saves correctly `(MUT)`
- [ ] Manager assignment dropdown populated from employee list `(MUT)`
- [ ] Delete: confirmation prompt; department removed `(MUT)`
- [ ] Delete a department that has employees assigned → handled gracefully (error or dependency block) `(MUT)`

---

## F. Position Management

### F1. List view (RO)

- [ ] `/positions` loads with position list `(RO)`
- [ ] Search by name filters `(RO)`
- [ ] Filter by department works `(RO)`
- [ ] Pagination works `(RO)`
- [ ] Each position shows its linked department `(RO)`

### F2. RBAC (RO)

- [ ] As MANAGER: direct URL `/positions` is blocked `(RO)`
- [ ] As EMPLOYEE: direct URL `/positions` is blocked `(RO)`

### F3. Create / Edit / Delete position (MUT)

> **Environment:** Local or staging.

- [ ] Create: name + department required; position created `(MUT)`
- [ ] Edit: fields pre-populated; save persists change `(MUT)`
- [ ] Delete: confirmation prompt; position removed `(MUT)`

---

## G. Attendance

### G1. Clock-in / clock-out (MUT)

> Clocking actions mutate data. Use a test employee account or confirm this is acceptable in production (time records are expected employee workflow).

- [ ] As any authenticated user, `/attendance` loads Bangkok real-time clock `(RO)`
- [ ] Clock-in button visible and enabled when not yet clocked in today `(MUT)`
- [ ] Clock-in → status changes to clocked-in; button changes to Clock-out `(MUT)`
- [ ] Clock-out → record updated; button changes back `(MUT)`
- [ ] Cannot clock in twice (button disabled or API rejects duplicate) `(MUT)`

### G2. My attendance records (RO)

- [ ] Own attendance records load with date and status `(RO)`
- [ ] Status values shown: PRESENT / LATE / ABSENT (or Thai equivalents) `(RO)`

### G3. All attendance — admin view (RO)

- [ ] As SUPER_ADMIN / HR_ADMIN: all employees' attendance records visible `(RO)`
- [ ] Status filter (PRESENT / LATE / ABSENT) works `(RO)`
- [ ] Date range filter works `(RO)`
- [ ] Pagination works `(RO)`
- [ ] As EMPLOYEE: only own records visible (no "all records" table) `(RO)`

### G4. RBAC (RO)

- [ ] EMPLOYEE account cannot access another employee's attendance via a direct URL (e.g., `/attendance?employeeId=<other>`) `(RO)`

---

## H. Leave Requests

### H1. List view (RO)

- [ ] `/leave` loads `(RO)`
- [ ] As admin: all leave requests across all employees visible `(RO)`
- [ ] As non-admin: only own leave requests visible `(RO)`
- [ ] Leave type labels: SICK, VACATION, PERSONAL, OTHER rendered correctly `(RO)`
- [ ] Status labels rendered (Pending / Approved / Rejected or Thai equivalents) `(RO)`

### H2. Approve / Reject (MUT)

> **Environment:** Local or staging — or production with full awareness a real leave record is being mutated.

- [ ] As SUPER_ADMIN / HR_ADMIN: Approve and Reject buttons visible for PENDING requests `(MUT)`
- [ ] Approve → status changes to APPROVED `(MUT)`
- [ ] Reject → status changes to REJECTED `(MUT)`
- [ ] As MANAGER: Approve/Reject NOT available (leave is admin-only) `(RO)`
- [ ] As EMPLOYEE: Approve/Reject NOT available `(RO)`

### H3. Create leave request (MUT)

> **Environment:** Local or staging preferred.

- [ ] Create form: type, start date, end date, reason fields `(MUT)`
- [ ] Date range validation: end ≥ start `(MUT)`
- [ ] Submitted request appears in list with PENDING status `(MUT)`

---

## I. Leave Balances

### I1. View (RO)

- [ ] As admin: all employees' leave balances visible `(RO)`
- [ ] As non-admin: own leave balance only (read-only) `(RO)`
- [ ] Balance displayed per leave type `(RO)`

### I2. Create / Edit balance (MUT)

> **Environment:** Local or staging. Changing leave balances in production affects employee entitlements.

- [ ] As admin: Create and Edit buttons visible `(MUT)`
- [ ] Create: employee + type + balance fields required `(MUT)`
- [ ] Edit: existing balance pre-populated; save persists change `(MUT)`
- [ ] As non-admin: Create / Edit buttons NOT visible `(RO)`

---

## J. Off-Site Requests

### J1. List view (RO)

- [ ] `/offsite` loads with off-site request list `(RO)`
- [ ] Status filter (PENDING / APPROVED / REJECTED) works `(RO)`
- [ ] Pagination works `(RO)`
- [ ] Thai status labels: รอการอนุมัติ / อนุมัติแล้ว / ไม่อนุมัติ displayed correctly `(RO)`

### J2. Approve / Reject (MUT)

- [ ] As SUPER_ADMIN: Approve/Reject visible for PENDING `(MUT)`
- [ ] As HR_ADMIN: Approve/Reject visible `(MUT)`
- [ ] As MANAGER: Approve/Reject visible `(MUT)`
- [ ] As EMPLOYEE: Approve/Reject NOT visible `(RO)`
- [ ] Approve action → status changes to APPROVED `(MUT)`
- [ ] Reject action → status changes to REJECTED `(MUT)`

---

## K. Geofence Settings

### K1. Load (RO)

- [ ] `/attendance/geofence-settings` loads for admin accounts `(RO)`
- [ ] Current settings displayed: enabled toggle, latitude, longitude, radius, max accuracy `(RO)`

### K2. RBAC (RO)

- [ ] As MANAGER: direct URL blocked `(RO)`
- [ ] As EMPLOYEE: direct URL blocked `(RO)`

### K3. Save (MUT)

> **CAUTION:** Changing geofence settings on production affects all employee clock-in validation immediately.

- [ ] As admin: Save button functional `(MUT)`
- [ ] Toggle enabled ON/OFF → persists on page reload `(MUT)`
- [ ] Changing lat/lng/radius → persists on page reload `(MUT)`
- [ ] Invalid values (e.g., lat > 90) → validation error, not a crash `(MUT)`

---

## L. Audit Logs

### L1. Access control (RO)

- [ ] `/audit-logs` loads for SUPER_ADMIN `(RO)`
- [ ] `/audit-logs` loads for HR_ADMIN `(RO)`
- [ ] As MANAGER: direct URL `/audit-logs` blocked `(RO)`
- [ ] As EMPLOYEE: direct URL `/audit-logs` blocked `(RO)`

### L2. Log display (RO)

- [ ] Logs listed with actor, action, target, result, timestamp `(RO)`
- [ ] Pagination works `(RO)`
- [ ] Detail modal opens on a log entry and shows full payload `(RO)`

### L3. Filters (RO)

- [ ] Filter by action → results update `(RO)`
- [ ] Filter by targetType → results update `(RO)`
- [ ] Filter by actorRole (SUPER_ADMIN / HR_ADMIN / MANAGER / EMPLOYEE) → results update `(RO)`
- [ ] Filter by result (SUCCESS / FAILURE) → results update `(RO)`
- [ ] Filter by actorUserId → results update `(RO)`
- [ ] Filter by targetId → results update `(RO)`
- [ ] Filter by dateFrom / dateTo date range → results update `(RO)`
- [ ] All filters combined → results update correctly `(RO)`

---

## M. Profile / Password Change

### M1. View (RO)

- [ ] `/profile` loads for all authenticated roles `(RO)`
- [ ] Displays: name, role, email, and other account info `(RO)`

### M2. Password change (MUT)

> **CAUTION on production:** Changing the default admin password is encouraged, but test with a non-critical account first.

- [ ] Password change form shows three fields: current, new, confirm `(MUT)`
- [ ] Show/hide toggle works on each password field `(MUT)`
- [ ] Live rule validation: 8 chars min, uppercase, lowercase, digit, special char (`!@#$%^&*`) `(MUT)`
- [ ] All rules satisfied → submit enabled `(MUT)`
- [ ] Wrong current password → error shown, password NOT changed `(MUT)`
- [ ] New ≠ confirm → error shown `(MUT)`
- [ ] Successful change → confirmation shown; can log in with new password `(MUT)`
- [ ] After successful change: old password rejected on next login `(MUT)`

---

## N. Security Checks

These checks are read-only against the running application.

- [ ] `Authorization: Bearer <token>` is required; unprotected calls to `/employees`, `/departments`, `/attendance` without a token return 401 `(RO)`
- [ ] JWT token value does NOT appear in: page title, any visible DOM element, browser URL bar, or JavaScript `console.log` output `(RO)`
- [ ] User passwords are NOT visible anywhere in any API response (not in employee detail, not in audit log detail) `(RO)`
- [ ] Audit log detail does NOT include raw JWT tokens or passwords `(RO)`
- [ ] EMPLOYEE navigating to `/employees` (another user's detail) is blocked by the API (401 or 403), not just hidden in the UI `(RO)`
- [ ] Verify `./scripts/security-review.sh` exits 0 `(RO)`

```bash
./scripts/security-review.sh
```

---

## O. Visual / UX Spot Checks

- [ ] Admin web branding is "HR Management" (not STEP Connect) — distinct from the mobile PWA `(RO)`
- [ ] Thai language strings render correctly (no garbled characters) `(RO)`
- [ ] No broken images or icons across main pages `(RO)`
- [ ] Console shows no unhandled errors or network failures during normal navigation `(RO)`
- [ ] Responsive layout is usable at 1280px width (minimum expected viewport) `(RO)`

---

## Bugs Found

| # | Page | Description | Severity | Proposed task |
|---|------|-------------|----------|---------------|
| — | — | None at checklist creation time | — | — |

> Fill this table if `[!]` items are found during testing.

---

## Known Limitations

1. **Mutating checks require a non-production environment** — all `(MUT)` items should be executed against local (`localhost:3002`) or a staging deployment to avoid mutating live employee data. The checklist is structured so that all `(RO)` items can be safely run against production.

2. **This checklist was created by code inspection** — it was not executed against a running system at creation time. Build verification (`./scripts/verify.sh`) confirmed the build is clean, but feature execution was not performed.

3. **RBAC negative-path tests require multiple test accounts** — at minimum one account per role (SUPER_ADMIN, MANAGER, EMPLOYEE) is needed to complete sections B, D, E, F, G, H, I, J, K, L.

4. **No staging environment documented** — if no staging instance is available, `(MUT)` tests on production should be performed during a low-traffic window with a clearly labeled QA test record that is cleaned up immediately after.

5. **`mustChangePassword` flow (B4)** requires an account in that state to test; may need to be set manually via DB or admin action.
