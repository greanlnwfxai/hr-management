# Mobile Dashboard & Profile — T-044

## Overview

T-044 upgrades the mobile Home screen into a real authenticated dashboard that fetches live HR data and displays a profile section, summary cards, and feature navigation.

---

## Authenticated Request Flow

All protected API calls go through `authGet<T>(path, token)` in `apps/mobile/src/api/client.ts`.

1. Token is retrieved from `AuthProvider` context (originally stored via `expo-secure-store`).
2. Every request sets `Authorization: Bearer <token>`.
3. A `fetch()` network failure throws a Thai-language error message.
4. A `401 Unauthorized` response throws `SessionExpiredError` (see below).
5. Any other non-OK response throws a generic Thai error with the HTTP status.

---

## Endpoints Used

| Method | Path         | Auth | Notes                                        |
|--------|--------------|------|----------------------------------------------|
| GET    | /auth/me     | ✅   | Fetch fresh profile (id, email, role)        |
| GET    | /dashboard   | ✅   | Aggregated HR snapshot (SUPER_ADMIN/HR_ADMIN/MANAGER) |
| GET    | /health      | ❌   | Health check (retained from T-042, removed from main UI) |

`/employees` and `/departments` with `limit=1` are available in `client.ts` as fallback
helpers but are not called in the default dashboard flow because `/dashboard` already
includes aggregate counts.

---

## 401 Auto Sign-Out Behavior

`SessionExpiredError` is a typed error class exported from `src/api/types.ts`.

Flow:
1. `authGet()` receives `401` → throws `SessionExpiredError`.
2. `useDashboard` hook catches `SessionExpiredError` in its fetch callback.
3. Calls `signOut()` → clears token + user from SecureStore + resets AuthContext.
4. Calls `router.replace('/login')` → navigates back to the login screen.
5. The login screen shows the normal login form; no additional message banner is shown.

Thai message embedded in `SessionExpiredError`:
> เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง

No refresh token support. Expiry causes immediate re-login.

---

## Dashboard Data Shown

Source: `GET /dashboard`

| UI Label                  | Field                                  |
|---------------------------|----------------------------------------|
| พนักงานทั้งหมด             | `employees.totalEmployees`             |
| ใช้งาน (sub)              | `employees.activeEmployees`            |
| แผนกทั้งหมด               | `employees.totalDepartments`           |
| ตำแหน่ง (sub)             | `employees.totalPositions`             |
| การลงเวลาวันนี้            | `attendance.todayClockedInCount`       |
| สาย (sub)                 | `attendance.todayLateCount`            |
| คำขอลารอดำเนินการ          | `leave.pendingLeaveRequests`           |
| อนุมัติแล้ว (sub)          | `leave.approvedLeaveRequests`          |

---

## Profile Data

Source: `GET /auth/me`

| UI Label          | Field         |
|-------------------|---------------|
| Email             | `email`       |
| บทบาท             | `role` (mapped to Thai label) |
| Avatar letter     | First char of `email` |
| สถานะผู้ใช้       | Always "ใช้งานอยู่" when authenticated |

**Limitation:** The `/auth/me` endpoint returns only `id`, `email`, `role`. Employee
details (name, employee code, department, position) are not linked to the auth user in
the current API. If available in future tasks, `GET /employees?search=<email>` or a
dedicated `/auth/me/employee` endpoint would be required.

Graceful fallback: if `getProfile()` fails or `/auth/me` is unavailable, the screen
falls back to the `user` object cached in AuthContext from login.

---

## Manual Verification Steps

1. Start the backend stack:
   ```bash
   docker compose up -d
   ```
2. Start the mobile web dev server:
   ```bash
   cd apps/mobile
   npm run web
   ```
3. Open `http://localhost:8081` in a browser.
4. Log in with `admin@hr.local` / `admin1234`.
5. Confirm redirect to the Home/Dashboard screen.
6. Confirm dashboard summary cards load with real numbers.
7. Confirm profile card shows email and role.
8. Pull down or tap "อัปเดตข้อมูล" → data refreshes and "อัปเดตล่าสุด" time updates.
9. Tap "ออกจากระบบ" → confirms sign-out and redirect to login.
10. **401 test** (optional): clear `hr_auth_token` from `localStorage` in browser DevTools,
    then tap "อัปเดตข้อมูล" → should auto-redirect to login.

---

## Known Limitations

- `/dashboard` is role-restricted to SUPER_ADMIN, HR_ADMIN, MANAGER. **T-049 fix:** `useDashboard`
  now skips the `getDashboard` call for EMPLOYEE roles using `canSeeDashboard(role)`, and the
  org-summary section is hidden on Home for EMPLOYEE. An EMPLOYEE-role user no longer triggers a 403.
- Profile shows only `email` and `role`; no employee name, code, or department yet.
- No persistent dashboard cache; data re-fetches on every mount and manual refresh.
- No offline/stale-data indicator.

---

## Future Tasks

| Task  | Description                              |
|-------|------------------------------------------|
| T-045 | Mobile Attendance Foundation             |
| T-046 | Attendance Geofence Backend              |
| T-047 | Mobile Geofence Clock In/Out             |
| T-048 | Mobile Leave Request                     |
