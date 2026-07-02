# CTO Summary

## Step
T-092 — HR-Knowledge & ADR Sync Through v1.2.67

## Status
PASS

## Scope
Synced `HR-Knowledge/` and `docs/adr/` to reflect all production/security/workflow
hotfixes from `v1.2.61` through `v1.2.67`, ahead of starting **SEC-ATT-001
Cross-Platform Attendance Anti-Spoofing**. Docs/knowledge/ADR only — no
runtime application code, schema, or migration changes. No git operations were
performed (add/commit/push/tag are the user's manual step, per `CLAUDE.md`).

Covered releases: v1.2.61 (employee self-dashboard), v1.2.62 (manager personal
summary), v1.2.63 (attendance date-normalization fix), v1.2.64 (leave employee
dropdown + Thai localization), v1.2.65 (non-destructive docker-verify.sh),
v1.2.66 (web clock-in/out disabled), v1.2.67 (SUPER_ADMIN password rotation +
seed hardening).

## Files Created

**New ADRs (full documents):**
- `docs/adr/ADR-029-web-vs-mobile-attendance-clock-policy.md`
- `docs/adr/ADR-030-non-destructive-docker-verification.md`
- `docs/adr/ADR-031-super-admin-password-rotation-and-seed-hardening.md`
- `docs/adr/ADR-032-manager-employee-dashboard-scope-and-personal-summary.md`

**New ADR stubs (HR-Knowledge, short form matching existing convention):**
- `HR-Knowledge/03-ADR/ADR-029 Web vs Mobile Attendance Clock Policy.md`
- `HR-Knowledge/03-ADR/ADR-030 Non-destructive Docker Verification.md`
- `HR-Knowledge/03-ADR/ADR-031 SUPER_ADMIN Password Rotation and Seed Hardening.md`
- `HR-Knowledge/03-ADR/ADR-032 Manager Employee Dashboard Scope and Personal Summary.md`

**This summary:**
- `docs/CTO_SUMMARY_T092_KNOWLEDGE_ADR_SYNC.md`

## Files Modified

| File | Change |
|---|---|
| `HR-Knowledge/01-START-HERE/Current Status.md` | Bumped header to v1.2.67; added "Release Timeline: v1.2.61 – v1.2.67" table; ADR Pack count 26 → 32 with ADR-027–032 entries; corrected stale claim that `docker-verify.sh` "internally invokes `docker compose down`"; updated "Next Recommended Task" to SEC-ATT-001; added production password-rotation note |
| `HR-Knowledge/03-ADR/ADR Index.md` | Added ADR-029–032 rows, bumped count 28 → 32, updated intro line and `docs/adr/` source-file fenced list |
| `HR-Knowledge/03-ADR/ADR-003 Docker Compose.md` | Corrected stale safety note ("`docker-verify.sh` may perform teardown operations") — now states it is non-destructive as of v1.2.65; linked ADR-030 |
| `docs/adr/ADR-003-docker-compose-local-development.md` | Same correction in the full ADR document; added Related ADRs section linking ADR-030 |
| `HR-Knowledge/03-ADR/ADR-009 Development Harness.md` | Corrected "historical Docker gate; only run when allowed" wording — now non-destructive/always-safe; linked ADR-030 |
| `HR-Knowledge/03-ADR/ADR-015 Security Harness.md` | Added v1.2.67 password rotation + seed hardening note, linked ADR-031 |
| `HR-Knowledge/04-DOMAINS/Attendance/Attendance Module.md` | Added "Web vs. Mobile Clock Channel (v1.2.66)" section; added known-limitation note on the SEC-ATT-001 follow-up gap; linked ADR-029 |
| `HR-Knowledge/04-DOMAINS/Auth/Auth Module.md` | Added "Default Admin Seed Account and Password Rotation (v1.2.67)" section; linked ADR-031 |
| `HR-Knowledge/04-DOMAINS/Dashboard/Dashboard Module.md` | Added "Web Dashboard Scope by Role (v1.2.61–v1.2.63)" and "Personal Attendance Date Normalization" sections; clarified the existing `GET /dashboard` guard is unchanged; linked ADR-032 |
| `HR-Knowledge/04-DOMAINS/Leave/Leave Balance Module.md` | Added "Web Admin UI — Employee Selection in Balance Modals (v1.2.64)" section documenting the pagination/localization fix and unchanged RBAC |
| `HR-Knowledge/07-BUSINESS-RULES/RBAC Rules.md` | Updated EMPLOYEE role summary; added two clarifying notes that the v1.2.66 web-clock removal and the v1.2.61–63 dashboard scoping are UX-only, not RBAC/API changes; linked ADR-029, ADR-032 |
| `HR-Knowledge/08-SOP/Development Workflow.md` | Added non-destructive `docker-verify.sh` note under Docker Safety; linked ADR-030 |
| `HR-Knowledge/08-SOP/Verification Workflow.md` | Rewrote the `docker-verify.sh` script description to reflect the v1.2.65 non-destructive behavior and updated when-to-run guidance; linked ADR-030 |
| `HR-Knowledge/09-QA/Backend QA Checklist.md` | Annotated a historical (pre-v1.2.65) "NOT RUN — requires `docker compose down`" entry as historical, linking ADR-030 for current behavior (entry itself left unchanged, as it correctly reflects that point in time) |

No files were deleted. No files outside `docs/` and `HR-Knowledge/` were touched.

## Knowledge Sections Updated

1. **Release timeline** — added v1.2.61–v1.2.67 table to Current Status.md.
2. **Attendance knowledge** — web clock-in/out disabled (mobile-only policy), backend/geofence unchanged, dashboard scope, personal-summary date normalization.
3. **Leave knowledge** — paginated employee dropdown (backend max 100), Thai/English localization of Vacation Balance Setup, active-employee filter, RBAC unchanged.
4. **RBAC / role behavior** — documented current SUPER_ADMIN/HR_ADMIN/MANAGER/EMPLOYEE dashboard and attendance-UI scope, with explicit "UX-only, not RBAC" callouts so the API-level matrix isn't misread as changed.
5. **Security knowledge** — production SUPER_ADMIN password rotation (no secret value referenced) and seed.ts hardening, framed as seed-safety hardening rather than a runtime auth change.
6. **Docker / harness workflow knowledge** — `docker-verify.sh` non-destructive status propagated everywhere it was previously described as requiring approval or performing teardown.
7. **ADRs** — 4 new ADRs (029–032) in both `docs/adr/` (full) and `HR-Knowledge/03-ADR/` (stub), index updated, two pre-existing ADR stale claims corrected (ADR-003, ADR-009).

## ADR List (This Sync)

| ADR | Title | Status |
|---|---|---|
| ADR-029 | Web vs. Mobile Attendance Clock Policy | New |
| ADR-030 | Non-Destructive Docker Verification | New |
| ADR-031 | SUPER_ADMIN Password Rotation and Seed Hardening | New |
| ADR-032 | Manager/Employee Dashboard Scope and Personal Summary | New |
| ADR-003 | Docker Compose for Local Development | Corrected (stale teardown caveat) |
| ADR-009 | Development Harness and Manual Git Workflow | Corrected (stale "historical gate" wording) |
| ADR-015 | Security Harness and Review Policy | Updated (added v1.2.67 rotation note) |

## Verification Result

This is a docs/knowledge/ADR-only change; no application code, dependency, or
schema files were touched, so the product build/runtime scripts are not
required as evidence for this task:

```
git diff --check                → PASS (clean, no whitespace/conflict-marker issues)
./scripts/secret-scan.sh         → PASS — no findings (Phase 1: no committed .env
                                    files; Phase 2: no PEM blocks; Phase 3: no
                                    suspicious patterns in source files)
git diff -- . | grep -niE \
  'accessToken\s*[:=]|refreshToken\s*[:=]|authorization:\s*bearer|password:\s*[a-z0-9]{6,}'
                                  → PASS — no matches
git diff -- . | grep -n 'admin1234'
                                  → 1 match: "Production SUPER_ADMIN password
                                    was rotated ... admin1234 is the dev/CI/
                                    local seed default only and no longer
                                    works against production." — descriptive
                                    reference to the pre-existing documented
                                    dev default, not a new secret; no new
                                    password value is stated anywhere in the diff
```

`./scripts/verify.sh` was **not run** — this change touches no `apps/api` or
`apps/web` source files, so API build/Prisma validate/web build are unaffected
and re-running them would add no verification value for a docs-only diff.
`./scripts/docker-verify.sh` was **not run** for the same reason (no runtime
code changed) and because it is not required for docs-only tasks per
`HR-Knowledge/08-SOP/Verification Workflow.md`'s "Docs-Only Verification"
guidance.

## Confirmation: No Secrets Included

Confirmed by the grep/secret-scan results above. No new password, token,
`accessToken`, `refreshToken`, or Authorization header value appears in any
file touched by this task. The rotated production `SUPER_ADMIN` password value
was never seen by Claude and is not referenced anywhere. Pre-existing
references to the dev/CI/local seed default (`admin1234`) elsewhere in the
repository (e.g. `CLAUDE.md`, `docs/E2E_TESTING.md`) were left untouched, per
the task's explicit instruction not to rewrite existing, already-accurate
dev/CI documentation.

## Confirmation: No Runtime Code Changes

Confirmed — `git status --short` for this task shows changes only under
`HR-Knowledge/` and `docs/adr/`, plus the two new files under `docs/`
(this summary). No files under `apps/api`, `apps/web`, `apps/mobile`,
`prisma/`, or `scripts/` were modified. No database schema or migration files
were touched.

## Confirmation: No Git Operations Performed

Confirmed — no `git add`, `git commit`, `git push`, `git tag`, or `git merge`
was run. All files remain as untracked/modified working-tree changes for the
user to review and commit manually.

## Issues Found

None. Two pre-existing ADR notes (`ADR-003`, `ADR-009` in
`HR-Knowledge/03-ADR/`) contained claims that were accurate when written but
became stale after `v1.2.65` (they described `docker-verify.sh` as
potentially/historically performing a `docker compose down` teardown); these
were corrected in place rather than left to silently contradict the new
ADR-030.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None. No auth endpoint or guard was added or changed. |
| RBAC impact | None. No `@Roles` decorator or RBAC matrix changed. Documentation was added clarifying that the v1.2.66 web-clock removal and the v1.2.61–63 dashboard scoping are frontend/UX-only — the underlying RBAC matrix is explicitly documented as unchanged. |
| Data privacy impact | None. No new data exposure; docs describe existing self-scoped endpoint usage only. |
| Password/token/hash impact | None in code. Documentation describes that a production password rotation occurred (HOTFIX-SEC-002, already shipped in v1.2.67) and that `seed.ts` was hardened — no password/token/hash value is stated anywhere in this task's output. |
| Mobile security impact | None. Mobile app and its geofence/GPS behavior are unchanged; only referenced descriptively. |
| Dependency/advisory impact | None. No `package.json`/lockfile changes; no new packages. |
| Secrets/logging check | Verified via `secret-scan.sh` PASS and targeted greps (see Verification Result) — no secrets, tokens, or new credential values in any file touched. |
| New endpoints protected | None — no new endpoints were added by this task. |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Next Step
SEC-ATT-001 — Cross-Platform Attendance Anti-Spoofing Spec.

## Recommended Commit Message
```
docs(knowledge): sync HR knowledge and ADRs through v1.2.67

- Add ADR-029 (web vs. mobile attendance clock policy), ADR-030
  (non-destructive docker-verify.sh), ADR-031 (SUPER_ADMIN password
  rotation and seed hardening), ADR-032 (manager/employee dashboard
  scope and personal summary), each as a full docs/adr/ document plus
  a matching HR-Knowledge/03-ADR stub; update the ADR Index (28 → 32)
- Add a v1.2.61-v1.2.67 release timeline to Current Status.md and
  correct stale docker-verify.sh teardown claims (ADR-003, ADR-009,
  Current Status.md, Development/Verification Workflow, Backend QA
  Checklist) now that it is confirmed non-destructive as of v1.2.65
- Update Attendance, Auth, Dashboard, Leave Balance, and RBAC Rules
  knowledge notes for: web clock-in/out disabled (mobile-only),
  employee self-dashboard / manager personal summary + attendance
  date-normalization fix, leave employee dropdown pagination + Thai
  localization, and production SUPER_ADMIN password rotation with
  seed-safety hardening — all UX/RBAC-unchanged, docs-only

No application code, schema, or migration changes. No secrets
included. No git operations performed as part of this task.
```
