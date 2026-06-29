# REQ-002F — Mixed Attendance Flow: On-site Check-in to Off-site Check-out
## Specification Document

**Status:** SPEC ONLY — no implementation yet
**Depends on:** REQ-002C (backend foundation), REQ-002D (review API), REQ-002E (mobile UI)
**Date:** 2026-06-29

---

## 1. Problem Statement

The system supports two attendance patterns:

| Pattern | Check-in source | Check-out validation |
|---|---|---|
| Full on-site | COMPANY_GEOFENCE | Geofence enforced at checkout |
| Full off-site | OFFSITE_PLANNED or OFFSITE_UNPLANNED | No geofence at checkout |

A real-world scenario that is currently unsupported:

> An employee arrives at the office in the morning (on-site check-in, geofence satisfied),
> then leaves the office during the day for an external meeting or work assignment. At the end
> of work, the employee is outside the company geofence and cannot check out. The system
> currently blocks checkout with HTTP 422 "You are outside the allowed company area." and
> offers no alternative path.

This forces the employee to physically return to the office just to check out, or to leave the
day with a MISSING_CHECKOUT status. Neither outcome is acceptable.

---

## 2. Current Behavior (code references)

### Backend

- `attendance.service.ts:188` — `clockOut()` checks `attendanceSource`. If value is
  `COMPANY_GEOFENCE`, `validateGeofence()` is called unconditionally.
- `attendance.service.ts:799` — When outside radius, throws `UnprocessableEntityException`
  with plain message `"You are outside the allowed company area."` (no structured error code).
- `attendance.service.ts:336` — `clockOutOffsite()` explicitly rejects records where
  `attendanceSource === COMPANY_GEOFENCE` — so this endpoint is not usable as a workaround.
- `attendance.service.ts:592` — `approveOffsiteAttendance()` rejects records where
  `attendanceSource === COMPANY_GEOFENCE` — review endpoints are also blocked for these records.

### Mobile (`apps/mobile/app/home.tsx`)

- Line 308: `hasActiveOffsiteCheckIn = today?.workMode === 'OFFSITE' && Boolean(today?.checkIn) && !today?.checkOut`
- The off-site checkout card is only rendered when `workMode === 'OFFSITE'`. An ONSITE check-in
  (workMode=ONSITE) never shows this card, so there is no visible path to an off-site checkout.

---

## 3. Proposed Behavior

When an employee has an active ONSITE check-in (`attendanceSource=COMPANY_GEOFENCE`, `checkIn`
exists, `checkOut` null) and attempts to check out outside the company geofence:

1. Normal clock-out is rejected (geofence enforcement unchanged).
2. Backend returns a structured error code so the mobile can detect the specific case.
3. Mobile offers an explicit "เช็คเอาท์นอกสถานที่" / mixed checkout exception flow.
4. Employee provides reason, work location name, and a note (optional).
5. GPS coordinates at checkout time are captured and stored.
6. The backend records checkout time and sets `reviewStatus=PENDING_REVIEW`.
7. The original `attendanceSource=COMPANY_GEOFENCE` is preserved (check-in truth is not lost).
8. `workMode` remains `ONSITE` (payroll must not be affected).
9. The record appears in the HR/Admin off-site review queue.
10. A privacy-safe audit event is written.
11. Mobile shows a "submitted, pending HR review" state card.
12. Normal ONSITE checkout from inside the geofence continues to work unchanged.

---

## 4. Data Model

### Recommendation: No Schema Migration Required for MVP

All required database columns already exist on the `Attendance` model:

| Column | Used for | Notes |
|---|---|---|
| `checkOut` | Checkout timestamp | Set at submission time |
| `checkOutLatitude` | GPS at checkout | Already nullable Float |
| `checkOutLongitude` | GPS at checkout | Already nullable Float |
| `checkOutAccuracyMeters` | GPS accuracy | Already nullable Float |
| `checkOutDistanceFromCompanyMeters` | Distance from HQ | Computed by backend |
| `workLocationName` | Off-site destination label | Max 200 chars, currently null for ONSITE records |
| `offsiteReason` | Employee's reason text | Max 500 chars, currently null for ONSITE records |
| `reviewStatus` | PENDING_REVIEW | Already exists with full lifecycle enum |
| `reviewedById` | HR reviewer identity | Already exists |
| `reviewedAt` | Review timestamp | Already exists |
| `reviewNote` | Reviewer comment | Already exists |

### Unique Identifier — No New Enum Value Needed

The combination `attendanceSource=COMPANY_GEOFENCE` AND `reviewStatus=PENDING_REVIEW` is
currently **impossible** in normal flows. This combination uniquely and unambiguously identifies
a mixed checkout exception record. No new enum value or boolean flag is required.

Querying mixed checkout records:
```sql
WHERE "attendanceSource" = 'COMPANY_GEOFENCE'
  AND "reviewStatus" = 'PENDING_REVIEW'
```

### Future Option (Deferred)

An explicit `checkoutExceptionType VARCHAR(50)` column could be added in a future migration
(e.g., value `'MIXED_ONSITE_OFFSITE'`) to make queries more self-documenting. Deferred until
a second exception type actually exists.

---

## 5. API Design

### 5.1 New Endpoint — Submit Mixed Checkout Exception

```
POST /attendance/offsite/mixed-checkout-exception
Authorization: Bearer <token>   (JWT, any authenticated employee)
```

**Request body (`MixedCheckoutExceptionDto`):**

| Field | Type | Validation | Notes |
|---|---|---|---|
| `latitude` | `number` | Required, -90 to 90 | Current GPS at checkout |
| `longitude` | `number` | Required, -180 to 180 | Current GPS at checkout |
| `accuracy` | `number` | Required, > 0 | In meters |
| `workLocationName` | `string` | Required, 1–200 chars | Human-readable destination |
| `reason` | `string` | Required, 3–500 chars | Why they are off-site |
| `note` | `string` | Optional, max 500 chars | Additional context |

**Validation rules (backend):**
1. Employee must have a check-in record for today.
2. Record `attendanceSource` must be `COMPANY_GEOFENCE` (not an off-site record).
3. `checkIn` must not be null.
4. `checkOut` must be null (no double checkout).
5. `reviewStatus` must be null (not already submitted).
6. All three GPS fields are required (no null GPS allowed).
7. If geofence is configured: employee must be OUTSIDE the company radius (prevent abuse of
   exception flow when the employee is actually inside and could use normal checkout).

**Updates on success:**

```typescript
{
  checkOut: new Date(),
  checkOutLatitude: dto.latitude,
  checkOutLongitude: dto.longitude,
  checkOutAccuracyMeters: dto.accuracy,
  checkOutDistanceFromCompanyMeters: computed,   // best-effort, null if unconfigured
  workLocationName: dto.workLocationName,
  offsiteReason: dto.reason,
  note: dto.note ?? existing,                    // optional, does not clear existing note
  reviewStatus: AttendanceReviewStatus.PENDING_REVIEW,
  // workMode stays ONSITE — payroll unchanged
  // attendanceSource stays COMPANY_GEOFENCE — check-in truth preserved
}
```

**Response:** `200 OK` — updated attendance record (standard `ATTENDANCE_SELECT` shape).

**Error responses:**

| HTTP | Condition |
|---|---|
| 404 | No clock-in record for today |
| 409 | Already checked out (`checkOut` not null) |
| 409 | Mixed checkout already submitted (`reviewStatus` not null) |
| 422 | Record is not a COMPANY_GEOFENCE check-in |
| 422 | GPS not provided or invalid |
| 422 | Employee is inside company geofence (normal checkout should be used) |

**Audit event:** `ATTENDANCE_MIXED_CHECKOUT_SUBMITTED`

```typescript
metadata: {
  attendanceId: id,
  employeeId: id,
  date: date,
  attendanceSource: 'COMPANY_GEOFENCE',
  newReviewStatus: 'PENDING_REVIEW',
  workLocationName: dto.workLocationName,    // safe — not GPS
  hasCoordinates: true,
  accuracyBucket: 'ACCEPTABLE' | 'POOR',    // never raw accuracy value
  hasNote: boolean,
  checkoutAt: timestamp,
}
```

---

### 5.2 Modified Endpoint — Structured Geofence Error Code

**Current behaviour (`clockOut` / `validateGeofence`):**
```
HTTP 422  { message: "You are outside the allowed company area." }
```

**Required change (minimal, non-breaking):**
```
HTTP 422  { message: "You are outside the allowed company area.", code: "OUTSIDE_GEOFENCE" }
```

The mobile uses `code === "OUTSIDE_GEOFENCE"` to decide whether to offer the mixed checkout
card. Without this code field the mobile would have to pattern-match on the English message
string, which is fragile.

**File to modify:** `apps/api/src/attendance/attendance.service.ts` — `validateGeofence()` method,
line ~799. Swap `UnprocessableEntityException(string)` for
`UnprocessableEntityException({ message, code: 'OUTSIDE_GEOFENCE' })`.

---

### 5.3 Extended Endpoint — Off-site Review Queue

**Current:** `GET /attendance/offsite-review` filters:
```typescript
attendanceSource: { in: [OFFSITE_UNPLANNED, OFFSITE_PLANNED] }
```

**Required change:** Also include mixed checkout exceptions:
```typescript
OR: {
  attendanceSource: AttendanceSource.COMPANY_GEOFENCE,
  reviewStatus: AttendanceReviewStatus.PENDING_REVIEW,
}
```

Effective Prisma query:
```typescript
where: {
  OR: [
    { attendanceSource: { in: [OFFSITE_UNPLANNED, OFFSITE_PLANNED] }, ...reviewStatusFilter },
    { attendanceSource: COMPANY_GEOFENCE, reviewStatus: PENDING_REVIEW },
  ]
}
```

Optional: add `type` query param (`'offsite' | 'mixed' | 'all'`, default `'all'`) so HR can
filter the queue. Not required for MVP.

---

### 5.4 Existing Endpoints — No Change Required

| Endpoint | Why no change needed |
|---|---|
| `PATCH /attendance/offsite-review/:id/approve` | Already updates any Attendance by ID; only requires `reviewStatus=PENDING_REVIEW`. Works for mixed checkout records. |
| `PATCH /attendance/offsite-review/:id/reject` | Same — no source restriction on the review action itself. |

The two guard checks at lines 592 and 660 only check `attendanceSource` for the off-site
clock-in/clock-out routes — the review PATCH routes do not have this restriction.

---

## 6. Mobile UX Flow

### 6.1 Home Screen States

**State A — Active ONSITE, not yet checked out (inside geofence)**
- Condition: `attendanceSource='COMPANY_GEOFENCE'`, `checkIn` set, `checkOut` null, `reviewStatus` null
- UI: Normal "ลงเวลาออก" button only. No change from today.

**State B — Active ONSITE, clock-out failed because outside geofence**
- Trigger: Normal clock-out returned `{ code: "OUTSIDE_GEOFENCE" }` (HTTP 422)
- UI: Show exception offer card below the normal checkout button:
  - Amber card with lock icon
  - Text: "คุณอยู่นอกพื้นที่บริษัท — ต้องการเช็คเอาท์นอกสถานที่หรือไม่?"
  - Button: "เช็คเอาท์นอกสถานที่" → navigates to `/mixed-checkout` screen
  - Normal checkout button remains visible (employee may move back inside)
- Implementation: Store `hasGeofenceError: boolean` in hook state; set true when OUTSIDE_GEOFENCE
  received; clear when attendance refreshes.

**State C — Mixed checkout submitted, pending HR review**
- Condition: `attendanceSource='COMPANY_GEOFENCE'`, `checkIn` set, `checkOut` set,
  `reviewStatus='PENDING_REVIEW'`
- UI: Amber review-pending card:
  - Badge: "รอตรวจสอบ" (amber)
  - Text: "การเช็คเอาท์นอกสถานที่ถูกส่งแล้ว — รอ HR ตรวจสอบ"
  - Work location name displayed (if set)
  - No further action button (submitted state)

**State D — Mixed checkout approved**
- Condition: `attendanceSource='COMPANY_GEOFENCE'`, `checkOut` set, `reviewStatus='APPROVED'`
- UI: Green completion card (same as normal completed checkout):
  - Show check-in and check-out times
  - Small "ตรวจสอบแล้ว" badge in green

**State E — Mixed checkout rejected**
- Condition: `attendanceSource='COMPANY_GEOFENCE'`, `checkIn` set, `checkOut` set,
  `reviewStatus='REJECTED'`
- UI: Red/amber card:
  - Badge: "ถูกปฏิเสธ" (red)
  - Text: "HR ปฏิเสธการเช็คเอาท์นอกสถานที่ กรุณาติดต่อ HR"
  - Show reviewer note if present
  - No resubmission button (contact HR for manual resolution)

---

### 6.2 Mixed Checkout Screen (`/mixed-checkout`)

New screen, similar structure to existing `offsite-checkout.tsx`:

1. **GPS status pill** (top of screen) — same pattern as offsite-checkout.tsx:
   - loading / ready (green) / low_accuracy (amber) / denied / error
   - Require accuracy ≤ 100 m or allow low_accuracy with warning (matches existing pattern)

2. **Work location field** (required):
   - `TextInput` — "ชื่อสถานที่ / ปลายทาง" (max 200 chars)
   - Required — submit disabled until filled

3. **Reason field** (required):
   - `TextInput` multiline — "เหตุผลที่ออกนอกสถานที่" (max 500 chars, min 3)
   - Required — submit disabled until filled

4. **Note field** (optional):
   - Same as existing offsite-checkout.tsx note field (max 500)

5. **Submit button** — "ส่งคำขอเช็คเอาท์"
   - Disabled until GPS ready (or low_accuracy accepted), workLocationName filled, reason filled
   - On tap: calls `POST /attendance/offsite/mixed-checkout-exception`
   - On success: `refreshAttendance()` → navigate back to home
   - On error: show error message inline

**Data sent:**
```typescript
{
  latitude: number,
  longitude: number,
  accuracy: number,
  workLocationName: string,
  reason: string,
  note?: string,
}
```

---

### 6.3 Privacy Constraints in Mobile

- Raw GPS coordinates are NOT displayed anywhere in the UI.
- Work location name (human-readable string) is displayed — not coordinates.
- No background location tracking is initiated.
- GPS is captured once at submission time only.

---

## 7. Admin/HR Review Impact

### Review Queue Extension

`GET /attendance/offsite-review` will return mixed checkout records alongside existing
OFFSITE_UNPLANNED/OFFSITE_PLANNED records. HR sees them in the same queue.

To help HR distinguish record types, the response should include:
- `attendanceSource` (already in `ATTENDANCE_SELECT`)
- `workLocationName` (already in `ATTENDANCE_SELECT`)
- `offsiteReason` (already in `ATTENDANCE_SELECT`)

Mixed checkout records are visually distinguishable: `attendanceSource=COMPANY_GEOFENCE` + note
that check-in was on-site.

### Review Actions

Existing `PATCH /attendance/offsite-review/:id/approve` and `reject` work without modification.
They operate on any Attendance UUID with `reviewStatus=PENDING_REVIEW`.

### Rejected Mixed Checkout

When HR rejects a mixed checkout, the record retains `checkOut` timestamp but has
`reviewStatus=REJECTED`. The employee's checkout time is recorded; rejection means HR questions
the legitimacy of the off-site location, not the time itself. Manual HR resolution required for
payroll adjustments. This is consistent with existing OFFSITE_UNPLANNED rejection behavior.

### Admin Web Review UI

No changes to the Admin Web (`apps/web`) are required at this stage. The existing table at
`GET /attendance/offsite-review` will surface mixed checkout records once the query is extended.
A dedicated "Mixed Checkout" column/badge on the Admin Web table is a UX improvement deferred
to a follow-up task.

---

## 8. Audit & Privacy Design

### New Audit Events

| Event | Trigger | Actor | Result |
|---|---|---|---|
| `ATTENDANCE_MIXED_CHECKOUT_SUBMITTED` | Successful mixed checkout submission | Employee | SUCCESS |
| `ATTENDANCE_OFFSITE_APPROVED` | HR approves (existing event, reused) | HR_ADMIN / SUPER_ADMIN | SUCCESS |
| `ATTENDANCE_OFFSITE_REJECTED` | HR rejects (existing event, reused) | HR_ADMIN / SUPER_ADMIN | SUCCESS |

### Privacy-Safe Metadata Pattern

Follows the same pattern established in REQ-002C/REQ-002D:
- Raw `latitude`, `longitude`, `accuracy` are **never** written to `AuditLog.metadata`
  (they are in `AUDIT_SENSITIVE_KEYS` and are stripped automatically by `audit-log.sanitizer.ts`)
- `hasCoordinates: boolean` — confirms GPS was present
- `accuracyBucket: 'ACCEPTABLE' | 'POOR' | 'UNKNOWN'` — `ACCEPTABLE` if accuracy ≤ 100 m
- `workLocationName` — safe; employee-provided text, not GPS
- Raw GPS is stored only in `Attendance.checkOutLatitude / checkOutLongitude` (operational
  dispute resolution, consistent with existing off-site checkout behaviour)

---

## 9. Security Review

| Area | Assessment |
|---|---|
| Auth impact | New endpoint `POST /attendance/offsite/mixed-checkout-exception` requires JWT. No unauthenticated access. |
| RBAC impact | Employee submits their own record only (userId from JWT). No role check beyond JWT required — consistent with existing clock-out endpoints. HR review uses existing SUPER_ADMIN / HR_ADMIN guards (no change). |
| Data privacy impact | Checkout GPS stored in Attendance table (existing pattern). Never exposed in audit log. workLocationName is employee-supplied text — no auto-address lookup. |
| Password/token/hash impact | None. |
| Mobile security impact | No new token storage. GPS captured once on submission, not persisted in mobile storage. |
| Dependency/advisory impact | No new packages required for the spec. Implementation will reuse existing GPS, DTO validation, and audit patterns. |
| Secrets/logging check | `workLocationName` and `offsiteReason` are employee-provided text — confirm they are not logged at INFO level in NestJS interceptors. |
| New endpoints protected | `POST /attendance/offsite/mixed-checkout-exception` — protected by JwtAuthGuard (same as all /attendance routes). |
| Geofence bypass risk | Spec explicitly prevents misuse: backend must validate employee is OUTSIDE the geofence before accepting the exception. If employee is inside, normal checkout must be used. |
| Risk level | LOW |
| Security decision | PASS (spec only; re-assess at implementation) |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Employee abuses exception flow while actually inside geofence | Medium | Backend validates employee is outside geofence before accepting exception. Return 422 if inside. |
| Duplicate exception submissions | Low | Backend checks `reviewStatus=null` before accepting. Returns 409 if already submitted. |
| HR review queue becomes large with mixed-type records | Low | Optional `type` filter param in query; Admin Web badge to distinguish types. |
| `workMode` stays ONSITE — payroll system sees it as ONSITE day | Intended | Mixed checkout = ONSITE shift with off-site departure. `reviewStatus=APPROVED` is the payroll signal. Document this in HR policy. |
| Rejected mixed checkout leaves employee with no resolution path | Medium | Spec documents that HR manual resolution is required. Employee UI shows "contact HR" message. Resubmission logic deferred. |
| Mobile shows exception card when employee is inside but GPS is inaccurate | Low | Exception card triggers from `code: "OUTSIDE_GEOFENCE"` — the backend's geofence calculation is authoritative. Mobile GPS only used at mixed checkout submission. |

---

## 11. Acceptance Criteria

1. `POST /attendance/clock-out` outside geofence returns HTTP 422 with
   `{ message: "You are outside the allowed company area.", code: "OUTSIDE_GEOFENCE" }`.
2. `POST /attendance/clock-out` inside geofence returns HTTP 200 (unchanged behavior).
3. `POST /attendance/offsite/mixed-checkout-exception` succeeds for COMPANY_GEOFENCE records
   outside geofence; sets checkOut, checkout GPS fields, workLocationName, offsiteReason,
   reviewStatus=PENDING_REVIEW; does not change attendanceSource or workMode.
4. `POST /attendance/offsite/mixed-checkout-exception` returns 409 if checkOut already set.
5. `POST /attendance/offsite/mixed-checkout-exception` returns 422 if employee is inside the
   geofence.
6. `POST /attendance/offsite/mixed-checkout-exception` returns 422 if GPS fields are missing.
7. `GET /attendance/offsite-review` (HR role) returns mixed checkout records.
8. `PATCH /attendance/offsite-review/:id/approve` and `reject` work for mixed checkout records.
9. Audit event `ATTENDANCE_MIXED_CHECKOUT_SUBMITTED` is written on successful submission; no
   raw GPS in audit metadata.
10. Mobile home screen shows exception offer card after OUTSIDE_GEOFENCE error.
11. Mobile home screen shows pending-review card when
    `attendanceSource='COMPANY_GEOFENCE'` + `reviewStatus='PENDING_REVIEW'` + checkOut set.
12. `/mixed-checkout` screen requires GPS, workLocationName, and reason before enabling submit.
13. Normal on-site full-day attendance flow (check-in and check-out inside geofence) is
    unchanged and all existing tests still pass.

---

## 12. Test Plan

### Unit Tests (backend)

| Test | File |
|---|---|
| `mixedCheckoutException()` — success path | `attendance.service.spec.ts` |
| Rejects if attendanceSource ≠ COMPANY_GEOFENCE | same |
| Rejects if checkOut already set | same |
| Rejects if reviewStatus ≠ null | same |
| Rejects if employee inside geofence | same |
| Rejects if GPS missing | same |
| Verifies attendanceSource and workMode unchanged after update | same |
| `clockOut()` outside geofence includes `code: "OUTSIDE_GEOFENCE"` in error | same |
| `findOffsiteReview()` includes mixed checkout records | same |

### Integration / E2E Tests

| Test | Scope |
|---|---|
| POST /attendance/offsite/mixed-checkout-exception — 200 happy path | API |
| POST /attendance/offsite/mixed-checkout-exception — 409 duplicate | API |
| GET /attendance/offsite-review — mixed checkout in results | API |
| PATCH approve/reject — works on mixed checkout record | API |
| Audit event written and GPS stripped | API |

### Mobile

| Test | Type |
|---|---|
| Home screen shows exception card after OUTSIDE_GEOFENCE error | Manual / unit |
| Home screen shows pending card for COMPANY_GEOFENCE + PENDING_REVIEW | Unit |
| `/mixed-checkout` submit disabled until GPS + workLocationName + reason all present | Manual |
| Successful submission navigates back and shows pending card | Manual |

---

## 13. Implementation Breakdown (Safe Subtasks)

| Subtask | Scope | Risk | Files |
|---|---|---|---|
| **T-001: Structured geofence error** | Add `code: "OUTSIDE_GEOFENCE"` to UnprocessableEntityException in `validateGeofence()` | LOW | `attendance.service.ts` |
| **T-002: MixedCheckoutExceptionDto** | New DTO with validation | LOW | `attendance/dto/mixed-checkout-exception.dto.ts` |
| **T-003: Backend service method** | `mixedCheckoutException()` in AttendanceService | MEDIUM | `attendance.service.ts` |
| **T-004: Controller endpoint** | `POST /attendance/offsite/mixed-checkout-exception` | LOW | `attendance.controller.ts` |
| **T-005: Review query extension** | Extend `findOffsiteReview()` to include mixed checkout records | LOW | `attendance.service.ts` |
| **T-006: Mobile — home screen states** | Add State B, C, D, E logic to `home.tsx` | MEDIUM | `apps/mobile/app/home.tsx` |
| **T-007: Mobile — mixed checkout screen** | New `apps/mobile/app/mixed-checkout.tsx` screen | MEDIUM | New file |
| **T-008: Mobile — hook** | `useMixedCheckoutAttendance.ts` hook (or extend `useAttendance.ts`) | LOW | `apps/mobile/src/hooks/` |
| **T-009: Tests** | Unit + integration tests for backend | MEDIUM | `attendance.service.spec.ts` |

**Safe order:** T-001 → T-002 → T-003 → T-004 → T-005 (all backend) → T-006 → T-007 → T-008 (all mobile) → T-009

---

## Open Decisions (for product / user approval before implementation)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| OD-1 | Rejected mixed checkout: can employee resubmit? | (a) Yes, clear reviewStatus to null and allow resubmit; (b) No, manual HR resolution only | (b) for safety — prevents gaming the review |
| OD-2 | Admin Web badge for mixed vs pure offsite records | (a) Defer; (b) Add in this task | (a) Defer — Admin Web is out of scope per task brief |
| OD-3 | `type` filter in `/offsite-review` query | (a) Include now; (b) Defer | (b) Defer — MVP is functional without it |
| OD-4 | Show exception offer card proactively (before clock-out attempt) | (a) React to error only (recommended); (b) Proactive geofence check on home load | (a) Simpler, avoids background polling |
