# CTO Summary

## Step
T-048 — Mobile Leave Request

## Status
PASS

## Scope
Added a fully protected Mobile Leave Request screen to the Expo React Native app, allowing employees to view their leave balance, submit leave requests, and track their own leave history — all with Thai-first UI and robust session/error handling. No backend changes were required.

## Files Created

- `apps/mobile/app/leave.tsx` — Leave screen (balance, create form, request history)
- `apps/mobile/src/hooks/useLeave.ts` — Leave hook (fetch, submit, session handling, error translation)
- `docs/MOBILE_LEAVE_REQUEST.md` — Feature documentation

## Files Modified

- `apps/mobile/src/api/types.ts` — Added `LeaveType`, `LeaveRequestStatus`, `LeaveRequestRecord`, `LeaveBalanceRecord`, `CreateLeaveRequestPayload`
- `apps/mobile/src/api/client.ts` — Added `getMyLeaveRequests()`, `getMyLeaveBalance()`, `createLeaveRequest()`
- `apps/mobile/src/hooks/index.ts` — Exported `useLeave`
- `apps/mobile/app/_layout.tsx` — Registered `/leave` screen with Thai header title "การลา"
- `apps/mobile/app/home.tsx` — Wired Leave card to navigate to `/leave` with active badge
- `apps/mobile/README.md` — Added leave screen entry and Leave Request section

## Leave API Routes Inspected

| File | Key Finding |
|------|------------|
| `apps/api/src/leave/leave.controller.ts` | `POST /leave/request`, `GET /leave/me`, `GET /leave/:id`, `PATCH /leave/:id/approve`, `PATCH /leave/:id/reject` |
| `apps/api/src/leave/leave.service.ts` | Balance check happens at `approve()`, NOT at `create()`. `create()` only validates date order and overlap. |
| `apps/api/src/leave-balance/leave-balance.controller.ts` | `GET /leave-balances/my` (own), `GET /leave-balances` (admin), `POST /leave-balances`, `PATCH /leave-balances/:id` |
| `apps/api/src/leave-balance/leave-balance.service.ts` | `remainingDays` is computed (`totalDays - usedDays`) and returned by backend |
| `apps/api/src/leave/dto/create-leave-request.dto.ts` | Fields: `leaveType`, `startDate`, `endDate`, `reason` (optional in DTO, required on mobile) |
| `apps/api/src/common/enums.ts` | `LeaveType`: SICK/VACATION/PERSONAL/OTHER; `LeaveStatus`: PENDING/APPROVED/REJECTED |

## Leave API Endpoints Used

| Method | Path | Used For |
|--------|------|----------|
| `GET` | `/leave/me?page=1&limit=20` | My leave request history |
| `GET` | `/leave-balances/my?page=1&limit=20` | My leave balance by type |
| `POST` | `/leave/request` | Submit new leave request |

Note: Task spec suggested `/leave-requests` and `/leave-balance/me` — those paths do not exist in the API. Actual paths were verified from the controllers.

## Mobile Leave Screen Summary

The `/leave` screen (`apps/mobile/app/leave.tsx`) contains:

1. **Header**: "การลา" (registered via `_layout.tsx` `Stack.Screen`)
2. **Leave Balance section**: lists all balance records with `leaveType`, year, total/used/remaining days in a compact stat row
3. **Create Leave Request form**: leave type selector (tap-to-select grid), two date inputs (YYYY-MM-DD), reason textarea, ล้างข้อมูล + ส่งคำขอลา buttons
4. **My Leave Requests section**: list of past requests with type label, date range, reason, days count, Thai status badge
5. **Refresh button** and **pull-to-refresh** scroll control

## Leave Balance Summary

- Balance is fetched from `GET /leave-balances/my` → `PaginatedResponse<LeaveBalanceRecord>`
- Displayed per type per year: วันลาทั้งหมด / ใช้ไปแล้ว / คงเหลือ
- Balance is **informational only** — backend enforces deduction at approval time, not at submission
- Empty state: "ไม่พบข้อมูลสิทธิ์การลา"

## Create Leave Request Flow Summary

1. User selects leave type (tap grid: ลาป่วย / ลาพักร้อน / ลากิจ / อื่น ๆ)
2. User enters `startDate` and `endDate` as `YYYY-MM-DD`
3. User enters reason (required on mobile, optional in backend DTO)
4. Client-side validation fires on submit:
   - All fields required
   - Date format check (`YYYY-MM-DD` regex + `Date` validity)
   - `endDate ≥ startDate` check
5. On valid form: calls `POST /leave/request` via `authPost`
6. Success: shows "ส่งคำขอลาสำเร็จ", refreshes balance + request list
7. Error: translates backend error message to Thai, shown inline

## Hook / API Client Summary

**`useLeave.ts`**:
- Fetches balance and requests in `Promise.all` on mount and after submit
- `submitRequest()` calls `createLeaveRequest()`, returns `boolean` success flag
- `resetSubmit()` clears submit state/messages (used by "ล้างข้อมูล")
- Exports `leaveTypeLabel()`, `leaveStatusLabel()`, `leaveStatusColor()`, `LEAVE_TYPE_OPTIONS`

**`client.ts` additions**:
- `getMyLeaveRequests(token, page, limit)` → `PaginatedResponse<LeaveRequestRecord>`
- `getMyLeaveBalance(token, page, limit)` → `PaginatedResponse<LeaveBalanceRecord>`
- `createLeaveRequest(token, payload)` → `LeaveRequestRecord`
- All reuse existing `authGet`/`authPost` helpers

## Error Handling Summary

| Condition | Thai Message |
|-----------|-------------|
| Network failure | ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ |
| 401 (GET or POST) | triggers `SessionExpiredError` → session expiry flow |
| Overlap conflict | มีคำขอลาที่ทับซ้อนกันอยู่แล้ว |
| startDate > endDate (backend) | วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด |
| No employee profile | ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้ |
| Invalid date format (client) | กรุณากรอกวันที่ในรูปแบบ YYYY-MM-DD |
| Missing reason (client) | กรุณากรอกเหตุผลการลา |
| Fallback | ไม่สามารถส่งคำขอลาได้ กรุณาลองใหม่อีกครั้ง |

## Session Handling Summary

- Both `authGet` and `authPost` throw `SessionExpiredError` on `401`
- `useLeave` catches it in both `fetchData` and `submitRequest`
- On session expiry: calls `signOut()`, redirects to `/login`
- Token sourced from `useAuth()` → `AuthProvider` → `expo-secure-store`

## Documentation Updated

- `docs/MOBILE_LEAVE_REQUEST.md` — Created: endpoints, payload contract, Thai labels, validation, error handling, manual test steps, known limitations, future improvements
- `apps/mobile/README.md` — Added `/leave` screen to Screens table and added Leave Request section

## Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` (mobile) | PASS — 0 errors |
| `npx expo export --platform web` | PASS — bundled successfully |
| `npm test` (API) | PASS — 143/143 tests |
| `./scripts/verify.sh` | PASS — API build, Prisma schema, Web build |
| `./scripts/docker-verify.sh` | PASS — all 4 containers healthy |
| `./scripts/api-smoke-test.sh` | PASS — all 11 smoke checks |
| `./scripts/e2e-test.sh` | PASS — 51/51 Playwright tests |

## Manual Mobile Verification Notes

End-to-end golden path was verified live against the running Docker stack:

| Endpoint | HTTP | Result |
|----------|------|--------|
| `GET /leave/me` | 200 | 5 leave requests for EMP-001 (Jane Doe, Engineering) |
| `GET /leave-balances/my` | 200 | 1 SICK balance record (10 total, 9 used, 1 remaining) |
| `POST /leave/request` | 201 | New PERSONAL leave request created successfully |

`admin@hr.local` is linked to employee EMP-001. The Leave screen golden path (balance display → form submit → list refresh) is fully functional with the seeded data.

## Existing Web/API/Mobile Impact

- **Web leave page**: unchanged — no modifications to `apps/web`
- **API contracts**: unchanged — no backend modifications
- **Mobile CI**: no configuration changes — existing typecheck + export CI job covers the new screen
- **E2E tests**: all 51 pass — web leave page tests unaffected
- **Home screen**: Leave card now navigates to `/leave` and shows "เปิดใช้งาน" badge (previously "เร็วๆ นี้")

## Known Limitations

1. **Balance at approval only**: Leave balance enforcement happens at HR approval, not at submission. The balance section is informational.
2. **Text date input**: No native date picker — users enter `YYYY-MM-DD` manually. Deferred per task spec.
3. **No file attachment**: Medical certificates out of scope.
4. **No manager approval on mobile**: Approve/reject stays on web/admin side.
5. **Employee record required**: The account must have a linked employee record. Verified: `admin@hr.local` is linked to EMP-001 in the seed data and all three endpoints return real data.
6. **Pagination**: First page only (limit 20). Older requests not shown.

## Risk
Low

## Decision
PASS

## Next Step
T-049 — (Suggested) Mobile Leave Calendar View, or continued mobile feature development (profile screen, push notifications)

## Recommended Commit Message
```
feat(mobile): add leave request screen (T-048)

Add protected Leave screen with balance summary, create request form,
and request history. Uses GET /leave/me, GET /leave-balances/my, and
POST /leave/request. Thai-first UI, 401 session expiry, and full
client-side validation. Wires Leave card on Home to /leave route.
All CI checks pass: typecheck, expo export, 143 API tests, E2E 51/51.
```
