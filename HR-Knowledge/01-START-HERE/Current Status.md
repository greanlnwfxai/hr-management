# Current Status

Last updated: 2026-06-23

## Current Product State — v1.2.0 ✅

The platform is now beyond the original backend v1.0-only foundation. Through `v1.2.0-employee-self-service-offsite` (commit `b611f95`), it includes:

- Stable NestJS API with username/email login
- Web admin: profile/password change, employee account management, audit log review, off-site request management, department manager assignment
- Mobile: attendance, leave, calendar, profile/password change, manager approval, off-site request, and fully refreshed v1.2.0 UI with summary cards
- Forced `mustChangePassword` flow on web and mobile
- Security harness scripts, security CI, Dependabot, and accepted-risk policy
- **Full Audit Log Pack — complete**: append-only audit trail, 10 event types, RBAC-restricted read API, admin web UI, failed geofence rejection audit
- **Full Attendance Geofence Pack — complete**: backend-enforced mobile geofence, DB-backed admin config, admin web UI, rejected-attempt audit logging
- **Off-site Work Request Workflow — complete**: employee self-service off-site request, admin/manager approval, OFFSITE clock-in bypass for approved dates
- **Department Manager Scoping — complete**: MANAGER approve/reject scoped to managed department via `Department.managerId`

## ADR Pack — COMPLETE ✅

24 Architecture Decision Records. See [[ADR Index]].

ADR-018 (specification-only audit log state) is superseded by ADR-019 (Audit Trail and Admin Audit Log Review).
ADR-020 added: Attendance Geofence and Admin Configuration.
ADR-021 added: Failed Geofence Attempt Audit.
ADR-022 added: Off-site Work Request Workflow.
ADR-023 added: Department Manager Leave Approval Scope.
ADR-024 added: Mobile Employee Self-Service v1.2.0 UI Refresh.

## Major Delivered Areas

| Area | Scope | Milestones | Status |
|---|---|---|---|
| Core backend | Auth, employee, department, position, attendance, leave, leave balance, dashboard | T-005–T-023 | ✅ Done |
| Username/account management | Username/email login, HR account provisioning, password reset, `GET /employees/:id/account` | T-050, T-055 | ✅ Done |
| Mobile | Dashboard, attendance, leave request, manager approval, profile/password change, calendar, off-site request, v1.2.0 UI refresh | T-044–T-056A, T-071 | ✅ Done |
| Web admin | Profile/password change, forced password change flow, employee detail account management, audit log review | T-053–T-055, T-057B-7 | ✅ Done |
| Security process | Security harness, accepted-risk policy, CI security job, Dependabot, agent workflow docs | T-052A.1, T-052A.3, T-052A.4 | ✅ Done |
| Audit Log Pack | Prisma model, audit service, 10 event types, read API, admin web UI, Playwright e2e, rejected geofence audit | T-057B-1 through T-057B-7, T-065 | ✅ Done |
| Attendance Geofence Pack | Backend geofence engine, mobile GPS wiring, gap closure, DB-backed admin config UI | T-046, T-047, T-059, T-060 | ✅ Done |

Current documented API surface: **49 endpoints including `GET /health`** (v1.2.0 added 6 off-site endpoints).

## v1.2.0 Release Summary

| Task | Tag | Scope |
|---|---|---|
| T-071 | `v1.2.0-employee-self-service-offsite` | Off-site request module, manager dept-scoping, mobile v1.2.0 UI refresh, department manager UI |

Commit: `b611f95`
Verification: verify.sh PASS, 351/351 tests PASS, mobile-verify.sh PASS, security-review.sh PASS, CI green.

## Audit Log Pack Summary

| Task | Tag | Scope |
|---|---|---|
| T-057B-1 | `v1.1.34-audit-log-foundation` | AuditLog model, migration, service, sanitizer |
| T-057B-2 | `v1.1.35-auth-audit-events` | AUTH_LOGIN_SUCCESS/FAILURE, AUTH_PASSWORD_CHANGE |
| T-057B-3 | `v1.1.36-employee-account-audit-events` | EMPLOYEE_ACCOUNT_PROVISIONED, EMPLOYEE_TEMP_PASSWORD_RESET |
| T-057B-4 | `v1.1.37-leave-audit-events` | LEAVE_APPROVED, LEAVE_REJECTED |
| T-058A | `v1.1.38-sandbox-attendance-seed` | Sandbox attendance data for mobile testing |
| T-057B-5 | `v1.1.39-attendance-clock-audit-events` | ATTENDANCE_CLOCK_IN, ATTENDANCE_CLOCK_OUT |
| T-057B-6 | `v1.1.40-audit-log-read-api` | GET /audit-logs, GET /audit-logs/:id; RBAC |
| T-057B-7 | `v1.1.41-admin-audit-log-ui` | Web route /audit-logs; Playwright e2e |

See [[Audit Log Module]] for full architecture details.

## Attendance Geofence Pack Summary

| Task | Tag | Scope |
|---|---|---|
| T-046 | (within geofence milestone) | Backend Haversine engine, env-var geofence config, validation sequence |
| T-047 | (within geofence milestone) | Mobile GPS UI, `expo-location` permission, `source: "mobile"` clock-in/out |
| T-059 | `v1.1.43-mobile-attendance-geofence` | Gap closure: backend-authoritative enforcement confirmed, web preserved |
| T-060 | `v1.1.44-admin-geofence-settings` | GeofenceConfig DB singleton, `GET/PATCH /attendance/geofence-config`, admin web UI at `/attendance/geofence-settings` |
| T-061 | `v1.1.45-geofence-knowledge-sync` | HR-Knowledge and ADR sync for full geofence pack |
| T-062 | `v1.1.46-geofence-runtime-verification` | Full runtime verification: API, RBAC, mobile enforcement, audit privacy, web UI |
| T-063 | (docs only) | Production geofence readiness checklist and SOP |
| T-064 | (docs only) | Failed geofence attempt audit specification (`ATTENDANCE_GEOFENCE_REJECTED`) |
| T-065 | `v1.1.49-failed-geofence-audit-implementation` | Failed mobile geofence attempt audit logging with privacy-safe metadata and sanitizer GPS denylist |
| T-066 | (docs only) | Failed geofence audit knowledge and ADR sync |

See [[Attendance Geofence]] for full architecture details.

## Current Operational Rules

- Work schedule: `08:30–17:30`
- LATE threshold: strictly after `08:30` Asia/Bangkok
- Backend RBAC remains the source of truth; UI role gating is UX-only
- `mustChangePassword` is enforced in current web/mobile UX flows
- Audit writes are best-effort (try/catch); a failed audit write does not affect the business operation
- Mobile geofence enforcement is backend-authoritative for ONSITE mode; the mobile app never decides attendance eligibility
- OFFSITE clock-in bypasses the geofence radius check if an approved `OffSiteRequest` exists for the employee and today
- MANAGER approve/reject (leave and off-site) is scoped to the department they manage via `Department.managerId`

## Current Known Limitations

| # | Area | Limitation | Plan |
|---|---|---|---|
| 1 | LeaveType enum | ANNUAL and UNPAID not in schema | Enum migration in v1.1 |
| 2 | Leave approval | UNPAID balance bypass not implemented | After UNPAID enum added |
| 3 | LeaveRequest | `rejectReason` accepted in DTO but not persisted | Schema migration v1.1 |
| 4 | RBAC | MANAGER approve/reject is now department-scoped (v1.2.0); list access (GET /leave, GET /off-site) remains org-wide | Future: scope list access by department |
| 5 | Attendance | No auto-absent marking job | Future scheduled task |
| 6 | Dashboard | `todayAbsentCount` counts only explicit ABSENT records | Acceptable current limitation |
| 7 | Attendance/dashboard | Some older docs still referenced the old `09:00` rule; current source uses `08:30` | Continue doc hygiene |
| 8 | LeaveBalance | DB column `totalDays` vs API field `entitledDays` | Column rename in v1.1 |
| 9 | Security | Monthly full security review is policy-driven; not every routine task should run the full security workflow | Continue scoped verification discipline |
| 10 | Audit Log | No export/download, no retention/cleanup policy, no anomaly detection; actorUserId shown as UUID in UI | Future work |
| 11 | Audit Log | `dateTo` filter uses UTC midnight boundary; may exclude records created after 00:00 UTC on that date | Future fix if needed |
| 12 | Geofence | Single office location only; multi-office requires schema redesign | Future work |
| 13 | Geofence | GPS spoofing undetectable without device integrity APIs (SafetyNet / DeviceCheck) | Future work |
| 14 | Geofence | Rejected clock-in/out audit logging implemented in T-065; runtime verification and operational observation still recommended | Follow-up verification in T-067 |

## Next Recommended Task

**T-072 (TBD)** — Further feature development or runtime verification for v1.2.0 features.

## Security / Process Notes

- Full security review is not required for every task.
- `./scripts/security-audit.sh` is especially relevant when dependency manifests or lockfiles change.
- `./scripts/secret-scan.sh` is available locally and enforced in CI through `Security — Audit & Secret Scan`.
- User handles `git add`, `git commit`, `git push`, and tagging manually.
- Agent tools must not run destructive Docker commands like `docker compose down`.
- Do NOT run `./scripts/docker-verify.sh` unless explicitly approved; it internally invokes `docker compose down`.

## Related Notes

- [[Project Overview]]
- [[Platform State v1.2.0]]
- [[Platform State v1.1.31]]
- [[Audit Log Module]]
- [[Attendance Geofence]]
- [[Off-site Work Mode]]
- [[ADR Index]]
- [[API Route Index]]
- [[RBAC Rules]]
- [[Production Geofence Readiness]]

#hr-management #status #v1-2-0
