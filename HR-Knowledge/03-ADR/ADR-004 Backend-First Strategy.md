# ADR-004: Backend-First Development Strategy

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Adopt a **backend-first development strategy**:

1. The API must reach v1.0 completeness before frontend UI work begins.
2. Backend v1.0 = all core modules implemented, verified, and documented.
3. ADRs are written after implementation, not speculatively before.

## Why

- Avoids frontend rework from API churn during backend development
- Business rules (leave balance deduction, timezone handling, approval flow) validated end-to-end before UI depends on them
- ADRs accurately describe what was actually built — no speculative or outdated decisions

## Scope of Backend v1.0

| Step | Module |
|---|---|
| T-016 | Department Module |
| T-017 | Position Module |
| T-018 | Attendance Module |
| T-019 | Leave Request Module |
| T-020 | Leave Balance Module |
| T-021 | Dashboard Module |
| T-022 | Backend Hardening & QA |
| T-023 | ADR Pack |

**Status: Complete.**

## What "Frontend Starts" Means

After backend v1.0 is committed, the Next.js frontend can consume the API. The API contract (routes, request/response shapes, RBAC) is stable — no breaking changes expected.

## Source

`docs/adr/ADR-004-backend-first-strategy.md`

## Related Notes

- [[Current Status]]
- [[Backend v1 Architecture]]
- [[ADR Index]]

#adr #process #backend-v1
