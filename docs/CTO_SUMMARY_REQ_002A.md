# CTO Summary

## Step
REQ-002A — Off-site Work Check-in/Check-out Product Design

## Status
PASS

## Scope
Design-only specification for off-site work check-in/check-out across STEP Connect (mobile PWA) and HR Management Admin Web. Analyzes 12 design dimensions (UX, approval model, required fields, check-out behavior, data model, admin visibility, RBAC, audit trail, geofence integration, abuse controls, mobile UX flow, and v1 out-of-scope items). No runtime code, schema migration, or data mutation performed.

## Files Created
- `docs/REQ_002A_OFFSITE_WORK_CHECKIN_CHECKOUT_DESIGN.md` — Full product/design specification

## Files Modified
None.

## Verification Result
```
git status --short     → docs/REQ_002A_OFFSITE_WORK_CHECKIN_CHECKOUT_DESIGN.md (untracked, correct)
git diff --check       → clean (no whitespace errors)
git diff --stat        → no tracked file changes
Documentation review   → PASS (file created, content verified)
./scripts/verify.sh    → NOT RUN (design-only task; no runtime code changed)
./scripts/docker-verify.sh   → NOT RUN (design-only task)
./scripts/api-smoke-test.sh  → NOT RUN (design-only task)
./scripts/security-review.sh → NOT RUN (design-only task; no endpoints, dependencies, or runtime code added)
```

## Issues Found
None. One notable pre-existing implementation gap was discovered and documented:

- **Off-site clock-out geofence bug:** The current `attendance.service.ts:clockOut()` calls `validateGeofence()` unconditionally, meaning employees who checked in as OFFSITE cannot clock out from off-site. This is documented in §2.3 of the design spec. Fix is scoped to the future implementation task, not REQ-002A.

## Key Design Decision

**Recommended: Hybrid Model (Option C)** — additive to the existing pre-approval workflow (Option B, already shipped).

Two paths:
- **Path 1 (Planned):** Employee has an APPROVED `OffSiteRequest` for today → off-site check-in → `reviewStatus = AUTO_ACCEPTED`. No HR review needed.
- **Path 2 (Unplanned):** No approved request → off-site check-in allowed with required reason + work location name → `reviewStatus = PENDING_REVIEW`. HR_ADMIN / SUPER_ADMIN must review.

This is the lowest-friction evolution: it keeps Option B's gate for planned work and adds a safe escape hatch for unplanned work.

## Options Considered

| Option | Description | Outcome |
|---|---|---|
| A — No Pre-approval | Immediate check-in, HR reviews later | Rejected: too weak for abuse control |
| B — Pre-approval Required (current) | Must have APPROVED request before check-in | Retained for planned off-site; too rigid for unplanned |
| C — Hybrid (recommended) | Path 1: approved request → auto-accepted; Path 2: unplanned → pending review | **Selected** |

## Recommended V1 Workflow

```
Employee (outside geofence)
  → Taps "ลงเวลาเข้า (นอกสถานที่)"
  → Enters: work location name (required) + reason (required)
  → App captures GPS → backend validates
  → Backend: APPROVED request exists? → AUTO_ACCEPTED : PENDING_REVIEW
  → Attendance created (workMode=OFFSITE, attendanceSource=OFFSITE_PLANNED|UNPLANNED)
  → Audit: ATTENDANCE_OFFSITE_CLOCK_IN

HR_ADMIN (if PENDING_REVIEW):
  → Reviews in /attendance/offsite-review
  → Approve → ATTENDANCE_OFFSITE_APPROVED
  → Reject  → ATTENDANCE_OFFSITE_REJECTED

Employee
  → Taps "ลงเวลาออก (นอกสถานที่)"
  → GPS captured → backend validates
  → Audit: ATTENDANCE_OFFSITE_CLOCK_OUT
```

## RBAC Recommendation

| Role | Check-in/out (own) | View own | View team | Approve attendance | Approve request |
|---|---|---|---|---|---|
| EMPLOYEE | ✅ | ✅ | ❌ | ❌ | ❌ |
| MANAGER | ✅ | ✅ | 👁️ read-only | ❌ (→ v1.1) | ✅ own dept |
| HR_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ all |
| SUPER_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ all |

**Manager attendance review deferred to v1.1** — blocked on HOTFIX-T089A manager-scope hardening.

## Audit Recommendation

New events follow existing `ATTENDANCE_`-prefix convention (aligning with `ATTENDANCE_GEOFENCE_REJECTED`, `ATTENDANCE_CLOCK_IN`, etc.):

- `ATTENDANCE_OFFSITE_CLOCK_IN`
- `ATTENDANCE_OFFSITE_CLOCK_OUT`
- `ATTENDANCE_OFFSITE_APPROVED`
- `ATTENDANCE_OFFSITE_REJECTED`
- `ATTENDANCE_OFFSITE_CHECKOUT_FILLED`

All audit metadata follows T-060/T-064 privacy rules:
- No raw `latitude`, `longitude`, `accuracy`, or `distance` in audit metadata
- GPS stored only in the Attendance operational record (for dispute resolution), never in audit log
- `accuracyBucket` (ACCEPTABLE / POOR / UNKNOWN) used instead of raw accuracy number
- Note/reason content not included in audit metadata

## Privacy Recommendation

| Data | Storage | Rationale |
|---|---|---|
| Raw lat/lon at check-in/check-out | Attendance record only | Operational evidence for dispute resolution (like a timesheet location) |
| Raw lat/lon in audit metadata | ❌ Forbidden | Follows T-060/T-064 GPS-free audit principle |
| Work location name | Attendance record + audit metadata | Not a GPS coordinate; required for HR visibility |
| Reason/note content | Attendance record only | May contain sensitive text; not in audit metadata |
| GPS accuracy (raw meters) | ❌ Not stored | Bucketed only (`accuracyBucket`) |
| Distance from company | ❌ Not stored | Equivalent to coordinate disclosure given known office location |

GPS capture is foreground-only, two snapshots per day (check-in + check-out). No continuous or background location tracking.

## Runtime Code Changed
No.

## Database / Schema Changed
No.

## Data Mutation
No.

## Docker Destructive Commands
None executed.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints added in this task. Future implementation will add off-site check-in/check-out endpoints — all must be JWT-guarded. |
| RBAC impact | RBAC model designed and documented. Manager attendance review explicitly scoped to v1.1. HR_ADMIN / SUPER_ADMIN only for review in v1. |
| Data privacy impact | Raw GPS coordinates stored in Attendance record (operational record, not audit). This creates PDPA-relevant location data. Design includes open question #2 for user confirmation. |
| Password/token/hash impact | None. Design-only. |
| Mobile security impact | Off-site check-in uses foreground GPS only. No background location. Backend remains authority for all validation decisions. |
| Dependency/advisory impact | No new packages added. |
| Secrets/logging check | Audit metadata explicitly forbids raw lat/lon, accuracy, distance, note content. Privacy rules documented. |
| New endpoints protected | None added in REQ-002A. Future endpoints: `POST /attendance/offsite-clock-in`, `POST /attendance/offsite-clock-out`, `GET /attendance/offsite-review`, `PATCH /attendance/offsite-review/:id` — all must require JWT + role guard. |
| Risk level | LOW (design-only; no code changes) |
| Security decision | PASS |

## Open Questions for User Approval

1. **GPS accuracy threshold for off-site:** Same 100m limit as normal attendance, or looser (e.g., 200m) for rural/outdoor GPS?
2. **Raw lat/lon on Attendance record:** Aligned with PDPA requirements? Or store only `workLocationName + hasCoordinates: boolean`?
3. **Reason for Path 1 (planned) check-in:** Mandatory even when OffSiteRequest already has a reason, or optional?
4. **Missing check-out auto-close time:** 23:59 Bangkok time, or employee's scheduled work end time?
5. **Manager read-only in v1:** Include team off-site record read access for managers in v1, or restrict to HR_ADMIN/SUPER_ADMIN only until v1.1?
6. **Reject behavior:** When HR rejects an unplanned off-site record, does the day auto-mark ABSENT or require manual HR action?

## Risk
Low — documentation and design only; no runtime changes.

## Decision
PASS

## Next Step
REQ-002B — Implementation of off-site work check-in/check-out based on approved REQ-002A design (pending user approval of open questions above).

## Recommended Commit Message
```
docs(req): add off-site work attendance design REQ-002A

Product design specification for off-site work check-in/check-out
covering UX, hybrid approval model (Option C), required fields,
GPS privacy rules, audit trail, RBAC, and mobile screen flows.
Design-only; no runtime code or schema changes.
```
