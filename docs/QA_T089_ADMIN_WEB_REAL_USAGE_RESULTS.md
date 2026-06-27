# T-089 — Admin Web Real-Usage QA Results

**Task:** T-089
**Date executed:** 2026-06-27
**Tester:** Claude Code (automated code-inspection; no live execution)
**Baseline:** `2d3849d docs(qa): add admin web production QA checklist T-088`
**Checklist source:** `docs/QA_T088_ADMIN_WEB_PRODUCTION_QA.md`

---

## Environment Status

| Target | Status | Reason |
|--------|--------|--------|
| Local stack (`localhost:4002`) | NOT RUNNING | `docker compose ps` — no containers up |
| Production (`172.16.2.31:4002`) | UNREACHABLE | Connection timeout (curl exit 28) |
| Test accounts (SUPER_ADMIN / MANAGER / EMPLOYEE) | NOT AVAILABLE | No credentials provided |

**Execution method:** Static code inspection only.
All checks that require a running system or live browser are classified **BLOCKED**.
All mutating `(MUT)` checks are classified **NOT RUN** per task scope constraints.

No runtime code was changed in this task.

---

## Result Summary

| Section | Total | PASS | FAIL | BLOCKED | NOT RUN |
|---------|------:|-----:|-----:|--------:|--------:|
| Pre-flight | 5 | 1 | 0 | 4 | 0 |
| A — Authentication / Session | 17 | 0 | 0 | 17 | 0 |
| B — Layout / Navigation / RBAC | 25 | 19 | 3 | 3 | 0 |
| C — Dashboard | 17 | 0 | 0 | 17 | 0 |
| D — Employee Management | 18 | 3 | 0 | 5 | 10 |
| E — Department Management | 11 | 0 | 2 | 4 | 5 |
| F — Position Management | 10 | 0 | 2 | 5 | 3 |
| G — Attendance | 13 | 0 | 0 | 9 | 4 |
| H — Leave Requests | 13 | 3 | 0 | 4 | 6 |
| I — Leave Balances | 7 | 2 | 0 | 2 | 3 |
| J — Off-Site Requests | 10 | 1 | 0 | 4 | 5 |
| K — Geofence Settings | 8 | 2 | 0 | 2 | 4 |
| L — Audit Logs | 15 | 2 | 0 | 13 | 0 |
| M — Profile / Password | 10 | 0 | 0 | 2 | 8 |
| N — Security | 6 | 1 | 0 | 5 | 0 |
| O — Visual / UX | 5 | 0 | 0 | 5 | 0 |
| **TOTAL** | **190** | **34** | **7** | **101** | **48** |

> **Note:** T-088 CTO summary cited "95 test items." This execution counted 190 individual checkbox items
> (each `- [ ]` bullet in the checklist, including cases where T-088 grouped multiple assertions per bullet).

---

## PASS Results (Code Inspection)

All PASS results are based on static source code analysis. They are labeled with file and line references.
They are NOT confirmed by a live browser session or API call.

| Check | Area | Description | Evidence (file:line) |
|-------|------|-------------|----------------------|
| PRE-4 | Pre-flight | Working tree clean | `git status --short` → no output |
| B1.1–9 (×9) | SUPER_ADMIN nav | All 9 nav items visible for SUPER_ADMIN | `AppLayout.tsx:navForRole('SUPER_ADMIN')` returns 9 routes |
| B2.1 | MANAGER nav | Correct visible items (Dashboard, Employees, Attendance, Leave, Off-site) | `AppLayout.tsx:navForRole('MANAGER')` |
| B2.2 | MANAGER nav | Correct hidden items (Departments, Positions, Audit Logs, Geofence) | Same `navForRole` — absent for MANAGER |
| B2.3 | MANAGER RBAC | `/audit-logs` direct URL → access denied (403 error state) | `audit-logs/page.tsx:61–65` — `if (!admin) return <ErrorState status={403} />` |
| B2.6 | MANAGER RBAC | `/attendance/geofence-settings` direct URL → access denied | `geofence-settings/page.tsx:57–63` — `if (!adminUser) return <div>{t('error_access_denied')}</div>` |
| B3.1 | EMPLOYEE nav | Correct visible items (Attendance, Leave only) | `AppLayout.tsx:navForRole('EMPLOYEE')` |
| B3.2 | EMPLOYEE nav | Correct hidden items (all admin routes absent) | Same `navForRole` |
| B3.5 | EMPLOYEE leave | `/leave` shows own records only | `leave/page.tsx` — `const fetcher = admin ? getLeave : getMyLeave;` |
| B3.6 | EMPLOYEE RBAC | `/audit-logs` direct URL → access denied (403 error state) | `audit-logs/page.tsx:61–65` — same gate as B2.3 |
| B4.1 | mustChangePassword | After login with `mustChangePassword=true` → redirected to `/profile` | `AppLayout.tsx:44–48` — `if (forced && pathname !== '/profile') router.replace('/profile')` |
| B4.3 | mustChangePassword | Navigating away returns to `/profile` | Same `useEffect` in `AppLayout.tsx` runs on every `pathname` change |
| D2.1 | Employee CRUD | SUPER_ADMIN sees Create/Edit/Delete buttons | `employees/page.tsx:216,280,299` — `{admin && ...}` where `isAdmin()=true` for SUPER_ADMIN |
| D2.2 | Employee CRUD | MANAGER sees no Create/Edit/Delete buttons | Same — `isAdmin()=false` for MANAGER |
| D2.3 | Employee CRUD | EMPLOYEE sees no Create/Edit/Delete buttons | Same — `isAdmin()=false` for EMPLOYEE |
| H1.3 | Leave list | Non-admin (MANAGER / EMPLOYEE) sees own leave only | `leave/page.tsx` — `const fetcher = admin ? getLeave : getMyLeave` |
| H2.4 | Leave RBAC | MANAGER sees no Approve/Reject buttons | `leave/page.tsx` — `{admin && <approve/reject buttons>}`; `admin=isAdmin()=false` for MANAGER |
| H2.5 | Leave RBAC | EMPLOYEE sees no Approve/Reject buttons | Same |
| I1.2 | Leave balance | Non-admin sees own leave balance only (no admin panel) | `leave/page.tsx` — `{admin && <balance admin panel>}` block hidden for non-admin |
| I2.4 | Leave balance | Non-admin: Create/Edit balance buttons NOT visible | Same `{admin && ...}` block |
| J2.4 | Off-site RBAC | EMPLOYEE: Approve/Reject NOT visible | `offsite/page.tsx:32` — `canApprove = role===SUPER_ADMIN\|\|HR_ADMIN\|\|MANAGER`; EMPLOYEE excluded |
| K2.1 | Geofence RBAC | MANAGER: `/attendance/geofence-settings` → access denied | `geofence-settings/page.tsx:57–63` |
| K2.2 | Geofence RBAC | EMPLOYEE: `/attendance/geofence-settings` → access denied | Same |
| L1.3 | Audit log RBAC | MANAGER: `/audit-logs` → 403 error state | `audit-logs/page.tsx:61–65` |
| L1.4 | Audit log RBAC | EMPLOYEE: `/audit-logs` → 403 error state | Same |
| N.6 | Security | `./scripts/security-review.sh` exits 0 | Script ran: `[PASS] SECURITY REVIEW PASSED` (Multer HIGH accepted-risk documented) |

---

## FAIL Results (Code Inspection)

| Check | Area | RO/MUT | Expected | Actual | Bug ID |
|-------|------|--------|----------|--------|--------|
| B2.4 | MANAGER RBAC | RO | `/departments` direct URL → access denied | `departments/page.tsx` has no early return for non-admin; page renders full department list (CRUD buttons hidden only) | BUG-003 |
| B2.5 | MANAGER RBAC | RO | `/positions` direct URL → access denied | `positions/page.tsx` has no early return for non-admin; page renders full position list | BUG-003 |
| B3.4 | EMPLOYEE RBAC | RO | `/employees` direct URL → blocked | `employees/page.tsx:113` skips `load()` for non-admin but page renders with empty/loading state; no "access denied" message. API `GET /employees` has no `@Roles` guard | BUG-004 |
| E2.1 | Dept RBAC | RO | MANAGER: `/departments` blocked | Same root cause as B2.4 | BUG-003 |
| E2.2 | Dept RBAC | RO | EMPLOYEE: `/departments` blocked | Same root cause | BUG-003 |
| F2.1 | Position RBAC | RO | MANAGER: `/positions` blocked | Same root cause as B2.5 | BUG-003 |
| F2.2 | Position RBAC | RO | EMPLOYEE: `/positions` blocked | Same root cause | BUG-003 |

> **Note:** B2.4/E2.1 and B2.5/F2.1 are the same finding appearing in multiple checklist sections.
> Root cause count: 2 distinct bugs (BUG-003, BUG-004).

---

## BLOCKED Results — Summary by Section

Blocked due to: no live services, no test accounts, no live browser.

| Section | Count | Primary blocker |
|---------|------:|----------------|
| Pre-flight (items 1, 2, 3, 5) | 4 | No running containers; no test accounts |
| A — Auth (all 17) | 17 | Requires live browser + running auth stack |
| B — mustChangePassword (B4.2, B4.4) | 2 | Requires live browser + account in `mustChangePassword` state |
| B — EMPLOYEE /dashboard (B3.3) | 1 | No role gate found in `dashboard/page.tsx`; depends on API 403 error state rendering — needs live system |
| C — Dashboard (all 17) | 17 | Requires live system with real data |
| D — Employee list (D1 × 5) | 5 | Requires live system |
| E — Dept list (E1 × 4) | 4 | Requires live system |
| F — Position list (F1 × 5) | 5 | Requires live system |
| G — Attendance (G1 RO, G2, G3, G4 = 9) | 9 | Requires live system + real attendance data |
| H — Leave list (H1 excl H1.3, H2.1) | 4 | Requires live system |
| I — Leave balance (I1.1, I1.3) | 2 | Requires live system |
| J — Off-site list (J1) | 4 | Requires live system |
| K — Geofence load (K1) | 2 | Requires live system |
| L — Audit log access SUPER/HR (L1.1, L1.2), log display (L2 × 3), filters (L3 × 8) | 13 | Requires live system |
| M — Profile (M1 × 2) | 2 | Requires live browser |
| N — Security checks (N.1–5) | 5 | Require live API calls or browser dev tools |
| O — Visual/UX (all 5) | 5 | Requires live browser |

---

## NOT RUN Results — Summary

All `(MUT)` checks were classified NOT RUN per T-089 scope: "Mutating checks must NOT be run against production. Mutating checks may only be marked NOT RUN or BLOCKED unless a local/staging environment is explicitly available and approved."

| Section | NOT RUN count | Examples |
|---------|:---:|---------|
| D3, D4, D5 — Employee CRUD | 10 | Create/edit/delete employee |
| E3 — Department CRUD | 5 | Create/edit/delete department |
| F3 — Position CRUD | 3 | Create/edit/delete position |
| G1 — Clock-in/out | 4 | Clock-in, clock-out, duplicate check |
| H2 (approve/reject), H3 (create request) | 6 | Approve leave, reject leave, submit request |
| I2 — Leave balance CRUD | 3 | Create balance, edit balance |
| J2 — Off-site approve/reject | 5 | Approve/reject off-site, action results |
| K3 — Geofence save | 4 | Toggle enabled, save lat/lng/radius |
| M2 — Password change | 8 | Live validation, submit, post-change login |

---

## Bug Candidates

### BUG-001 — MANAGER cannot approve/reject team leave via UI (API supports it)

| Field | Detail |
|-------|--------|
| **ID** | BUG-001 |
| **Severity** | MEDIUM |
| **Area** | Leave / RBAC — Frontend |
| **Steps to reproduce** | 1. Log in as MANAGER. 2. Navigate to `/leave`. 3. Observe: no Approve/Reject buttons on any PENDING leave request (including team members). |
| **Expected** | MANAGER should see Approve/Reject buttons for PENDING leave from employees in their managed department. The API `PATCH /leave/:id/approve` allows MANAGER with service-level department scoping (`leave.service.ts:171–176` — rejects if `approverEmp.managedDepartment.id !== leaveEmployee.departmentId`). |
| **Actual** | `leave/page.tsx` uses `{admin && <approve/reject>}` where `admin = isAdmin(user)`. `isAdmin()` returns false for MANAGER → buttons never rendered. MANAGER has no UI path to approve team leave. |
| **Evidence** | `apps/api/src/leave/leave.controller.ts` — `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` on `PATCH /leave/:id/approve` and `PATCH /leave/:id/reject`. `apps/api/src/leave/leave.service.ts:171–176` — department-scope check. `apps/web/app/(app)/leave/page.tsx` — `{admin && approve/reject buttons}`. |
| **Not a scope change** | API behavior is intentional and correctly scoped. Only the frontend is missing the MANAGER pathway. |
| **Suggested next task** | `HOTFIX-T089A` — Replace `isAdmin()` gate on approve/reject with a `canManageLeave` flag that includes MANAGER role. |

---

### BUG-002 — MANAGER sees only own leave in UI (API supports team leave view)

| Field | Detail |
|-------|--------|
| **ID** | BUG-002 |
| **Severity** | MEDIUM |
| **Area** | Leave / RBAC — Frontend |
| **Steps to reproduce** | 1. Log in as MANAGER. 2. Navigate to `/leave`. 3. Observe: only own leave requests listed. |
| **Expected** | MANAGER should see leave requests for employees in their managed department (the API `GET /leave` allows MANAGER via `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` and the service has MANAGER-specific handling at line 144). |
| **Actual** | `leave/page.tsx` uses `const fetcher = admin ? getLeave : getMyLeave` where `admin = isAdmin(user) = false` for MANAGER → `getMyLeave` called → only own records returned. |
| **Evidence** | `apps/api/src/leave/leave.controller.ts` — `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` on `GET /leave`. `apps/api/src/leave/leave.service.ts:144` — MANAGER role handling. `apps/web/app/(app)/leave/page.tsx` — `const fetcher = admin ? getLeave : getMyLeave`. |
| **Relationship to BUG-001** | Same root cause — `isAdmin()` is used as the MANAGER boundary check. A single `canManageLeave` flag that includes MANAGER would fix both BUG-001 and BUG-002. |
| **Suggested next task** | `HOTFIX-T089A` — same fix as BUG-001. |

---

### BUG-003 — Departments and positions pages accessible (not blocked) for non-admin roles

| Field | Detail |
|-------|--------|
| **ID** | BUG-003 |
| **Severity** | LOW-MEDIUM |
| **Area** | Department / Position / RBAC — Frontend + Backend |
| **Steps to reproduce** | 1. Log in as MANAGER or EMPLOYEE. 2. Navigate directly to `/departments`. 3. Observe: full department list renders (Create/Edit/Delete buttons hidden). Repeat for `/positions`. |
| **Expected** | Non-admin users navigating directly to `/departments` or `/positions` should see an "access denied" message (consistent with `/audit-logs` and `/attendance/geofence-settings` behavior). |
| **Actual** | `departments/page.tsx` and `positions/page.tsx` have NO early return for non-admin. The `admin` flag only controls CRUD button visibility. Full list renders for any authenticated user. `GET /departments` and `GET /positions` also have no `@Roles` guard on the API. |
| **Evidence** | `apps/web/app/(app)/departments/page.tsx:34` — `const admin = isAdmin(user)` used only for button visibility. `apps/web/app/(app)/positions/page.tsx:33` — same pattern. `apps/api/src/departments/departments.controller.ts` — `GET /departments` no `@Roles`. `apps/api/src/positions/positions.controller.ts` — `GET /positions` no `@Roles`. Compare: `audit-logs/page.tsx:61–65` has explicit `if (!admin) return <ErrorState>`. |
| **Checklist failures** | B2.4, B2.5, E2.1, E2.2, F2.1, F2.2 (6 checks) |
| **Note** | CRUD mutations (POST/PATCH/DELETE) are correctly guarded at API level with `@Roles(SUPER_ADMIN, HR_ADMIN)`. Read access to directory data may be considered acceptable; the UX inconsistency (some pages block, some don't) is the primary issue. |
| **Suggested next task** | `HOTFIX-T089B` — Add `if (!admin) return <ErrorState status={403} />` to `departments/page.tsx` and `positions/page.tsx`. Optionally add `@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)` to `GET /departments` and `GET /positions` if read access should also be restricted at the API level. |

---

### BUG-004 — Employee list page gives no "access denied" for EMPLOYEE role

| Field | Detail |
|-------|--------|
| **ID** | BUG-004 |
| **Severity** | LOW |
| **Area** | Employee / RBAC — Frontend + Backend |
| **Steps to reproduce** | 1. Log in as EMPLOYEE. 2. Navigate directly to `/employees`. 3. Observe: page renders but shows no employee data (empty/loading state with no message). |
| **Expected** | EMPLOYEE navigating to `/employees` should see an "access denied" message (consistent with `/audit-logs` behavior). |
| **Actual** | `employees/page.tsx:113` has `if (!admin) return;` inside the `load` callback — skips data fetch, but the page still renders (empty state, no explanation). `GET /employees` API has no `@Roles` guard, so EMPLOYEE could also bypass the UI and call the API directly to retrieve all employee records. |
| **Evidence** | `apps/web/app/(app)/employees/page.tsx:113` — `if (!admin) return;` inside `useCallback`. `apps/api/src/employees/employees.controller.ts` — `GET /employees` no `@Roles`. `apps/api/src/employees/employees.service.ts:EMPLOYEE_SELECT` — returns directory fields only (name, email, code, department, position, manager); no salary or national ID. |
| **Data sensitivity** | LOW — `EMPLOYEE_SELECT` does not include salary or national ID. Directory-level exposure only. |
| **Suggested next task** | `HOTFIX-T089B` — Add explicit `if (!admin) return <ErrorState status={403} />` render path to `employees/page.tsx`. Optionally add `@Roles` to `GET /employees` if directory access should be restricted. |

---

## Additional RBAC Observations (Not on T-088 Checklist)

These were discovered during controller survey but are not mapped to a specific T-088 check item.

| Observation | Severity | Notes |
|-------------|----------|-------|
| `GET /employees` and `GET /employees/:id` — no `@Roles` guard | LOW | Any authenticated user (including EMPLOYEE) can call these endpoints directly. Frontend gates data display for non-admin via `if (!admin) return;` in load callback. Data returned is directory-level only (no salary/PII). |
| `PATCH /leave/:id/approve` and `PATCH /leave/:id/reject` — `@Roles` includes MANAGER | INFO | By design — service performs department-scope check at line 171–176. Not a bug at API level; BUG-001 tracks the missing UI pathway. |
| `GET /leave` — `@Roles` includes MANAGER | INFO | By design — MANAGER role is intended to have visibility of team leave at API level. BUG-002 tracks missing UI representation. |
| Off-site approve/reject — `canApprove` check includes MANAGER | PASS | `offsite/page.tsx:32` — `canApprove = SUPER_ADMIN\|\|HR_ADMIN\|\|MANAGER`. This is correct and consistent with off-site API controller which allows MANAGER on approve/reject. |

---

## What Remains Blocked (To Complete QA)

The following environment and access items are required to unblock the remaining 101 BLOCKED checks:

| Requirement | Blocks |
|-------------|--------|
| Local stack running (`docker compose up`) | Pre-flight 1–3, all live-execution checks |
| One account per role (SUPER_ADMIN, MANAGER, EMPLOYEE) | All RBAC positive-path browser checks (sections A, B, C, D, G, H, I, J, K, L, M, O) |
| Local-only environment (no production mutation) | All MUT checks (D3, D4, D5, E3, F3, G1.2–5, H2.1–3, H3, I2.1–3, J2.1–3/5–6, K3, M2) |
| Account with `mustChangePassword = true` | B4.2, B4.4 |

> **Recommendation:** To complete this QA cycle, bring up the local stack and provide three test accounts. This unlocks ~101 currently BLOCKED checks in a single session.

---

## Constraints Observed

| Constraint | Status |
|-----------|--------|
| Runtime code (backend, frontend, mobile) changed | NO |
| Database / Prisma schema changed | NO |
| Auth or session logic changed | NO |
| Business logic (attendance, leave, geofence) changed | NO |
| Docker / production compose changed | NO |
| Production data mutated | NO |
| Destructive Docker commands run | NO |
| `git add / commit / push / tag` run | NO (user performs manually) |
| `./scripts/docker-verify.sh` run | NOT RUN (not approved for this task) |
