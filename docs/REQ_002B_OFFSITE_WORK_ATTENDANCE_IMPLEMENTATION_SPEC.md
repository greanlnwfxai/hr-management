# REQ-002B — Off-site Work Attendance Implementation Specification

**Type:** Technical Implementation Specification and Phased Implementation Plan
**Status:** Ready for implementation — pending resolution of open questions listed in §13
**Date:** 2026-06-28
**Author:** Claude Code (AI assistant)
**Task:** REQ-002B
**Depends on:** REQ-002A (approved product design)
**Supersedes implementation of:** `POST /attendance/clock-in` with `workMode=OFFSITE` (existing strict pre-approval branch)

---

## 1. Executive Summary

This document translates the approved REQ-002A Hybrid Model product design into a concrete technical implementation plan for the off-site work attendance feature. It identifies all files to be created or modified, specifies exact schema changes, API contracts, DTO validation, business rules, audit events, frontend changes for both STEP Connect and Admin Web, a full test plan, and a phased implementation schedule.

**No runtime code is changed in REQ-002B.** This is a specification document only.

---

## 2. Current Codebase Analysis

### 2.1 Files Affected by This Feature

#### Backend — `apps/api/`

| File | Change type | Notes |
|---|---|---|
| `prisma/schema.prisma` | Add enums + fields | Two new enums; ~12 new fields on `Attendance`; back-relations |
| `src/common/enums.ts` | Add enums | Mirror `AttendanceSource` and `AttendanceReviewStatus` (CLAUDE.md rule) |
| `src/attendance/attendance.service.ts` | Modify + extend | Fix clockOut bug; add offsite clock-in/out methods; add review methods |
| `src/attendance/attendance.module.ts` | Extend | Register new controller if split, or new service methods |
| `src/attendance/attendance.controller.ts` | Extend | Add new offsite routes, or create `OffsiteAttendanceController` |
| `src/attendance/dto/clock-in.dto.ts` | Extend | Add `workLocationName`, `reason` (new off-site fields) |
| `src/attendance/dto/clock-out.dto.ts` | Extend | Add lat/lon/accuracy fields (for off-site clock-out GPS storage) |
| `src/attendance/dto/query-attendance.dto.ts` | Extend | Add `attendanceSource`, `reviewStatus` filter fields |
| `src/attendance/dto/offsite-clock-in.dto.ts` | Create new | DTO dedicated to off-site check-in |
| `src/attendance/dto/offsite-clock-out.dto.ts` | Create new | DTO dedicated to off-site check-out |
| `src/attendance/dto/review-offsite-attendance.dto.ts` | Create new | DTO for approve/reject with optional note |
| `src/attendance/attendance.service.spec.ts` | Extend | New unit tests for all off-site paths |
| `src/attendance/attendance.controller.spec.ts` | Extend | New controller tests |
| `prisma/migrations/<timestamp>_add_offsite_attendance_fields/` | Create | Migration SQL for new schema |

#### Mobile — `apps/mobile/`

| File | Change type | Notes |
|---|---|---|
| `src/api/types.ts` | Extend | Add `AttendanceSource`, `AttendanceReviewStatus` types; extend `AttendanceRecord` |
| `src/api/client.ts` | Extend | Add `clockInOffsite()`, `clockOutOffsite()` API functions |
| `src/hooks/useAttendance.ts` | Modify | Remove auto-offsite logic from `performClockIn`; add outside-geofence detection |
| `src/hooks/useOffsiteAttendance.ts` | Create new | Hook for off-site clock-in/out flow, form state, GPS capture |
| `app/attendance.tsx` | Modify | Add outside-geofence state, off-site button, active off-site status card |
| `app/offsite-checkin.tsx` | Create new | Off-site check-in form screen |
| `app/offsite-checkout.tsx` | Create new | Off-site check-out screen |

#### Admin Web — `apps/web/`

| File | Change type | Notes |
|---|---|---|
| `lib/api.ts` (or equivalent) | Extend | Add offsite review API client functions |
| `app/(app)/attendance/offsite-review/page.tsx` | Create new | Off-site review page for HR admins |
| Navigation/sidebar component | Modify | Add "Off-site Review" link (HR_ADMIN / SUPER_ADMIN only) |

#### Documentation

| File | Change type | Notes |
|---|---|---|
| `docs/REQ_002B_OFFSITE_WORK_ATTENDANCE_IMPLEMENTATION_SPEC.md` | Create | This file |
| `docs/CTO_SUMMARY_REQ_002B.md` | Create | CTO summary |

---

## 3. Current Off-site Clock-in Logic (Pre-REQ-002B)

The existing `attendance.service.ts:clockIn()` (lines 67–87) has a dedicated branch for `workMode=OFFSITE`:

```typescript
if (dto.workMode === WorkMode.OFFSITE) {
  // GPS required; radius check skipped.
  // REQUIRES an APPROVED OffSiteRequest for today — throws 403 if absent.
  const approved = await this.prisma.offSiteRequest.findFirst({
    where: { employeeId, date, status: OffSiteStatus.APPROVED },
  });
  if (!approved) {
    throw new ForbiddenException('ไม่พบคำขอทำงานนอกสถานที่ที่อนุมัติแล้วสำหรับวันนี้');
  }
  offSiteRequestId = approved.id;
}
```

**This branch contradicts the REQ-002A hybrid model.** The new design allows unplanned off-site without a pre-approved request (Path 2 → PENDING_REVIEW). The existing branch must be **replaced in REQ-002C** by the new dedicated off-site check-in logic, and mobile must be migrated away from calling `POST /attendance/clock-in` with `workMode=OFFSITE` in REQ-002E.

### 3.1 Mobile Client Dependency

`apps/mobile/src/hooks/useAttendance.ts` (lines 106–113) currently auto-detects a planned off-site scenario and calls the regular `POST /attendance/clock-in` with `workMode: 'OFFSITE'`:

```typescript
const isOffSiteApproved = todayOffSite?.status === 'APPROVED';
await apiClockIn(token, {
  source: 'mobile',
  ...location,
  ...(isOffSiteApproved && { workMode: 'OFFSITE' }),
});
```

This migration path is critical:
- REQ-002C removes/replaces the `workMode=OFFSITE` branch from the existing endpoint and adds the new `POST /attendance/offsite/clock-in` endpoint.
- REQ-002E migrates mobile to the new endpoint and removes the `workMode: 'OFFSITE'` injection from `useAttendance`.
- Until REQ-002E is deployed, do not remove the old branch from `POST /attendance/clock-in` (it must be deprecated, not immediately deleted).
- Once REQ-002E is deployed, the old branch can be removed entirely.

---

## 4. Clock-out Geofence Bug — Precise Description and Fix

### 4.1 Bug Description

`attendance.service.ts:clockOut()` (line 138) calls `validateGeofence()` as its **very first action**, before even looking up the attendance record:

```typescript
async clockOut(userId: string, dto: ClockOutDto, ctx?: AttendanceAuditContext) {
  await this.validateGeofence(dto, 'CLOCK_OUT', ctx);   // ← called unconditionally
  const employeeId = await this.requireEmployeeId(userId);
  const date = this.todayUtc();
  const record = await this.prisma.attendance.findUnique(...);  // ← only here is workMode known
  ...
}
```

`validateGeofence()` is a no-op for non-mobile requests (`if (dto.source !== 'mobile') return;` at line 344). So **the bug only affects mobile source requests.** A mobile employee who checked in as OFFSITE will receive a geofence rejection on clock-out because the service applies the company radius check before it can inspect `record.workMode`.

### 4.2 Required Fix

The fix requires looking up the attendance record *before* calling `validateGeofence()`, then skipping geofence validation if the record is OFFSITE:

```typescript
async clockOut(userId: string, dto: ClockOutDto, ctx?) {
  const employeeId = await this.requireEmployeeId(userId);
  const date = this.todayUtc();
  const record = await this.prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });
  if (!record) throw new NotFoundException('No clock-in found for today');
  if (record.checkOut) throw new ConflictException('Already clocked out for today');

  // Only validate geofence for ONSITE records — OFFSITE clock-out is mobile-only
  // and must not require the company radius check.
  if ((record.workMode as string) !== WorkMode.OFFSITE) {
    await this.validateGeofence(dto, 'CLOCK_OUT', ctx);
  }
  // ... rest of clockOut
}
```

> **Note:** This fix is part of REQ-002C scope. It is also a bug that can be shipped independently if urgent (existing off-site employees are currently unable to clock out from mobile).

---

## 5. Proposed Database / Schema Changes

> **PDPA caution:** GPS column inclusion depends on resolution of REQ-002A Open Question #2 (see §13). The schema below reflects the recommended path (store lat/lon in the operational Attendance record). If OQ#2 is answered negatively, columns `checkIn/checkOutLatitude/Longitude` are removed and replaced with `checkInHasCoordinates / checkOutHasCoordinates BOOLEAN`.

### 5.1 New Enums (schema.prisma)

```prisma
enum AttendanceSource {
  COMPANY_GEOFENCE
  OFFSITE_PLANNED
  OFFSITE_UNPLANNED
}

enum AttendanceReviewStatus {
  AUTO_ACCEPTED
  PENDING_REVIEW
  APPROVED
  REJECTED
  MISSING_CHECKOUT
}
```

Both enums are **also mirrored in `src/common/enums.ts`** per the CLAUDE.md enum rule ("Enums for @IsEnum come from src/common/enums.ts, never directly from @prisma/client"). Services use the common enum values and map to Prisma types with `as unknown as Prisma...`.

### 5.2 Extended `Attendance` Model

```prisma
model Attendance {
  // ─── Existing fields (unchanged) ────────────────────────────────────────────
  id         String           @id @default(uuid())
  employeeId String
  employee   Employee         @relation(fields: [employeeId], references: [id])
  date       DateTime         @db.Date
  checkIn    DateTime?
  checkOut   DateTime?
  status     AttendanceStatus @default(PRESENT)
  workMode   WorkMode         @default(ONSITE)
  note       String?
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  // ─── New fields for REQ-002B ────────────────────────────────────────────────
  attendanceSource   AttendanceSource        @default(COMPANY_GEOFENCE)
  reviewStatus       AttendanceReviewStatus?

  // Review tracking (HR_ADMIN / SUPER_ADMIN)
  reviewedById       String?
  reviewedBy         Employee?  @relation("AttendanceReviewer", fields: [reviewedById], references: [id])
  reviewedAt         DateTime?
  reviewNote         String?

  // Off-site request link (populated when attendanceSource = OFFSITE_PLANNED)
  offSiteRequestId   String?
  offSiteRequest     OffSiteRequest? @relation(fields: [offSiteRequestId], references: [id])

  // Work location context (required when workMode = OFFSITE)
  workLocationName   String?       @db.VarChar(200)

  // GPS snapshot at check-in (pending OQ#2 approval)
  checkInLatitude    Float?
  checkInLongitude   Float?

  // GPS snapshot at check-out (pending OQ#2 approval)
  checkOutLatitude   Float?
  checkOutLongitude  Float?

  @@unique([employeeId, date])
  @@index([date])
  @@index([status])
  @@index([attendanceSource])
  @@index([reviewStatus])
  @@map("attendances")
}
```

> **Field type note:** `Float?` is used for lat/lon, consistent with `GeofenceConfig.latitude / longitude` (existing schema). The REQ-002A conceptual sketch used `Decimal`; this spec aligns to the existing codebase type choice.

### 5.3 Back-relation Changes on `Employee` Model

Add to `Employee`:
```prisma
reviewedAttendances  Attendance[]   @relation("AttendanceReviewer")
```

### 5.4 Back-relation on `OffSiteRequest` Model

Add to `OffSiteRequest`:
```prisma
attendances  Attendance[]
```

### 5.5 New Prisma Indexes

| Index | Column(s) | Purpose |
|---|---|---|
| `@@index([attendanceSource])` | `attendanceSource` | Filter by source in admin review |
| `@@index([reviewStatus])` | `reviewStatus` | Filter pending records |

### 5.6 Migration Strategy

Migration is additive only (new columns with defaults or nullable). No existing row data is mutated:
- `attendanceSource DEFAULT COMPANY_GEOFENCE` — all existing rows get COMPANY_GEOFENCE
- All new fields are nullable or have defaults
- Safe to run with zero downtime on production

---

## 6. API Design

### 6.1 Controller Architecture Decision

**Recommendation: Add off-site routes to the existing `AttendanceController` under the `/attendance` prefix**, using nested paths (`/attendance/offsite/*`). This avoids a new module, keeps RBAC pattern identical to existing code, and keeps Swagger organized by the `Attendance` tag.

A dedicated `OffsiteAttendanceController` can be considered if the off-site method count grows to > 8, but for v1 scoped routes, a single controller is cleaner.

### 6.2 New Employee Endpoints

#### `POST /attendance/offsite/clock-in`

**Guard:** `JwtAuthGuard`, `RolesGuard` (all roles — EMPLOYEE can call this for themselves)

**DTO — `OffsiteClockInDto`:**

```typescript
class OffsiteClockInDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;        // Required
  @IsNumber() @Min(-180) @Max(180) longitude: number;     // Required
  @IsNumber() @IsPositive() accuracy: number;             // Required

  @IsString() @MinLength(1) @MaxLength(200) workLocationName: string;  // Required always

  @IsString() @MinLength(3) @MaxLength(500) reason: string;
  // Required for OFFSITE_UNPLANNED.
  // Pending OQ#3: may be optional for OFFSITE_PLANNED.
  // V1 safe default: required for both paths.

  @IsOptional() @IsString() @MaxLength(500) note?: string;  // Free note, optional
}
```

**Business logic:**
1. Require `employeeId` from JWT user
2. Validate GPS fields present and within bounds
3. Validate `workLocationName` present (always required)
4. Validate `reason` present — required in v1 for both paths (see OQ#3 note)
5. Check for existing attendance record today → throw 409 if already clocked in
6. Look up `OffSiteRequest` with `status = APPROVED` for this `employeeId` and today's Bangkok date
7. If found: `attendanceSource = OFFSITE_PLANNED`, `reviewStatus = AUTO_ACCEPTED`, `offSiteRequestId = request.id`
8. If not found: `attendanceSource = OFFSITE_UNPLANNED`, `reviewStatus = PENDING_REVIEW`, `offSiteRequestId = null`
9. Create `Attendance` record:
   - `workMode = OFFSITE`
   - `attendanceSource`, `reviewStatus` from step 7/8
   - `workLocationName = dto.workLocationName`
   - `checkInLatitude = dto.latitude`, `checkInLongitude = dto.longitude` (pending OQ#2)
   - `checkIn = now`, `date = todayBangkok()`
10. Emit `ATTENDANCE_OFFSITE_CLOCK_IN` audit event
11. Return created attendance record

**Response:** 201 Created — Attendance record with new off-site fields

**Errors:**
- 409 Conflict: Already checked in today
- 422 Unprocessable: Missing GPS or missing workLocationName or missing reason

---

#### `POST /attendance/offsite/clock-out`

**Guard:** `JwtAuthGuard`, `RolesGuard` (all roles)

**DTO — `OffsiteClockOutDto`:**

```typescript
class OffsiteClockOutDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;       // Required
  @IsNumber() @Min(-180) @Max(180) longitude: number;    // Required
  @IsNumber() @IsPositive() accuracy: number;            // Required

  @IsOptional() @IsString() @MaxLength(500) note?: string;  // Optional checkout note
}
```

**Business logic:**
1. Require `employeeId` from JWT user
2. Validate GPS fields present
3. Look up today's attendance record for this employee
4. If not found: throw 404 "No off-site check-in found for today"
5. If `record.workMode !== OFFSITE`: throw 422 "No off-site check-in found — use normal clock-out"
6. If `record.checkOut !== null`: throw 409 "Already checked out today"
7. **Do NOT call `validateGeofence()`** — off-site clock-out bypasses company radius check
8. Update record: `checkOut = now`, `checkOutLatitude = dto.latitude`, `checkOutLongitude = dto.longitude` (pending OQ#2)
9. Emit `ATTENDANCE_OFFSITE_CLOCK_OUT` audit event
10. Return updated attendance record

**Errors:**
- 404 Not Found: No check-in found for today
- 409 Conflict: Already checked out
- 422 Unprocessable: Missing GPS; or today's record is not OFFSITE

---

### 6.3 Admin Review Endpoints

#### `GET /attendance/offsite`

**Guard:** `JwtAuthGuard`, `RolesGuard(HR_ADMIN, SUPER_ADMIN)`

**Query params (`QueryOffsiteAttendanceDto`):**

```typescript
class QueryOffsiteAttendanceDto {
  @IsOptional() @IsEnum(AttendanceReviewStatus) reviewStatus?: AttendanceReviewStatus;
  @IsOptional() @IsEnum(AttendanceSource) attendanceSource?: AttendanceSource;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsString() startDate?: string;  // YYYY-MM-DD
  @IsOptional() @IsString() endDate?: string;    // YYYY-MM-DD
  @IsOptional() @IsString() workLocationName?: string;  // partial search
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}
```

**Response:** Paginated list of OFFSITE attendance records with employee, review status, location name, reason, reviewer info.

---

#### `PATCH /attendance/offsite/:id/approve`

**Guard:** `JwtAuthGuard`, `RolesGuard(HR_ADMIN, SUPER_ADMIN)`

**DTO:**

```typescript
class ApproveOffsiteAttendanceDto {
  @IsOptional() @IsString() @MaxLength(500) reviewNote?: string;
}
```

**Business logic:**
1. Find attendance record by id; 404 if not found
2. Verify `record.workMode === OFFSITE` — 422 if not an off-site record
3. Verify `record.reviewStatus === PENDING_REVIEW` — 400 if already reviewed
4. Update: `reviewStatus = APPROVED`, `reviewedById = currentEmployeeId`, `reviewedAt = now`, `reviewNote = dto.reviewNote`
5. Emit `ATTENDANCE_OFFSITE_APPROVED` audit event
6. Return updated record

---

#### `PATCH /attendance/offsite/:id/reject`

**Guard:** `JwtAuthGuard`, `RolesGuard(HR_ADMIN, SUPER_ADMIN)`

**DTO:**

```typescript
class RejectOffsiteAttendanceDto {
  @IsOptional() @IsString() @MaxLength(500) reviewNote?: string;
}
```

**Business logic:**
1. Find attendance record by id; 404 if not found
2. Verify `record.workMode === OFFSITE` — 422 if not an off-site record
3. Verify `record.reviewStatus === PENDING_REVIEW` — 400 if already reviewed
4. Update: `reviewStatus = REJECTED`, `reviewedById = currentEmployeeId`, `reviewedAt = now`, `reviewNote = dto.reviewNote`
5. Rejected record is **retained** in the database — not deleted
6. Emit `ATTENDANCE_OFFSITE_REJECTED` audit event
7. Return updated record

> **Reject behavior (REQ-002A OQ#6 consideration):** In v1, rejection marks the `reviewStatus` as REJECTED and retains the record. The `AttendanceStatus` (PRESENT/LATE/ABSENT) remains as originally set. HR must manually adjust the employee's status separately. Automatic ABSENT conversion on rejection is deferred to v2.

---

### 6.4 RBAC Summary

| Endpoint | EMPLOYEE | MANAGER | HR_ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| `POST /attendance/offsite/clock-in` | ✅ (own) | ✅ (own) | ✅ (own) | ✅ (own) |
| `POST /attendance/offsite/clock-out` | ✅ (own) | ✅ (own) | ✅ (own) | ✅ (own) |
| `GET /attendance/offsite` | ❌ | ❌ | ✅ | ✅ |
| `PATCH /attendance/offsite/:id/approve` | ❌ | ❌ | ✅ | ✅ |
| `PATCH /attendance/offsite/:id/reject` | ❌ | ❌ | ✅ | ✅ |

Manager read-only access deferred to v1.1 (blocked on HOTFIX-T089A manager-scope hardening).

---

## 7. Business Rules

### 7.1 Off-site Check-in Rules

| Rule | Implementation |
|---|---|
| Cannot check in twice on same day | Existing `@@unique([employeeId, date])` + 409 response |
| GPS is always required | `latitude`, `longitude`, `accuracy` all required in DTO |
| `workLocationName` always required | `@IsString()` `@MinLength(1)` in DTO — not optional |
| `reason` required in v1 (see OQ#3) | `@IsString()` `@MinLength(3)` in DTO |
| Planned path: APPROVED OffSiteRequest exists for today (Bangkok date) | `status = AUTO_ACCEPTED`, linked via FK |
| Unplanned path: No approved request | `status = PENDING_REVIEW`, `offSiteRequestId = null` |
| Clock-in creates `workMode = OFFSITE` | Set in service, not in DTO |
| Date must use Bangkok calendar day | Use `todayBangkok()` helper (see §8) |

### 7.2 Off-site Check-out Rules

| Rule | Implementation |
|---|---|
| Cannot check out without an OFFSITE check-in | 404 "No off-site check-in found for today" |
| Cannot check out if already checked out | 409 Conflict |
| Off-site check-out must NOT validate company geofence | Skip `validateGeofence()` when `record.workMode === OFFSITE` |
| GPS required at check-out | `latitude`, `longitude`, `accuracy` required in DTO |
| GPS stored in checkout coords | `checkOutLatitude = dto.latitude`, `checkOutLongitude = dto.longitude` (pending OQ#2) |

### 7.3 Review Rules

| Rule | Implementation |
|---|---|
| Only `PENDING_REVIEW` records can be approved/rejected | 400 if `reviewStatus !== PENDING_REVIEW` |
| `AUTO_ACCEPTED` records are read-only in review | HR can view; approve/reject actions blocked |
| Rejected records are retained | No deletion; `reviewStatus = REJECTED` |
| Reviewer identity captured | `reviewedById`, `reviewedAt` set at review time |
| Manager cannot review attendance in v1 | `@Roles(HR_ADMIN, SUPER_ADMIN)` guard only |

---

## 8. Timezone Handling — Bangkok Date for OffSiteRequest Matching

### 8.1 The Problem

The existing `todayUtc()` helper:

```typescript
private todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
```

Returns the UTC calendar date. During the window **00:00–06:59 Bangkok time** (i.e., 17:00–23:59 UTC of the previous day), this returns yesterday's Bangkok date. An employee working the early Bangkok morning would find no matching `OffSiteRequest` for "today" because the UTC date is one day behind.

Both `attendance.date` and the `OffSiteRequest.date` lookup currently use the UTC date, so they are *mutually consistent* — but both are wrong relative to Bangkok calendar day during that window.

### 8.2 Required Fix

Introduce a `todayBangkok()` helper, mirroring the pattern already used by `isLateInBangkok()`:

```typescript
private todayBangkok(): Date {
  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, fixed — no DST in Thailand
  const bangkokNow = new Date(Date.now() + BANGKOK_OFFSET_MS);
  return new Date(Date.UTC(
    bangkokNow.getUTCFullYear(),
    bangkokNow.getUTCMonth(),
    bangkokNow.getUTCDate(),
  ));
}
```

Use `todayBangkok()` for:
1. `attendance.date` in `clockInOffsite()`
2. `OffSiteRequest` date match in `clockInOffsite()`

> **Behavior change note:** Switching `attendance.date` from `todayUtc()` to `todayBangkok()` changes which calendar date a pre-7am Bangkok check-in is attributed to. For off-site check-ins only (OFFSITE_PLANNED and OFFSITE_UNPLANNED), this is the correct behavior. For the existing ONSITE clock-in, leave `todayUtc()` unchanged to preserve backward compatibility until a separate decision is made.

### 8.3 OffSiteRequest Single-Use Semantics

One `OffSiteRequest` may match one `Attendance` per day (via the `@@unique([employeeId, date])` constraint on Attendance). Multiple `OffSiteRequest` records for the same employee/date are blocked by the `app-level overlap guard` in `off-site.service.ts` (line 71). There is no FK enforcement preventing multiple `Attendance` records from referencing the same `OffSiteRequest`, but the unique date constraint on Attendance makes this impossible in practice.

---

## 9. Audit Events

### 9.1 Event List

| Event | Trigger | Actor |
|---|---|---|
| `ATTENDANCE_OFFSITE_CLOCK_IN` | Successful off-site check-in | Employee |
| `ATTENDANCE_OFFSITE_CLOCK_OUT` | Successful off-site check-out | Employee |
| `ATTENDANCE_OFFSITE_APPROVED` | HR approves unplanned off-site attendance | HR_ADMIN / SUPER_ADMIN |
| `ATTENDANCE_OFFSITE_REJECTED` | HR rejects unplanned off-site attendance | HR_ADMIN / SUPER_ADMIN |
| `ATTENDANCE_OFFSITE_CHECKOUT_FILLED` | HR fills missing check-out time (v1.1) | HR_ADMIN / SUPER_ADMIN |

### 9.2 Metadata — `ATTENDANCE_OFFSITE_CLOCK_IN`

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
  "hasNote": true | false,
  "clockInAt": "2026-06-28T08:45:00.000Z"
}
```

> **GPS accuracy bucket logic:**
> - `accuracy <= config.maxAccuracyMeters`: `"ACCEPTABLE"`
> - `accuracy > config.maxAccuracyMeters`: `"POOR"`
> - `accuracy` absent or null: `"UNKNOWN"`
>
> The raw `accuracy` number is in `AUDIT_SENSITIVE_KEYS` (`audit-log.types.ts` line 30) and will be auto-stripped. Use `accuracyBucket` string instead.

### 9.3 Metadata — `ATTENDANCE_OFFSITE_CLOCK_OUT`

```json
{
  "attendanceId": "<uuid>",
  "employeeId": "<uuid>",
  "date": "2026-06-28",
  "workMode": "OFFSITE",
  "reviewStatus": "AUTO_ACCEPTED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED",
  "hasCoordinates": true,
  "accuracyBucket": "ACCEPTABLE" | "POOR" | "UNKNOWN",
  "clockOutAt": "2026-06-28T17:30:00.000Z"
}
```

### 9.4 Metadata — `ATTENDANCE_OFFSITE_APPROVED` / `ATTENDANCE_OFFSITE_REJECTED`

```json
{
  "attendanceId": "<uuid>",
  "employeeId": "<uuid>",
  "date": "2026-06-28",
  "previousReviewStatus": "PENDING_REVIEW",
  "newReviewStatus": "APPROVED" | "REJECTED",
  "reviewedById": "<reviewer-employee-uuid>",
  "hasReviewNote": true | false
}
```

### 9.5 Privacy Constraints (from `AUDIT_SENSITIVE_KEYS`)

The following are stripped automatically by `audit-log.sanitizer.ts` and must NOT appear as keys in any audit metadata:

| Forbidden key | Alternative |
|---|---|
| `latitude` | `hasCoordinates: boolean` |
| `longitude` | `hasCoordinates: boolean` |
| `accuracy` | `accuracyBucket: 'ACCEPTABLE' | 'POOR' | 'UNKNOWN'` |
| `distance` | Not included in v1 at all |
| `note` content | `hasNote: boolean` |
| `reviewNote` content | `hasReviewNote: boolean` |

All audit writes use the existing `recordBestEffort` pattern (failure never suppresses the primary operation).

---

## 10. STEP Connect Mobile UX Implementation Plan

### 10.1 Geofence State Detection

STEP Connect must determine whether the user is inside or outside the company geofence before rendering attendance buttons. The geofence config is available from `GET /attendance/geofence-location` (already implemented).

Mobile logic (in `useAttendance` hook or a new `useOffsiteAttendance` hook):
1. Fetch geofence config once on screen mount (cached, not continuous polling)
2. Capture current GPS via `getLocation()` from `useDeviceLocation`
3. Compute distance using existing `apps/mobile/src/utils/haversine.ts`
4. Determine state: `inside` | `outside` | `gps_unavailable` | `geofence_not_configured`

> The app's geofence check is for **UI pre-screening only** — the backend remains the authority. The app must not suppress the off-site UI even if the distance computation says "inside" and backend rejects for a different reason.

### 10.2 Attendance Screen State Machine

| State | UI shown |
|---|---|
| `not_checked_in` + inside geofence | "ลงเวลาเข้า" (normal) button enabled |
| `not_checked_in` + outside geofence | "ลงเวลาเข้า (นอกสถานที่)" button; normal button disabled with message |
| `not_checked_in` + GPS unavailable | Both buttons disabled; GPS error message |
| `offsite_checked_in` + no checkout | Active off-site status card + "ลงเวลาออก (นอกสถานที่)" button |
| `onsite_checked_in` + no checkout | Existing normal "ลงเวลาออก" button |
| `checked_out` | Read-only record display |

### 10.3 Off-site Check-in Screen (`app/offsite-checkin.tsx`)

**Navigation:** Tapping "ลงเวลาเข้า (นอกสถานที่)" pushes `offsite-checkin` screen.

**Required UI elements:**

```
┌─────────────────────────────────┐
│  ลงเวลาเข้า (นอกสถานที่)        │
│                                 │
│  📍 [GPS STATUS INDICATOR]      │  ← "พร้อมใช้งาน" or "กำลังอ่านตำแหน่ง..."
│  [มีคำขออนุมัติสำหรับวันนี้ ✓]  │  ← shown if todayOffSite?.status === 'APPROVED'
│  [บันทึกจะถูกส่ง HR ตรวจสอบ]   │  ← shown if unplanned path
│                                 │
│  สถานที่ทำงาน *                 │
│  [TextInput maxLength=200]      │
│                                 │
│  เหตุผล *                       │
│  [TextInput multiline max=500]  │
│                                 │
│  [ยืนยันลงเวลาเข้า]             │  ← calls POST /attendance/offsite/clock-in
└─────────────────────────────────┘
```

**Validation (client-side):**
- `workLocationName` must not be empty
- `reason` must not be empty and at least 3 chars (pending OQ#3)
- GPS must be available before confirm button is enabled

**API call:** `POST /attendance/offsite/clock-in` with all GPS fields + `workLocationName` + `reason`

### 10.4 Active Off-site Status Card (in `attendance.tsx`)

After successful off-site check-in, the attendance header area shows:

```
┌─────────────────────────────────┐
│  📍 กำลังทำงานนอกสถานที่        │
│  [นอกสถานที่]  [รอ HR]  OR  [อนุมัติ] │  ← workMode + reviewStatus badges
│  เวลาเข้า: 08:45               │
│  สถานที่: [workLocationName]    │
│                                 │
│  [ลงเวลาออก (นอกสถานที่)]       │  ← navigates to offsite-checkout screen
└─────────────────────────────────┘
```

Badge colors:
- "นอกสถานที่" (workMode): teal (`#0d9488`)
- "รอ HR ตรวจสอบ" (PENDING_REVIEW): amber (`#d97706`)
- "อนุมัติแล้ว" (AUTO_ACCEPTED / APPROVED): green (`#16a34a`)
- "ไม่อนุมัติ" (REJECTED): red (`#dc2626`)

### 10.5 Off-site Check-out Screen (`app/offsite-checkout.tsx`)

```
┌─────────────────────────────────┐
│  ลงเวลาออก (นอกสถานที่)         │
│                                 │
│  📍 [GPS STATUS INDICATOR]      │
│                                 │
│  หมายเหตุ (ไม่จำเป็น)           │
│  [TextInput optional max=500]   │
│                                 │
│  [ยืนยันลงเวลาออก]              │  ← calls POST /attendance/offsite/clock-out
└─────────────────────────────────┘
```

### 10.6 Mobile API Client Changes

New functions needed in `apps/mobile/src/api/client.ts`:

```typescript
export async function clockInOffsite(
  token: string,
  payload: OffsiteClockInPayload,
): Promise<AttendanceRecord>

export async function clockOutOffsite(
  token: string,
  payload: OffsiteClockOutPayload,
): Promise<AttendanceRecord>
```

New types needed in `apps/mobile/src/api/types.ts`:

```typescript
export type AttendanceSource = 'COMPANY_GEOFENCE' | 'OFFSITE_PLANNED' | 'OFFSITE_UNPLANNED';
export type AttendanceReviewStatus =
  | 'AUTO_ACCEPTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'MISSING_CHECKOUT';

// Extend AttendanceRecord
export interface AttendanceRecord {
  // ... existing fields ...
  attendanceSource?: AttendanceSource;
  reviewStatus?: AttendanceReviewStatus;
  workLocationName?: string | null;
}

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
```

### 10.7 Migration from Old Off-site Path

In REQ-002E, the `useAttendance.ts` hook must remove the auto-offsite injection:

```typescript
// REMOVE this block from performClockIn():
const isOffSiteApproved = todayOffSite?.status === 'APPROVED';
...(isOffSiteApproved && { workMode: 'OFFSITE' }),
```

This auto-injection was the mechanism that drove the old strict pre-approval flow via `POST /attendance/clock-in`. After REQ-002E, off-site check-in uses the dedicated `POST /attendance/offsite/clock-in` endpoint, and the regular `POST /attendance/clock-in` is ONSITE-only.

### 10.8 Off-site History in History Timeline

Extend the existing `HistoryTimeline` component in `attendance.tsx` to show:
- `[นอกสถานที่]` badge when `rec.workMode === 'OFFSITE'` (already exists)
- `reviewStatus` badge alongside: amber for PENDING_REVIEW, green for AUTO_ACCEPTED/APPROVED, red for REJECTED
- `workLocationName` as subtitle in the timeline card

---

## 11. Admin Web Off-site Review UI Implementation Plan

### 11.1 New Page: `/attendance/offsite-review`

**Route:** `apps/web/app/(app)/attendance/offsite-review/page.tsx`

**Access:** HR_ADMIN, SUPER_ADMIN only. If EMPLOYEE or MANAGER navigates directly, redirect to `/attendance`.

**Layout:** Standard HR management page layout matching existing patterns (table with filters, card for actions).

### 11.2 Filters

```
Date range:   [startDate picker] → [endDate picker]
Employee:     [text search by name or employeeCode]
Review status: [dropdown: All / Pending / Auto-accepted / Approved / Rejected / Missing Checkout]
Source:       [dropdown: All / Planned / Unplanned]
Location:     [text search on workLocationName]
```

### 11.3 Table Columns

| Column | Source field | Notes |
|---|---|---|
| Employee | `employee.firstName + lastName + employeeCode` | |
| Date | `date` | Bangkok formatted |
| Check-in | `checkIn` | Time formatted |
| Check-out | `checkOut` | Time formatted or "—" |
| Location | `workLocationName` | Truncated at 40 chars |
| Source | `attendanceSource` | "Planned" / "Unplanned" badge |
| Review Status | `reviewStatus` | Color-coded badge |
| Linked Request | `offSiteRequest.id` | "Yes" / "—" |
| Reviewer | `reviewedBy.firstName + lastName` | If reviewed |
| Actions | — | Approve / Reject buttons (if PENDING_REVIEW) |

### 11.4 Review Actions

**Approve button:** Opens a modal with optional `reviewNote` textarea → calls `PATCH /attendance/offsite/:id/approve`

**Reject button:** Opens a modal with optional `reviewNote` textarea → calls `PATCH /attendance/offsite/:id/reject`

Both actions refresh the row in the table on success. Show a toast notification.

**Only shown when `reviewStatus === PENDING_REVIEW`.** Auto-accepted and already-reviewed records show read-only status badges.

### 11.5 Admin Navigation

Add "Off-site Review" link to the attendance section of the sidebar/navigation component, visible only to HR_ADMIN and SUPER_ADMIN.

---

## 12. Test Plan

### 12.1 Backend Unit Tests (`attendance.service.spec.ts`)

| Test case | Expected behavior |
|---|---|
| Planned off-site check-in (approved request exists for today Bangkok) | Creates attendance with `OFFSITE_PLANNED`, `AUTO_ACCEPTED`, FK set |
| Unplanned off-site check-in (no approved request today) | Creates attendance with `OFFSITE_UNPLANNED`, `PENDING_REVIEW`, FK null |
| Off-site clock-out does NOT call `validateGeofence()` | `validateGeofence` mock not called when `record.workMode === OFFSITE` |
| Off-site clock-out with mobile source, inside company area | Succeeds (no radius check) |
| Cannot double check-in (existing attendance record today) | 409 Conflict |
| Cannot off-site check-out without any check-in | 404 Not Found |
| Cannot off-site check-out with ONSITE check-in | 422 or redirect to regular clock-out |
| Cannot off-site check-out twice | 409 Conflict |
| Missing `workLocationName` | 422 Validation error |
| Missing `reason` | 422 Validation error |
| Missing latitude/longitude/accuracy | 422 Validation error |
| Raw GPS not present in `ATTENDANCE_OFFSITE_CLOCK_IN` audit metadata | Audit metadata `latitude` key absent |
| Raw GPS not present in `ATTENDANCE_OFFSITE_CLOCK_OUT` audit metadata | Audit metadata `longitude` key absent |
| HR_ADMIN can approve PENDING_REVIEW record | `reviewStatus = APPROVED`, `reviewedById` set |
| HR_ADMIN can reject PENDING_REVIEW record | `reviewStatus = REJECTED`, retained in DB |
| SUPER_ADMIN can approve | Same as HR_ADMIN |
| EMPLOYEE cannot approve/reject (role guard) | 403 Forbidden |
| MANAGER cannot approve/reject (role guard) | 403 Forbidden |
| Cannot approve record that is already APPROVED | 400 Bad Request |
| Cannot approve record that is AUTO_ACCEPTED | 400 Bad Request |
| Rejected attendance remains in database | Record exists with `REJECTED` status |
| Bangkok date matching: pre-7am Bangkok UTC previous day | Uses Bangkok date, matches correct OffSiteRequest date |
| Approved request for a different date does not match | 422 or unplanned path taken |

### 12.2 Backend Controller Tests (`attendance.controller.spec.ts`)

| Test case | Expected behavior |
|---|---|
| `POST /attendance/offsite/clock-in` returns 201 | Created response with attendance record |
| `POST /attendance/offsite/clock-out` returns 200 | Updated attendance record |
| `GET /attendance/offsite` requires HR_ADMIN | 403 for EMPLOYEE/MANAGER |
| `PATCH /attendance/offsite/:id/approve` requires HR_ADMIN | 403 for EMPLOYEE/MANAGER |
| `PATCH /attendance/offsite/:id/reject` requires HR_ADMIN | 403 for EMPLOYEE/MANAGER |

### 12.3 Frontend Tests — STEP Connect

| Test case | Expected behavior |
|---|---|
| Outside-geofence state shows off-site button | Off-site check-in button visible |
| Inside-geofence state hides off-site button | Off-site button not rendered |
| Submit without `workLocationName` shows error | Inline validation error shown |
| Submit without `reason` shows error | Inline validation error shown |
| GPS unavailable disables confirm button | Button disabled, GPS error message shown |
| Successful off-site check-in shows active status card | Card shows "นอกสถานที่" + "รอ HR ตรวจสอบ" badges |
| `AUTO_ACCEPTED` record shows green "อนุมัติแล้ว" badge | Green badge not amber |
| History timeline shows reviewStatus badges for OFFSITE records | Correct badge for each status |
| Off-site check-out succeeds | Status card updates to show checkout time |

### 12.4 Frontend Tests — Admin Web

| Test case | Expected behavior |
|---|---|
| Off-site review page loads for HR_ADMIN | Table renders, filters available |
| EMPLOYEE cannot access page | Redirect or 403 |
| Approve action updates row status | Row shows "อนุมัติแล้ว" badge after approve |
| Reject action updates row status | Row shows "ไม่อนุมัติ" badge after reject |
| Filters by reviewStatus work | Filtering to PENDING_REVIEW shows only pending |
| Filters by date range work | Date filter limits rows shown |

---

## 13. Open Questions — Blocking or Advisory

These carry forward from REQ-002A. The ones marked **[BLOCKS IMPLEMENTATION]** must be resolved before the relevant implementation phase can begin.

| # | Question | Impact | Blocking? |
|---|---|---|---|
| OQ#1 | GPS accuracy threshold for off-site: same 100m limit as normal, or looser (e.g. 200m)? | DTO validation threshold; `accuracyBucket` cutoff | Advisory (default to same 100m) |
| OQ#2 | Store raw lat/lon in `Attendance` table? PDPA-aligned? | Whether `checkIn/checkOutLatitude/Longitude` columns exist at all | **BLOCKS REQ-002C schema** |
| OQ#3 | Is `reason` mandatory for Path 1 (planned) check-in, or optional? | DTO validation; UX form | Advisory (v1 safe default: required for both) |
| OQ#4 | Missing check-out auto-close time: 23:59 Bangkok or employee's scheduled end time? | Background job config; MISSING_CHECKOUT trigger | Blocks midnight job (REQ-002D if included) |
| OQ#5 | Manager read-only scope in v1: should MANAGER see team off-site records, or HR_ADMIN+ only until v1.1? | `GET /attendance/offsite` RBAC | Advisory (default HR_ADMIN+ only) |
| OQ#6 | Reject behavior: record stays REJECTED, or auto-marks employee ABSENT? | `rejectOffsiteAttendance()` side effects | Advisory (v1 default: retain, no auto-ABSENT) |

---

## 14. Implementation Phases

### REQ-002C — Backend Schema + Off-site Attendance API Foundation

**Scope:**
- Add `AttendanceSource` and `AttendanceReviewStatus` enums to `schema.prisma` and `common/enums.ts`
- Add new fields to `Attendance` model in schema (GPS columns conditional on OQ#2)
- Generate Prisma migration
- Fix the `clockOut()` geofence bug (mobile off-site clock-out fails pre-fix)
- Deprecate `workMode=OFFSITE` branch in existing `POST /attendance/clock-in` (leave in-place until REQ-002E mobile migration)
- Add `clockInOffsite()` service method with Hybrid Model logic
- Add `clockOutOffsite()` service method (no geofence call)
- Update `ATTENDANCE_SELECT` to include new fields
- Add `POST /attendance/offsite/clock-in` and `POST /attendance/offsite/clock-out` routes
- Unit tests for new service methods

**Risks:** Schema migration with new columns on `attendances` table; must be tested on a staging DB before production.

---

### REQ-002D — Audit Integration + Admin Review API

**Scope:**
- Add `ATTENDANCE_OFFSITE_CLOCK_IN`, `ATTENDANCE_OFFSITE_CLOCK_OUT` audit events in service methods (from REQ-002C)
- Add `findOffsiteAttendance()` service method with filters
- Add `approveOffsiteAttendance()` service method
- Add `rejectOffsiteAttendance()` service method
- Add `ATTENDANCE_OFFSITE_APPROVED`, `ATTENDANCE_OFFSITE_REJECTED` audit events
- Add admin endpoints: `GET /attendance/offsite`, `PATCH /attendance/offsite/:id/approve`, `PATCH /attendance/offsite/:id/reject`
- Controller and service unit tests for review flow

**Depends on:** REQ-002C (schema + service foundation)

---

### REQ-002E — STEP Connect Off-site UX

**Scope:**
- Add `AttendanceSource` and `AttendanceReviewStatus` types to `apps/mobile/src/api/types.ts`
- Extend `AttendanceRecord` type with new fields
- Add `clockInOffsite()` and `clockOutOffsite()` to `apps/mobile/src/api/client.ts`
- Create `apps/mobile/app/offsite-checkin.tsx` screen
- Create `apps/mobile/app/offsite-checkout.tsx` screen
- Modify `apps/mobile/src/hooks/useAttendance.ts`:
  - Add geofence distance check for outside-geofence state
  - Remove `workMode: 'OFFSITE'` auto-injection from `performClockIn`
- Modify `apps/mobile/app/attendance.tsx`:
  - Add outside-geofence detection state
  - Show off-site check-in button when outside geofence
  - Show active off-site status card when `today.workMode === 'OFFSITE'`
  - Show review status badge on attendance history items
- Frontend tests for all new screens/states

**Depends on:** REQ-002C + REQ-002D (API endpoints must be deployed first)

---

### REQ-002F — Admin Web Off-site Review UI

**Scope:**
- Create `apps/web/app/(app)/attendance/offsite-review/page.tsx`
- Add API client functions for off-site review endpoints
- Add navigation link for HR_ADMIN / SUPER_ADMIN
- Frontend tests for review page

**Depends on:** REQ-002C + REQ-002D

**Can be parallelized with REQ-002E** (both depend on the same backend phases).

---

### REQ-002G — Runtime Verification / QA

**Scope:**
- Run `./scripts/verify.sh`, `./scripts/docker-verify.sh`, `./scripts/api-smoke-test.sh`
- Run `./scripts/security-review.sh`
- Manual end-to-end QA:
  - Path 1 (planned): submit OffSiteRequest → approve → off-site check-in → verify AUTO_ACCEPTED → check-out
  - Path 2 (unplanned): off-site check-in without request → verify PENDING_REVIEW → HR approve → verify APPROVED
  - Verify old normal ONSITE clock-in still works (regression)
  - Verify off-site clock-out bypasses geofence check
  - Verify audit log for all off-site events — no GPS in metadata
- Smoke test of Admin Web review page
- Docker stack health check

**Depends on:** REQ-002C + REQ-002D + REQ-002E + REQ-002F

---

### REQ-002H — HR-Knowledge & ADR Sync

**Scope:**
- Update HR-Knowledge docs to reflect hybrid off-site model
- Create ADR for hybrid off-site attendance model (see §15 for proposed title)
- Update `API_ROUTES.md` or `API_DOCUMENTATION.md` with new endpoints
- Update `MOBILE_ATTENDANCE_FOUNDATION.md` to reflect new clock-in flow

**Depends on:** REQ-002G (final implementation confirmed working)

---

## 15. Proposed ADR Title

If the technical decision (hybrid off-site model replacing strict pre-approval, GPS stored in Attendance operational record) warrants an ADR, the recommended title is:

> **ADR: Hybrid Off-site Attendance Model with GPS in Operational Record**

The ADR would capture: (1) the decision to add OFFSITE_UNPLANNED path alongside OFFSITE_PLANNED, (2) the decision to store raw GPS in the `attendances` table rather than only the audit log, and (3) the rationale for Bangkok-timezone date matching. The ADR file is not created in REQ-002B.

---

## 16. Risk Analysis

| Risk | Severity | Mitigation |
|---|---|---|
| **Off-site clock-out bug** — employees with existing OFFSITE attendance cannot clock out from mobile today | HIGH | Fix is included in REQ-002C; can be shipped independently as a hotfix if urgent |
| **Schema migration safety** — adding nullable columns to `attendances` table in production | MEDIUM | Migration is additive-only; no row updates; tested on staging first |
| **Timezone mismatch** — Bangkok date vs UTC date for OffSiteRequest matching | MEDIUM | `todayBangkok()` helper introduced in REQ-002C; behavior change in 00:00–07:00 BKK window |
| **Old workMode=OFFSITE path conflict** — mobile still calls old endpoint until REQ-002E | MEDIUM | Deprecate branch (keep but log deprecation warning) until REQ-002E lands; deploy mobile in REQ-002E |
| **GPS privacy (PDPA)** — raw lat/lon in Attendance table | MEDIUM | Blocked on OQ#2 approval; if rejected, use `hasCoordinates: boolean` instead |
| **Geofence bypass perception** — off-site path could be seen as bypassing security | MEDIUM | Off-site is a separate, audited code path with GPS+reason+review requirements; documented explicitly |
| **Manager scope risk** — manager review of attendance deferred, but manager can still approve OffSiteRequest | LOW | Acceptable: manager OffSiteRequest approval is already shipped; manager attendance review explicitly blocked by guard |
| **Misuse / fraud** — employee submits false work location | LOW | GPS at check-in/check-out; required reason; HR review for unplanned; audit trail |
| **UI confusion** — employee taps off-site button when inside geofence | LOW | App only shows off-site button when outside geofence; backend enforces GPS regardless |
| **Duplicate OffSiteRequest + attendance on same day** | LOW | `@@unique([employeeId, date])` on Attendance prevents this; existing overlap guard on OffSiteRequest |

---

## 17. V1 Explicit Non-Goals

The following are out of scope for all REQ-002C through REQ-002H phases:

- Continuous GPS / background location tracking
- Route or path recording during the workday
- Photo proof requirement
- Automatic payroll calculation for off-site hours
- Manager review and approval of off-site attendance records
- Multi-site routing: multiple off-site locations on one calendar day
- Customer / site master database lookup
- Job / ticket / work order reference field
- Admin notification on new pending off-site records
- Repeated unplanned pattern detection
- GPS consistency check between check-in and check-out locations
- Device integrity checks (SafetyNet / DeviceCheck)

---

*End of REQ-002B Technical Implementation Specification*
*Pending resolution of OQ#2 (GPS storage) before schema can be finalized in REQ-002C*
