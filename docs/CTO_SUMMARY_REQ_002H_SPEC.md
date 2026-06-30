# CTO Summary

## Step
REQ-002H-SPEC — Manager Flexible Attendance Policy: Specification

## Status
SPEC ONLY / PASS

## Scope

Business and technical specification for a Manager Flexible Attendance Policy that:

- Allows Managers to clock in or out at non-standard times with a mandatory reason.
- Routes Manager flexible attendance to HR_ADMIN for review and approval.
- Produces a distinct `FLEX_APPROVED` status in attendance reports after approval.
- Preserves full audit trail: actual time, submitted reason, reviewer decision, and timestamps.
- Keeps this workflow entirely separate from REQ-002G (Manager-as-approver of employee off-site records).

This task is documentation only. No runtime code, schema, Docker configuration, or infrastructure was changed.

## Files Created

| File | Purpose |
|------|---------|
| `docs/REQ_002H_MANAGER_FLEXIBLE_ATTENDANCE_POLICY_SPEC.md` | Full spec: objective, current state, target policy, user stories, proposed status model, check-in/out behavior, review ownership, REQ-002G distinction, API/web/mobile/report/audit impact, fallback and edge cases, acceptance criteria, risks, non-goals, open decisions, and implementation recommendation |
| `docs/CTO_SUMMARY_REQ_002H_SPEC.md` | This document |

## Files Modified

| File | Change |
|------|--------|
| `HR-Knowledge/07-BUSINESS-RULES/Attendance Rules.md` | Added "Manager Flexible Attendance (REQ-002H)" section as a forward reference to the REQ-002H spec |

## Runtime Code Changed
None.

## Business Decision

**Manager Flexible Attendance is allowed but must be reviewed and approved by HR.**

Managers work with genuinely flexible schedules — late-night work, after-hours support, customer visits, emergency service, and on-site management duties all legitimately push check-in and check-out outside normal hours. The current system marks any clock-in after 08:30 as LATE regardless of role, which is inaccurate and unfair for Managers.

The policy response:
- **Actual time is always recorded.** FLEX does not suppress or alter timestamps.
- **Reason is mandatory every time.** Empty or trivially short reasons are rejected.
- **HR reviews every FLEX instance.** Approval is never automatic.
- **Approved records display as FLEX_APPROVED** — not LATE, not PRESENT.
- **FLEX is opt-in.** Manager who does not submit FLEX reason is still marked LATE.

## Product Owner Policy Decisions (Captured in This Spec)

| Decision | Policy |
|----------|--------|
| Who can use FLEX | MANAGER role only |
| Latest allowed time for FLEX | No hard limit |
| Reason required | Yes — every time |
| Who reviews | HR_ADMIN (primary); SUPER_ADMIN (override) |
| Final report status after approval | FLEX_APPROVED |
| Scope of FLEX | Both check-in and check-out, independently |
| Self-review | Not allowed — Manager cannot review own FLEX |

## Proposed Status Model

| Status | Meaning |
|--------|---------|
| `FLEX_PENDING_REVIEW` | Manager submitted FLEX reason; HR has not reviewed yet |
| `FLEX_APPROVED` | HR approved; report shows FLEX_APPROVED (not LATE) |
| `FLEX_REJECTED` | HR rejected; falls back to normal LATE or irregular evaluation |

Status lifecycle:
```
Manager submits FLEX reason → FLEX_PENDING_REVIEW → HR approves → FLEX_APPROVED
                                                  → HR rejects → FLEX_REJECTED (→ LATE in report)
```

## RBAC Impact

| Role | Before | After (when implemented) |
|------|--------|--------------------------|
| SUPER_ADMIN | No FLEX-specific behavior | Can view all FLEX records; can override HR decision |
| HR_ADMIN | No FLEX-specific behavior | Primary reviewer: can approve/reject FLEX records |
| MANAGER | Marked LATE if after 08:30 | Can submit FLEX reason for own attendance; status becomes FLEX_PENDING_REVIEW |
| EMPLOYEE | Marked LATE if after 08:30 | No change — EMPLOYEE cannot use FLEX |

No RBAC change is implemented in this spec.

**Key RBAC rules:**
- Only MANAGER can submit FLEX.
- Only HR_ADMIN and SUPER_ADMIN can approve or reject.
- MANAGER cannot review own FLEX (self-review prohibited — 403 at service layer).
- MANAGER peer cannot review another Manager's FLEX.
- EMPLOYEE is not exposed to FLEX in any UI.

## Report Impact

| Status | In reports |
|--------|-----------|
| FLEX_PENDING_REVIEW | Shown as pending; not counted as LATE |
| FLEX_APPROVED | Shown as FLEX_APPROVED; NOT counted as LATE |
| FLEX_REJECTED | Shown as FLEX_REJECTED; falls back to LATE in late report |

- Actual check-in/out time always remains visible alongside FLEX status.
- HR can filter attendance reports by FLEX_APPROVED to produce a dedicated flexible attendance report.
- `FLEX_APPROVED` records must not inflate `todayLateCount` or monthly late metrics.

## Audit Impact

| Event | Trigger | Actor |
|-------|---------|-------|
| `ATTENDANCE_FLEX_SUBMITTED` | Manager submits FLEX reason | MANAGER |
| `ATTENDANCE_FLEX_APPROVED` | HR approves | HR_ADMIN / SUPER_ADMIN |
| `ATTENDANCE_FLEX_REJECTED` | HR rejects | HR_ADMIN / SUPER_ADMIN |
| `ATTENDANCE_FLEX_OVERRIDDEN` | SUPER_ADMIN overrides HR decision | SUPER_ADMIN |

- FLEX reason text is stored in the attendance/FLEX record — NOT duplicated in audit metadata.
- Audit metadata includes `attendanceId`, `actorRole`, `actorUserId`, `flexType (CHECKIN/CHECKOUT)`, and decision fields.
- Audit log remains accessible to HR_ADMIN and SUPER_ADMIN only via `GET /audit-logs`.

## Relationship to REQ-002G

| | REQ-002G | REQ-002H |
|--|----------|----------|
| Subject | Employee's off-site attendance | Manager's own flexible attendance |
| Requester | Employee (automatic) | Manager (voluntary FLEX submission) |
| Approver | Manager (dept-scoped) | HR_ADMIN / SUPER_ADMIN |
| Direction | Manager → Employee records | HR → Manager records |
| Status produced | APPROVED / REJECTED (existing) | FLEX_APPROVED / FLEX_REJECTED (new) |
| GPS involvement | Yes (off-site location) | No (timing only) |
| Status | SPEC ONLY (REQ-002G doc) | SPEC ONLY (this spec) |

**These are separate workflows. Do not combine them.**

## Risks and Open Decisions

**Top risks:**

| Risk | Mitigation |
|------|-----------|
| Managers overusing FLEX | HR review gate — every FLEX requires individual justification and HR approval |
| Weak/generic reasons ("busy") | Minimum reason length (OD-7); HR can reject; repeat patterns inform policy |
| HR review backlog | Dashboard metric for pending FLEX count recommended in implementation |
| Report confusion (FLEX_APPROVED vs PRESENT) | Distinct status label; tooltip/legend in Admin Web |
| FLEX + off-site overlap on same attendance record | Block at submission (409 Conflict) — OD-8 |
| Perception of unfairness | Policy communication; HR approval is not automatic |

**Open decisions for product owner before implementation:**

| # | Decision |
|---|----------|
| OD-1 | FLEX scope: check-in only, check-out only, or both independently? |
| OD-2 | Mobile UX: auto-prompt FLEX for late MANAGER check-in, or manual FLEX action? |
| OD-3 | FLEX review UI: standalone page or section within existing attendance review? |
| OD-4 | Retroactive FLEX submission: same-day only, or within N hours? |
| OD-5 | FLEX_REJECTED display: show FLEX_REJECTED + LATE, or replace with LATE? |
| OD-6 | Schema approach: extend `reviewStatus` enum, new `flexStatus` field, or new `FlexRequest` model? |
| OD-7 | Minimum FLEX reason length (e.g., 10 characters)? |
| OD-8 | Behavior when FLEX and off-site review overlap on same attendance record? |
| OD-9 | Is HR rejection reason mandatory (recommended: yes)? |
| OD-10 | Does FLEX_APPROVED affect leave/absence calculation (recommended: no)? |

## Verification Result

```
git diff --check     — no trailing whitespace or line-ending errors
No build required    — docs-only task; no source code changed
```

## Issues Found
None.

## Risk
Low — specification-only document. No runtime artifacts changed.

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | No endpoints added or changed in this task. Future implementation will add new JWT-guarded endpoints (`POST /attendance/flex`, `GET /attendance/flex-review`, `PATCH .../approve`, `PATCH .../reject`). All must require valid JWT. |
| RBAC impact | Spec defines MANAGER as submitter (not reviewer) for FLEX. Future implementation must enforce: (1) role guard on submission endpoint (MANAGER only), (2) self-review prohibition at service layer (403), (3) HR_ADMIN/SUPER_ADMIN only for review endpoints. No RBAC change implemented in this task. |
| Data privacy impact | FLEX reason text is professional justification. Implementation must not log raw reason text in audit metadata — reference by attendanceId only. No GPS data is involved (FLEX is timing-only). No new PII field is introduced in this spec. |
| Password/token/hash impact | None. |
| Mobile security impact | No mobile code changes. Future mobile implementation must ensure FLEX option is conditionally rendered for MANAGER role only (checked at JWT decode time, not just UI-side). |
| Dependency/advisory impact | No packages added. |
| Secrets/logging check | No credentials, tokens, GPS coordinates, or sensitive data referenced in documentation. |
| New endpoints protected | None (spec only). Future implementation must guard all four FLEX endpoints with JWT + role check. |
| Self-review risk | Spec explicitly defines self-review prohibition: Manager cannot approve own FLEX (403 at service layer). Must be implemented, not just documented. |
| EMPLOYEE exposure risk | Spec defines EMPLOYEE must not see FLEX option in any UI. Frontend gating is a UX control; backend role guard is the security control — both must be implemented. |
| Risk level | LOW (spec only) |
| Security decision | PASS |

## Decision
PASS

## Next Step

**REQ-002H — Open Decisions Resolution + Implementation (separate tasks)**

Immediate next steps:
1. Product owner resolves open decisions OD-1 through OD-10.
2. Engineering team chooses schema approach (OD-6: `FlexRequest` model recommended).
3. Implementation begins with schema migration (T-001), then backend (T-002 through T-005), then Admin Web (T-006, T-007), then mobile (T-008, T-009), then tests (T-010) and audit verification (T-011).

See `docs/REQ_002H_MANAGER_FLEXIBLE_ATTENDANCE_POLICY_SPEC.md` §20 for the full implementation sequence.

## Recommended Commit Message
```
docs(attendance): add manager flexible attendance policy spec

REQ-002H specification for Manager flexible attendance — allows Managers
to clock in/out at non-standard times with a mandatory reason, subject
to HR review and approval. Approved records display as FLEX_APPROVED
(not LATE) in attendance reports.

Spec includes: current state, target policy, user stories, proposed
status model (FLEX_PENDING_REVIEW / FLEX_APPROVED / FLEX_REJECTED),
check-in/out behavior, review ownership, REQ-002G distinction, API/
web/mobile/report/audit impact, fallback and edge cases, acceptance
criteria, risks, 10 open decisions, and implementation sequence.

No runtime code changes. Schema migration not implemented in this spec.

Files created:
- docs/REQ_002H_MANAGER_FLEXIBLE_ATTENDANCE_POLICY_SPEC.md
- docs/CTO_SUMMARY_REQ_002H_SPEC.md

Files modified:
- HR-Knowledge/07-BUSINESS-RULES/Attendance Rules.md (forward reference)
```

Recommended tag after PASS:
`v1.2.57-manager-flex-attendance-policy-spec`
