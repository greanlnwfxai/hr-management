# Mobile Manager Approval

**Task:** T-051 — Mobile Manager Approval
**Status:** Complete

---

## Overview

Managers, HR Admins, and Super Admins can review, approve, and reject employee leave requests directly from the mobile app via the `/approvals` screen.

---

## Who Can Access

| Role | Can Access Approval Screen | Backend Enforced |
|------|:--------------------------:|:----------------:|
| `SUPER_ADMIN` | ✅ | ✅ |
| `HR_ADMIN` | ✅ | ✅ |
| `MANAGER` | ✅ | ✅ |
| `EMPLOYEE` | ❌ (UI gate + backend 403) | ✅ |

**UI gating:** The approval card on the Home screen is only shown to roles where `canUseManagerApproval(role)` returns `true`. If an EMPLOYEE navigates directly to `/approvals`, they see "คุณไม่มีสิทธิ์เข้าถึงฟีเจอร์นี้". `useApprovals(enabled=false)` is called with `enabled=false` so no API fetch is triggered on unauthorized mount.

**Backend RBAC** is the authoritative gate — the `RolesGuard` enforces role restrictions on all three endpoints.

---

## Mobile Entry Point

**Home screen** (`apps/mobile/app/home.tsx`):
- "อนุมัติคำขอลา" card is shown in the **สำหรับผู้จัดการ** section for eligible roles.
- Badge: **ผู้จัดการ**
- Navigates to `/approvals` on press.

---

## Approval Screen (`/approvals`)

File: `apps/mobile/app/approvals.tsx`

### Layout
1. Back navigation (→ Home)
2. Page title: **อนุมัติคำขอลา**
3. Section header: **คำขอรออนุมัติ** with count badge
4. List of `PENDING` leave request cards (pull-to-refresh supported)
5. Empty state: "ไม่มีคำขอที่รออนุมัติ"
6. Refresh button at the bottom

### Leave Request Card

Each card shows:
- Employee name + employee code
- Status badge (color-coded)
- Leave type (Thai label)
- Number of days
- Date range
- Reason (if provided)
- Submission date
- **อนุมัติ** and **ปฏิเสธ** action buttons

---

## Approve Flow

1. Tap **อนุมัติ** on a pending request card.
2. `ApproveModal` opens: "ยืนยันการอนุมัติ / อนุมัติคำขอลาของ [ชื่อพนักงาน]?" (native `<Modal>`, works on both native and web).
3. On confirm: calls `PATCH /leave/:id/approve`.
4. On success: card removed from pending list, green inline banner shown ("อนุมัติคำขอลาเรียบร้อยแล้ว"). Tap banner to dismiss.
5. On error: red inline banner shown with API error message.

**Backend behavior (approve):**
- Validates request is `PENDING`.
- Checks leave balance exists for employee + leave type + year.
- Deducts `totalDays` from `leaveBalance.usedDays` atomically.
- Sets status to `APPROVED` and records `approvedAt`.
- Returns full leave request record.

---

## Reject Flow

1. Tap **ปฏิเสธ** on a pending request card.
2. `RejectModal` opens: "เหตุผลการปฏิเสธ" with optional text input.
3. Tap **ยืนยันการปฏิเสธ**: calls `PATCH /leave/:id/reject` with `{ rejectReason }`.
4. On success: card removed from pending list, green inline banner shown ("ปฏิเสธคำขอลาเรียบร้อยแล้ว"). Tap banner to dismiss.
5. On error: red inline banner shown with API error message.

**Note on rejection reason:** The backend `RejectLeaveRequestDto.rejectReason` field is accepted but not currently persisted in the database (documented in the DTO). The reason is optional at both the mobile and API level.

---

## API Client

File: `apps/mobile/src/api/client.ts`

| Function | Method | Endpoint |
|----------|--------|----------|
| `getApprovalRequests(token, status, page, limit)` | `GET` | `/leave?status=PENDING` |
| `approveLeaveRequest(token, id)` | `PATCH` | `/leave/:id/approve` |
| `rejectLeaveRequest(token, id, reason?)` | `PATCH` | `/leave/:id/reject` |

An `authPatch` helper was added (mirrors existing `authGet` / `authPost` with `PATCH` method).

All three functions:
- Attach `Authorization: Bearer <token>` header.
- Throw `SessionExpiredError` on 401 (triggers sign-out + redirect to login).
- Throw `Error` with API message on other non-OK responses.

---

## Hook

File: `apps/mobile/src/hooks/useApprovals.ts`

| State / Action | Description |
|----------------|-------------|
| `loadState` | `'idle' \| 'loading' \| 'success' \| 'error'` |
| `requests` | Array of `LeaveRequestRecord` (PENDING only) |
| `error` | Error message string or null |
| `actionLoadingId` | ID of request currently being actioned (prevents double submit) |
| `refresh()` | Re-fetches pending requests |
| `approve(id)` | Approves request, removes from list on success |
| `reject(id, reason)` | Rejects request with optional reason, removes from list |

Session expiry triggers `signOut()` + router redirect to `/login`.

---

## Backend Changes

File: `apps/api/src/leave/leave.controller.ts`

Added `UserRole.MANAGER` to `@Roles()` on:

| Endpoint | Before | After |
|----------|--------|-------|
| `GET /leave` | SUPER_ADMIN, HR_ADMIN | SUPER_ADMIN, HR_ADMIN, **MANAGER** |
| `PATCH /leave/:id/approve` | SUPER_ADMIN, HR_ADMIN | SUPER_ADMIN, HR_ADMIN, **MANAGER** |
| `PATCH /leave/:id/reject` | SUPER_ADMIN, HR_ADMIN | SUPER_ADMIN, HR_ADMIN, **MANAGER** |

File: `apps/api/src/leave/leave.service.ts`

Updated `findOne` to allow MANAGER to read any leave request without an ownership check (consistent with HR_ADMIN access).

---

## Security / RBAC Review

- All approval/rejection endpoints remain behind `JwtAuthGuard` + `RolesGuard`.
- EMPLOYEE role cannot call approve/reject (403 from backend).
- EMPLOYEE cannot list all leave requests (403 from backend).
- Mobile UI gate is defense-in-depth only, not a security boundary.
- No new Prisma schema changes — existing RBAC column values unchanged.

---

## Known Limitations

1. **No manager-subordinate hierarchy:** MANAGER sees ALL pending leave requests, not just their direct reports. There is no reporting-line relationship in the current schema. This matches HR_ADMIN behavior and is acceptable for the current team size.
2. **Rejection reason not persisted:** The `rejectReason` field in `RejectLeaveRequestDto` is accepted but the Prisma schema does not have a `rejectReason` column. Future work: add schema field and migration.
3. **No approval history tab:** The screen only shows `PENDING` requests. Approved/rejected history is not shown in the mobile approval view (visible via `GET /leave/me` for employees, or `GET /leave` for admins).
4. **No push notifications:** Employees are not notified when their request is approved or rejected.
5. **No optimistic updates:** The list refreshes only after a confirmed API response.

---

## Future Improvements

- Approval notification badge on Home card (use `dashboard.leave.pendingLeaveRequests`)
- Push notifications to employee on approval/rejection
- Approval history filter (show recent approved/rejected)
- Manager-subordinate hierarchy filter
- Add `rejectReason` column to Prisma schema and persist it
- Offline-safe action queue (retry on reconnect)
