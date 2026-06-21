# Current Status

Last updated: 2026-06-21

## Current Product State — v1.1.41 ✅

The platform is now beyond the original backend v1.0-only foundation. Through `v1.1.41-admin-audit-log-ui`, it includes:

- Stable NestJS API with username/email login
- Web admin: profile/password change, employee account management, audit log review
- Mobile: attendance, leave, calendar, profile/password change, manager approval, and final UI polish
- Forced `mustChangePassword` flow on web and mobile
- Security harness scripts, security CI, Dependabot, and accepted-risk policy
- **Full Audit Log Pack — complete**: append-only audit trail, 9 event types, RBAC-restricted read API, admin web UI

## ADR Pack — COMPLETE ✅

19 Architecture Decision Records in `docs/adr/`. See [[ADR Index]].

ADR-018 (specification-only audit log state) is superseded by ADR-019 (Audit Trail and Admin Audit Log Review).

## Major Delivered Areas

| Area | Scope | Milestones | Status |
|---|---|---|---|
| Core backend | Auth, employee, department, position, attendance, leave, leave balance, dashboard | T-005–T-023 | ✅ Done |
| Username/account management | Username/email login, HR account provisioning, password reset, `GET /employees/:id/account` | T-050, T-055 | ✅ Done |
| Mobile | Dashboard, attendance, leave request, manager approval, profile/password change, calendar, UI polish | T-044–T-056A | ✅ Done |
| Web admin | Profile/password change, forced password change flow, employee detail account management, audit log review | T-053–T-055, T-057B-7 | ✅ Done |
| Security process | Security harness, accepted-risk policy, CI security job, Dependabot, agent workflow docs | T-052A.1, T-052A.3, T-052A.4 | ✅ Done |
| Audit Log Pack | Prisma model, audit service, 9 event types, read API, admin web UI, Playwright e2e | T-057B-1 through T-057B-7 | ✅ Done |

Current documented API surface: **41 endpoints including `GET /health`** (was 39 before T-057B-6 added /audit-logs).

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

## Current Operational Rules

- Work schedule: `08:30–17:30`
- LATE threshold: strictly after `08:30` Asia/Bangkok
- Backend RBAC remains the source of truth; UI role gating is UX-only
- `mustChangePassword` is enforced in current web/mobile UX flows
- Audit writes are best-effort (try/catch); a failed audit write does not affect the business operation

## Current Known Limitations

| # | Area | Limitation | Plan |
|---|---|---|---|
| 1 | LeaveType enum | ANNUAL and UNPAID not in schema | Enum migration in v1.1 |
| 2 | Leave approval | UNPAID balance bypass not implemented | After UNPAID enum added |
| 3 | LeaveRequest | `rejectReason` accepted in DTO but not persisted | Schema migration v1.1 |
| 4 | RBAC | MANAGER can access `GET /leave` and approve/reject leave, but there is still no manager-to-subordinate scoping | Future hierarchy/scoping design |
| 5 | Attendance | No auto-absent marking job | Future scheduled task |
| 6 | Dashboard | `todayAbsentCount` counts only explicit ABSENT records | Acceptable current limitation |
| 7 | Attendance/dashboard | Some older docs still referenced the old `09:00` rule; current source uses `08:30` | Continue doc hygiene |
| 8 | LeaveBalance | DB column `totalDays` vs API field `entitledDays` | Column rename in v1.1 |
| 9 | Security | Monthly full security review is policy-driven; not every routine task should run the full security workflow | Continue scoped verification discipline |
| 10 | Audit Log | No export/download, no retention/cleanup policy, no anomaly detection; actorUserId shown as UUID in UI | Future work |
| 11 | Audit Log | `dateTo` filter uses UTC midnight boundary; may exclude records created after 00:00 UTC on that date | Future fix if needed |

## Next Recommended Task

**T-059 — Mobile Attendance Location Enforcement**

See `docs/ATTENDANCE_GEOFENCE_BACKEND.md` for geofencing backend spec.

## Security / Process Notes

- Full security review is not required for every task.
- `./scripts/security-audit.sh` is especially relevant when dependency manifests or lockfiles change.
- `./scripts/secret-scan.sh` is available locally and enforced in CI through `Security — Audit & Secret Scan`.
- User handles `git add`, `git commit`, `git push`, and tagging manually.
- Agent tools must not run destructive Docker commands like `docker compose down`.
- Do NOT run `./scripts/docker-verify.sh` unless explicitly approved; it internally invokes `docker compose down`.

## Related Notes

- [[Project Overview]]
- [[Platform State v1.1.31]]
- [[Audit Log Module]]
- [[ADR Index]]
- [[API Route Index]]
- [[RBAC Rules]]

#hr-management #status #v1-1-41
