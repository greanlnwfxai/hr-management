# ADR-018: Audit Log Foundation Specification Status

## Status
Superseded by ADR-019 (Audit Trail and Admin Audit Log Review) — dated 2026-06-21. The specification-only phase described here is complete; the Audit Log Pack (T-057B-1 through T-057B-7) has been fully implemented and deployed through `v1.1.41-admin-audit-log-ui`.

## Date
2026-06-20

## Context
The project now has a documented audit log foundation specification in `docs/T057_AUDIT_LOG_FOUNDATION_SPEC.md`, but no runtime implementation exists yet. Without an explicit decision record, later readers may confuse the specification with a delivered backend capability.

## Decision
Treat audit logging as specification-only work at the current milestone and require phased follow-up implementation before any backend/runtime claims are made.

### Current status
T-057-prep produced:
- `docs/T057_AUDIT_LOG_FOUNDATION_SPEC.md`

At this point there is:
- no Prisma audit log model
- no migration
- no `/audit-logs` API endpoint
- no runtime audit capture

### Implementation policy
Future audit log work should be phased and reviewed separately before database or backend changes are introduced.

Planned implementation stages include:
- schema/model work
- audit service
- auth integration
- employee account integration
- leave integration
- attendance integration
- read endpoints
- tests

## Consequences

**Positive**
- Prevents over-claiming audit capabilities that do not exist yet.
- Gives future implementation work a clear starting point and scope boundary.
- Keeps schema/backend changes gated behind explicit follow-up review.

**Negative**
- There is still no runtime audit trail for sensitive operational actions.
- Security and compliance investigation still depend on current logs and business records rather than a dedicated audit table.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Implement audit logging immediately in the prep task | Out of scope for the specification milestone |
| Leave audit log state undocumented | Too easy to misread the spec as implemented behavior |

## Follow-up Tasks
- Execute T-057 in phased backend/database work.
- Add audit-specific ADRs later if implementation decisions diverge from the current specification.
