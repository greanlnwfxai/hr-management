# REQ-002E — STEP Connect Off-site Attendance UI Specification

**Type:** Mobile/PWA UI Implementation Specification
**Status:** Ready for implementation
**Date:** 2026-06-28
**Author:** Claude Code (AI assistant)
**Task:** REQ-002E-SPEC
**Depends on:** REQ-002C (backend foundation), REQ-002D (review API)
**Implements:** REQ-002A (product design), REQ-002B (implementation spec)

---

## 1. Purpose

This document specifies the STEP Connect mobile/PWA user experience for off-site attendance — allowing employees to clock in and out from locations outside the company geofence. It is the UI counterpart to the already-deployed backend (REQ-002C, REQ-002D).

**Scope:** STEP Connect mobile app only (`apps/mobile/`). No Admin Web changes, no backend changes, no schema changes.

**Not in scope:** Admin Web off-site review UI (REQ-002F).

---

## 2. Current Backend Assumptions

The following backend is already deployed and confirmed working:

### 2.1 Deployed Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/attendance/offsite/clock-in` | JWT (all roles) | Off-site clock-in — GPS + workLocationName + reason required |
| `POST` | `/attendance/offsite/clock-out` | JWT (all roles) | Off-site clock-out — GPS required, note optional |
| `GET` | `/attendance/me` | JWT (all roles) | Own attendance history — now includes `attendanceSource`, `reviewStatus`, `workLocationName` |
| `GET` | `/attendance/geofence-location` | JWT (all roles) | Company geofence config for map/distance check |

### 2.2 DTO Contracts (as built)

**`POST /attendance/offsite/clock-in`** body:

```json
{
  "latitude":        number,           // required, -90 to 90
  "longitude":       number,           // required, -180 to 180
  "accuracy":        number,           // required, positive, max 100 (metres)
  "workLocationName": string,          // required, 1–200 chars
  "reason":          string,           // required, 3–500 chars
  "note":            string | null     // optional, max 500 chars
}
```

**`POST /attendance/offsite/clock-out`** body:

```json
{
  "latitude":  number,           // required
  "longitude": number,           // required
  "accuracy":  number,           // required, max 100
  "note":      string | null     // optional, max 500 chars
}
```

### 2.3 Backend Business Rules (relevant to mobile UX)

| Rule | Mobile implication |
|---|---|
| `accuracy` field max 100m | If device GPS accuracy > 100m the API returns 422. Show a "GPS accuracy too low" error. |
| `workLocationName` min 1 char, max 200 | Required field; enforce client-side before submit |
| `reason` min 3 chars, max 500 | Required field; enforce client-side before submit |
| 409 if already clocked in today | Show "Already checked in" message; refresh attendance state |
| Planned path: backend auto-detects approved `OffSiteRequest` | Mobile does NOT pass a flag — backend decides `OFFSITE_PLANNED` vs `OFFSITE_UNPLANNED` |
| `reviewStatus` returned in attendance response | Mobile renders appropriate status badge |

### 2.4 New Attendance Record Fields (must add to mobile types)

The backend now returns these fields on `AttendanceRecord`:

| Field | Type | Notes |
|---|---|---|
| `attendanceSource` | `'COMPANY_GEOFENCE' \| 'OFFSITE_PLANNED' \| 'OFFSITE_UNPLANNED'` | May be absent on older records |
| `reviewStatus` | `'AUTO_ACCEPTED' \| 'PENDING_REVIEW' \| 'APPROVED' \| 'REJECTED' \| 'MISSING_CHECKOUT'` | Nullable |
| `workLocationName` | `string \| null` | Present when off-site |

### 2.5 Migration: Old Off-site Path Must Be Removed

`apps/mobile/src/hooks/useAttendance.ts` line 106 currently injects `workMode: 'OFFSITE'` into the regular `POST /attendance/clock-in` call when an approved off-site request exists:

```typescript
// CURRENT — MUST BE REMOVED in REQ-002E:
const isOffSiteApproved = todayOffSite?.status === 'APPROVED';
...(isOffSiteApproved && { workMode: 'OFFSITE' }),
```

After REQ-002E, this injection must be deleted. Off-site clock-in uses the dedicated `POST /attendance/offsite/clock-in` endpoint. The regular clock-in stays ONSITE-only.

---

## 3. User Journeys

### Journey 1: Planned Off-site Clock-in (AUTO_ACCEPTED)

**Precondition:** Employee has an approved `OffSiteRequest` for today.

```
1. Employee opens STEP Connect
2. App silently fetches geofence config (GET /attendance/geofence-location)
   and current GPS via useDeviceLocation.getLocation()
3. haversineMeters(company, device) > radiusMeters → app is outside geofence
4. Home screen: normal "ลงเวลาเข้า" button replaced by "ลงเวลาเข้า (นอกสถานที่)" button
   and "มีคำขออนุมัติสำหรับวันนี้ ✓" info banner shown
5. Employee taps "ลงเวลาเข้า (นอกสถานที่)"
6. App navigates to offsite-checkin screen
7. Screen shows:
   - GPS status: "📍 พร้อมใช้งาน" (ready) if already obtained
   - Info banner: "มีคำขออนุมัติสำหรับวันนี้ ✓" (green)
   - workLocationName field (required)
   - reason field (required, pre-filled suggestion optional)
   - Confirm button
8. Employee fills in workLocationName (e.g. "ลูกค้า ABC สาทร") and reason
9. Employee taps Confirm
10. App sends POST /attendance/offsite/clock-in with GPS + workLocationName + reason
11. Backend detects approved OffSiteRequest → sets reviewStatus = AUTO_ACCEPTED
12. App receives 201 response; attendanceSource = OFFSITE_PLANNED
13. App navigates back / home
14. Attendance card shows:
    - Badge "นอกสถานที่" (teal)
    - Badge "อนุมัติแล้ว (ตามคำขอ)" (green)
    - workLocationName text
    - checkIn time
```

### Journey 2: Unplanned Off-site Clock-in (PENDING_REVIEW)

**Precondition:** Employee has NO approved `OffSiteRequest` for today.

```
1–3. Same as Journey 1 (geofence check)
4. Home screen: "ลงเวลาเข้า (นอกสถานที่)" button shown
   Info banner: "บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ" (amber)
5. Employee taps "ลงเวลาเข้า (นอกสถานที่)"
6. App navigates to offsite-checkin screen
7. Screen shows:
   - GPS status: "📍 พร้อมใช้งาน"
   - Info banner (amber): "บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ"
   - workLocationName field (required)
   - reason field (required — explain why working off-site today)
   - Confirm button
8. Employee fills both fields
9. Employee taps Confirm
10. App sends POST /attendance/offsite/clock-in
11. Backend: no approved request found → reviewStatus = PENDING_REVIEW
12. App receives 201; attendanceSource = OFFSITE_UNPLANNED
13. Attendance card shows:
    - Badge "นอกสถานที่" (teal)
    - Badge "รอ HR ตรวจสอบ" (amber)
    - workLocationName text
```

### Journey 3: Off-site Clock-out

**Precondition:** Employee has an active off-site clock-in (no clock-out yet).

```
1. Employee opens STEP Connect
2. App detects today.workMode === 'OFFSITE' and today.checkOut === null
3. Home and/or attendance screen show active off-site card:
   - workLocationName
   - checkIn time
   - reviewStatus badge
   - "ลงเวลาออก (นอกสถานที่)" button
4. Employee taps "ลงเวลาออก (นอกสถานที่)"
5. App navigates to offsite-checkout screen
6. Screen captures fresh GPS via getLocation()
7. Screen shows:
   - GPS status: "📍 กำลังอ่านตำแหน่ง..." → "📍 พร้อมใช้งาน"
   - note field (optional)
   - Confirm button (enabled only once GPS is obtained)
8. Employee taps Confirm
9. App sends POST /attendance/offsite/clock-out with GPS + optional note
10. Backend does NOT validate company geofence (by design — REQ-002C fix)
11. Response: updated record with checkOut time
12. Home card updates to show both checkIn + checkOut times
13. reviewStatus badge preserved as-is (unchanged by clock-out)
```

### Journey 4: Location Permission Denied

```
1. Employee taps "ลงเวลาเข้า (นอกสถานที่)" or "ลงเวลาออก (นอกสถานที่)"
2. App calls requestForegroundPermissionsAsync()
3. Employee denies location permission
4. useDeviceLocation.getLocation() throws with message:
   "กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อใช้การลงเวลาผ่านมือถือ"
5. Screen shows inline error banner (red):
   TH: "ต้องอนุญาตการเข้าถึงตำแหน่งสำหรับการลงเวลานอกสถานที่"
   EN: "Location access required for off-site attendance"
6. Confirm button remains disabled
7. Optionally: show "เปิดการตั้งค่า" (Open Settings) deep link to system location settings
```

### Journey 5: Poor GPS Accuracy (accuracy > 100m)

```
1. Employee taps Confirm on offsite-checkin or offsite-checkout screen
2. App has GPS with accuracy > 100m (e.g., 120m)
3. API returns 422 Unprocessable Entity with message about accuracy
4. Screen shows inline error banner (amber):
   TH: "ความแม่นยำ GPS ต่ำเกินไป กรุณาเดินออกนอกอาคารหรือลองใหม่"
   EN: "GPS accuracy too low. Please move outdoors and try again."
5. GPS indicator updates: "📍 ความแม่นยำต่ำ (120m)" in amber
6. Employee can retry — app re-fetches GPS on each Confirm tap
```

### Journey 6: Already Clocked In Today

```
1. Employee attempts clock-in (off-site or on-site)
2. API returns 409 Conflict
3. Screen shows inline error (amber):
   TH: "ลงเวลาเข้าไปแล้วสำหรับวันนี้"
   EN: "Already checked in for today."
4. App calls fetchData() to refresh today's state
5. Attendance card displays the existing clock-in record
```

### Journey 7: Already Clocked Out Today

```
1. Employee attempts clock-out
2. API returns 409 Conflict
3. Screen shows inline error:
   TH: "ลงเวลาออกไปแล้วสำหรับวันนี้"
   EN: "Already checked out for today."
4. App refreshes and shows the existing checkout time
```

---

## 4. UI Components Needed in STEP Connect

### 4.1 New Files to Create

| File | Purpose |
|---|---|
| `apps/mobile/app/offsite-checkin.tsx` | Off-site clock-in form screen |
| `apps/mobile/app/offsite-checkout.tsx` | Off-site clock-out form screen |
| `apps/mobile/src/hooks/useOffsiteAttendance.ts` | Hook for off-site clock-in/out flow, GPS state, form state |

### 4.2 Files to Modify

| File | Change |
|---|---|
| `apps/mobile/src/api/types.ts` | Add `AttendanceSource`, `AttendanceReviewStatus` types; extend `AttendanceRecord` |
| `apps/mobile/src/api/client.ts` | Add `clockInOffsite()`, `clockOutOffsite()` functions |
| `apps/mobile/src/hooks/useAttendance.ts` | Remove `workMode: 'OFFSITE'` injection; add geofence detection state |
| `apps/mobile/app/home.tsx` | Add outside-geofence state; add off-site clock-in/out trigger |
| `apps/mobile/app/attendance.tsx` | Add `reviewStatus` + `workLocationName` display in `HistoryTimeline` |

### 4.3 No New Dependencies Required

All required utilities already exist:
- `expo-location` → GPS (used in `useDeviceLocation`)
- `haversineMeters` → distance check (`apps/mobile/src/utils/haversine.ts`)
- `authPost` helper → API calls (`apps/mobile/src/api/client.ts`)
- `getGeofenceLocation` → geofence config (already in client.ts)
- `useDeviceLocation` → `getLocation()` (already in hooks)

---

## 5. Screen Placement

### 5.1 Home Screen (`app/home.tsx`)

**Current behavior:** Shows a `GeofenceMapModal`-backed clock-in/clock-out button in the hero header. The normal "ลงเวลาเข้า" button calls `performClockIn()` (which opens `GeofenceMapModal`).

**REQ-002E changes:**

1. On mount, fetch geofence config + current GPS
2. Compute `distanceFromCompany = haversineMeters(company.lat, company.lon, device.lat, device.lon)`
3. Display based on location state:

| State | Home screen shows |
|---|---|
| Inside geofence (`distance <= radiusMeters`) | Normal "ลงเวลาเข้า" / "ลงเวลาออก" buttons (unchanged) |
| Outside geofence (`distance > radiusMeters`) + no active clock-in | "ลงเวลาเข้า (นอกสถานที่)" button + location notice |
| Active off-site clock-in (`today.workMode === 'OFFSITE'`, no checkOut) | Active off-site card with "ลงเวลาออก (นอกสถานที่)" button |
| GPS unavailable | Both buttons disabled; "ไม่สามารถอ่านตำแหน่งได้" warning |
| Geofence not configured | Show normal buttons (fall back to backend validation) |

> **Important:** The geofence check on mobile is for UI pre-screening only. The backend is authoritative. Do not suppress the off-site UI if the user claims to be outside — always let the API reject invalid attempts.

### 5.2 Attendance Screen (`app/attendance.tsx`)

**Current behavior:** Shows `HistoryTimeline` with a basic "นอกสถานที่" badge when `rec.workMode === 'OFFSITE'`.

**REQ-002E changes:**

1. Extend `HistoryTimeline` to show `reviewStatus` badge alongside the workMode badge
2. Show `workLocationName` as a subtitle in each off-site timeline card
3. No new clock-in/clock-out buttons here — home screen handles the action triggers

> The attendance screen's "คำขอ" tab (off-site requests list) remains unchanged — it shows pre-approval requests, not the new review status.

### 5.3 Off-site Clock-in Screen (`app/offsite-checkin.tsx`)

Pushed as a new Expo Router screen. Navigation: `router.push('/offsite-checkin')`.

### 5.4 Off-site Clock-out Screen (`app/offsite-checkout.tsx`)

Pushed as a new Expo Router screen. Navigation: `router.push('/offsite-checkout')`.

---

## 6. Button and State Design

### 6.1 On-site Clock-in/Clock-out (Unchanged)

When inside geofence, the existing `GeofenceMapModal` flow is fully preserved. No changes to that interaction.

### 6.2 Off-site Clock-in Button

**Trigger location:** Home screen hero, replacing the normal "ลงเวลาเข้า" button when outside geofence.

```
Style: Primary action button, full-width
Background: #0d9488 (teal-600) — distinct from normal clock-in blue (#1a56db)
Icon: 📍 (or map-pin icon)
Text (TH): ลงเวลาเข้า (นอกสถานที่)
Text (EN): Off-site Clock-in
Disabled state: opacity 0.5, not pressable (during GPS loading or submitting)
```

### 6.3 Off-site Clock-out Button

**Trigger location:** Home screen / attendance card, when `today.workMode === 'OFFSITE'` and `today.checkOut === null`.

```
Style: Secondary action button, full-width
Background: #0d9488 (teal-600) with outline variant
Text (TH): ลงเวลาออก (นอกสถานที่)
Text (EN): Off-site Clock-out
```

### 6.4 Review Status Badges

Displayed in history timeline and on the active attendance card:

| reviewStatus | Badge text (TH) | Badge text (EN) | Color |
|---|---|---|---|
| `AUTO_ACCEPTED` | อนุมัติแล้ว (ตามคำขอ) | Auto-approved | `#16a34a` (green-600) |
| `PENDING_REVIEW` | รอ HR ตรวจสอบ | Pending HR Review | `#d97706` (amber-600) |
| `APPROVED` | อนุมัติแล้ว | Approved | `#16a34a` (green-600) |
| `REJECTED` | ไม่อนุมัติ | Rejected | `#dc2626` (red-600) |
| `MISSING_CHECKOUT` | ไม่ได้ลงเวลาออก | Missing checkout | `#ea580c` (orange-600) |

**Badge style:** Rounded pill, `backgroundColor: color + '20'` (10% opacity fill), `color: color` for text. Font size 11, fontWeight 600. Pattern matches existing `statusBadge` style in `attendance.tsx`.

### 6.5 Work Mode Badge

| workMode | Badge text (TH) | Color |
|---|---|---|
| `OFFSITE` | นอกสถานที่ | `#0d9488` (teal-600) |
| `ONSITE` | — (not shown) | — |

---

## 7. Form Fields

### 7.1 Off-site Clock-in Form (`offsite-checkin.tsx`)

| Field | Label (TH) | Label (EN) | Required | Validation | Max Length | Notes |
|---|---|---|---|---|---|---|
| `workLocationName` | สถานที่ทำงาน | Work Location | ✅ | min 1 char | 200 | Free text; examples: "ลูกค้า ABC", "ทำงานที่บ้าน", "สาขาลาดพร้าว" |
| `reason` | เหตุผล | Reason | ✅ | min 3 chars | 500 | Why working off-site today; multiline TextInput |
| `note` | หมายเหตุ (ไม่จำเป็น) | Note (optional) | ❌ | — | 500 | Additional context; show/hide toggle or always shown below reason |

GPS fields (`latitude`, `longitude`, `accuracy`) are captured silently by the app — NOT shown as form inputs.

### 7.2 Off-site Clock-out Form (`offsite-checkout.tsx`)

| Field | Label (TH) | Label (EN) | Required | Validation | Max Length |
|---|---|---|---|---|---|
| `note` | หมายเหตุ (ไม่จำเป็น) | Note (optional) | ❌ | — | 500 |

GPS fields captured silently. No other inputs required.

### 7.3 GPS Status Indicator

Show in both forms as a read-only status row:

| GPS state | Indicator (TH) | Indicator (EN) | Color |
|---|---|---|---|
| Loading | 📍 กำลังอ่านตำแหน่ง... | Acquiring location... | `#6b7280` (gray) |
| Ready (accuracy ≤ 100m) | 📍 พร้อมใช้งาน | Location ready | `#16a34a` (green) |
| Poor (accuracy > 100m) | 📍 ความแม่นยำต่ำ | Low accuracy | `#d97706` (amber) |
| Denied | 📍 ไม่ได้รับอนุญาต | Permission denied | `#dc2626` (red) |
| Error | 📍 ไม่สามารถอ่านตำแหน่ง | Location unavailable | `#dc2626` (red) |

> Raw GPS coordinates (latitude, longitude) must NOT be displayed to the user.
> Accuracy in metres SHOULD NOT be displayed (privacy; avoid exposing tracking precision).
> Show only the status bucket ("Ready" / "Low accuracy") — not the raw number.

---

## 8. Validation Rules

### 8.1 Client-side Validation (before API call)

| Field | Rule | Error message (TH) |
|---|---|---|
| GPS | Must be obtained before submit | ต้องระบุตำแหน่งสำหรับการลงเวลานอกสถานที่ |
| GPS accuracy | > 100m shows warning; API will reject | ความแม่นยำ GPS ต่ำเกินไป กรุณาลองใหม่ |
| `workLocationName` | Not empty, ≤ 200 chars | กรุณาระบุสถานที่ทำงาน |
| `reason` | ≥ 3 chars, ≤ 500 chars | กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร) |
| `note` (optional) | ≤ 500 chars | หมายเหตุยาวเกินไป (สูงสุด 500 ตัวอักษร) |

**Confirm button enabling rule:** Button is enabled only when GPS is obtained AND required fields are non-empty.

### 8.2 Server-side Error Handling

| HTTP status | Scenario | Mobile action |
|---|---|---|
| 201 | Clock-in success | Navigate back; refresh attendance; show success toast |
| 200 | Clock-out success | Navigate back; refresh attendance; show success toast |
| 409 | Already clocked in/out | Show inline error; refresh attendance state |
| 422 | GPS accuracy too low or missing fields | Show inline error matching field; do NOT clear form |
| 401 | Token expired | Redirect to login (existing `SessionExpiredError` pattern) |
| 403 | Employee has no profile | Show inline error: "ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้" |
| 500 | Server error | Show generic retry error |

---

## 9. API Calls Required

### 9.1 New API Client Functions (add to `apps/mobile/src/api/client.ts`)

```typescript
export interface OffsiteClockInPayload {
  latitude: number;
  longitude: number;
  accuracy: number;
  workLocationName: string;
  reason: string;
  note?: string;
}

export interface OffsiteClockOutPayload {
  latitude: number;
  longitude: number;
  accuracy: number;
  note?: string;
}

export async function clockInOffsite(
  token: string,
  payload: OffsiteClockInPayload,
): Promise<AttendanceRecord> {
  return authPost<AttendanceRecord>('/attendance/offsite/clock-in', token, payload);
}

export async function clockOutOffsite(
  token: string,
  payload: OffsiteClockOutPayload,
): Promise<AttendanceRecord> {
  return authPost<AttendanceRecord>('/attendance/offsite/clock-out', token, payload);
}
```

### 9.2 New Type Additions (add to `apps/mobile/src/api/types.ts`)

```typescript
export type AttendanceSource =
  | 'COMPANY_GEOFENCE'
  | 'OFFSITE_PLANNED'
  | 'OFFSITE_UNPLANNED';

export type AttendanceReviewStatus =
  | 'AUTO_ACCEPTED'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'MISSING_CHECKOUT';

// Extend existing AttendanceRecord:
export interface AttendanceRecord {
  // ... existing fields unchanged ...
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  workMode: WorkMode;
  note: string | null;
  employee: AttendanceEmployee;
  createdAt: string;
  updatedAt: string;
  // New off-site fields (optional — may be absent on older ONSITE records):
  attendanceSource?: AttendanceSource;
  reviewStatus?: AttendanceReviewStatus | null;
  workLocationName?: string | null;
}
```

### 9.3 Existing API Calls (unchanged usage)

| Function | Called from | Purpose |
|---|---|---|
| `getTodayAttendance(token)` | `useAttendance` | Fetch today's record including new off-site fields |
| `getMyAttendance(token, ...)` | `useAttendance` | Attendance history |
| `getGeofenceLocation(token)` | `useOffsiteAttendance` or home | Geofence radius for distance check |
| `getTodayOffSiteStatus(token)` | `useAttendance` | Check for approved OffSiteRequest (determines info banner shown) |

### 9.4 Error Handling Pattern

Use the existing `normalizeApiMessage()` and `SessionExpiredError` patterns in `client.ts`. Translate API error messages to Thai using the `translateClockError()` pattern in `useAttendance.ts`. Add off-site-specific translations to that function.

---

## 10. UX Copy — Thai and English

### 10.1 Button Labels

| Key | Thai | English |
|---|---|---|
| `btn.offsite_clock_in` | ลงเวลาเข้า (นอกสถานที่) | Off-site Clock-in |
| `btn.offsite_clock_out` | ลงเวลาออก (นอกสถานที่) | Off-site Clock-out |
| `btn.confirm_offsite_clock_in` | ยืนยันลงเวลาเข้า (นอกสถานที่) | Confirm Off-site Clock-in |
| `btn.confirm_offsite_clock_out` | ยืนยันลงเวลาออก (นอกสถานที่) | Confirm Off-site Clock-out |
| `btn.retry` | ลองใหม่อีกครั้ง | Try Again |
| `btn.open_settings` | เปิดการตั้งค่า | Open Settings |

### 10.2 Info Banners

| Key | Thai | English |
|---|---|---|
| `banner.outside_area` | 📍 คุณอยู่นอกพื้นที่สำนักงาน | 📍 You are outside the office area |
| `banner.has_approval` | ✓ มีคำขออนุมัติสำหรับวันนี้ | ✓ Pre-approval found for today |
| `banner.pending_review` | บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ | This record will be submitted for HR review |

### 10.3 Form Labels

| Key | Thai | English |
|---|---|---|
| `form.work_location.label` | สถานที่ทำงาน | Work Location |
| `form.work_location.placeholder` | เช่น ลูกค้า ABC, ทำงานที่บ้าน | e.g. Customer site, Home office |
| `form.reason.label` | เหตุผล | Reason |
| `form.reason.placeholder` | อธิบายเหตุผลที่ทำงานนอกสถานที่วันนี้ | Explain why you are working off-site today |
| `form.note.label` | หมายเหตุ (ไม่จำเป็น) | Note (optional) |
| `form.note.placeholder` | เพิ่มเติม (ถ้ามี) | Additional details (if any) |

### 10.4 GPS Status

| Key | Thai | English |
|---|---|---|
| `gps.loading` | กำลังอ่านตำแหน่ง... | Acquiring location... |
| `gps.ready` | พร้อมใช้งาน | Location ready |
| `gps.low_accuracy` | ความแม่นยำต่ำ | Low accuracy |
| `gps.denied` | ไม่ได้รับอนุญาต | Permission denied |
| `gps.unavailable` | ไม่สามารถอ่านตำแหน่ง | Location unavailable |

### 10.5 Error Messages

| Key | Thai | English |
|---|---|---|
| `error.gps_required` | ต้องระบุตำแหน่งสำหรับการลงเวลานอกสถานที่ | Location required for off-site attendance |
| `error.gps_accuracy` | ความแม่นยำ GPS ต่ำเกินไป กรุณาเดินออกนอกอาคารหรือลองใหม่ | GPS accuracy too low. Please move outdoors or try again. |
| `error.location_denied` | ต้องอนุญาตการเข้าถึงตำแหน่งสำหรับการลงเวลานอกสถานที่ | Location access required for off-site attendance |
| `error.work_location_required` | กรุณาระบุสถานที่ทำงาน | Please enter your work location |
| `error.reason_required` | กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร) | Please enter a reason (at least 3 characters) |
| `error.already_clocked_in` | ลงเวลาเข้าไปแล้วสำหรับวันนี้ | Already checked in for today |
| `error.already_clocked_out` | ลงเวลาออกไปแล้วสำหรับวันนี้ | Already checked out for today |
| `error.no_checkin` | ยังไม่มีการลงเวลาเข้าสำหรับวันนี้ | No check-in found for today |
| `error.no_employee_profile` | ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้ | No employee profile linked to this account |
| `error.server` | ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง | Unable to complete action. Please try again. |

### 10.6 Review Status Badge Labels

| Status | Thai | English |
|---|---|---|
| `AUTO_ACCEPTED` | อนุมัติแล้ว (ตามคำขอ) | Auto-approved |
| `PENDING_REVIEW` | รอ HR ตรวจสอบ | Pending HR Review |
| `APPROVED` | อนุมัติแล้ว | Approved |
| `REJECTED` | ไม่อนุมัติ | Rejected |
| `MISSING_CHECKOUT` | ไม่ได้ลงเวลาออก | Missing checkout |

### 10.7 Success Messages

| Key | Thai | English |
|---|---|---|
| `success.offsite_clock_in` | ลงเวลาเข้า (นอกสถานที่) สำเร็จ | Off-site clock-in successful |
| `success.offsite_clock_out` | ลงเวลาออก (นอกสถานที่) สำเร็จ | Off-site clock-out successful |

---

## 11. Privacy and Security Notes

### 11.1 GPS Data Handling

| Principle | Implementation |
|---|---|
| No raw GPS in UI | Do not display `latitude`, `longitude`, or raw `accuracy` meters to users |
| No background tracking | GPS captured via `requestForegroundPermissionsAsync` only |
| No continuous tracking | Exactly one GPS snapshot per clock-in, one per clock-out |
| No GPS in audit metadata | Already enforced by backend `AUDIT_SENSITIVE_KEYS` |
| GPS stored in Attendance record | Operational evidence only; accessible to HR for dispute resolution |

### 11.2 User Consent UX

Before capturing GPS:
1. `requestForegroundPermissionsAsync` shows system permission dialog (OS-level)
2. If denied: show clear inline error; do not proceed
3. Do not request background location permission at any point

### 11.3 Accuracy Indicator

Show only bucketed quality (Ready / Low accuracy), not raw metre value. This avoids giving users a false sense that reporting a specific accuracy value improves their claim.

### 11.4 No Reverse-Geocoding

Do not look up or display the employee's actual street address from GPS coordinates. The employee enters `workLocationName` manually — this is a functional field, not a GPS reverse-geocode.

### 11.5 Token Handling

No changes to JWT or token storage. Existing `expo-secure-store` pattern continues. Off-site API calls use the same `authPost` helper as all other calls.

---

## 12. Edge Cases

| Edge case | Behavior |
|---|---|
| Employee inside geofence tries to navigate to `/offsite-checkin` directly | Allow navigation (URL can be typed); GPS check will still happen; backend validates |
| GPS is available but geofence config is not loaded yet | Show loading state; do not show off-site button until config is confirmed |
| Geofence is disabled (`enabled: false`) | Show normal clock-in button; do not show off-site button (no off-site mode when geofence enforcement is off) |
| Employee has today's off-site clock-in but GPS for clock-out is unavailable | Show "ไม่สามารถอ่านตำแหน่ง" error; do not submit; user must retry |
| Employee's `OffSiteRequest` for today is `PENDING` (not yet approved) | Treat as unplanned: show amber "รอ HR ตรวจสอบ" banner; `todayOffSite?.status === 'APPROVED'` is false |
| Employee's `OffSiteRequest` for today is `REJECTED` | Treat as unplanned (same as no request) |
| Network error during clock-in/out | Show "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้" error; do not clear form |
| Employee switches apps between GPS capture and confirm tap | On return to app, re-fetch GPS before allowing submit (or at minimum warn that position may be stale) |
| `AttendanceRecord.reviewStatus` is null (ONSITE record) | Do not render reviewStatus badge; only render for OFFSITE records |
| History record has `workMode === 'OFFSITE'` but no `reviewStatus` (legacy data) | Show "นอกสถานที่" badge only; omit review badge |
| mustChangePassword is true | Redirect to `/profile` before any clock action; existing guard in `attendance.tsx` already handles this |

---

## 13. Acceptance Criteria

### 13.1 Off-site Clock-in (Planned)

- [ ] When employee is outside geofence AND has an approved `OffSiteRequest` for today, home screen shows "ลงเวลาเข้า (นอกสถานที่)" button in teal
- [ ] Info banner "✓ มีคำขออนุมัติสำหรับวันนี้" is shown in green
- [ ] Tapping button navigates to `/offsite-checkin`
- [ ] After successful clock-in, attendance card shows "นอกสถานที่" (teal) + "อนุมัติแล้ว (ตามคำขอ)" (green) badges
- [ ] workLocationName is displayed in the attendance card

### 13.2 Off-site Clock-in (Unplanned)

- [ ] When employee is outside geofence AND has no approved off-site request, button is shown with amber banner "บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ"
- [ ] After successful clock-in, attendance card shows "รอ HR ตรวจสอบ" (amber) badge
- [ ] workLocationName is displayed

### 13.3 Off-site Clock-out

- [ ] When `today.workMode === 'OFFSITE'` and `today.checkOut === null`, "ลงเวลาออก (นอกสถานที่)" button is shown
- [ ] Clock-out succeeds even if employee is outside company geofence (no 422 geofence error)
- [ ] After clock-out, card shows both checkIn and checkOut times

### 13.4 Form Validation

- [ ] Confirm button is disabled until GPS is obtained and required fields are filled
- [ ] Submitting with empty `workLocationName` shows inline error, does not call API
- [ ] Submitting with empty `reason` (< 3 chars) shows inline error
- [ ] API 422 (accuracy > 100m) shows amber "ความแม่นยำ GPS ต่ำเกินไป" error; form is not cleared

### 13.5 Error Handling

- [ ] Location permission denied → red inline error, button remains disabled
- [ ] Network failure → Thai error message; form preserved
- [ ] 409 Already clocked in → inline Thai error; attendance state refreshed
- [ ] 401 Session expired → redirect to login

### 13.6 History Display

- [ ] Attendance history for OFFSITE records shows `reviewStatus` badge with correct color
- [ ] workLocationName shown as subtitle in timeline card for OFFSITE records
- [ ] ONSITE records unchanged — no reviewStatus badge rendered

### 13.7 Old Off-site Path Removed

- [ ] `useAttendance.ts` no longer injects `workMode: 'OFFSITE'` into regular clock-in
- [ ] Normal `POST /attendance/clock-in` is called for ONSITE only
- [ ] Off-site uses `POST /attendance/offsite/clock-in` exclusively

### 13.8 Privacy

- [ ] Raw latitude, longitude, and accuracy in metres are not displayed in any UI element
- [ ] No background location permission is requested
- [ ] GPS is captured only on user tap of Confirm

### 13.9 Regression

- [ ] Normal ONSITE clock-in via GeofenceMapModal still works when inside geofence
- [ ] Attendance history of ONSITE records unchanged
- [ ] Off-site request pre-approval workflow (`offsite-request.tsx`) unchanged
- [ ] Leave request flow unchanged
- [ ] Profile and password change flow unchanged
- [ ] `mustChangePassword` guard still redirects when active

---

## 14. Non-goals

The following are explicitly out of scope for REQ-002E:

| Out of scope | Rationale |
|---|---|
| Admin Web off-site review UI | Deferred to REQ-002F |
| Manager review of off-site attendance | Blocked on HOTFIX-T089A scope hardening; deferred to v1.1 |
| Background GPS tracking | Privacy; battery drain |
| Continuous location polling | Same as above |
| Displaying raw GPS coordinates | Privacy principle |
| Reverse-geocoding work location from GPS | UX complexity; employee enters name manually |
| Photo proof requirement | Deferred to v2 |
| Multi-site per day | Requires schema change; deferred to v2 |
| Push notifications when review status changes | Notification module not built |
| Off-site request submission from this screen | Handled by existing `offsite-request.tsx` screen |
| Any changes to `apps/api/` backend | Backend already complete |
| Any changes to `apps/web/` Admin Web | Separate task (REQ-002F) |
| Database schema changes | Already complete in REQ-002C |

---

## 15. Recommended Implementation Phases

### Phase 1 — Type + Client Layer (1–2 hours)

1. Add `AttendanceSource`, `AttendanceReviewStatus` to `apps/mobile/src/api/types.ts`
2. Extend `AttendanceRecord` interface with optional new fields
3. Add `clockInOffsite()` and `clockOutOffsite()` to `apps/mobile/src/api/client.ts`
4. Write TypeScript types for payloads

### Phase 2 — Remove Old Off-site Injection (30 min)

1. In `useAttendance.ts`: delete `isOffSiteApproved` variable and `...(isOffSiteApproved && { workMode: 'OFFSITE' })` spread
2. Verify regular clock-in still works (ONSITE path unaffected)

### Phase 3 — New Hook (`useOffsiteAttendance`) (2–3 hours)

Implement `apps/mobile/src/hooks/useOffsiteAttendance.ts` with:
- `clockInState`, `clockOutState` state machines
- `performOffsiteClockIn(workLocationName, reason, note?)` — calls `getLocation()` then `clockInOffsite()`
- `performOffsiteClockOut(note?)` — calls `getLocation()` then `clockOutOffsite()`
- GPS state management (loading, ready, poor, denied, error)
- Error translation for off-site-specific messages

### Phase 4 — Off-site Check-in Screen (3–4 hours)

Create `apps/mobile/app/offsite-checkin.tsx`:
- GPS status indicator (using hook state)
- Info banners (planned vs unplanned) driven by `todayOffSite?.status`
- `workLocationName` TextInput + validation
- `reason` TextInput (multiline) + validation
- `note` TextInput (optional)
- Confirm button (disabled until GPS ready + fields valid)
- Submit → success → `router.back()`; error → inline display

### Phase 5 — Off-site Clock-out Screen (1–2 hours)

Create `apps/mobile/app/offsite-checkout.tsx`:
- GPS status indicator
- `note` TextInput (optional)
- Confirm button (disabled until GPS ready)
- Submit → success → `router.back()`

### Phase 6 — Home Screen Geofence Detection (3–4 hours)

Modify `apps/mobile/app/home.tsx`:
- Add geofence state: `inside | outside | gps_unavailable | loading | unconfigured`
- On mount: `getGeofenceLocation()` + `getLocation()` → compute `haversineMeters()`
- Render off-site button when state is `outside` and not yet clocked in
- Render active off-site card when `today.workMode === 'OFFSITE'` and no checkout

### Phase 7 — Attendance History Display (1 hour)

Modify `apps/mobile/app/attendance.tsx` `HistoryTimeline`:
- Add `reviewStatus` badge alongside existing "นอกสถานที่" badge
- Add `workLocationName` as subtitle text

### Phase 8 — Tests and QA (3–4 hours)

- Unit tests for `useOffsiteAttendance` hook
- Component tests for form validation
- End-to-end smoke test: planned off-site → clock-in → verify badge → clock-out
- Regression check: normal ONSITE clock-in still works
- GPS permission denied handling check

---

## 16. Recommended Test Plan

### 16.1 Unit Tests (`useOffsiteAttendance.spec.ts`)

| Test | Expected |
|---|---|
| `performOffsiteClockIn` calls `getLocation()` then `clockInOffsite()` | Both called in sequence |
| GPS error during clock-in sets error state | `clockInState = 'error'`, message set |
| Missing `workLocationName` (< 1 char) → validation error | API not called |
| Missing `reason` (< 3 chars) → validation error | API not called |
| API 409 on clock-in → error message in Thai | `translateOffsiteError('Already clocked in...')` → Thai string |
| API 422 accuracy error → amber GPS error message | Correct error message set |
| Successful clock-in → `clockInState = 'success'` | State updates correctly |

### 16.2 Component Tests (`offsite-checkin.spec.tsx`)

| Test | Expected |
|---|---|
| Confirm button disabled when `workLocationName` empty | `Pressable` has `disabled` or opacity style |
| Confirm button disabled when GPS not ready | Button not pressable |
| Green banner shown when `todayOffSite.status === 'APPROVED'` | Banner text correct |
| Amber banner shown when no approved off-site request | Banner text correct |
| Inline error on empty submission attempt | Error text visible |

### 16.3 Integration / Manual QA

| Scenario | Expected |
|---|---|
| Outside geofence → tap Off-site Clock-in → fill form → success | 201; attendance card with correct badges |
| Outside geofence → unplanned → success | "รอ HR ตรวจสอบ" badge shown |
| Outside geofence → planned → success | "อนุมัติแล้ว (ตามคำขอ)" badge shown |
| Off-site clock-out succeeds from any location | 200; no geofence error |
| Inside geofence → normal clock-in still works | No regression |
| Location denied → cannot submit | Error shown; no API call |
| GPS accuracy > 100m → API 422 | Amber error shown; form preserved |

---

## 17. Risks and Dependencies

| Risk | Severity | Mitigation |
|---|---|---|
| `getLocation()` performance on home mount — GPS fetch adds 1–3s latency | MEDIUM | Fetch asynchronously; show normal buttons initially; update to off-site button when GPS arrives. Do not block initial render. |
| GPS accuracy > 100m indoors (common in older buildings) | MEDIUM | Backend max accuracy is 100m; inform user to move outdoors; do not lock them out permanently |
| Old `workMode: 'OFFSITE'` injection removal may break planned path for users with existing approved requests | LOW | Backend dedicated endpoint (`/attendance/offsite/clock-in`) now handles this; the old `POST /attendance/clock-in` with `workMode` injection is now redundant and safe to remove |
| `attendanceSource` and `reviewStatus` absent on old `AttendanceRecord` responses | LOW | Typed as optional (`?`) — optional chaining handles null/undefined gracefully |
| Home screen geofence check increases `useAttendance` hook complexity | LOW | Use `useOffsiteAttendance` as separate hook; `useAttendance` retains existing shape; `home.tsx` imports both |
| Network latency during GPS + API call on slow 4G | LOW | Loading spinner during submit; form is not cleared on error |

### 17.1 Hard Dependencies (must be deployed before REQ-002E)

- ✅ REQ-002C — Backend `POST /attendance/offsite/clock-in` and `POST /attendance/offsite/clock-out` (deployed)
- ✅ REQ-002D — Review API and `reviewStatus` in `AttendanceRecord` responses (deployed)

### 17.2 Soft Dependencies (parallel or sequential)

- REQ-002F (Admin Web review UI) — can be developed in parallel; not a blocker for mobile
- Expo SDK version must support `requestForegroundPermissionsAsync` (already used; no change needed)

---

## 18. Deferred Work

| Task | Deferred to |
|---|---|
| Admin Web off-site review UI | REQ-002F |
| Runtime end-to-end QA (Docker + full smoke test) | REQ-002G |
| HR-Knowledge / ADR sync for hybrid off-site model | REQ-002H |
| Manager read-only view of team off-site records | v1.1 (blocked on HOTFIX-T089A) |
| Push notification when HR approves/rejects | v2 (notification module not built) |
| Multi-site / multiple off-site sessions per day | v2 (schema change required) |
| Photo proof at clock-in | v2 |
| Repeated unplanned pattern warning badge | v2 |
| GPS consistency check (check-in vs check-out distance) | v2 |

---

## Appendix A: Existing Off-site Path Migration Summary

| Component | Before REQ-002E | After REQ-002E |
|---|---|---|
| `useAttendance.ts` `performClockIn` | Injects `workMode: 'OFFSITE'` when approved OffSiteRequest found | Removed; regular clock-in is ONSITE-only |
| Home screen clock-in button | Single "ลงเวลาเข้า" button regardless of location | Conditional: inside = normal; outside = off-site |
| Off-site clock-in API | `POST /attendance/clock-in` with `workMode: 'OFFSITE'` | `POST /attendance/offsite/clock-in` |
| Off-site clock-out | `POST /attendance/clock-out` with geofence bug (422 for mobile off-site) | `POST /attendance/offsite/clock-out` (no geofence check) |
| AttendanceRecord type | No `attendanceSource` / `reviewStatus` / `workLocationName` | Types added; optional for backward compat |
| History badge | "นอกสถานที่" only (binary) | "นอกสถานที่" + `reviewStatus` color-coded badge + `workLocationName` subtitle |

---

## Appendix B: Screen Wireframes

### Home Screen — Outside Geofence, Not Yet Clocked In

```
┌───────────────────────────────────────────┐
│  [Hero Header — dark blue]                │
│  สวัสดี, [Name]                           │
│  [Date / time display]                    │
│                                           │
│  📍 คุณอยู่นอกพื้นที่สำนักงาน            │  ← amber notice
│  ✓ มีคำขออนุมัติสำหรับวันนี้             │  ← green (if APPROVED request)
│  หรือ                                     │
│  บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ         │  ← amber (if unplanned)
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │  📍 ลงเวลาเข้า (นอกสถานที่)       │  │  ← teal button
│  └─────────────────────────────────────┘  │
│                                           │
│  [ลงเวลาเข้า (ปกติ) — disabled, grey]   │  ← normal button disabled
└───────────────────────────────────────────┘
```

### Off-site Clock-in Form Screen

```
┌───────────────────────────────────────────┐
│  ← ลงเวลาเข้า (นอกสถานที่)              │
│                                           │
│  [📍 พร้อมใช้งาน] (green)               │  ← GPS indicator
│                                           │
│  [✓ มีคำขออนุมัติสำหรับวันนี้]         │  ← green banner (planned)
│  หรือ                                     │
│  [บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ]     │  ← amber banner (unplanned)
│                                           │
│  สถานที่ทำงาน *                          │
│  ┌─────────────────────────────────────┐  │
│  │ เช่น ลูกค้า ABC, ทำงานที่บ้าน      │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  เหตุผล *                                │
│  ┌─────────────────────────────────────┐  │
│  │ อธิบายเหตุผลที่ทำงานนอกสถานที่     │  │  ← multiline
│  │ วันนี้                              │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  หมายเหตุ (ไม่จำเป็น)                  │
│  ┌─────────────────────────────────────┐  │
│  │ เพิ่มเติม (ถ้ามี)                  │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │  ยืนยันลงเวลาเข้า (นอกสถานที่)   │  │  ← teal, disabled until ready
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

### Active Off-site Card (Home or Attendance Screen)

```
┌───────────────────────────────────────────┐
│  📍 กำลังทำงานนอกสถานที่                 │
│  [นอกสถานที่]  [รอ HR ตรวจสอบ]          │  ← teal + amber badges
│  สถานที่: ลูกค้า ABC สาทร               │
│  เวลาเข้า: 08:45                         │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │  📍 ลงเวลาออก (นอกสถานที่)        │  │  ← teal outline button
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

### History Timeline Card — Off-site Record

```
┌───────────────────────────────────────────┐
│  [08:45]  บันทึกเข้างาน    [ตรงเวลา]    │
│  [28 มิ.ย.]                              │
│  ผ่านมือถือ  [นอกสถานที่]  [รอ HR]      │  ← workMode + reviewStatus badges
│  ลูกค้า ABC สาทร                         │  ← workLocationName subtitle
│  ออกงาน: 17:30                           │
└───────────────────────────────────────────┘
```

---

*End of REQ-002E STEP Connect Off-site Attendance UI Specification*
