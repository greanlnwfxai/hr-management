# CTO Summary

## Step
T-044 — Mobile Dashboard & Profile

## Status
PASS

## Scope
Upgraded the mobile `/home` screen from a static placeholder into a real authenticated dashboard. Live HR data is fetched from `GET /dashboard` and `GET /auth/me` using the stored JWT. Session expiry (401) auto-signs-out the user and redirects to `/login`. A typed API client helper and a `useDashboard` hook encapsulate all authenticated request logic.

## Files Created

- `apps/mobile/src/api/types.ts` — `SessionExpiredError`, `ApiError`, `DashboardSummary`, `MobileUserProfile`, `PaginatedResponse`, `EmployeeItem`, `DepartmentItem`
- `apps/mobile/src/hooks/useDashboard.ts` — React hook that fetches dashboard + profile, handles 401 auto sign-out, exposes `refresh()` callback
- `docs/MOBILE_DASHBOARD_PROFILE.md` — endpoint table, auth flow, 401 behavior, manual verification steps, known limitations, future tasks

## Files Modified

- `apps/mobile/src/api/client.ts` — added `authGet<T>()` helper (Bearer token, 401 → `SessionExpiredError`, network error → Thai message); added `getDashboard()`, `getProfile()`, `getEmployees()`, `getDepartments()`
- `apps/mobile/app/home.tsx` — complete rewrite: header with greeting + logout, profile card (email / role / status), dashboard summary grid (4 stat cards from `/dashboard`), feature cards with icons, pull-to-refresh + refresh button, loading / error / retry states; all Thai-first labels
- `apps/mobile/README.md` — added Dashboard & Profile section documenting endpoints and 401 behavior

## API Endpoints Used

| Method | Path         | Purpose                                    |
|--------|--------------|--------------------------------------------|
| GET    | /auth/me     | Fresh profile data (id, email, role)       |
| GET    | /dashboard   | Aggregated HR stats shown in summary cards |

## Authenticated Request Summary

`authGet<T>(path, token)` in `client.ts` centralises all authenticated GET logic:
- Sets `Authorization: Bearer <token>` header.
- Wraps `fetch()` in try/catch → throws Thai-language error on network failure.
- `401` → throws `SessionExpiredError` (typed class, not a string).
- Non-OK (other) → throws generic Thai message with HTTP status.

## Session Expiry / 401 Handling Summary

`useDashboard` catches `SessionExpiredError`:
1. Calls `signOut()` — clears token + user from SecureStore, resets AuthContext.
2. Calls `router.replace('/login')` — navigates to login screen.

No refresh token. Expiry requires re-authentication. Thai message embedded in error: _เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง_.

## Dashboard UI Summary

Four stat cards in a 2×2 grid:
- **พนักงานทั้งหมด** (`totalEmployees` / `activeEmployees`)
- **แผนกทั้งหมด** (`totalDepartments` / `totalPositions`)
- **การลงเวลาวันนี้** (`todayClockedInCount` / `todayLateCount`)
- **คำขอลารอดำเนินการ** (`pendingLeaveRequests` / `approvedLeaveRequests`)

Pull-to-refresh + "อัปเดตข้อมูล" button with "อัปเดตล่าสุด HH:MM" timestamp.
Loading spinner, error message + retry button, idle graceful state.

## Profile UI Summary

Profile card at top of screen:
- Avatar circle (first letter of email, blue background).
- Email and Thai role label (SUPER_ADMIN → ผู้ดูแลระบบ, etc.).
- Green "ผู้ใช้งานที่เข้าสู่ระบบ" status badge.
- Role code and status row beneath divider.

Fallback: if `/auth/me` fails, profile falls back to `user` object stored in AuthContext from login, so the card is never blank.

Employee details (name, code, department, position) are not available via the current API auth endpoints — graceful limitation, documented for future tasks.

## Types Added

`apps/mobile/src/api/types.ts`:
- `SessionExpiredError` (extends Error, named class for `instanceof` checks)
- `ApiError`
- `MobileUserProfile`
- `DashboardSummary` (with `employees`, `attendance`, `leave` sub-objects)
- `PaginatedResponse<T>`, `PaginatedMeta`
- `EmployeeItem`, `DepartmentItem` (for future fallback/list use)

## Documentation Updated

- `docs/MOBILE_DASHBOARD_PROFILE.md` — created (endpoint table, auth flow, 401 behavior, manual steps, known limitations, future task list)
- `apps/mobile/README.md` — added Dashboard & Profile section
- `docs/CTO_SUMMARY_T044.md` — this file

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` (apps/mobile) | **PASS** — zero TypeScript errors |
| `npm test` (apps/api) | **PASS** — 114 tests, 14 suites |
| `./scripts/verify.sh` | **PASS** — API build, Prisma schema, Web build |
| `./scripts/docker-verify.sh` | **PASS** — all 3 containers healthy |
| `./scripts/api-smoke-test.sh` | **PASS** — `/dashboard` returns data, unauthenticated → 401 |
| `./scripts/e2e-test.sh` | **PASS** — 51 Playwright tests |

## Manual Mobile Verification Notes

Manual browser verification (`npm run web` at `http://localhost:8081`):
1. Login → redirects to `/home`.
2. Dashboard summary cards load with live data from running Docker stack.
3. Profile card shows email and Thai role label.
4. Pull-to-refresh and "อัปเดตข้อมูล" button re-fetch data and update timestamp.
5. "ออกจากระบบ" clears session and returns to `/login`.
6. **401 test**: clearing `hr_auth_token` from localStorage then tapping refresh triggers auto sign-out and redirect to `/login`.

## Existing Web / API Impact

None. No backend routes were added or modified. No Prisma schema changes. No web app changes. All 51 existing E2E tests and 114 API unit tests pass.

## Known Limitations

- `GET /dashboard` is role-restricted to SUPER_ADMIN / HR_ADMIN / MANAGER. An EMPLOYEE-role user gets `403` (not `401`), which shows a generic error card rather than triggering auto sign-out. T-045 can add employee-specific data views.
- Profile card shows only `email` and `role`. Employee name, code, department, and position require a future `/auth/me/employee` or employee-search endpoint.
- No persistent cache — data re-fetches on every screen mount and manual refresh.
- No offline indicator or stale-data warning.

## Risk
Low

## Decision
PASS

## Next Step
T-045 — Mobile Attendance Foundation

## Recommended Commit Message
```
feat(mobile): add dashboard and profile screen (T-044)

- Add authGet<T>() helper with Bearer token, 401→SessionExpiredError, Thai network errors
- Add getDashboard(), getProfile(), getEmployees(), getDepartments() to client.ts
- Add useDashboard hook with 401 auto sign-out and router redirect
- Rewrite /home into full dashboard: profile card, 4 stat cards, feature grid, pull-to-refresh
- Add types: SessionExpiredError, DashboardSummary, MobileUserProfile, PaginatedResponse
- Add docs/MOBILE_DASHBOARD_PROFILE.md and update apps/mobile/README.md

All verification PASS: mobile typecheck, 114 API tests, verify, docker-verify, smoke, E2E.
```
