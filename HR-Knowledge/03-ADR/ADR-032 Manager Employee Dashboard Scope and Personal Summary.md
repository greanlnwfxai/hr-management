# ADR-032: Manager/Employee Dashboard Scope and Personal Summary

**Status:** Accepted | **Date:** 2026-07-01

## Decision

EMPLOYEE now gets a self-only dashboard; MANAGER gets the existing team
dashboard plus an embedded "My Summary" personal section. Both use the same
already-existing self-scoped endpoints. No backend changes.

## Key Points

- SUPER_ADMIN / HR_ADMIN — global dashboard via `GET /dashboard`, unchanged
- MANAGER — Team Overview (`GET /dashboard`, department-scoped, unchanged) +
  "My Summary" (own attendance/leave/balance via `/attendance/me`,
  `/leave-balances/my`, `/leave/me`)
- EMPLOYEE — self-only dashboard via the same three `/me` endpoints; **never**
  calls `GET /dashboard`
- `GET /dashboard` RBAC guard (`SUPER_ADMIN`, `HR_ADMIN`, `MANAGER`) untouched —
  EMPLOYEE's "no global data" guarantee is architectural, not an added runtime
  check
- Shared `PersonalSummaryBody` component for both roles — one code path for
  self-data, reducing scope-leak risk
- v1.2.63 follow-up: fixed today-attendance detection and date rendering —
  `attendance.date` arrives as a full ISO timestamp encoding a business date,
  not a plain `YYYY-MM-DD` string; comparisons must normalize first

## Source

`docs/adr/ADR-032-manager-employee-dashboard-scope-and-personal-summary.md`

#adr #dashboard #rbac #attendance #leave
