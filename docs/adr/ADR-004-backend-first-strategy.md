# ADR-004: Backend-First Development Strategy

## Status
Accepted

## Date
2026-06-12

## Context
The HR Management system is being built by a small team with a single primary developer (assisted by Claude Code). Building frontend and backend in parallel risks wasting UI effort when API contracts, data models, or RBAC rules change. Business logic (leave balance deduction, attendance timezone rules, approval workflows) must be validated before a UI is built on top of it. Additionally, Architecture Decision Records (ADRs) cannot be written accurately until the architectural decisions have actually been made in the implementation.

## Decision
Adopt a **backend-first development strategy**:

1. The API must reach **v1.0 completeness** before frontend UI work begins.
2. Backend v1.0 is defined as: all core modules implemented, verified, and documented.
3. ADRs are written after implementation, not speculatively before it.

### Backend v1.0 scope (completed)
| Step | Module |
|------|--------|
| T-016 | Department Module |
| T-017 | Position Module |
| T-018 | Attendance Module |
| T-019 | Leave Request Module |
| T-020 | Leave Balance Module |
| T-021 | Dashboard Module |
| T-022 | Backend Hardening & QA |
| T-023 | ADR Pack (this document) |

### What "frontend starts" means
After backend v1.0 is committed, the Next.js frontend can begin consuming the API. At that point, the API contract (routes, request/response shapes, RBAC) is stable enough to build UI against without expecting breaking changes.

### ADR policy
ADRs were intentionally postponed until backend v1.0 so that each decision document reflects what was actually built rather than what was planned. Writing ADRs against a working, verified system eliminates guesswork and discrepancy.

## Consequences

**Positive**
- API contracts are stable before UI development begins — no wasted frontend work from backend churn.
- Business rules are validated end-to-end (leave approval flow, balance deduction, timezone handling) before a user-facing layer depends on them.
- ADRs accurately describe the implemented system.
- Docker verification and smoke tests cover the full backend before any UI is built.

**Negative**
- Frontend delivery is delayed until backend is complete.
- UX feedback comes later in the cycle — no iterative UI/API co-design.
- Stakeholders cannot see a working UI until Phase 2.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Parallel frontend + backend | Risk of API churn breaking in-progress UI; higher coordination overhead for a solo team |
| Frontend-first (mock API) | Mock data doesn't validate actual business rules; mocks accumulate drift |
| Monolith (Next.js API routes only) | Harder to scale; mixes concerns; no separate API for mobile/external consumers later |

## Follow-up Tasks
- Begin frontend UI phase (T-024 or equivalent): Dashboard page, Employee list, Leave management.
- Align Next.js API client with routes documented in `docs/API_ROUTES.md`.
- Consider an OpenAPI/Swagger spec for the API to support frontend development without needing to read source code.
