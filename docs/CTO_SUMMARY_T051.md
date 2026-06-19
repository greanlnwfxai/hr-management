# CTO Summary

## Step
T-051 — Mobile Manager Approval

## Status
PASS

## Scope
Implemented full mobile manager leave approval workflow. Managers (and HR Admins / Super Admins) can now list pending leave requests, approve them (with balance deduction), and reject them from the mobile app. Backend RBAC was extended to include `MANAGER` role for the three relevant leave endpoints. Mobile screen, hook, and API client functions were added. Home screen approval card is now live and navigates to `/approvals`.

## Files Created
- `apps/mobile/app/approvals.tsx` — Manager approval screen
- `apps/mobile/src/hooks/useApprovals.ts` — Approval data hook
- `docs/MOBILE_MANAGER_APPROVAL.md` — Feature documentation
- `docs/CTO_SUMMARY_T051.md` — This file

## Files Modified
- `apps/api/src/leave/leave.controller.ts` — Added `UserRole.MANAGER` to `GET /leave`, `PATCH /leave/:id/approve`, `PATCH /leave/:id/reject`
- `apps/api/src/leave/leave.service.ts` — Extended `findOne` to allow MANAGER access without ownership check
- `apps/api/src/leave/leave.service.spec.ts` — Added MANAGER `findOne` test
- `apps/mobile/src/api/client.ts` — Added `authPatch` helper + `getApprovalRequests`, `approveLeaveRequest`, `rejectLeaveRequest`
- `apps/mobile/app/home.tsx` — Enabled approval card with navigation to `/approvals`
- `docs/MOBILE_ROLE_BASED_UX.md` — Updated feature table, approval card status, known limitations

## Mobile Approval Route Summary
- Route: `apps/mobile/app/approvals.tsx`
- Navigation entry: Home screen "อนุมัติคำขอลา" card (สำหรับผู้จัดการ section)
- Role gate: `canUseManagerApproval()` → SUPER_ADMIN, HR_ADMIN, MANAGER
- EMPLOYEE accessing `/approvals` directly sees "คุณไม่มีสิทธิ์เข้าถึงฟีเจอร์นี้" — `useApprovals(enabled=false)` ensures no API call is made
- Pull-to-refresh supported

## API Client / Hook Summary
- `authPatch<T>()` helper added to `client.ts` (mirrors authGet/authPost pattern)
- `getApprovalRequests()` — `GET /leave?status=PENDING`
- `approveLeaveRequest(id)` — `PATCH /leave/:id/approve`
- `rejectLeaveRequest(id, reason?)` — `PATCH /leave/:id/reject`
- `useApprovals(enabled)` hook manages: loadState, requests[], error, actionLoadingId, refresh, approve, reject
- `enabled` param (default `true`) gates `fetchData` — EMPLOYEE callers pass `false`, preventing any API call on unauthorized mount
- `actionLoadingId` prevents double-submit during in-flight actions
- `SessionExpiredError` triggers `signOut()` + `/login` redirect consistently

## Approval UI Summary
- Each leave request card shows: employee name, code, status badge, leave type (Thai), total days, date range, reason, submission date
- Approve: `ApproveModal` confirmation (native `<Modal>`, works on web) → API call → remove card from list → inline feedback banner
- Reject: `RejectModal` with optional `TextInput` for reason → API call → remove card from list → inline feedback banner
- Feedback banner is dismissible (tap to close); replaces `Alert.alert` for full web-compatibility
- Empty state: "ไม่มีคำขอที่รออนุมัติ" with green check icon
- All Thai text is clear and professional

## Role-Based Access Summary
| Role | Home Card Shown | Screen Accessible | Backend Enforced |
|------|:-:|:-:|:-:|
| SUPER_ADMIN | ✅ | ✅ | ✅ |
| HR_ADMIN | ✅ | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ✅ |
| EMPLOYEE | ❌ | UI gate (no API call) | ✅ (403) |

## Backend Changes Summary
Three `@Roles()` decorators in `leave.controller.ts` now include `UserRole.MANAGER`:
- `GET /leave` — list all leave requests
- `PATCH /leave/:id/approve` — approve a pending request
- `PATCH /leave/:id/reject` — reject a pending request

`leave.service.ts` `findOne` now allows MANAGER to view any leave request (consistent with HR_ADMIN).

No new Prisma schema changes. No migrations. No new database columns.

## Tests Added / Updated
- `apps/api/src/leave/leave.service.spec.ts` — +1 test: "returns the record to MANAGER without ownership check"
- Total: 190/190 API tests pass (was 189)

## Documentation Updated
- `docs/MOBILE_MANAGER_APPROVAL.md` — Created (full feature doc)
- `docs/MOBILE_ROLE_BASED_UX.md` — Feature table updated, approval card status updated to active, known limitations updated
- `docs/CTO_SUMMARY_T051.md` — Created (this file)

## Verification Results
| Check | Result |
|-------|--------|
| `npm test` (API — 190 tests) | ✅ PASS |
| `npm run typecheck` (mobile — post-fix) | ✅ PASS |
| `npx expo export --platform web` (post-fix) | ✅ PASS |
| `npm run build` (web) | ✅ PASS |
| `./scripts/verify.sh` | ✅ PASS |
| `./scripts/api-smoke-test.sh` | ✅ PASS |
| `./scripts/mobile-verify.sh` | ✅ PASS |
| `./scripts/e2e-test.sh` (51/51) | ✅ PASS |
| `docker compose ps` (all healthy) | ✅ PASS |
| `curl http://localhost:4002/health` | ✅ `{"status":"ok"}` |

## Manual Verification Notes
- Docker stack was running throughout verification (no restart needed).
- API smoke test confirms `GET /leave` returns 6 records (live data) for admin user.
- Full manual mobile testing (login as manager, tap approval card, approve/reject) requires a running Expo dev server or re-built Docker mobile image. The Docker image runs the pre-T-051 bundle. A rebuild with `docker compose up -d --build` (user-approved) will deploy the new screens.
- EMPLOYEE role manual test not possible with current seed data (single admin@hr.local account). The UI gate and backend 403 are code-verified.

## Security / RBAC Review
- No security regression introduced.
- EMPLOYEE cannot list leave requests or approve/reject (confirmed by `RolesGuard` enforcement, unchanged).
- Backend RBAC is the authoritative gate; mobile UI gating is defense-in-depth only.
- JWT validation unchanged; token handling unchanged.
- No new public routes added.

## Backward Compatibility Review
- No breaking changes to existing API response shapes.
- No Prisma schema changes; no migrations.
- Existing web app login and navigation unchanged (E2E: 51/51 pass).
- Existing mobile screens (attendance, leave request, home, login) unchanged and still pass typecheck + export.
- Existing 189 API tests still pass; 1 new test added.

## Known Limitations
1. **No manager-subordinate hierarchy** — MANAGER sees ALL pending leave requests (same as HR_ADMIN). No reporting-line in current schema.
2. **Rejection reason not persisted** — `rejectReason` accepted by API but no database column exists. A future schema migration is needed to persist it.
3. **No push notifications** — Employees are not notified on approval/rejection.
4. **No approval history view** — Approval screen only shows PENDING. Approved/rejected history not shown in mobile approval context.
5. **Docker image not rebuilt** — Running Docker container uses pre-T-051 image. Rebuild required to deploy MANAGER RBAC change to the Docker stack.

## Risk
**Low**
- Backend change is additive (extending existing `@Roles()` decorators to include MANAGER, not removing or weakening any existing guards).
- No schema changes; no migrations; no data mutations.
- All verification checks pass.

## Decision
**PASS**

## Recommended Commit Message
```
feat(mobile): add manager leave approval workflow (T-051)
```

## Next Recommended Task
**T-052** — Mobile Profile Screen (employee self-service: view personal info, employment contract details) — currently showing as "เร็ว ๆ นี้" placeholder.

Or alternatively: persist `rejectReason` in the backend schema (small targeted task), or implement approval notification badge on Home using `dashboard.leave.pendingLeaveRequests`.
