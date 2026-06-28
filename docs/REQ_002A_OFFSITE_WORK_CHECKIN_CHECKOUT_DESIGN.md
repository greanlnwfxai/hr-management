# REQ-002A — Off-site Work Check-in/Check-out Product Design

**Type:** Product / UX Design Specification
**Status:** Draft — Pending Approval
**Date:** 2026-06-28
**Author:** Claude Code (AI assistant)
**Task:** REQ-002A
**Replaces / Supersedes:** Extends existing off-site pre-approval implementation (shipped in earlier T-0xx tasks)

---

## 1. Requirement Summary

Employees who work outside company premises cannot use the normal geofence-protected clock-in/clock-out (which requires being within 100m of the office). HR needs to track off-site attendance with full auditability, visibility, and abuse controls — without requiring pre-approval for every unplanned off-site work scenario.

This spec defines the **product design** for off-site check-in/check-out across STEP Connect (mobile PWA) and HR Management Admin Web. It is **design-only**; no runtime code, schema migration, or data mutation is performed in REQ-002A.

---

## 2. Current System Analysis

### 2.1 What Is Already Built

The following off-site infrastructure is already in production:

| Component | Status | Notes |
|---|---|---|
| `OffSiteRequest` model | Shipped | `PENDING / APPROVED / REJECTED` workflow |
| `WorkMode` enum on `Attendance` | Shipped | `ONSITE` (default) or `OFFSITE` |
| `POST /attendance/clock-in` with `workMode=OFFSITE` | Shipped | Requires APPROVED `OffSiteRequest` for today; GPS required; radius check skipped |
| `apps/api/src/off-site/` NestJS module | Shipped | CRUD + approve/reject endpoints |
| Mobile off-site request form (`offsite-request.tsx`) | Shipped | Employee submits pre-approval request |
| Admin off-site approval page (`/offsite`) | Shipped | MANAGER / HR_ADMIN / SUPER_ADMIN can approve |

### 2.2 Current Business Logic (Option B — Pre-approval Required)

The existing flow is **strict pre-approval (Option B)**:

```
Employee submits OffSiteRequest (mobile)
  → HR or Manager approves
  → On approved date, employee clocks in with workMode=OFFSITE
      → Backend: finds APPROVED OffSiteRequest for today
      → Allows clock-in without radius check; GPS still required
      → If no approved request: 403 Forbidden
```

### 2.3 Known Gaps in Current Implementation

| Gap | Impact | Resolution in this spec |
|---|---|---|
| `clockOut` always validates geofence — off-site employees cannot clock out from off-site | Off-site clock-out fails if employee is not back at office | Design: off-site clock-out must bypass radius check |
| No `reviewStatus` field on `Attendance` | Cannot distinguish auto-approved vs pending review attendance | Design: add `AttendanceReviewStatus` conceptually |
| No `workLocationName` field | No record of where the employee actually worked | Design: required field at check-in |
| No GPS coordinates stored in attendance record | Cannot verify location claims in disputes | Design: store check-in/check-out lat/lon in attendance record (not in audit) |
| No `offSiteRequestId` FK on `Attendance` | Request-to-attendance link only in audit metadata | Design: store FK when planned path is used |
| Unplanned off-site has no path at all | Employee with emergency off-site work cannot self-serve | Design: hybrid model adds unplanned path with review |

---

## 3. Business Problem

Some employees work outside company location regularly or spontaneously:

- Customer site visits (planned or unplanned)
- Remote technical support
- Field service / on-site repair
- Business errands
- Off-site meetings
- Work from an approved alternative location

They cannot use normal geofence clock-in/out (100m radius), but HR must have:
- Accurate attendance records
- Location context (where did the employee work?)
- Auditability (can disputes be resolved?)
- Abuse controls (can the system detect suspicious patterns?)

---

## 4. Recommended V1 Design: Hybrid Model (Option C)

### 4.1 Option Comparison

| | Option A: No Pre-approval | Option B: Pre-approval Required (current) | Option C: Hybrid (recommended) |
|---|---|---|---|
| Planned off-site | No gate — HR reviews later | Employee submits request, waits for approval | Request auto-grants clean record |
| Unplanned off-site | Immediate check-in | Blocked — no approved request | Immediate check-in, marked Pending Review |
| HR oversight | Retroactive review only | Pre-approval required | Review for unplanned; pre-approval for planned |
| Auditability | Moderate | High | High |
| Employee friction | Low (may be abused) | High for unplanned work | Balanced |
| Abuse controls | Weak | Strong | Strong (reason + GPS + review) |

**Recommendation: Option C — Hybrid**

Option C is the lowest-friction evolution of what is already built. It preserves the existing pre-approval path (planned off-site → clean auto-accepted record) and adds an escape hatch for unplanned off-site work that goes through HR review. It does not weaken the normal geofence.

### 4.2 Two Paths in the Hybrid Model

```
Employee is outside company geofence:
  ┌─ Path 1: PLANNED ──────────────────────────────────────────────────────────────┐
  │  Pre-approved OffSiteRequest exists for today (status = APPROVED)             │
  │  → Off-site Check-in allowed                                                  │
  │  → reviewStatus = AUTO_ACCEPTED                                               │
  │  → Attendance linked to OffSiteRequest via offSiteRequestId FK                │
  └───────────────────────────────────────────────────────────────────────────────┘
  ┌─ Path 2: UNPLANNED ────────────────────────────────────────────────────────────┐
  │  No approved OffSiteRequest for today                                         │
  │  → Off-site Check-in allowed                                                  │
  │  → Reason + work location name required                                       │
  │  → reviewStatus = PENDING_REVIEW                                              │
  │  → HR_ADMIN / SUPER_ADMIN must review and approve or reject                   │
  └───────────────────────────────────────────────────────────────────────────────┘
```

Both paths:
- Require GPS at check-in and check-out
- Do NOT bypass the normal ONSITE geofence (separate code path)
- Create a full audit trail
- Record work location name

---

## 5. UX Design — Button and Screen States

### 5.1 Button Logic

The STEP Connect mobile app detects GPS location before showing attendance buttons. Buttons shown depend on location state:

| Location State | Normal Buttons | Off-site Buttons |
|---|---|---|
| Inside geofence (≤ 100m) | ✅ Enabled | ❌ Hidden |
| Outside geofence (> 100m) | ❌ Hidden or disabled | ✅ Shown |
| GPS unavailable | ⚠️ Disabled with message | ❌ Hidden (GPS required for both paths) |

> The app does NOT make the allow/deny decision — it reads GPS, passes coordinates to the backend, and reflects the backend response. Location detection is used only for UI pre-screening, not as the authority.

### 5.2 Button Labels (EN / TH)

| Action | English | Thai |
|---|---|---|
| Normal clock-in | Clock In | ลงเวลาเข้า |
| Normal clock-out | Clock Out | ลงเวลาออก |
| Off-site check-in | Off-site Check-in | ลงเวลาเข้า (นอกสถานที่) |
| Off-site check-out | Off-site Check-out | ลงเวลาออก (นอกสถานที่) |
| Status: working off-site | Working Off-site | กำลังทำงานนอกสถานที่ |
| Status: pending review | Pending HR Review | รอการตรวจสอบจาก HR |
| Status: approved | Approved | อนุมัติแล้ว |
| Status: auto-accepted | Approved (Pre-approved) | อนุมัติแล้ว (ตามคำขอ) |
| Outside area notice | You are outside the office area | คุณอยู่นอกพื้นที่สำนักงาน |
| Review notice | This record will be submitted for HR review | บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ |
| Pre-approval badge | Pre-approval found for today | มีคำขออนุมัติสำหรับวันนี้แล้ว |

### 5.3 Status After Off-site Check-in

After a successful off-site check-in, the attendance card displays:

- **Work mode badge:** "นอกสถานที่" (Off-site) — teal or amber color
- **Review status badge:**
  - Path 1 (planned): "อนุมัติแล้ว (ตามคำขอ)" — green
  - Path 2 (unplanned): "รอ HR ตรวจสอบ" — amber
- **Work location name** shown below badge
- **Check-in time** as normal

---

## 6. Required Fields at Off-site Check-in

### 6.1 V1 Required Fields

| Field | Required? | Notes |
|---|---|---|
| GPS latitude | ✅ Required | Collected by app, sent to backend |
| GPS longitude | ✅ Required | Collected by app, sent to backend |
| GPS accuracy (meters) | ✅ Required | Sent to backend for signal quality logging |
| Work location name | ✅ Required | Free text, max 200 chars. Examples: "ลูกค้า ABC", "ทำงานที่บ้าน", "สาขาลาดพร้าว" |
| Reason / note | ✅ Required | Free text, max 500 chars. Why employee is off-site today |

### 6.2 Optional V1 Fields

| Field | Optional? | Notes |
|---|---|---|
| Customer / site name | Optional | Can overlap with work location name; defer separate field to v2 |
| Off-site request ID | Auto-populated | Auto-linked if Path 1 (planned); null if Path 2 (unplanned) |

### 6.3 Deferred to V2

- Photo proof
- Job / ticket / work order reference number
- Customer/site master database lookup
- Distance from company display (privacy tradeoff discussed in §10)

### 6.4 GPS Storage Decision

| Data | Where stored | Rationale |
|---|---|---|
| Latitude / longitude at check-in | Attendance record (new fields) | Operational evidence for HR dispute resolution |
| Latitude / longitude at check-out | Attendance record (new fields) | Same — check-out location context |
| GPS accuracy (raw meters) | NOT stored | Bucketed as signal quality in audit metadata |
| Raw coordinates in audit metadata | ❌ FORBIDDEN | Follows T-064 privacy principle — audit log stays GPS-free |
| Distance from company (meters) | NOT stored in audit | Same privacy principle; HR can calculate if needed from stored lat/lon |

**Rationale:** The `Attendance` table holds the operational work record — similar to how a timesheet holds actual hours. Raw lat/lon in the attendance record serves the same purpose as a paper sign-in sheet showing location. The audit log (append-only, shared with all admins) retains the privacy-safe metadata convention established in T-060 and T-064.

---

## 7. Off-site Check-out Behavior

### 7.1 GPS Requirement

GPS is required at check-out. Backend validates coordinates present; accuracy bucket is logged. The check-out GPS location is stored in the attendance record (same rationale as §6.4).

### 7.2 Location Comparison

V1 does **not** compare check-out location to check-in location. An employee may have moved to a different site during the day. Location consistency checks are deferred to v2.

### 7.3 Check-out Note

Note is **optional** at check-out. If provided, max 500 chars. (Required only at check-in where the business justification is needed.)

### 7.4 Forgot-to-Check-out Policy

If an employee does not check out by end of day:

1. A daily background job (midnight Bangkok time) auto-closes the attendance record.
2. `checkOut` is set to null / a configurable end-of-day time.
3. `reviewStatus` is set to `MISSING_CHECKOUT` (a new review state flag, not a full enum value).
4. HR_ADMIN sees the record in the review dashboard with a "Missing checkout" warning badge.
5. HR can manually fill the check-out time via the review UI.

### 7.5 Multi-site During One Day

Multiple off-site locations on the same day are **deferred to v2**. The existing `@@unique([employeeId, date])` constraint on the `Attendance` table means one attendance record per employee per day — there is no space for two off-site sessions without a schema change. V2 may introduce `AttendanceSession` to handle this.

---

## 8. Attendance Record Model (Conceptual)

This section describes the conceptual data shape only. Actual schema migration is a future implementation task.

### 8.1 Conceptual Extended Attendance Fields

```
Attendance {
  // existing fields
  id              UUID PK
  employeeId      UUID → Employee
  date            Date (unique per employee)
  checkIn         DateTime?
  checkOut        DateTime?
  status          AttendanceStatus (PRESENT | LATE | ABSENT | HALF_DAY | ON_LEAVE)
  workMode        WorkMode (ONSITE | OFFSITE)
  note            String? (max 500)

  // new conceptual fields for REQ-002A
  attendanceSource    AttendanceSource  (COMPANY_GEOFENCE | OFFSITE_PLANNED | OFFSITE_UNPLANNED)
  reviewStatus        AttendanceReviewStatus?  (AUTO_ACCEPTED | PENDING_REVIEW | APPROVED | REJECTED | MISSING_CHECKOUT)
  reviewedById        UUID? → Employee
  reviewedAt          DateTime?
  reviewNote          String?

  offSiteRequestId    UUID? → OffSiteRequest  (null if unplanned)
  workLocationName    String? (max 200)         (required when workMode=OFFSITE)

  checkInLatitude     Decimal?                  (stored for dispute resolution)
  checkInLongitude    Decimal?
  checkOutLatitude    Decimal?
  checkOutLongitude   Decimal?
}
```

### 8.2 AttendanceSource Enum

| Value | Meaning |
|---|---|
| `COMPANY_GEOFENCE` | Standard clock-in/out; employee was within 100m radius |
| `OFFSITE_PLANNED` | Off-site check-in with an APPROVED OffSiteRequest (Path 1) |
| `OFFSITE_UNPLANNED` | Off-site check-in without a pre-approved request (Path 2) |

### 8.3 AttendanceReviewStatus Enum

| Value | Meaning | Who sets it |
|---|---|---|
| `AUTO_ACCEPTED` | Planned off-site — no review needed | System (at clock-in) |
| `PENDING_REVIEW` | Unplanned off-site — awaits HR review | System (at clock-in) |
| `APPROVED` | HR reviewed and approved | HR_ADMIN / SUPER_ADMIN |
| `REJECTED` | HR reviewed and rejected | HR_ADMIN / SUPER_ADMIN |
| `MISSING_CHECKOUT` | No clock-out by end of day | System (midnight job) |

### 8.4 How Reports Distinguish Normal vs Off-site Attendance

- `workMode = ONSITE` + `attendanceSource = COMPANY_GEOFENCE` → Standard attendance
- `workMode = OFFSITE` + `attendanceSource = OFFSITE_PLANNED` → Planned off-site
- `workMode = OFFSITE` + `attendanceSource = OFFSITE_UNPLANNED` → Unplanned off-site

Filter in admin reports by `workMode` or `attendanceSource`. Aggregate counts by type for monthly reports.

---

## 9. Admin Web / Manager Visibility

### 9.1 Placement

A new **"Off-site Review"** section within Attendance module in HR Management Admin Web:

- Path: `/attendance/offsite-review`
- Accessible to: HR_ADMIN, SUPER_ADMIN
- (Manager access: deferred to v1.1 — see §11.4)

### 9.2 Review States Required

| Review State | Color | Badge | HR Action |
|---|---|---|---|
| Auto-accepted | Green | ✅ อนุมัติแล้ว (ตามคำขอ) | No action needed |
| Pending Review | Amber | ⏳ รอตรวจสอบ | Review required |
| Approved | Green | ✅ อนุมัติแล้ว | — |
| Rejected | Red | ❌ ไม่อนุมัติ | Can add note |
| Missing Checkout | Orange | ⚠️ ไม่ได้ลงเวลาออก | Manual fill-in |

### 9.3 Review Permissions

| Role | Can View | Can Approve/Reject | Can Fill Missing Checkout |
|---|---|---|---|
| EMPLOYEE | Own records only | ❌ | ❌ |
| MANAGER | Own records only in v1 | ❌ in v1 (→ v1.1) | ❌ |
| HR_ADMIN | All employees | ✅ | ✅ |
| SUPER_ADMIN | All employees | ✅ | ✅ |

### 9.4 Filters Required in Review Dashboard

- Date range picker
- Employee name / employee code
- Department (HR_ADMIN / SUPER_ADMIN)
- Review status (Pending / Approved / Rejected / Auto-accepted / Missing Checkout)
- Work location name (free text search)

### 9.5 Suspicious Record Surfacing

Records that warrant HR attention should be visually highlighted:

| Pattern | Flag Type |
|---|---|
| `PENDING_REVIEW` with no approved request | Standard pending — amber badge |
| `MISSING_CHECKOUT` | Orange warning badge |
| Multiple PENDING_REVIEW in one week from same employee | "Repeated unplanned" indicator (v2) |
| Check-in and check-out GPS > 50km from company | "Remote location" badge (v2) |

---

## 10. RBAC

### 10.1 V1 Permissions

| Action | EMPLOYEE | MANAGER | HR_ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| Off-site check-in (own) | ✅ | ✅ | ✅ | ✅ |
| Off-site check-out (own) | ✅ | ✅ | ✅ | ✅ |
| Submit OffSiteRequest | ✅ | ✅ | ✅ | ✅ |
| View own off-site records | ✅ | ✅ | ✅ | ✅ |
| View team off-site records | ❌ | 👁️ Read-only | ✅ | ✅ |
| Approve/reject OffSiteRequest | ❌ | ✅ (own dept) | ✅ (all) | ✅ (all) |
| Review/approve off-site attendance | ❌ | ❌ (→ v1.1) | ✅ | ✅ |
| Fill missing check-out | ❌ | ❌ | ✅ | ✅ |
| Configure geofence settings | ❌ | ❌ | ✅ | ✅ |

### 10.2 Manager Scope Constraint (HOTFIX-T089A Dependency)

> **IMPORTANT:** MANAGER review of off-site attendance records is deferred to v1.1. It is blocked on a manager-scope hardening task (dependency: resolution of HOTFIX-T089A). Manager approval of `OffSiteRequest` (pre-approval flow) is already shipped and may remain as-is. Manager review of **attendance records** — which requires reliable department/team scoping — must not be added until the scoping is verified safe.

In v1:
- MANAGER can view team off-site records (read-only, filtered by their department)
- MANAGER cannot approve or reject off-site attendance review states
- MANAGER can continue to approve/reject OffSiteRequests (pre-approval) as already shipped

---

## 11. Audit Trail

### 11.1 Event Naming Convention

Existing events follow `ATTENDANCE_`-prefixed convention (e.g., `ATTENDANCE_CLOCK_IN`, `ATTENDANCE_GEOFENCE_REJECTED`). New off-site events align to this convention:

> **Note:** The task specification suggests `OFFSITE_CLOCK_IN` style names. This spec recommends `ATTENDANCE_OFFSITE_` prefix instead to align with existing audit log convention and allow consistent filtering in the `/audit-logs` UI.

### 11.2 Required Audit Events

| Event | Trigger | Actor |
|---|---|---|
| `ATTENDANCE_OFFSITE_CLOCK_IN` | Successful off-site check-in | Employee |
| `ATTENDANCE_OFFSITE_CLOCK_OUT` | Successful off-site check-out | Employee |
| `ATTENDANCE_OFFSITE_APPROVED` | HR approves unplanned off-site attendance | HR_ADMIN / SUPER_ADMIN |
| `ATTENDANCE_OFFSITE_REJECTED` | HR rejects unplanned off-site attendance | HR_ADMIN / SUPER_ADMIN |
| `ATTENDANCE_OFFSITE_CHECKOUT_FILLED` | HR fills missing check-out time | HR_ADMIN / SUPER_ADMIN |

### 11.3 Metadata Schema — ATTENDANCE_OFFSITE_CLOCK_IN

```json
{
  "attendanceId": "<uuid>",
  "employeeId": "<uuid>",
  "date": "2026-06-28",
  "workMode": "OFFSITE",
  "attendanceSource": "OFFSITE_PLANNED" | "OFFSITE_UNPLANNED",
  "reviewStatus": "AUTO_ACCEPTED" | "PENDING_REVIEW",
  "workLocationName": "ลูกค้า ABC สาทร",
  "hasCoordinates": true,
  "accuracyBucket": "ACCEPTABLE" | "POOR" | "UNKNOWN",
  "offSiteRequestId": "<uuid>" | null,
  "hasNote": true,
  "clockInAt": "2026-06-28T08:45:00.000Z"
}
```

**FORBIDDEN in metadata (all events):**

- `latitude`, `longitude` (raw GPS — stored in attendance record, never in audit)
- `accuracy` (raw number — use `accuracyBucket`)
- `distance` (any calculated distance in meters)
- `note` content (free-form text — may contain sensitive info)
- `reviewNote` content

### 11.4 Metadata Schema — ATTENDANCE_OFFSITE_APPROVED / REJECTED

```json
{
  "attendanceId": "<uuid>",
  "employeeId": "<uuid>",
  "date": "2026-06-28",
  "previousReviewStatus": "PENDING_REVIEW",
  "newReviewStatus": "APPROVED" | "REJECTED",
  "reviewedById": "<reviewer-uuid>",
  "hasReviewNote": true | false
}
```

### 11.5 Best-Effort Write

All audit writes use the existing `recordBestEffort` pattern. An audit write failure must never suppress the primary operation response.

---

## 12. Geofence Integration

### 12.1 Separation of Concerns

Normal and off-site attendance are **separate backend code paths with separate business logic and audit trails**:

| Concern | Normal ONSITE | Off-site OFFSITE |
|---|---|---|
| Geofence radius enforced | ✅ (100m) | ❌ (skipped) |
| GPS required | Yes (when mobile source) | Yes (always) |
| Audit on rejection | `ATTENDANCE_GEOFENCE_REJECTED` | `ATTENDANCE_OFFSITE_CLOCK_IN` with failure result |
| Can bypass silently | ❌ Never | ❌ Never |
| Review required | ❌ (normal attendance) | If OFFSITE_UNPLANNED |

### 12.2 Off-site Does Not Silently Bypass Geofence

An employee setting `workMode=OFFSITE` is NOT bypassing the geofence silently — they are explicitly declaring off-site work, which triggers a different set of requirements (GPS, reason, location name) and review obligations. The separation is intentional and audited.

### 12.3 No Continuous GPS Tracking

Only two GPS snapshots per day are captured:
- One at check-in time
- One at check-out time

No background location tracking, no route recording, no passive location collection. Foreground location permission (`requestForegroundPermissionsAsync`) only.

---

## 13. Abuse Prevention and Controls

| Control | V1 | Notes |
|---|---|---|
| GPS required at check-in | ✅ | Backend enforced — not mobile-side decision |
| GPS required at check-out | ✅ | Backend enforced |
| Reason required (unplanned) | ✅ | Min 3 chars, max 500 |
| Work location name required | ✅ | Required for both planned and unplanned |
| Cannot check in twice in one day | ✅ | Existing `@@unique([employeeId, date])` |
| Cannot check out without check-in | ✅ | Existing business rule |
| HR review for unplanned off-site | ✅ | PENDING_REVIEW state |
| Repeated unplanned pattern detection | ❌ → v2 | Dashboard indicator for >N unplanned per week |
| GPS consistency check (check-in vs check-out distance) | ❌ → v2 | Deferred — employees may move |
| Photo proof | ❌ → v2 | Not required in v1 |
| No silent GPS tracking | ✅ | Foreground only; two snapshots max |
| Rate limiting on check-in attempts | ❌ → v2 | Current rate limiting applies at API level |

---

## 14. STEP Connect Mobile UX — Screen Flow

### 14.1 Home / Attendance Screen (Outside Geofence)

```
┌─────────────────────────────────┐
│  📍 คุณอยู่นอกพื้นที่สำนักงาน   │
│  (You are outside office area)  │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🏢 ลงเวลาเข้า (นอกสถานที่)│  │  ← Off-site Check-in button
│  └─────────────────────────┘   │
│  (shown only if not yet         │
│   checked in today)             │
│                                 │
│  ─── หรือ ───                   │
│  ลงเวลาเข้าปกติ: ไม่พร้อมใช้งาน│  ← Normal button disabled
│  (กรุณาอยู่ในพื้นที่สำนักงาน)   │
└─────────────────────────────────┘
```

### 14.2 Off-site Check-in Form

```
┌─────────────────────────────────┐
│  ลงเวลาเข้า (นอกสถานที่)        │
│  Off-site Check-in              │
│                                 │
│  📍 GPS พร้อมใช้งาน             │  ← GPS status
│  [มีคำขออนุมัติสำหรับวันนี้ ✓]  │  ← If Path 1 (planned)
│  [บันทึกจะถูกส่ง HR ตรวจสอบ]   │  ← If Path 2 (unplanned)
│                                 │
│  สถานที่ทำงาน *                 │
│  [__________________________]   │  ← Required, max 200 chars
│                                 │
│  เหตุผล *                       │
│  [__________________________]   │  ← Required, max 500 chars
│                                 │
│  [ยืนยันลงเวลาเข้า (นอกสถานที่)]│  ← Confirm button
└─────────────────────────────────┘
```

### 14.3 Active Off-site Status (After Successful Check-in)

```
┌─────────────────────────────────┐
│  📍 กำลังทำงานนอกสถานที่        │
│  [นอกสถานที่]  [รอ HR ตรวจสอบ]  │  ← Work mode + review status badges
│                                 │
│  เวลาเข้า: 08:45               │
│  สถานที่: ลูกค้า ABC สาทร       │
│                                 │
│  ┌─────────────────────────┐   │
│  │ ลงเวลาออก (นอกสถานที่) │   │  ← Check-out button
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

### 14.4 Off-site Check-out Form

```
┌─────────────────────────────────┐
│  ลงเวลาออก (นอกสถานที่)         │
│  Off-site Check-out             │
│                                 │
│  📍 GPS พร้อมใช้งาน             │
│                                 │
│  หมายเหตุ (ไม่จำเป็น)           │
│  [__________________________]   │  ← Optional
│                                 │
│  [ยืนยันลงเวลาออก (นอกสถานที่)] │
└─────────────────────────────────┘
```

### 14.5 History / Status View (Off-site Records)

```
┌─────────────────────────────────┐
│  ประวัติการทำงานนอกสถานที่       │
│                                 │
│  วันที่ 28 มิ.ย. 2026           │
│  ลูกค้า ABC สาทร               │
│  08:45 → 17:30                 │
│  [รอ HR ตรวจสอบ]               │  ← amber badge
│                                 │
│  วันที่ 25 มิ.ย. 2026           │
│  บ้านพัก                        │
│  09:00 → 18:00                 │
│  [อนุมัติแล้ว (ตามคำขอ)]        │  ← green badge
│                                 │
│  วันที่ 20 มิ.ย. 2026           │
│  สาขาบางนา                      │
│  08:30 → ?                     │
│  [ไม่ได้ลงเวลาออก]              │  ← orange badge
└─────────────────────────────────┘
```

### 14.6 Error Messages (EN / TH)

| Scenario | English | Thai |
|---|---|---|
| GPS not available | Location required for off-site check-in. | ต้องระบุตำแหน่งสำหรับการลงเวลานอกสถานที่ |
| GPS accuracy too low | GPS accuracy is too low. Please try again. | ความแม่นยำ GPS ต่ำเกินไป กรุณาลองใหม่ |
| Work location name missing | Please enter your work location. | กรุณาระบุสถานที่ทำงาน |
| Reason missing | Please enter a reason. | กรุณาระบุเหตุผล |
| Already checked in today | Already checked in for today. | ลงเวลาเข้าไปแล้วสำหรับวันนี้ |
| No check-in to check out | No check-in found for today. | ยังไม่มีการลงเวลาเข้าสำหรับวันนี้ |
| Session expired | Session expired. Please log in again. | เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ |

---

## 15. Out of Scope for V1

The following features are explicitly deferred:

| Feature | Reason for Deferral | Target |
|---|---|---|
| Route / path tracking | Background location; privacy concern; complexity | v3+ |
| Continuous GPS tracking | Privacy; battery drain; no foreground-only equivalent | v3+ |
| Photo proof requirement | Added friction; storage cost; offline edge cases | v2 |
| Customer/site master database | Requires separate domain model and admin UI | v2 |
| Job/ticket/work order reference | Requires integration with ticketing system | v2 |
| Automatic payroll calculation for off-site | Payroll module not built | v2+ |
| Multi-site / multi-session per day | Requires schema change (Attendance @@unique constraint) | v2 |
| Distance-from-company display in review | Privacy tradeoff; marginal operational value | v2 |
| GPS consistency check between sites | Employees may legitimately move; v1 one session | v2 |
| Manager review and approval of attendance | Blocked on HOTFIX-T089A manager-scope hardening | v1.1 |
| Device integrity checks (SafetyNet/DeviceCheck) | Platform-specific; significant complexity | v3 |
| Admin notification on pending off-site records | Notification module not built | v2 |
| Repeated unplanned pattern detection | Requires analytics; aggregate queries | v2 |

---

## 16. Open Questions for User Approval

1. **Accuracy threshold for off-site GPS:** Should the same `ATTENDANCE_GPS_MAX_ACCURACY_METERS` (default 100m) apply to off-site check-ins, or should off-site allow a looser threshold (e.g., 200m) given that outdoor/rural GPS may be less precise?

2. **Raw lat/lon storage on Attendance:** This spec recommends storing raw lat/lon in the `Attendance` table for dispute resolution. Is this aligned with your data privacy / PDPA requirements? If not, should we store only `workLocationName` + `hasCoordinates: boolean`?

3. **Mandatory reason for Path 1 (planned) check-in:** Currently the spec requires a reason for all off-site check-ins. Should the reason be optional for Path 1 (employee already submitted a reason in the OffSiteRequest), or required for both paths?

4. **Auto-close time for missing check-out:** What end-of-day time should the midnight job use to auto-close off-site attendance with missing check-out? (Example: 23:59 Bangkok time, or the employee's normal work end time?)

5. **Manager read-only scope in v1:** Should Manager be able to see team off-site records (read-only) in v1, or should off-site review be HR_ADMIN/SUPER_ADMIN only until v1.1?

6. **Reject behavior:** When HR rejects an unplanned off-site attendance record, what happens to the employee's attendance for that day? Options: (a) record remains with status REJECTED and employee is marked ABSENT, (b) HR must also set the correct attendance status, (c) rejected off-site auto-triggers an ABSENT record.

---

## 17. V1 Workflow Summary

```
EMPLOYEE (Outside geofence, mobile)
  ↓ Taps "ลงเวลาเข้า (นอกสถานที่)"
  ↓ Enters work location name + reason
  ↓ App captures GPS → sends to backend
  ↓
BACKEND
  ↓ Validates GPS (required, accuracy checked)
  ↓ Validates work location name + reason (required)
  ↓ Checks for APPROVED OffSiteRequest today
      ├─ Found → attendanceSource=OFFSITE_PLANNED, reviewStatus=AUTO_ACCEPTED
      └─ Not found → attendanceSource=OFFSITE_UNPLANNED, reviewStatus=PENDING_REVIEW
  ↓ Creates Attendance record (workMode=OFFSITE)
  ↓ Emits ATTENDANCE_OFFSITE_CLOCK_IN audit event
  ↓
EMPLOYEE sees "กำลังทำงานนอกสถานที่" status card

If PENDING_REVIEW:
HR_ADMIN / SUPER_ADMIN
  ↓ Opens /attendance/offsite-review
  ↓ Reviews pending records: work location, reason, GPS bucket
  ↓ Approve → reviewStatus=APPROVED, ATTENDANCE_OFFSITE_APPROVED event
     OR
     Reject → reviewStatus=REJECTED, ATTENDANCE_OFFSITE_REJECTED event

EMPLOYEE
  ↓ Taps "ลงเวลาออก (นอกสถานที่)"
  ↓ App captures GPS → sends to backend
  ↓
BACKEND
  ↓ Validates GPS
  ↓ Verifies existing OFFSITE Attendance record for today
  ↓ Updates checkOut, stores check-out coordinates
  ↓ Emits ATTENDANCE_OFFSITE_CLOCK_OUT audit event
```

---

*End of REQ-002A Product Design Specification*
*Status: Draft — Pending user approval before implementation*
