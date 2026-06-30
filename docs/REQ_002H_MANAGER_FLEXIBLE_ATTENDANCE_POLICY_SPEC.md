# REQ-002H — Manager Flexible Attendance Policy
## Specification Document

**Status:** SPEC ONLY — no implementation
**Depends on:** REQ-002C (off-site backend), REQ-002F (mixed checkout exception), REQ-002G (manager-based off-site approval)
**Date:** 2026-06-30
**Relationship:** See §9 for distinction from REQ-002G (Manager-Based Off-site Attendance Approval).

---

## 1. Objective

Define a formal **Manager Flexible Attendance Policy** that:

- Prevents Managers from being automatically treated as `LATE` when their schedule is legitimately flexible due to management duties.
- Requires Managers to always record actual clock-in and clock-out times — FLEX does not mean skipping clock-in.
- Requires a written reason every time FLEX is used.
- Routes Manager flexible attendance to HR for review and approval.
- Produces a distinct `FLEX_APPROVED` status in attendance reports after HR approval.
- Preserves full audit trail: actual time, reason, reviewer, decision, timestamps.
- Keeps this workflow entirely separate from REQ-002G (Manager-as-approver of employee off-site records).

**What FLEX does NOT mean:**
- It does not exempt the Manager from clocking in or out.
- It does not grant an automatic exception — HR must review and approve each instance.
- It does not change normal employee late policy.
- It does not connect to payroll or overtime calculation.

---

## 2. Current State

### 2.1 LATE Evaluation

The system evaluates attendance status at clock-in time using Bangkok wall-clock time (UTC+7, fixed):

```typescript
// apps/api/src/attendance/attendance.service.ts (runtime logic — not modified in this spec)
private isLateInBangkok(now: Date): boolean {
  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const bangkokWallClock = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const hour = bangkokWallClock.getUTCHours();
  const minute = bangkokWallClock.getUTCMinutes();
  return hour > 8 || (hour === 8 && minute > 30);
}
```

| Clock-in time (Asia/Bangkok) | Current status |
|------------------------------|----------------|
| ≤ 08:30:00 | PRESENT |
| > 08:30:00 | LATE |

This rule is applied uniformly to all roles. Managers who clock in after 08:30 are currently marked LATE regardless of legitimate flexible scheduling.

### 2.2 Roles

| Role | Current |
|------|---------|
| SUPER_ADMIN | Full system access |
| HR_ADMIN | Manage employees, attendance, leave; review off-site records |
| MANAGER | Operational visibility; leave approval for team; clock in/out |
| EMPLOYEE | Self-service: clock in/out, view own records, submit leave |

No role-specific exemption from the LATE rule currently exists.

### 2.3 Attendance Status Enum (Current)

```
AttendanceStatus: PRESENT | LATE | ABSENT
```

A `FLEX_PENDING_REVIEW` and `FLEX_APPROVED` status does not currently exist.

### 2.4 Attendance Record Structure (Current Relevant Fields)

From `apps/api/prisma/schema.prisma`:

```
Attendance
  id                   String                     @id @default(uuid())
  employeeId           String
  date                 DateTime                   ← UTC date
  checkIn              DateTime                   ← UTC timestamp
  checkOut             DateTime?                  ← UTC timestamp (optional)
  status               AttendanceStatus           ← PRESENT | LATE | ABSENT
  workMode             WorkMode                   ← ONSITE | OFFSITE
  attendanceSource     AttendanceSource           ← COMPANY_GEOFENCE | OFFSITE_PLANNED | OFFSITE_UNPLANNED
  reviewStatus         AttendanceReviewStatus?    ← PENDING_REVIEW | APPROVED | REJECTED | AUTO_ACCEPTED | MISSING_CHECKOUT
  reviewedById         String?                    ← FK to Employee (reviewer)
  reviewedAt           DateTime?
  reviewNote           String?
  note                 String?                    ← employee note at clock-in
```

### 2.5 Existing Review Flows

| Flow | When triggered | Current reviewer |
|------|---------------|-----------------|
| Off-site full day | attendanceSource IN [OFFSITE_PLANNED, OFFSITE_UNPLANNED] | HR_ADMIN / SUPER_ADMIN |
| Mixed checkout exception | ONSITE check-in, off-site checkout submitted | HR_ADMIN / SUPER_ADMIN |

Neither existing flow addresses Manager flexible clock-in/clock-out timing.

### 2.6 Existing Audit Infrastructure

An audit log exists (`GET /audit-logs`) with `actorUserId`, `actorRole`, `action`, `targetType`, `targetId`, `metadata`, and `result`. This infrastructure will be reused for REQ-002H audit events.

---

## 3. Target Policy

### 3.1 Who Can Use FLEX

| Role | Can request FLEX? |
|------|-------------------|
| MANAGER | Yes |
| SUPER_ADMIN | No (not in scope of this policy) |
| HR_ADMIN | No (not in scope of this policy) |
| EMPLOYEE | No |

FLEX is strictly a MANAGER-role feature.

### 3.2 No Fixed Time Limit

There is no hard latest allowed time for a Manager FLEX check-in or check-out. The policy allows flexibility in timing, but:
- Actual time is always recorded.
- A reason/note is always required.
- HR reviews every instance.

### 3.3 Reason Requirement

A reason/note is **mandatory every time** FLEX is used. A FLEX submission without a reason must be rejected by the system (`400 Bad Request`). Minimum reason length will be determined in an open decision before implementation (see §19).

### 3.4 Review Ownership

| Role | Authority |
|------|-----------|
| HR_ADMIN | Primary reviewer — approves or rejects FLEX requests |
| SUPER_ADMIN | Can view and override if needed |
| MANAGER | Can submit FLEX for their own attendance only; cannot review own FLEX |
| MANAGER (peer) | Cannot review another Manager's FLEX unless explicitly allowed in a future policy |
| EMPLOYEE | No access to FLEX controls |

### 3.5 Final Report Status

| FLEX state | Report display |
|------------|----------------|
| FLEX_PENDING_REVIEW | Pending — not yet counted as LATE or PRESENT |
| FLEX_APPROVED | FLEX_APPROVED (not LATE) |
| FLEX_REJECTED | Falls back to normal LATE/irregular evaluation |

### 3.6 Applies to Both Check-in and Check-out

| Scenario | FLEX Applies? |
|----------|--------------|
| Manager clocks in after 08:30 | Yes — FLEX may be submitted for check-in |
| Manager clocks out at non-standard time | Yes — FLEX may be submitted for check-out |
| Both check-in and check-out are flexible on the same day | Yes — each may independently be FLEX |
| Check-in is FLEX, check-out is normal | Yes — supported |
| Check-in is normal, check-out is FLEX | Yes — supported |

---

## 4. User Stories

### Manager Stories

**US-001:** As a Manager, I can clock in later than the normal start time with a required reason so that HR can review my attendance as flexible rather than LATE.

**US-002:** As a Manager, I can clock out at a non-standard time with a required reason so that HR can review my check-out as flexible attendance.

**US-003:** As a Manager, I can submit a reason when using flexible attendance so that HR has context for their review decision.

**US-004:** As a Manager, I can see a pending status banner in the mobile app indicating that my flexible attendance is under HR review.

**US-005:** As a Manager, after HR approves my flexible attendance, I see FLEX_APPROVED status in my attendance report.

**US-006:** As a Manager, if HR rejects my flexible attendance, I see a rejection status and the reason provided by HR.

### HR Stories

**US-007:** As HR, I can see a list of pending Manager flexible attendance records waiting for my review.

**US-008:** As HR, I can view each record's actual check-in/out time, the reason submitted by the Manager, the employee name, department, and submission timestamp.

**US-009:** As HR, I can approve a pending flexible attendance record, changing its status to FLEX_APPROVED.

**US-010:** As HR, I can reject a pending flexible attendance record with a mandatory rejection reason, so the Manager understands why it was not approved.

**US-011:** As HR, I can filter flexible attendance records by status, date range, department, and employee name.

### Employee Story

**US-012:** As a normal Employee (EMPLOYEE role), I cannot see or use the FLEX attendance option — it is not presented to me in any UI.

### SUPER_ADMIN Story

**US-013:** As SUPER_ADMIN, I can view all Manager flexible attendance records org-wide for governance and compliance inspection.

**US-014:** As SUPER_ADMIN, I can override HR's decision on a flexible attendance record if needed.

---

## 5. Proposed Status Model

### 5.1 New Status Values

| Status | Meaning |
|--------|---------|
| `FLEX_PENDING_REVIEW` | Manager submitted flexible attendance reason; HR has not yet reviewed. |
| `FLEX_APPROVED` | HR reviewed and approved; report shows FLEX_APPROVED, not LATE. |
| `FLEX_REJECTED` | HR reviewed and rejected; report falls back to normal LATE or irregular evaluation. |

### 5.2 Status Lifecycle

```
Manager clocks in/out after normal time
              │
      Manager submits FLEX reason
              │
              ▼
   FLEX_PENDING_REVIEW
              │
     ┌────────┴─────────┐
     │                  │
  HR approves       HR rejects
     │                  │
     ▼                  ▼
FLEX_APPROVED      FLEX_REJECTED
                        │
                        ▼
             Falls back to: LATE / irregular
             (based on actual time, per existing rules)
```

### 5.3 Field Reuse vs New Fields

This spec does not mandate schema changes. The following analysis is for future implementation reference:

| Approach | Assessment |
|----------|------------|
| Reuse `reviewStatus` enum, add FLEX values | Possible — `reviewStatus` is already `AttendanceReviewStatus?` on the Attendance model. Requires adding `FLEX_PENDING_REVIEW`, `FLEX_APPROVED`, `FLEX_REJECTED` to the enum. Existing PENDING_REVIEW/APPROVED/REJECTED semantics are different — mixing may cause confusion. |
| New `flexStatus` field | Cleaner separation — keeps FLEX workflow independent of the existing off-site/mixed checkout review flow. Requires a schema migration and new column. |
| New `FlexRequest` model | Maximum separation — FLEX request as a separate entity linked to an `Attendance` record, similar to `OffSiteRequest`. Fully independent workflow. |

**Recommendation for implementation decision:** Evaluate whether `reviewStatus` can be cleanly extended or whether a new `FlexRequest` model provides better separation. This is an open decision (OD-6) — do not implement schema in this spec.

---

## 6. Check-in Behavior

### 6.1 Normal Flow (No FLEX)

If a Manager clocks in after 08:30 and does not submit a FLEX reason, the existing LATE logic applies unchanged. FLEX is opt-in, not automatic.

### 6.2 FLEX Check-in Flow

```
Manager clocks in after 08:30 (Asia/Bangkok)
         │
System detects LATE condition for MANAGER role
         │
[Implementation-defined UX: prompt or manual action]
         │
Manager submits FLEX reason (mandatory, non-empty)
         │
System records:
  - Actual check-in time (UTC stored, Bangkok displayed)
  - FLEX reason
  - Status: FLEX_PENDING_REVIEW (check-in pending)
  - Creates HR review record
         │
HR reviews → FLEX_APPROVED or FLEX_REJECTED
```

### 6.3 Key Rules

- Actual clock-in time is always stored. FLEX does not change the recorded timestamp.
- System must not silently convert every Manager late check-in to FLEX without a reason.
- If the Manager does not elect to use FLEX, LATE status is applied as normal.
- FLEX submission at check-in time does not affect check-out behavior (independent).

---

## 7. Check-out Behavior

### 7.1 Normal Flow (No FLEX)

Manager clocks out at a standard time — no FLEX required. Standard check-out logic applies.

### 7.2 FLEX Check-out Flow

```
Manager clocks out at a non-standard time
         │
[Implementation-defined: what qualifies as "non-standard" for check-out]
         │
Manager submits FLEX reason (mandatory, non-empty)
         │
System records:
  - Actual check-out time (UTC stored, Bangkok displayed)
  - FLEX reason
  - Status: FLEX_PENDING_REVIEW (check-out pending)
  - Creates HR review record
         │
HR reviews → FLEX_APPROVED or FLEX_REJECTED
```

### 7.3 Key Rules

- The exact definition of "non-standard check-out" is implementation-defined and will be decided before implementation.
- Actual check-out time is always stored unchanged.
- FLEX check-out may coexist independently with a FLEX or normal check-in on the same day.
- GPS requirements for check-out follow existing rules (unchanged).

---

## 8. Review Ownership

### 8.1 Reviewer Authority Table

| Role | Can review Manager FLEX? | Scope |
|------|--------------------------|-------|
| HR_ADMIN | Yes — primary reviewer | Org-wide |
| SUPER_ADMIN | Yes — override authority | Org-wide |
| MANAGER | No — cannot review own FLEX | N/A |
| MANAGER (peer) | No — cannot review another Manager's FLEX (unless future policy changes this) | N/A |
| EMPLOYEE | No | N/A |

### 8.2 Self-Review Prohibition

A Manager may not approve or reject their own FLEX request. The system must enforce this at the service layer, returning `403 Forbidden` if a Manager attempts to act as their own reviewer.

### 8.3 Rejection Reason

HR rejection must include a mandatory rejection reason. Minimum length to be determined in open decision OD-7. This reason should be visible to the Manager in their mobile app and attendance report view.

### 8.4 Override Behavior

SUPER_ADMIN may override an HR approval or rejection. When SUPER_ADMIN acts, the audit log captures `actorRole = SUPER_ADMIN` and the original HR decision remains auditable in history.

---

## 9. Relationship to REQ-002G

REQ-002G and REQ-002H are separate requirements covering different workflows:

| | REQ-002G | REQ-002H |
|--|----------|----------|
| **Who is being reviewed** | Employee's off-site attendance | Manager's own flexible attendance |
| **Who requests/submits** | Employee (automatic on off-site check-in) | Manager (voluntary FLEX reason submission) |
| **Who reviews/approves** | Manager (for employees in their department) | HR_ADMIN / SUPER_ADMIN |
| **Direction** | Manager → Employee records | HR → Manager records |
| **Flows covered** | Full off-site, mixed checkout exception | Manager flexible check-in / check-out |
| **RBAC impact** | MANAGER added to review endpoints (dept-scoped) | MANAGER can submit FLEX; HR reviews |
| **Status produced** | APPROVED / REJECTED (existing enum) | FLEX_APPROVED / FLEX_REJECTED (new) |
| **Status** | SPEC ONLY (separate document) | SPEC ONLY (this document) |

**Do not combine these two workflows.** REQ-002G is Manager-as-approver. REQ-002H is Manager-as-requester. Combining them into one endpoint or review queue would create RBAC conflicts and audit ambiguity.

---

## 10. API Impact (Spec — No Implementation)

### 10.1 New Endpoints Needed

| Method | Suggested path | Roles | Purpose |
|--------|---------------|-------|---------|
| `POST` | `/attendance/flex` | MANAGER | Submit FLEX reason for own check-in or check-out attendance record |
| `GET` | `/attendance/flex-review` | HR_ADMIN, SUPER_ADMIN | List pending (and reviewed) Manager FLEX records |
| `PATCH` | `/attendance/flex-review/:id/approve` | HR_ADMIN, SUPER_ADMIN | Approve a FLEX_PENDING_REVIEW record |
| `PATCH` | `/attendance/flex-review/:id/reject` | HR_ADMIN, SUPER_ADMIN | Reject a FLEX_PENDING_REVIEW record (reason required) |

### 10.2 Existing Endpoint Impact

| Endpoint | Impact |
|----------|--------|
| `POST /attendance/clock-in` | May need role-aware behavior: detect MANAGER + LATE → offer FLEX path, or return a flag signaling FLEX eligibility |
| `POST /attendance/clock-out` | Similar: role-aware FLEX eligibility flag for MANAGER |
| `GET /attendance/me` | Should include FLEX status fields in response for MANAGER |
| `GET /attendance` (admin) | HR/SUPER_ADMIN list should show FLEX statuses and reason |
| `GET /attendance/:id` | Should return FLEX fields for authorized viewers |

### 10.3 Security Rules Summary

| Rule | Enforcement |
|------|-------------|
| Only MANAGER can submit FLEX | Role guard on `POST /attendance/flex` |
| MANAGER cannot review own FLEX | Service-layer self-review check (403) |
| EMPLOYEE cannot see or submit FLEX | Role guard (403) |
| FLEX submission without reason | DTO validation (400 / 422) |
| HR approval/rejection | Role guard: HR_ADMIN, SUPER_ADMIN only |
| Unauthenticated access | JWT guard (401) |
| Record not found | Service-layer 404 |
| Cross-role attempt (EMPLOYEE trying FLEX) | Role guard (403) |

---

## 11. Admin Web Impact (Spec — No Implementation)

### 11.1 HR Review Page

A dedicated review page (or a tab/section within the existing attendance review area) for Manager Flexible Attendance:

- Show pending FLEX records as a prioritized queue.
- Display per record: employee name, employee code, role (MANAGER), department, actual check-in/out time, reason/note, submission timestamp, current status.
- Approve and reject action controls (visible to HR_ADMIN / SUPER_ADMIN only).
- Rejection requires a reason before the action is allowed.
- Show review history (approved/rejected records) with reviewer name, role, and reviewed timestamp.

### 11.2 Report View Behavior

- Attendance list and report views: after approval, show `FLEX_APPROVED` in the status column, not LATE.
- Show actual time alongside status (do not suppress the real timestamp).
- Pending records clearly marked as `FLEX_PENDING_REVIEW`.
- Rejected records marked as `FLEX_REJECTED` (or fallback status).
- HR should be able to filter attendance reports by FLEX_APPROVED to produce a flexible attendance report.

### 11.3 Filters

| Filter | Who sees it |
|--------|-------------|
| Status: FLEX_PENDING / FLEX_APPROVED / FLEX_REJECTED | HR_ADMIN, SUPER_ADMIN |
| Employee name / code | HR_ADMIN, SUPER_ADMIN |
| Department | HR_ADMIN, SUPER_ADMIN |
| Date range | HR_ADMIN, SUPER_ADMIN |
| FLEX type: check-in / check-out / both | HR_ADMIN, SUPER_ADMIN |

### 11.4 FLEX Should Not Appear as a "Free Pass"

The UI must present actual time alongside the reason and FLEX status. HR reviewers see real numbers. Approved records are labeled FLEX_APPROVED but the underlying time is always visible and auditable.

---

## 12. Mobile Impact (Spec — No Implementation)

### 12.1 Manager Experience

- When a Manager clocks in after normal start time, the mobile app should present a FLEX option (UX to be implementation-defined: automatic prompt vs manual action).
- The reason/note field is mandatory — the FLEX submission should be blocked if reason is empty.
- After submission, the mobile app displays a pending status banner:
  > "การเช็คอินของคุณถูกส่งเพื่อขอ FLEX — รอ HR ตรวจสอบ"
  > *(Your check-in has been submitted as FLEX — awaiting HR review)*
- After HR approves, the status banner updates to FLEX_APPROVED.
- After HR rejects, the status banner shows the rejection reason.

### 12.2 Check-out FLEX on Mobile

Same pattern as check-in: Manager clocks out at non-standard time → FLEX option presented → reason required → pending status shown → updated after HR decision.

### 12.3 Normal Employee Experience

EMPLOYEE role must not see the FLEX option, prompt, or banner in any mobile screen. The FLEX workflow is invisible to normal employees.

### 12.4 No Mobile Runtime Changes in This Spec

This specification defines the expected behavior. All mobile changes are deferred to a future implementation task.

---

## 13. Report Impact

### 13.1 Attendance Status in Reports

| Status | Report display | Counted as LATE? |
|--------|---------------|-----------------|
| FLEX_PENDING_REVIEW | Pending FLEX (HR review) | No |
| FLEX_APPROVED | FLEX_APPROVED | No |
| FLEX_REJECTED | FLEX_REJECTED (+ fallback: LATE) | Yes (as LATE) |
| LATE (no FLEX submitted) | LATE | Yes |

### 13.2 Report Requirements

- `FLEX_APPROVED` must NOT be counted in the `todayLateCount` or monthly late report.
- `FLEX_PENDING_REVIEW` must be distinguishable from both LATE and APPROVED in any report view.
- `FLEX_REJECTED` records remain auditable — they do not disappear; they show the rejection and the underlying evaluated status.
- HR must be able to run a dedicated FLEX report: all Manager FLEX submissions by date range, filtered by status, department, and employee.
- Actual check-in/out time must remain visible alongside the FLEX status at all times.

---

## 14. Audit Impact

### 14.1 Required Audit Events

| Event name (suggested) | Trigger | Actor | Metadata |
|-----------------------|---------|-------|----------|
| `ATTENDANCE_FLEX_SUBMITTED` | Manager submits FLEX reason | MANAGER | `attendanceId`, `flexType (CHECKIN/CHECKOUT)`, `actorRole`, `actorUserId`, `employeeId`, `hasReason: true` |
| `ATTENDANCE_FLEX_APPROVED` | HR approves FLEX record | HR_ADMIN / SUPER_ADMIN | `attendanceId`, `actorRole`, `actorUserId`, `reviewerEmployeeId`, `employeeId`, `decision: APPROVED` |
| `ATTENDANCE_FLEX_REJECTED` | HR rejects FLEX record | HR_ADMIN / SUPER_ADMIN | `attendanceId`, `actorRole`, `actorUserId`, `reviewerEmployeeId`, `employeeId`, `decision: REJECTED`, `hasRejectReason: true` |
| `ATTENDANCE_FLEX_OVERRIDDEN` | SUPER_ADMIN overrides prior HR decision | SUPER_ADMIN | `attendanceId`, `actorRole`, `priorDecision`, `newDecision` |

### 14.2 Privacy Rules for Audit

| Data | Rule |
|------|------|
| FLEX reason text | Stored in the main FLEX/attendance record — not duplicated in audit metadata |
| Rejection reason | Stored in the main record — audit metadata records `hasRejectReason: true`, not the text |
| Check-in/out timestamps | Safe to reference by `attendanceId` — actual timestamps in the Attendance record |
| GPS coordinates | Not relevant to FLEX workflow — not stored or logged |
| Employee name / role | Reference by `employeeId` — name resolved at query time |

### 14.3 Audit Accessibility

- `GET /audit-logs` (SUPER_ADMIN, HR_ADMIN) — accessible with `action=ATTENDANCE_FLEX_*` filter.
- MANAGER and EMPLOYEE cannot access audit log endpoints (403) — unchanged from current policy.
- MANAGER can see their own FLEX status and HR decision in their mobile attendance view, but not the full audit log.

---

## 15. Fallback and Edge Cases

| Scenario | Expected behavior |
|----------|------------------|
| Manager clocks in late but does not submit FLEX | Existing LATE status applies unchanged. No automatic FLEX. |
| Manager submits FLEX with empty reason | System rejects with 400 Bad Request. FLEX not created. |
| Manager submits FLEX with too-short reason | Rejected if minimum length rule is enforced (see OD-7). |
| Manager submits multiple FLEX requests for the same attendance record | System must enforce one FLEX per attendance record (409 Conflict). |
| Manager changes role (demoted from MANAGER) after FLEX submission | FLEX record remains — reviewed under the original submission context. Role change does not cancel or alter a pending FLEX. HR reviews as submitted. |
| Manager account becomes inactive after FLEX submission | FLEX record remains pending. HR reviews. Inactive status does not auto-reject. |
| HR rejects FLEX | Status becomes FLEX_REJECTED; attendance report shows LATE (or evaluated status) with rejection noted. |
| Check-in is FLEX_PENDING, check-out is normal | Supported. Each event has independent FLEX state. |
| Check-in is normal, check-out is FLEX_PENDING | Supported. |
| Both check-in and check-out are FLEX on the same day | Supported. Each creates a separate HR review item. |
| FLEX submitted for a day that is also an off-site day (REQ-002G flow) | The FLEX review (HR) and off-site review (Manager/HR per REQ-002G) are separate workflows. The same attendance record should not simultaneously be in both FLEX review and off-site review unless implementation defines how these states coexist. This is an open decision (OD-8). |
| FLEX submitted for a mixed checkout exception attendance record | Edge case — requires implementation decision. Off-site review and FLEX review should not be combined on the same record without explicit handling. |
| Public holiday or weekend | Existing system behavior for holidays/weekends is not defined by REQ-002H. FLEX may technically be submitted but HR may simply reject. No automatic holiday detection is added in this spec. |
| Timezone | All times stored as UTC; Bangkok (UTC+7, no DST) wall-clock used for display and LATE evaluation. Unchanged per ADR-010. |

---

## 16. Acceptance Criteria (for Future Implementation)

- [ ] Only MANAGER role can submit a FLEX request.
- [ ] EMPLOYEE, HR_ADMIN, and SUPER_ADMIN cannot submit FLEX via the Manager FLEX endpoint.
- [ ] MANAGER must provide a non-empty reason every time FLEX is used (400 if missing).
- [ ] FLEX check-in is supported: Manager can submit FLEX for a late check-in.
- [ ] FLEX check-out is supported: Manager can submit FLEX for a non-standard check-out.
- [ ] Actual check-in and check-out times are stored unchanged regardless of FLEX status.
- [ ] FLEX submission creates a record with `FLEX_PENDING_REVIEW` status.
- [ ] HR_ADMIN can view all pending Manager FLEX records org-wide.
- [ ] SUPER_ADMIN can view all Manager FLEX records org-wide.
- [ ] HR_ADMIN can approve a pending FLEX record — status transitions to `FLEX_APPROVED`.
- [ ] HR_ADMIN can reject a pending FLEX record with a mandatory reason — status transitions to `FLEX_REJECTED`.
- [ ] SUPER_ADMIN can perform the same approval/rejection actions as HR_ADMIN.
- [ ] MANAGER cannot approve or reject their own FLEX request (403 Forbidden).
- [ ] MANAGER (peer) cannot approve or reject another Manager's FLEX request (403 Forbidden).
- [ ] After approval, the attendance report displays `FLEX_APPROVED`, not `LATE`.
- [ ] `FLEX_APPROVED` records are not counted in LATE reports.
- [ ] `FLEX_REJECTED` records are auditable and fall back to the evaluated LATE status.
- [ ] All FLEX lifecycle events are recorded in the audit log with correct `actorRole`.
- [ ] EMPLOYEE role sees no FLEX option in any UI (mobile or web).
- [ ] Existing normal employee attendance behavior (PRESENT / LATE evaluation) is unchanged.
- [ ] Existing off-site and mixed checkout flows (REQ-002F, REQ-002G) are not broken.
- [ ] FLEX submission without GPS — GPS is not required for FLEX submission (FLEX is about timing, not location). GPS rules for clock-in/out are unchanged.

---

## 17. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Perception of unfairness: Employees see Managers get approved FLEX but they cannot | Medium | Communication: FLEX is role-specific; Manager work patterns differ by design. HR approval gate prevents casual overuse. |
| Managers overusing FLEX ("FLEX every day") | Medium | HR review requirement means every FLEX request must be individually justified. HR can reject weak reasons. HR can also flag patterns to management. |
| Weak/generic FLEX reasons ("busy") | High | Minimum reason length may help (OD-7). HR can reject. Repeat rejection patterns should inform policy. |
| HR review backlog if many Managers submit FLEX daily | Low-Medium | First implementation should include a count/alert for HR if FLEX pending count exceeds a threshold. Dashboard metric recommended. |
| Report confusion: team lead sees Manager as "not LATE" without understanding FLEX | Medium | Admin Web should display FLEX_APPROVED distinctly from PRESENT, with a tooltip or legend explaining the status. |
| Combining FLEX with off-site attendance incorrectly | Low | Spec explicitly separates REQ-002G and REQ-002H workflows. Implementation must enforce separation. |
| Manager role change after FLEX submission affects routing | Low | Pending records reviewed under original submission context. Role change is not a cancellation event. |
| Incomplete audit trail | Low | Audit events defined in §14. Implementation must verify all three event types are written correctly. |
| Payroll/discipline implications of FLEX | Medium | This policy does not connect to payroll. Payroll integration is an explicit non-goal. HR discipline decisions are a separate process. |
| Scope creep: SUPER_ADMIN or HR_ADMIN request FLEX | Low | Policy explicitly restricts FLEX to MANAGER only. Executive or HR flexible attendance is a separate future policy if ever needed. |
| FLEX reason stored as sensitive/PII data | Low | Reason text is professional justification, not sensitive PII. However, implementation must not log raw reason text in audit metadata — reference by `attendanceId` only. |

---

## 18. Explicit Non-Goals

The following are explicitly out of scope for REQ-002H:

- **No runtime implementation in this task.** All changes are specification only.
- **No database migration.** No new columns, tables, or enum values are introduced.
- **No backend code changes.** AttendanceService, AttendanceController, and guards are not modified.
- **No Admin Web code changes.** React/Next.js pages are not modified.
- **No mobile code changes.** Expo/React Native screens are not modified.
- **No payroll integration.** FLEX approval has no effect on payroll in this spec.
- **No automatic overtime calculation.** FLEX does not imply or calculate overtime.
- **No direct link to compensation.** Approved FLEX is a reporting status, not a pay adjustment.
- **No background GPS tracking.** FLEX is a timing policy, not a location policy.
- **No change to normal employee late policy.** EMPLOYEE late evaluation is unchanged.
- **No change to REQ-002G.** REQ-002G (Manager-based off-site approval) is a separate workflow.
- **No executive or HR_ADMIN flexible attendance policy.** This spec covers MANAGER only.
- **No FLEX for SUPER_ADMIN.** Out of scope.
- **No automatic FLEX on every Manager late check-in.** FLEX is opt-in and requires explicit reason submission.
- **No resubmission logic.** If HR rejects a FLEX, the Manager does not automatically get to resubmit (future policy decision if needed).

---

## 19. Open Decisions

The following decisions must be finalized with the product owner before implementation begins:

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| OD-1 | Does FLEX apply only at clock-in, only at clock-out, or both? | (a) Check-in only; (b) Check-out only; (c) Both independently | (c) Both — spec supports this |
| OD-2 | Should mobile auto-prompt FLEX for late check-in, or require a manual Manager action? | (a) Auto-prompt when LATE detected for MANAGER; (b) Manual: Manager taps "Request FLEX"; (c) Hybrid: prompt + dismiss | (a) Auto-prompt is better UX, but carries risk of accidental FLEX — discuss with product |
| OD-3 | Should the FLEX review page be a new standalone page or a section/tab on the existing attendance review? | (a) Standalone `/attendance/flex-review`; (b) Tab on existing `/attendance/offsite-review`; (c) Unified attendance review with FLEX filter | (a) Standalone is cleanest, but (c) may be more efficient for HR if combined |
| OD-4 | Can FLEX be submitted retroactively (e.g., Manager submits reason the next day)? | (a) Yes, within N hours; (b) No — same-day only; (c) HR can add FLEX retroactively on behalf of Manager | (b) Same-day submission preferred for audit integrity; if retroactive needed, HR submits on behalf |
| OD-5 | What happens on FLEX_REJECTED — does the Manager see the actual LATE status or a FLEX_REJECTED status? | (a) Show FLEX_REJECTED + actual evaluated status (e.g., LATE); (b) Replace with LATE silently; (c) Show only FLEX_REJECTED | (a) Show both for full transparency |
| OD-6 | Schema approach: reuse `reviewStatus` enum, add new `flexStatus` field, or create a new `FlexRequest` model? | (a) Extend `AttendanceReviewStatus` with FLEX values; (b) New `flexStatus` field on Attendance; (c) New `FlexRequest` model | (c) New `FlexRequest` model preferred for cleanest separation — no shared state with off-site review |
| OD-7 | Minimum length for FLEX reason? | (a) No minimum; (b) 10 characters; (c) 20 characters | (b) 10 characters minimum — enough to reject blank/trivial reasons |
| OD-8 | What happens when a FLEX and an off-site review (REQ-002G) overlap on the same attendance record? | (a) Block overlap — not allowed; (b) Allow both independently; (c) Require HR to resolve manually | (a) Block at submission time — return 409 with clear message; implementation defines the exact condition |
| OD-9 | Is HR rejection reason mandatory? | (a) Yes, always; (b) Optional | (a) Mandatory — rejection without reason is not actionable for the Manager |
| OD-10 | Does FLEX approval affect leave calculation or absence tracking? | (a) No — FLEX is an attendance status only; (b) FLEX_APPROVED counts as PRESENT for absence calculation | (a) No change to leave or absence calculation in this spec |

---

## 20. Recommendation

**Proceed with REQ-002H implementation only after spec approval and open decisions OD-1 through OD-10 are resolved.**

Core policy decisions from the product owner — accepted as-is in this spec:

| Decision | Policy |
|----------|--------|
| Who can use FLEX | MANAGER only |
| Latest allowed time | No hard limit — reason required every time |
| Reason requirement | Mandatory, every FLEX use |
| Reviewer | HR_ADMIN reviews; SUPER_ADMIN can override |
| Final report status | FLEX_APPROVED (after approval) |
| FLEX scope | Both check-in and check-out, independently |
| Self-review | Not allowed — Manager cannot review own FLEX |

**Implementation sequence recommendation (for a future task):**

| Subtask | Scope | Risk | Reuses |
|---------|-------|------|--------|
| T-001: Schema migration | Add FLEX status values or new FlexRequest model (after OD-6 resolved) | MEDIUM | Prisma migration pattern |
| T-002: Backend — POST /attendance/flex | Manager FLEX submission endpoint with DTO validation | LOW | AttendanceService pattern |
| T-003: Backend — GET /attendance/flex-review | HR list endpoint with pagination and filters | LOW | Existing offsite-review pattern |
| T-004: Backend — PATCH .../approve and .../reject | HR approve/reject with self-review check | LOW | LeaveService / OffSiteService pattern |
| T-005: Backend — clock-in role-aware flag | Return FLEX eligibility flag for MANAGER in clock-in response | LOW | AttendanceService |
| T-006: Admin Web — HR FLEX review page | New page or tab for HR to review pending FLEX records | MEDIUM | Existing offsite-review page |
| T-007: Admin Web — report status display | Show FLEX_APPROVED / FLEX_REJECTED in attendance list and reports | LOW | Existing status badge pattern |
| T-008: Mobile — Manager FLEX prompt and submission | Auto-prompt or manual FLEX action with reason field | MEDIUM | Existing clock-in/out screens |
| T-009: Mobile — status banner | FLEX_PENDING / FLEX_APPROVED / FLEX_REJECTED banners | LOW | Existing state card pattern |
| T-010: Tests | Unit + integration tests for all FLEX paths, RBAC, edge cases | MEDIUM | Existing test patterns |
| T-011: Audit verification | Confirm all three FLEX audit events are written correctly | LOW | Existing audit service |

Safe implementation order: T-001 → T-002 → T-003 → T-004 → T-005 (backend) → T-010 (tests) → T-006 → T-007 (web) → T-008 → T-009 (mobile) → T-011 (audit verification)
