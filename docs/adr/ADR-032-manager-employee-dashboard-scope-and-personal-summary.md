# ADR-032 — Manager/Employee Dashboard Scope and Personal Summary

**Status:** Accepted
**Date:** 2026-07-01
**Tasks:** HOTFIX-REQ002G-4 (v1.2.61), HOTFIX-REQ002G-5 (v1.2.62), HOTFIX-REQ002G-6 (v1.2.63)
**Related tags:** `v1.2.61-employee-self-dashboard-profile-polish`, `v1.2.62-manager-personal-dashboard-summary`, `v1.2.63-personal-attendance-summary-date-fix`
**Implementation reference:** `docs/CTO_SUMMARY_HOTFIX_REQ002G_4.md`, `docs/CTO_SUMMARY_HOTFIX_REQ002G_5.md`, `docs/CTO_SUMMARY_HOTFIX_REQ002G_6.md`

---

## Context

Two gaps existed in the web dashboard UX:

1. **EMPLOYEE had no useful dashboard.** The `/dashboard` route redirected
   EMPLOYEE to `/profile`, even though `GET /dashboard` was already correctly
   restricted to `SUPER_ADMIN` / `HR_ADMIN` / `MANAGER` (ADR-006).
2. **MANAGER had no personal view.** MANAGER saw only the department-scoped
   Team Overview (from `GET /dashboard`) with no equivalent of an employee's own
   attendance/leave/balance summary.

A follow-up bug (v1.2.63) then surfaced in the shared personal-summary
component: `GET /attendance/me` returns `date` as a full ISO timestamp (the
backend's business-date-as-UTC-midnight convention, see `Attendance Module`
knowledge notes), but the frontend compared it against a plain `YYYY-MM-DD`
"today" string, so today's own attendance record was never detected as "today"
even though it was present in the data.

## Decision

**Dashboard scope by role, frontend-only (no backend changes):**

| Role | Dashboard | Data source |
|---|---|---|
| SUPER_ADMIN / HR_ADMIN | Global aggregated dashboard (org-wide KPIs, charts, recent activity) | `GET /dashboard` |
| MANAGER | Team Overview (department-scoped, same `GET /dashboard` call, same backend scoping) **plus** an embedded "My Summary" section showing the manager's own attendance/leave/balance | `GET /dashboard` (team) + `/attendance/me`, `/leave-balances/my`, `/leave/me` (self) |
| EMPLOYEE | Self-only dashboard — no team or global data | `/attendance/me`, `/leave-balances/my`, `/leave/me` only; **never** calls `GET /dashboard` |

EMPLOYEE and MANAGER's personal-summary sections share one component
(`PersonalSummaryBody` in `apps/web/app/(app)/dashboard/page.tsx`), fed by the
same three self-scoped, already-existing endpoints — there is exactly one code
path that fetches self-data, minimizing the chance of an accidental scope leak
between roles. `EmployeeSelfView` wraps it as a full page (EMPLOYEE);
`PersonalSummarySection` wraps it as an embedded section below the Team
Overview (MANAGER only).

**Architectural choice — frontend-only, not a new backend endpoint:** The
existing `GET /dashboard` guard (`@Roles(SUPER_ADMIN, HR_ADMIN, MANAGER)`) was
deliberately left untouched rather than opened to EMPLOYEE. EMPLOYEE's
self-dashboard is structurally incapable of leaking global data because it
never calls the guarded endpoint — the "no global data" guarantee is enforced
by architecture, not by an additional runtime check.

**Personal attendance date normalization (v1.2.63 correction):** The
personal-summary component now normalizes `attendance.date` (which may arrive
as either a plain `YYYY-MM-DD` string or a full ISO timestamp) to its business-
date digits before comparing against "today" or rendering it, via
`normalizeAttendanceBusinessDate` / `isSameBangkokDate` / `formatAttendanceDate`
helpers. Recent-attendance list dates render as `DD/MM/YYYY` (locale `en-GB`,
not `th-TH`, to avoid the Buddhist-calendar-year rendering of `th-TH` with a
numeric year) instead of the raw ISO string.

## Consequences

**Positive:**
- Every role now has a dashboard appropriate to its scope; no role sees data it
  isn't authorized for.
- No backend/RBAC surface change — the hardened `GET /dashboard` guard from
  prior scoping work is untouched.
- Today's-attendance detection and date rendering are now correct for both
  MANAGER's "My Summary" and EMPLOYEE's self-dashboard (shared fix via the
  shared component).

**Negative / Trade-offs:**
- No dedicated backend test coverage exists for an "EMPLOYEE dashboard path"
  because no such backend path was created — the guarantee is architectural
  (EMPLOYEE never calls the guarded endpoint), not runtime-enforced. This should
  be revisited if EMPLOYEE ever needs a backend-computed dashboard aggregate.
- No committed MANAGER/EMPLOYEE Playwright fixtures exist yet (only SUPER_ADMIN
  token caching in `e2e/global-setup.ts`); this scope was verified manually
  during v1.2.62/v1.2.63 rather than via committed automated role-based e2e
  tests. A follow-up ticket for dedicated fixtures is recommended.

## Related ADRs

- ADR-006 — Role-Based Access Control (base RBAC matrix; `GET /dashboard`
  guard unchanged by this decision)
- ADR-010 — Attendance Timezone Policy (Bangkok business-date convention this
  fix normalizes against)
- ADR-023 — Department Manager Leave Approval Scope (existing department
  scoping model that Team Overview already relied on, unchanged)
