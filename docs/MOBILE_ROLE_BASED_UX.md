# Mobile Role-Based UX

**Task:** T-049 — Mobile HR Polish & Role-Based UX

---

## Overview

The mobile app displays different navigation and feature cards based on the authenticated user's role. This is a **UI-only gate** — backend RBAC remains the authoritative source of trust.

---

## Roles and Visible Features

| Feature | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---------|:-----------:|:--------:|:-------:|:--------:|
| ลงเวลา (Attendance) | ✅ | ✅ | ✅ | ✅ |
| ขออนุมัติลา (Leave Request) | ✅ | ✅ | ✅ | ✅ |
| ภาพรวมองค์กร (Org Dashboard) | ✅ | ✅ | ✅ | ❌ |
| อนุมัติคำขอลา (Approval entry) | ✅ | ✅ | ✅ | ❌ |
| ภาพรวม HR (HR Overview) | ✅ (coming soon) | ✅ (coming soon) | ❌ | ❌ |
| จัดการพนักงาน (Employee Mgmt) | ✅ (coming soon) | ✅ (coming soon) | ❌ | ❌ |

---

## Role Labels (Thai)

| Role constant | Display label |
|---------------|---------------|
| `SUPER_ADMIN` | ผู้ดูแลระบบสูงสุด |
| `HR_ADMIN` | HR Admin |
| `MANAGER` | ผู้จัดการ |
| `EMPLOYEE` | พนักงาน |

Labels are centralized in `apps/mobile/src/utils/roles.ts`.

---

## Role Helper Functions

File: `apps/mobile/src/utils/roles.ts`

| Function | Purpose |
|----------|---------|
| `roleLabel(role)` | Returns Thai display label for a role |
| `isAdmin(role)` | True for SUPER_ADMIN or HR_ADMIN |
| `isManager(role)` | True for MANAGER |
| `canUseManagerApproval(role)` | True for MANAGER, HR_ADMIN, SUPER_ADMIN |
| `canUseEmployeeSelfService(role)` | True for all authenticated roles |
| `canSeeDashboard(role)` | True for MANAGER, HR_ADMIN, SUPER_ADMIN |

---

## Disabled / Coming-Soon Behavior

Cards that are visible but not yet implemented show:
- Greyed-out card style (no border highlight, muted icon)
- Badge: **เร็ว ๆ นี้**
- Not pressable / no navigation
- Description text: "ฟีเจอร์นี้จะเปิดใช้งานในขั้นตอนถัดไป"

This prevents broken navigation while preparing the UI entry point for T-050.

---

## Manager Approval (T-051)

The "อนุมัติคำขอลา" card is active for MANAGER, HR_ADMIN, and SUPER_ADMIN with a "ผู้จัดการ" badge. It navigates to `/approvals`. EMPLOYEE role does not see this card.

See [MOBILE_MANAGER_APPROVAL.md](MOBILE_MANAGER_APPROVAL.md) for the full approval flow documentation.

---

## Org Dashboard Gating

The `/dashboard` API endpoint is role-gated at the backend (`SUPER_ADMIN, HR_ADMIN, MANAGER`). To prevent EMPLOYEE users from triggering a 403:

- `useDashboard` skips the `getDashboard` API call when `canSeeDashboard(role)` is false.
- The profile fetch (`getProfile`) runs for all roles.
- The "ภาพรวมองค์กร" section is conditionally rendered in home.tsx based on role.

---

## Security Note

UI gating is **not authorization**. The backend API enforces access control independently:

- `GET /dashboard` → 403 for EMPLOYEE
- All protected routes require a valid JWT (Bearer token)
- Role permissions are enforced server-side via `@Roles()` decorator + `RolesGuard`

The mobile app's role-based UI is purely for UX — it never bypasses backend authorization.

---

## Known Limitations

- Only one seed user exists (`admin@hr.local` / `admin1234` — SUPER_ADMIN). EMPLOYEE role UI path is code-complete but cannot be manually tested without creating an employee account.
- HR Overview and Employee Management are placeholder cards (future tasks).
- No role-aware bottom tabs yet (future enhancement).
- No manager-subordinate hierarchy: MANAGER sees all PENDING leave requests (same as HR_ADMIN). Subordinate filtering is a future enhancement.

---

## Future Improvements

- **T-052+:** HR admin employee search and profile management
- Role-aware bottom tab bar
- Mobile notification badges for pending approvals (count from `dashboard.leave.pendingLeaveRequests`)
- Approval history filter (approved/rejected requests view)
- Manager-subordinate hierarchy (filter requests to only direct reports)
- Deeper employee profile screen
