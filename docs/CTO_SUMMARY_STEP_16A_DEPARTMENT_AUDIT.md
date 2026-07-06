# CTO Summary

## Step
STEP-16A — Department Module Audit & Implementation Plan

## Status
PASS (audit complete — no code changes)

## Scope
Audit the current state of the Department Module across DB schema, backend API, admin web UI, employee integration, manager/approval scope, and reporting. Determine whether the roadmap's "STEP 16 — Department Module" is actually unimplemented (as `CLAUDE.md` currently states) or already built, and produce a gap analysis + implementation plan for any remaining work. **This task made no runtime code changes.**

---

## Headline Finding

**The Department Module is already fully implemented, RBAC-integrated, and in production.** `CLAUDE.md`'s "Current Next Step: STEP 16 — Department Module" is **stale documentation**, not an accurate reflection of repo state. The module was originally built in commit `aed7c60` (`feat(departments): add Department CRUD module with safe delete`), and extended with manager assignment in v1.2.0 (commit `b611f95`, ADR-023, tag `v1.2.0-employee-self-service-offsite`). `SESSION.md` (an old session log) and `docs/CTO_SUMMARY_HOTFIX_REQ002G_3.md` (an older hotfix doc) both still contain the "STEP 16 not yet built" framing that appears to have leaked into `CLAUDE.md`'s "Current Next Step" line and never been corrected.

There is no missing-feature crisis here — the real gap is **roadmap/doc drift**, plus a small number of concrete, scoped follow-ups (below).

---

## Files Inspected

**Database**
- `apps/api/prisma/schema.prisma` (`Department`, `Position`, `Employee` models)

**Backend**
- `apps/api/src/departments/departments.module.ts`
- `apps/api/src/departments/departments.controller.ts`
- `apps/api/src/departments/departments.service.ts`
- `apps/api/src/departments/dto/create-department.dto.ts`
- `apps/api/src/departments/dto/update-department.dto.ts`
- `apps/api/src/departments/dto/query-department.dto.ts`
- `apps/api/src/app.module.ts` (module registration)
- `apps/api/src/leave/leave.service.ts`, `leave.service.spec.ts`
- `apps/api/src/off-site/off-site.service.ts`
- `apps/api/src/attendance/attendance.service.ts`, `attendance.service.spec.ts`
- `apps/api/src/dashboard/dashboard.service.ts`, `dashboard.service.spec.ts`, `dashboard.controller.ts`, `dashboard.controller.spec.ts`

**Web**
- `apps/web/app/(app)/departments/page.tsx`
- `apps/web/app/(app)/employees/page.tsx`
- `apps/web/app/(app)/dashboard/page.tsx`
- `apps/web/components/AppLayout.tsx` (nav)
- `apps/web/lib/api.ts`, `apps/web/lib/i18n.ts`

**Docs / knowledge**
- `HR-Knowledge/04-DOMAINS/Department/Department Module.md`
- `HR-Knowledge/03-ADR/ADR-023 Department Manager Leave Approval Scope.md`
- `docs/CTO_SUMMARY_HOTFIX_REQ002G_3.md`
- `SESSION.md`
- `CLAUDE.md`

**History**
- `git log --oneline --all -- apps/api/src/departments apps/web/app/(app)/departments` (6 commits, oldest `aed7c60`, newest `b611f95`)

---

## Current Department DB Model Summary

```prisma
model Department {
  id          String     @id @default(uuid())
  name        String     @unique
  description String?
  managerId   String?    @unique
  manager     Employee?  @relation("DepartmentManager", fields: [managerId], references: [id])
  employees   Employee[] @relation("DepartmentEmployees")
  positions   Position[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([name])
  @@map("departments")
}
```

| Requested field | Present? | Notes |
|---|---|---|
| `name` | ✅ | unique |
| `code` | ❌ | no short business code (e.g. `ENG`, `HR`) |
| `active`/`inactive` status | ❌ | no soft-delete/archive flag — hard delete only, blocked (409) if employees/positions reference it |
| manager / department-head relationship | ✅ | `managerId` (1:1, unique) → `Employee`, back-relation `managedDepartment` |
| `createdAt`/`updatedAt` | ✅ | both present |

`Employee.departmentId` is a required (`NOT NULL`) FK to `Department`, indexed. `Position.departmentId` is also required and indexed. So every employee and every position must belong to exactly one department — this is the mechanism the safe-delete check relies on.

**Schema verdict:** sufficient for current usage. `code` and `active` are the two plausible future additions, neither urgently needed (see Gap Analysis).

---

## Current Department API Summary

Module: `apps/api/src/departments/` (registered in `AppModule`).

| Method | Path | Guard | Roles | Behavior |
|---|---|---|---|---|
| GET | `/departments` | `JwtAuthGuard`, `RolesGuard` | any authenticated role | Paginated list (`page`, `limit`, `search` on name, case-insensitive) |
| GET | `/departments/:id` | same | any authenticated role | Single department, 404 if missing |
| POST | `/departments` | same | `SUPER_ADMIN`, `HR_ADMIN` | Create; 409 if name taken |
| PATCH | `/departments/:id` | same | `SUPER_ADMIN`, `HR_ADMIN` | Update; 409 on name collision |
| DELETE | `/departments/:id` | same | `SUPER_ADMIN`, `HR_ADMIN` | **Safe hard delete** — 409 if employees or positions still attached |

- DTO validation via `class-validator` (`CreateDepartmentDto`: `name` 2–100 chars, `description` optional ≤500 chars, `managerId` optional UUID). `UpdateDepartmentDto` is `PartialType` of create.
- Response shape includes `_count.employees` and `_count.positions` for the UI badges, plus `manager: { id, firstName, lastName }`.
- No soft delete — `remove()` calls `prisma.department.delete()` directly after the safe-delete guard.
- No manager-scoped restriction on department CRUD itself (department management is HR/admin-only; the manager-scoping RBAC pattern applies to *approvals*, not to department administration — see below).
- **Gap:** no `.spec.ts` unit tests exist for `departments.controller.ts` / `departments.service.ts`, and no dedicated e2e test file, unlike `attendance`, `dashboard`, and `leave`, which have deep spec coverage.

---

## Current Admin Web UI Summary

Page: `apps/web/app/(app)/departments/page.tsx`, nav entry in `AppLayout.tsx` (`nav_departments`).

| Capability | Present? | Notes |
|---|---|---|
| List departments | ✅ | paginated, search by name |
| Create department | ✅ | modal form (name, description, manager dropdown) — admin-gated in UI (`isAdmin(user)`) |
| Edit department | ✅ | same modal, pre-filled |
| Deactivate/archive department | ❌ | not possible — no `active` field exists to toggle |
| Assign department manager | ✅ | dropdown of active employees, "no manager" option, shown as a table column |
| See employee counts | ✅ | `_count.employees` and `_count.positions` both shown as columns |
| Delete (guarded) | ✅ | button disabled + tooltip when employees/positions attached; confirms via `window.confirm` |

**i18n gap (Thai/English):** most of the page correctly uses `t()` from `useLanguage()`/`i18n.ts` (both `en` and `th` dictionaries have full `dept_*` key sets). However, three manager-related UI strings are **hardcoded Thai literals**, not routed through `t()`:
- Table header `'ผู้จัดการ'` (should be `t('dept_col_manager')`)
- Field label `'ผู้จัดการแผนก'` (should be `t('dept_field_manager')`)
- Empty-option placeholder `'— ไม่มีผู้จัดการ —'` (should be `t('dept_manager_none')`)

Effect: these three strings render in Thai even when the UI language is set to English. This is a real, narrowly-scoped defect but does not block STEP-16A (audit-only); it's a good STEP-16B fix-list item.

**Other UI gap:** no "view employees in this department" drill-down link from the departments list — the employee count is a static number with no navigation.

---

## Current Employee Integration Summary

`apps/web/app/(app)/employees/page.tsx`:
- Employee create/edit form has a required `departmentId` select, populated from `getAllDepartments()`.
- Position select is filtered client-side to positions belonging to the selected department (`positions.filter(p => p.departmentId === form.departmentId)`), and resets `positionId` when department changes.
- Employee list table renders `emp.department?.name ?? '—'`.

**Gap:** employees list has no department filter/column-based query — you can only filter by `status`, not scope the list to one department. To see "who's in Engineering" today you'd go through the Departments page's raw count, not a filtered employee list.

---

## Current Manager Scope / Approval Impact

This is **already fully implemented**, more mature than the audit brief assumed ("do not implement anything here; just document" — nothing to implement, it's live):

- `Department.managerId` → `Employee.managedDepartment` (back-relation) is the mechanism.
- **ADR-023** (`HR-Knowledge/03-ADR/ADR-023 Department Manager Leave Approval Scope.md`, accepted 2026-06-23, T-071, shipped in `v1.2.0-employee-self-service-offsite`, commit `b611f95`) formally documents this.
- Enforced in:
  - `leave.service.ts` — `PATCH /leave/:id/approve` and `/reject` check `approverEmp.managedDepartment.id === leaveEmployee.departmentId`, else 403.
  - `off-site.service.ts` — identical pattern for off-site approve/reject.
  - `attendance.service.ts` (`findOffsiteReview`) — department-scoped attendance/off-site review queue for `MANAGER` role.
  - `dashboard.service.ts` — KPI/analytics scoping: resolves `managedDepartment.id`, falls back to the manager's own `departmentId` if they don't manage a department, and scopes employee/attendance/leave counts and `leaveByDepartment` breakdown accordingly.
- Explicitly **not** scoped (by design, per ADR-023): `GET /leave`, `GET /leave/:id`, `GET /off-site`, `GET /off-site/:id` — MANAGER still reads org-wide, only approve/reject is scoped.
- `Employee.managerId` (person-to-person reporting line) is a **distinct** relation from `Department.managerId` (department headship) — ADR-023 calls this out explicitly to avoid future confusion; worth preserving in any STEP-16B naming decisions.

**No action needed here.** Any STEP-16B work should treat this as a stable foundation, not a target for change.

---

## Reports / Dashboard Impact

- `dashboard.service.ts` already computes `leaveByDepartment` (pending/approved/rejected counts per department, zero-filled for departments with no leave activity) and `totalDepartments`/`totalPositions` KPIs, both scoped by manager's department when the caller is a `MANAGER`.
- `apps/web/app/(app)/dashboard/page.tsx` renders this breakdown.
- **Future opportunity (not a gap):** no attendance-by-department or headcount-trend-by-department view yet. Reasonable STEP-16C/D candidate if HR asks for it, not required now.

---

## Existing Docs / Roadmap Findings

- `HR-Knowledge/04-DOMAINS/Department/Department Module.md` — accurate, current, well-maintained domain doc. Already documents the endpoints, business rules, manager assignment (v1.2.0), and the flat-hierarchy limitation.
- `HR-Knowledge/03-ADR/ADR-023 Department Manager Leave Approval Scope.md` — accurate, detailed ADR covering the manager-scoping mechanism and exact 403 messages.
- **Stale:** `CLAUDE.md` → `## Current Next Step` says `STEP 16 — Department Module`, and `## Completed Milestone` stops at "STEP 05–15 completed." This is out of date by several major versions (repo is at `v1.2.82`). Recommend the user update this section once a new next-step is chosen (out of scope for this audit to invent one).
- `SESSION.md` and `docs/CTO_SUMMARY_HOTFIX_REQ002G_3.md` both contain historical "Department module is STEP 16, not yet built" language — accurate *at the time they were written*, now superseded. No action needed on these (they're historical records), but they explain why the stale framing persisted into `CLAUDE.md`.

---

## Gap Analysis (Summary Table)

| # | Gap | Severity | Area |
|---|---|---|---|
| 1 | `CLAUDE.md` roadmap section stale (says STEP 16 not done) | Doc debt | Docs |
| 2 | Manager column/label/placeholder hardcoded in Thai, bypasses `t()` | Low (i18n bug) | Web UI |
| 3 | No unit or e2e test coverage for Departments module | Medium (quality/regression risk) | Backend/Web testing |
| 4 | No `active`/`archive` flag — can't deactivate a department without deleting it, and delete is blocked once anything references it | Low–Medium (operational gap) | DB/API/UI |
| 5 | No `code` field (short business identifier) | Low (nice-to-have) | DB/API/UI |
| 6 | No employee-list filter by department | Low (UX gap) | Web UI |
| 7 | No "view employees" drill-down from department row | Low (UX gap) | Web UI |
| 8 | No parent/child department hierarchy | Low (already documented as known limitation, no current requirement) | DB |

---

## Recommended Implementation Breakdown

### STEP-16B — Test Coverage + i18n Fix (small, low-risk)
- Add `departments.service.spec.ts` and `departments.controller.spec.ts` (unit) mirroring the pattern used in `dashboard`/`leave` modules — cover create/update/delete conflict paths, safe-delete block, pagination/search.
- Add a Playwright e2e spec (`apps/web/e2e/departments.spec.ts`) mirroring existing attendance/employees e2e coverage.
- Fix the three hardcoded Thai strings in `apps/web/app/(app)/departments/page.tsx` (`ผู้จัดการ`, `ผู้จัดการแผนก`, `— ไม่มีผู้จัดการ —`) by adding `dept_col_manager` / `dept_field_manager` / `dept_manager_none` keys to both `en` and `th` dictionaries in `apps/web/lib/i18n.ts` and routing the JSX through `t()`.
- No schema or migration changes. No RBAC changes.

### STEP-16C — Department Lifecycle: Active/Inactive Flag (medium, requires migration)
- Add `Department.isActive Boolean @default(true)` (or `status` enum if HR wants more than binary) via a new Prisma migration.
- API: `PATCH /departments/:id/deactivate` (or fold into existing `PATCH` with an `isActive` field) — restrict active-only departments in employee/position "assign to department" dropdowns, but keep inactive departments visible/readable for historical records.
- UI: toggle/badge for active/inactive, filter on departments list, exclude inactive from employee-form department dropdown.
- **Migration impact:** additive column with default — low risk, no backfill logic needed beyond the default.
- **RBAC impact:** none (same SUPER_ADMIN/HR_ADMIN gate as existing mutations).

### STEP-16D — Department UX Polish (small, optional, no migration)
- Add department filter to the employees list query (`GET /employees?departmentId=`) and UI dropdown.
- Add a "view employees" link/count-click from the departments table to a pre-filtered employees view.
- Optional: `code` field addition if HR wants a short business identifier (would require migration + DTO + UI field; bundle with STEP-16C if approved together since both touch the same files).

**Priority order recommendation:** 16B first (cheap, no schema risk, closes a real regression-risk and a visible i18n bug), then 16C only if HR/product actually wants archive-without-delete, then 16D as backlog polish.

---

## Risk Assessment

| Area | Risk if left as-is | Risk of implementing STEP-16B/C/D |
|---|---|---|
| Doc drift (`CLAUDE.md`) | Low — cosmetic, but could mislead future agents/humans into re-building an existing module | N/A (docs-only fix) |
| Missing test coverage | Medium — regressions in department CRUD or safe-delete logic could ship unnoticed | Low — additive tests only |
| i18n hardcoding | Low — cosmetic language bug, no functional impact | Low — small, mechanical fix |
| No active/inactive flag | Low–Medium — HR currently must fully delete a department to "retire" it, which is blocked once anything references it, so in practice retired departments just linger active forever | Low — additive column with default, no backfill |
| Manager-scope RBAC (existing) | None — already shipped, tested, and ADR-documented | N/A — do not touch |

---

## Migration Impact Assessment
- **This audit:** zero migration impact — no schema changes made or proposed for execution.
- **STEP-16B:** no migration.
- **STEP-16C:** one additive column (`isActive` or `status`) with a default value — safe, no backfill required, no destructive change.
- **STEP-16D:** no migration unless `code` field is bundled in, in which case one additive nullable/unique column.

## Backend Impact Assessment
- **This audit:** no backend runtime files changed.
- **STEP-16B:** new spec files only; zero production code paths touched.
- **STEP-16C:** small service/controller/DTO changes to `departments.service.ts`/`.controller.ts`/DTOs to support the new field and an update-path guard (e.g., prevent assigning employees to inactive departments) — localized, no RBAC model changes.
- **STEP-16D:** small addition to `employees.service.ts`/controller query filtering by `departmentId` (may already partially exist — needs confirmation at implementation time).

## Frontend Impact Assessment
- **This audit:** no frontend runtime files changed.
- **STEP-16B:** i18n dictionary additions + JSX string swap in one file; new e2e spec file. Very low risk.
- **STEP-16C:** UI toggle/badge and filter in `departments/page.tsx`; dropdown filtering in `employees/page.tsx` to exclude inactive departments.
- **STEP-16D:** new filter control in `employees/page.tsx`; optional link/navigation addition in `departments/page.tsx`.

## Testing Strategy
- STEP-16B itself *is* the testing-strategy fix for this module — bring Departments up to the same coverage bar as Attendance/Dashboard/Leave (unit specs for service + controller, e2e for the admin page).
- For STEP-16C: unit-test the safe-delete-vs-deactivate interaction (can you deactivate a department that still has employees? — recommend yes, since deactivate ≠ delete), and test that inactive departments are excluded from "assignable" dropdowns but still resolve correctly for existing employees/positions.
- For STEP-16D: unit-test the new `departmentId` query param on `GET /employees` (whitelist validation, empty-result behavior); e2e-test the drill-down link.
- Standard verification gate for any future implementation step: `./scripts/verify.sh`, `./scripts/docker-verify.sh`, `./scripts/api-smoke-test.sh`, `./scripts/security-review.sh` — all must exit 0 per `CLAUDE.md`.

## Recommended Next Task
**STEP-16B — Department Test Coverage + i18n Fix.** It's small, has no migration or RBAC surface, closes a real (if minor) shipped bug, and closes the largest objective gap (test coverage) found in this audit. Recommend running it as its own reviewable unit before considering STEP-16C.

Separately (docs-only, can be done anytime): update `CLAUDE.md`'s `## Current Next Step` and `## Completed Milestone` sections to reflect that Department Module (STEP 16) is complete, and record whatever the user picks as the actual next roadmap item.

## PASS/FAIL Recommendation
**PASS.** Audit is complete, all seven requested audit areas were inspected, gap analysis and a phased implementation plan (STEP-16B/C/D) are documented above, and no runtime code, schema, or `.env` files were modified.

---

## Security Review

| Field | Finding |
|---|---|
| Auth impact | None — audit only, no endpoints added/changed |
| RBAC impact | None — no role checks added/changed. Confirmed existing RBAC is correct: GET open to any authenticated role, mutations gated to `SUPER_ADMIN`/`HR_ADMIN`, department-scoped approval RBAC (ADR-023) verified intact and untouched |
| Data privacy impact | None — no new PII exposure; department responses already expose only `manager.{id,firstName,lastName}`, no sensitive fields |
| Password/token/hash impact | None |
| Mobile security impact | None — Department module is admin-web-only, not exposed to mobile attendance flows |
| Dependency/advisory impact | None — no packages added or changed |
| Secrets/logging check | None — no logging or secret-handling code touched; this document contains no credentials or tokens |
| New endpoints protected | None added — existing endpoint guards reviewed and confirmed correct (see API summary table above) |
| Risk level | LOW |
| Security decision | PASS |

---

## Files Created
- `docs/CTO_SUMMARY_STEP_16A_DEPARTMENT_AUDIT.md` (this document)

## Files Modified
- None

## Runtime Code Changed
**No.** No files under `apps/api` or `apps/web` (excluding this new doc under `docs/`) were modified. Confirmed via `git status` / `git diff --stat` below.

## Verification Result (docs-only — lightweight checks per task instructions)
```
git status         → clean except new untracked file docs/CTO_SUMMARY_STEP_16A_DEPARTMENT_AUDIT.md
git diff --stat     → no output (no tracked files modified)
apps/api runtime files changed → none
apps/web runtime files changed → none
```
Full `verify.sh` / `docker-verify.sh` / `api-smoke-test.sh` were **not** run, per task instructions ("do not over-run heavy tests unless you changed code" — no code was changed).

## Git Operations Performed
**None.** No `git add`, `git commit`, `git push`, tag, merge, or branch switch was performed. All git operations remain the user's responsibility.

## Recommended Commit Message
```
docs(departments): add STEP-16A department module audit

Audits DB/API/UI/i18n/RBAC state of the Department module and finds
it already fully implemented (since aed7c60, extended in v1.2.0 /
ADR-023). Identifies stale CLAUDE.md roadmap text, a Thai-only i18n
bug on the manager field, and missing test coverage. Proposes
STEP-16B (tests + i18n fix), STEP-16C (active/inactive flag,
migration), STEP-16D (UX polish) as follow-ups.
```
