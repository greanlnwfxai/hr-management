# Current Status

Last updated: 2026-06-20

## Current Product State — v1.1.31 ✅

The project is no longer backend-only. Through `v1.1.31-audit-log-foundation-spec`, the platform now includes:
- stable NestJS API with username/email login
- web admin profile/password change and employee account management
- mobile attendance, leave, calendar, profile/password change, manager approval, and final UI polish
- forced `mustChangePassword` flow on web and mobile
- security harness scripts, security CI, Dependabot, and accepted-risk policy
- audit log foundation specification for future implementation

## ADR Pack — COMPLETE ✅

12 Architecture Decision Records written in `docs/adr/`. See [[ADR Index]].

## Major Delivered Areas

| Area | Scope | Milestones | Status |
|---|---|---|---|
| Core backend | Auth, employee, department, position, attendance, leave, leave balance, dashboard | T-005–T-023 | ✅ Done |
| Username/account management | Username/email login, HR account provisioning, password reset metadata, `GET /employees/:id/account` | T-050, T-055 | ✅ Done |
| Mobile | Dashboard, attendance, leave request, manager approval, profile/password change, calendar, UI polish | T-044–T-056A | ✅ Done |
| Web admin | Profile/password change, forced password change flow, employee detail account management | T-053–T-055 | ✅ Done |
| Security process | Security harness, accepted-risk policy, CI security job, Dependabot, agent workflow docs | T-052A.1, T-052A.3, T-052A.4 | ✅ Done |
| Audit log prep | Foundation specification only | T-057-prep | ✅ Done |

Current documented API surface is **39 endpoints including `GET /health`**.

## Current Operational Rules

- Work schedule: `08:30–17:30`
- LATE threshold: strictly after `08:30` Asia/Bangkok
- Backend RBAC remains the source of truth
- `mustChangePassword` is enforced in current web/mobile UX flows
- Audit log work is specification-only at this stage

## Current Known Limitations

| # | Area | Limitation | Plan |
|---|---|---|---|
| 1 | LeaveType enum | ANNUAL and UNPAID not in schema | Enum migration in v1.1 |
| 2 | Leave approval | UNPAID balance bypass not implemented | After UNPAID enum added |
| 3 | LeaveRequest | `rejectReason` accepted in DTO but not persisted | Schema migration v1.1 |
| 4 | RBAC | MANAGER can access `GET /leave` and approve/reject leave, but there is still no manager-to-subordinate scoping | Future hierarchy/scoping design |
| 5 | Attendance | No auto-absent marking job | Future scheduled task |
| 6 | Dashboard | `todayAbsentCount` counts only explicit ABSENT records | Acceptable current limitation |
| 7 | Attendance/dashboard | Some older docs still referenced the old `09:00` rule; current source uses `08:30` and knowledge has been synced here | Continue doc hygiene |
| 8 | LeaveBalance | DB column `totalDays` vs API field `entitledDays` | Column rename in v1.1 |
| 9 | Security | Monthly full security review is policy-driven; not every routine task should run the full security workflow | Continue scoped verification discipline |
| 10 | Audit Log | Specification exists, but there is no runtime implementation yet | Future T-057 phased backend work |

## Next Recommended Task

**T-057 implementation planning and phase execution**:
- Phase 1: audit log Prisma model + migration review
- Phase 2: dedicated audit service with sanitization rules
- Phase 3+: auth, employee account, leave, and attendance integration

See [[Platform State v1.1.31]] and `docs/T057_AUDIT_LOG_FOUNDATION_SPEC.md`.

## Security / Process Notes

- Full security review is not required for every task.
- `./scripts/security-audit.sh` is especially relevant when dependency manifests or lockfiles change.
- `./scripts/secret-scan.sh` is available locally and enforced in CI through `Security — Audit & Secret Scan`.
- User handles `git add`, `git commit`, `git push`, and tagging manually.
- Agent tools must not run destructive Docker commands like `docker compose down`.

## Related Notes

- [[Project Overview]]
- [[Platform State v1.1.31]]
- [[Backend v1 Readiness]]
- [[Backend QA Checklist]]
- [[ADR Index]]

#hr-management #status #v1-1-31
