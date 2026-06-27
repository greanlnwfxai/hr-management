# CTO Summary

## Step
T-089 — Admin Web Real-Usage QA Execution

## Status
PASS (documentation deliverable complete; live execution BLOCKED pending environment)

---

## Scope

Executed the T-088 admin web QA checklist via static code inspection. Classified all 190 individual checklist items as PASS / FAIL / BLOCKED / NOT RUN. Produced a full results document with bug candidates. No runtime code was changed.

**Execution method:** Static source code analysis only. No live services were running; no test accounts were available. All checks requiring a browser session or running API are BLOCKED. All `(MUT)` checks are NOT RUN per task constraints.

---

## Constraints Observed

| Area | Change made? |
|------|-------------|
| Runtime code (backend, frontend, mobile) | NO |
| Database / Prisma schema | NO |
| Auth or session logic | NO |
| Business logic (attendance, leave, geofence) | NO |
| Docker / production compose | NO |
| Production data mutated | NO |
| Destructive Docker commands run | NO |
| git add / commit / push / tag | NO (user performs manually) |
| `./scripts/docker-verify.sh` | NOT RUN (not approved for this task) |

**No runtime code was changed in T-089.**

---

## Result Summary

| Section | Total | PASS | FAIL | BLOCKED | NOT RUN |
|---------|------:|-----:|-----:|--------:|--------:|
| Pre-flight | 5 | 1 | 0 | 4 | 0 |
| A — Auth / Session | 17 | 0 | 0 | 17 | 0 |
| B — Nav / RBAC | 25 | 19 | 3 | 3 | 0 |
| C — Dashboard | 17 | 0 | 0 | 17 | 0 |
| D — Employees | 18 | 3 | 0 | 5 | 10 |
| E — Departments | 11 | 0 | 2 | 4 | 5 |
| F — Positions | 10 | 0 | 2 | 5 | 3 |
| G — Attendance | 13 | 0 | 0 | 9 | 4 |
| H — Leave | 13 | 3 | 0 | 4 | 6 |
| I — Leave Balances | 7 | 2 | 0 | 2 | 3 |
| J — Off-site | 10 | 1 | 0 | 4 | 5 |
| K — Geofence | 8 | 2 | 0 | 2 | 4 |
| L — Audit Logs | 15 | 2 | 0 | 13 | 0 |
| M — Profile | 10 | 0 | 0 | 2 | 8 |
| N — Security | 6 | 1 | 0 | 5 | 0 |
| O — Visual / UX | 5 | 0 | 0 | 5 | 0 |
| **TOTAL** | **190** | **34** | **7** | **101** | **48** |

---

## FAIL Items

| Check | Description | Root Cause | Bug ID |
|-------|-------------|-----------|--------|
| B2.4, E2.1, E2.2 | `/departments` accessible to non-admin roles | `departments/page.tsx` has no early return for non-admin; `GET /departments` has no `@Roles` guard | BUG-003 |
| B2.5, F2.1, F2.2 | `/positions` accessible to non-admin roles | `positions/page.tsx` has no early return for non-admin; `GET /positions` has no `@Roles` guard | BUG-003 |
| B3.4 | EMPLOYEE: `/employees` gives empty state (not "access denied") | `employees/page.tsx:113` skips `load()` for non-admin but page renders without explicit denial message; `GET /employees` has no `@Roles` | BUG-004 |

---

## Bug Candidates

| ID | Severity | Area | Description | Suggested Task |
|----|----------|------|-------------|---------------|
| BUG-001 | MEDIUM | Leave / RBAC (Frontend) | MANAGER cannot approve/reject team leave via UI. API `PATCH /leave/:id/approve` allows MANAGER with department-scope check in service (`leave.service.ts:171–176`). Frontend gates on `isAdmin()` which excludes MANAGER. | HOTFIX-T089A |
| BUG-002 | MEDIUM | Leave / RBAC (Frontend) | MANAGER sees only own leave in UI. API `GET /leave` allows MANAGER. Frontend uses `getMyLeave` for any non-admin. Related to BUG-001 (same `isAdmin()` gate). | HOTFIX-T089A |
| BUG-003 | LOW-MEDIUM | Dept / Position / RBAC | Departments and positions pages render full list for non-admin (CRUD hidden, data visible). Inconsistent with audit-logs and geofence-settings pages which have explicit `if (!admin) return <ErrorState>`. | HOTFIX-T089B |
| BUG-004 | LOW | Employees / RBAC | Employee list page gives no "access denied" for EMPLOYEE role — shows empty state. API `GET /employees` has no `@Roles` guard. Data exposure LOW (directory fields only, no salary/PII). | HOTFIX-T089B |

**Proposed HOTFIX tasks:**
- `HOTFIX-T089A` — Fix BUG-001 + BUG-002: Add `canManageLeave = isAdmin(user) || user?.role === 'MANAGER'` pattern to leave page so MANAGER sees team leave and approve/reject buttons.
- `HOTFIX-T089B` — Fix BUG-003 + BUG-004: Add `if (!admin) return <ErrorState status={403} />` to `departments/page.tsx`, `positions/page.tsx`, and `employees/page.tsx`. Optionally add `@Roles` guards to `GET /departments`, `GET /positions`, `GET /employees` if API-level restriction is also desired.

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/QA_T089_ADMIN_WEB_REAL_USAGE_RESULTS.md` | Full QA results — 190 items classified; bug candidates; BLOCKED resolution guide |
| `docs/CTO_SUMMARY_T089.md` | This CTO summary |

---

## Files Modified

None.

---

## Verification Performed

```
git status --short → (no output) — clean working tree

./scripts/verify.sh
→ [PASS] API build
→ [PASS] Prisma schema valid
→ [PASS] Web build
→ [PASS] ALL CHECKS PASSED

./scripts/security-review.sh
→ [PASS] API dependency audit (Multer HIGH — accepted risk, documented)
→ [PASS] Web dependency audit — no HIGH/CRITICAL
→ [PASS] Mobile dependency audit — no HIGH/CRITICAL
→ [PASS] Secret scan — no .env committed, no PEM blocks, no suspicious patterns
→ [PASS] SECURITY REVIEW PASSED
```

`./scripts/docker-verify.sh` — NOT RUN (not approved for this task; no Docker changes).
`./scripts/api-smoke-test.sh` — NOT RUN (no API changes; local stack not running).

---

## Issues Found

Four bug candidates identified by code inspection:

- **BUG-001 (MEDIUM):** MANAGER approve/reject leave absent from UI despite API support.
- **BUG-002 (MEDIUM):** MANAGER leave list shows own-only in UI despite API supporting team view.
- **BUG-003 (LOW-MEDIUM):** `/departments` and `/positions` pages accessible (not blocked) for non-admin roles.
- **BUG-004 (LOW):** `/employees` page gives empty state (not access denied) for EMPLOYEE role.

None of these bugs expose passwords, tokens, or highly sensitive PII. All CRUD mutations are correctly guarded at the API level.

---

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | No endpoints added or changed. |
| RBAC impact | No role checks were changed. Four bugs document existing gaps: BUG-001/002 (MANAGER UI underpresents capabilities), BUG-003/004 (non-admin can view directory data in pages that lack frontend access-denied gates). |
| Data privacy impact | `GET /employees`, `GET /departments`, `GET /positions` are readable by any authenticated user. `EMPLOYEE_SELECT` does not include salary or national ID — directory-level data only. Assessed LOW risk. |
| Password/token/hash impact | None. |
| Mobile security impact | None. |
| Dependency/advisory impact | No new packages added. Multer HIGH (API) has documented accepted risk in `.security-accepted-risks` and `docs/SECURITY_REVIEW_LOG.md`. |
| Secrets/logging check | Secret scan passed. No secrets in any new file. |
| New endpoints protected | N/A — no new endpoints. |
| Risk level | LOW |
| Security decision | PASS |

**Security note on identified bugs:**
- BUG-001/002: MANAGER can call `PATCH /leave/:id/approve` directly via API (within department scope). This is intentional API design, not a vulnerability. The gap is UI-only: MANAGER lacks a UI surface to perform their intended function.
- BUG-003: MANAGER/EMPLOYEE can read department and position lists via direct URL or direct API call. CRUD is blocked at API level (`@Roles(SUPER_ADMIN, HR_ADMIN)` on mutating endpoints). Low data sensitivity.
- BUG-004: EMPLOYEE can call `GET /employees` API directly and receive directory fields. No salary, national ID, or secrets exposed. Assessed LOW.
- None of these bugs meet Security FAIL conditions: no password/token exposure, no unintended admin escalation, no secret in source, no HIGH/CRITICAL unpatched dependency.

---

## Known Limitations

1. **Live execution not performed.** All 34 PASS results are based on static code analysis with file:line evidence. They have not been confirmed against a running system.
2. **101 checks remain BLOCKED.** Completing QA requires: local stack running, one test account per role (SUPER_ADMIN, MANAGER, EMPLOYEE), and local environment for MUT checks.
3. **Bug severity may change after live execution.** BUG-001 and BUG-002 impact severity confirmed after live MANAGER session with team leave data.

---

## Risk

Low

## Decision

PASS (documentation and code-inspection QA complete; live execution pending environment availability)

## Next Step

To close T-089 fully:
1. Stand up local stack (`docker compose up`) and prepare one account per role.
2. Re-execute all BLOCKED sections (A, B remaining, C, D, G, H, I, J, K, L, M, N.1–5, O) against the local environment.
3. Execute MUT sections (D3–D5, E3, F3, G1.2–5, H2.1–3, H3, I2.1–3, J2.1–3/5–6, K3, M2) against local environment.
4. Optionally pursue: `HOTFIX-T089A` (MANAGER leave UI), `HOTFIX-T089B` (access-denied gates for departments/positions/employees pages).

## Recommended Commit Message

```
docs(qa): add admin web real-usage QA results T-089

Execute T-088 checklist via static code inspection (no live services).
190 items: 34 PASS, 7 FAIL, 101 BLOCKED, 48 NOT RUN.
4 bug candidates documented: BUG-001/002 (MANAGER leave UI gaps),
BUG-003 (dept/position pages not blocked for non-admin),
BUG-004 (employees page empty state for EMPLOYEE role).
No runtime code changed. Propose HOTFIX-T089A and HOTFIX-T089B.
```
