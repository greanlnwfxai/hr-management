# Mobile Leave Request — T-048

## Feature Overview

Employees can use the mobile app to:
1. View their leave balance (by type and year)
2. Submit a leave request
3. View their own leave request history and status
4. See clear Thai UI messages for all states

## Endpoints Used

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/leave/me?page=1&limit=20` | Own leave requests (paginated) |
| `GET` | `/leave-balances/my?page=1&limit=20` | Own leave balances (paginated) |
| `POST` | `/leave/request` | Submit a new leave request |

All endpoints require `Authorization: Bearer <token>`.

## Payload Contract

### POST /leave/request

```json
{
  "leaveType": "SICK",
  "startDate": "2024-02-01",
  "endDate": "2024-02-03",
  "reason": "เป็นไข้"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `leaveType` | `LeaveType` | ✅ | One of: `SICK`, `VACATION`, `PERSONAL`, `OTHER` |
| `startDate` | `string` | ✅ | ISO 8601 date (`YYYY-MM-DD`) |
| `endDate` | `string` | ✅ | ISO 8601 date (`YYYY-MM-DD`) |
| `reason` | `string` | ✅ (mobile) | Optional in backend DTO but required on mobile form |

### Response shape (LeaveRequestRecord)

```json
{
  "id": "uuid",
  "leaveType": "SICK",
  "startDate": "2024-02-01T00:00:00.000Z",
  "endDate": "2024-02-03T00:00:00.000Z",
  "totalDays": 3,
  "reason": "เป็นไข้",
  "status": "PENDING",
  "approvedAt": null,
  "employee": { "id": "...", "employeeCode": "...", "firstName": "...", "lastName": "..." },
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Leave Balance shape (LeaveBalanceRecord)

```json
{
  "id": "uuid",
  "leaveType": "SICK",
  "year": 2024,
  "totalDays": 10,
  "usedDays": 3,
  "remainingDays": 7
}
```

`remainingDays` is computed by the backend (`totalDays - usedDays`).

## Leave Type Labels (Thai)

| Value | Thai Label |
|-------|-----------|
| `SICK` | ลาป่วย |
| `VACATION` | ลาพักร้อน |
| `PERSONAL` | ลากิจ |
| `OTHER` | อื่น ๆ |

## Leave Status Labels (Thai)

| Value | Thai Label | Color |
|-------|-----------|-------|
| `PENDING` | รอดำเนินการ | amber (`#d97706`) |
| `APPROVED` | อนุมัติแล้ว | green (`#16a34a`) |
| `REJECTED` | ปฏิเสธแล้ว | red (`#dc2626`) |

## Mobile Validation

Validated client-side before submission:

| Field | Rule |
|-------|------|
| `leaveType` | Required; must be a valid `LeaveType` |
| `startDate` | Required; must match `YYYY-MM-DD`; must be a valid date |
| `endDate` | Required; must match `YYYY-MM-DD`; must be a valid date |
| `startDate ≤ endDate` | `endDate` must not be before `startDate` |
| `reason` | Required (non-empty) |

Error messages are shown in Thai inline below each field.

## Session Handling

- All API calls use `Bearer <token>` from `AuthProvider`.
- A `401` response throws `SessionExpiredError`.
- The hook catches `SessionExpiredError`, calls `signOut()`, and redirects to `/login`.
- Message shown: **เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง**

## Error Handling

| Condition | Thai Message |
|-----------|-------------|
| Network failure | ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ |
| 401 Unauthorized | เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง |
| `startDate > endDate` (backend) | วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด |
| Overlapping leave (409) | มีคำขอลาที่ทับซ้อนกันอยู่แล้ว |
| No employee profile (400) | ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้ |
| Missing field validation | กรุณากรอกวันที่ในรูปแบบ YYYY-MM-DD / กรุณากรอกเหตุผลการลา |
| Other errors | ไม่สามารถส่งคำขอลาได้ กรุณาลองใหม่อีกครั้ง |

## Manual Test Steps

1. Start backend stack:
   ```bash
   docker compose up -d
   ```
2. Start mobile:
   ```bash
   cd apps/mobile && npm run web
   ```
3. Open `http://localhost:3004`
4. Login with `admin@hr.local` / `admin1234`
5. On Home screen → tap **คำขอลางาน** card
6. Confirm Leave screen opens
7. **Leave Balance section**: verify balance rows appear or "ไม่พบข้อมูลสิทธิ์การลา" empty state
8. **Create form**: select leave type, enter dates in `YYYY-MM-DD`, enter reason → tap **ส่งคำขอลา**
9. Confirm success message: **ส่งคำขอลาสำเร็จ**
10. Confirm "คำขอลาของฉัน" list refreshes and shows the new request with **รอดำเนินการ** badge
11. Test form validation: submit with empty fields → confirm Thai error messages appear
12. Test invalid date format: enter `01-01-2024` → confirm format error
13. Test end-before-start: enter `endDate < startDate` → confirm error
14. Pull-to-refresh on the leave screen → confirm data reloads
15. Test logout: tap ออกจากระบบ from Home → confirm redirect to login

## Known Limitations

1. **Leave balance check is at approval, not submission**: The backend validates remaining balance only when HR/Admin approves a request. The mobile form does not block submission for insufficient balance (this is by design — balance enforcement is admin-side). The leave balance section is informational.

2. **Date picker**: Date fields use plain text input (`YYYY-MM-DD` format). A native date picker would improve UX but was deferred to avoid adding a library dependency in T-048.

3. **No file attachments**: Medical certificates and supporting documents are out of scope for this task.

4. **No manager approval on mobile**: The approve/reject flow is web/admin only.

5. **Employee record required**: The account must have a linked employee record. The `admin@hr.local` account may not have one; in that case, `/leave/me` and `/leave-balances/my` return `400 "No employee profile linked to this account"` which appears as an error state in the UI.

## Future Improvements

- Native date picker (e.g., `@react-native-community/datetimepicker`)
- File attachment for medical certificates
- Mobile approval workflow for managers
- Push notification when a request is approved or rejected
- Leave calendar view showing approved leave days
- Pagination for long leave request history
- Filter by status or leave type
