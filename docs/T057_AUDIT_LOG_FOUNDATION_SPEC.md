# Audit Log Foundation Specification

## Objective

T-057 prepares the HR Management System for reliable audit logging of security-sensitive and operationally important actions.

Audit logs are needed in this HR system because the platform already handles:
- authentication events
- employee account provisioning
- password changes and resets
- attendance activity
- leave approval decisions

These actions affect user access, employee records, and workforce operations. Without a dedicated audit trail, it is harder to investigate incidents, answer internal compliance questions, reconstruct administrative actions, or confirm who performed a sensitive action and when it happened.

T-057 will solve the current gap by defining a foundation for structured, append-only audit records that can later be captured consistently across auth, employee, leave, and attendance flows.

---

## Scope For Future Implementation

The future audit log foundation should be designed to capture at least the following actions:

- login success
- login failure
- password change
- employee account provisioning
- temporary password reset
- leave request approval
- leave request rejection
- attendance clock-in
- attendance clock-out

The first implementation should focus on recording enough context to support:
- operational troubleshooting
- security review and incident investigation
- administrative accountability
- future filtered API retrieval

Action naming should be explicit and stable. Suggested action constants for future implementation:

| Event | Suggested action value |
|---|---|
| Login success | `AUTH_LOGIN_SUCCESS` |
| Login failure | `AUTH_LOGIN_FAILURE` |
| Password change | `AUTH_PASSWORD_CHANGE` |
| Employee account provisioning | `EMPLOYEE_ACCOUNT_PROVISIONED` |
| Temporary password reset | `EMPLOYEE_TEMP_PASSWORD_RESET` |
| Leave approval | `LEAVE_REQUEST_APPROVED` |
| Leave rejection | `LEAVE_REQUEST_REJECTED` |
| Attendance clock-in | `ATTENDANCE_CLOCK_IN` |
| Attendance clock-out | `ATTENDANCE_CLOCK_OUT` |

---

## Out Of Scope

T-057 foundation work should explicitly exclude the following:

- No UI implementation yet
- No export/report screen yet
- No advanced analytics yet
- No external SIEM integration
- No destructive data retention automation yet

This keeps the initial delivery focused on safe backend audit capture and controlled read access only.

---

## Proposed Audit Log Data Model

This section describes fields only. It does not define a final Prisma implementation or migration.

| Field | Type Direction | Purpose |
|---|---|---|
| `id` | UUID/string | Unique immutable audit record identifier |
| `actorUserId` | UUID/string or `null` | User who performed the action; may be `null` for unauthenticated login failures before user resolution |
| `actorRole` | enum/string or `null` | Role associated with the actor at the time of the action |
| `action` | enum/string | Stable machine-readable action name |
| `targetType` | enum/string | Category of object affected, for example `USER`, `EMPLOYEE`, `LEAVE_REQUEST`, `ATTENDANCE_RECORD`, `AUTH` |
| `targetId` | UUID/string or `null` | Primary identifier of the affected target entity when available |
| `targetLabel` | string or `null` | Human-readable target reference, such as username, employee code, or leave request label |
| `result` | enum/string | Outcome such as `SUCCESS`, `FAILURE`, or `REJECTED` |
| `ipAddress` | string or `null` | Request source IP if available through the API layer or proxy-safe extraction |
| `userAgent` | string or `null` | Client user-agent value if available |
| `metadata` | JSON/object or `null` | Sanitized supplementary context relevant to the action |
| `createdAt` | datetime | Immutable audit timestamp |

### Notes On Field Intent

`actorUserId`
- Should reflect the authenticated user who initiated the action.
- For failed login attempts, this may remain `null` if no user can be safely resolved.

`actorRole`
- Should be captured as a snapshot value at write time.
- This avoids ambiguity if the actor’s role changes later.

`targetType`
- Should use a narrow controlled set of values to support filtering and future reporting.

`targetLabel`
- Should help operators read logs without extra joins.
- Must never contain secrets or temporary passwords.

`result`
- Should distinguish between success and failure clearly.
- Leave rejection is still an intentional administrative action, so it may use `SUCCESS` as the action outcome while the action name itself indicates rejection.

`metadata`
- Should remain optional and minimal.
- Good examples: leave type, attendance source, reason code, request route, validation category.
- Bad examples: passwords, raw tokens, full headers, secret values, unfiltered request bodies.

---

## Security And Privacy Notes

The future implementation must follow these rules:

- Do not store passwords
- Do not store password hashes
- Do not store access tokens or refresh tokens
- Do not store temporary passwords
- Metadata must be sanitized
- Audit records should be append-only

Additional guidance:

- Store only the minimum context required for traceability.
- Avoid copying full request bodies into `metadata`.
- Avoid recording highly sensitive personal data unless it is necessary for the audit purpose.
- Prefer short structured metadata fields over large free-form text blobs.
- Treat audit logs as sensitive internal records even though they are not secret material.
- Update operations on audit records should not be supported in normal application behavior.
- Deletion should not be part of the initial foundation scope.

---

## RBAC Policy

Future audit log read access should be intentionally narrow.

### Allowed Readers

| Role | Proposed access |
|---|---|
| `SUPER_ADMIN` | Full read access |
| `HR_ADMIN` | Read access, subject to any future policy refinement if certain auth events need tighter restriction |

### Possibly Excluded

| Role | Proposed access |
|---|---|
| `MANAGER` | Excluded in initial implementation |
| `EMPLOYEE` | Excluded in initial implementation |

### RBAC Notes

- Backend RBAC must remain the source of truth.
- UI visibility must not be treated as authorization.
- Initial implementation should default to the more restrictive model if there is ambiguity.
- If future requirements need partial manager visibility, that should be a separate scoped task rather than added opportunistically to T-057.

---

## API Design Proposal

This section describes future endpoints only. It does not authorize implementation in this task.

### GET /audit-logs

Purpose:
- Return a paginated list of audit records for authorized administrators.

Proposed filters:
- `action`
- `actorUserId`
- `targetType`
- `targetId`
- `result`
- `dateFrom`
- `dateTo`

Additional suggested query params:
- `page`
- `limit`

Suggested response characteristics:
- Paginated list shape consistent with existing admin list endpoints
- Default newest-first ordering by `createdAt`
- Validation for supported filter values
- Reasonable max page size to avoid heavy log scans

### GET /audit-logs/:id

Purpose:
- Return a single audit record by identifier for authorized administrators.

Suggested behavior:
- `404` when the record does not exist
- `403` when the caller lacks access
- No mutation behavior

### API Notes

- Read endpoints should be JWT-protected.
- Read endpoints should use role guards for `SUPER_ADMIN` and `HR_ADMIN`.
- Filtering should rely on indexed fields once the model exists.
- Date filters should use a documented timezone assumption, preferably UTC storage with clear API semantics.

---

## Implementation Plan For Future T-057

Future implementation should be broken into safe phases:

### Phase 1. Prisma Model And Migration

- Define the audit log model in Prisma
- Add required indexes for likely filters
- Create and review the migration carefully
- Keep the schema minimal and extensible

### Phase 2. Audit Service

- Create a dedicated audit service in `apps/api/src/audit-log`
- Centralize write behavior to avoid duplicated logging logic
- Provide safe helper methods for structured event creation

### Phase 3. Auth Integration

- Log login success
- Log login failure
- Log password change
- Ensure auth integration never logs credentials or token values

### Phase 4. Employee Account Integration

- Log employee account provisioning
- Log temporary password reset
- Capture actor, target employee, and sanitized metadata only

### Phase 5. Leave Integration

- Log leave request approval
- Log leave request rejection
- Capture relevant request identifiers and decision context

### Phase 6. Attendance Integration

- Log attendance clock-in
- Log attendance clock-out
- Capture source context, such as mobile or web, only if it is already available safely

### Phase 7. API Read Endpoints

- Add `GET /audit-logs`
- Add `GET /audit-logs/:id`
- Apply strict RBAC and DTO validation

### Phase 8. Tests

- Add unit tests for the audit service
- Add integration tests for audited flows
- Add RBAC and filtering tests for read endpoints

### Phase 9. Documentation Update

- Update route inventory
- Update auth, attendance, leave, and employee docs if behavior changes
- Add CTO summary for the implementation task

---

## Test Plan

The future implementation should include both unit and integration coverage.

### Unit Tests

- Audit service creates records with required fields
- Audit service handles optional fields correctly
- Metadata sanitization removes disallowed sensitive keys
- Action constants map consistently to stored values
- Append-only protections are respected by service-level write patterns

### Integration Tests

- Successful login writes an audit record
- Failed login writes an audit record without secret leakage
- Password change writes an audit record
- Employee account provisioning writes an audit record
- Temporary password reset writes an audit record without storing the temporary password
- Leave approval writes an audit record
- Leave rejection writes an audit record
- Attendance clock-in writes an audit record
- Attendance clock-out writes an audit record

### RBAC And API Tests

- `SUPER_ADMIN` can list audit logs
- `HR_ADMIN` can list audit logs
- `MANAGER` is denied access in the initial policy
- `EMPLOYEE` is denied access in the initial policy
- Supported filters return expected subsets
- Invalid filters are rejected with validation errors
- Single-record lookup returns the correct record or `404`

### Security-Focused Tests

- Stored audit `metadata` never includes passwords
- Stored audit `metadata` never includes password hashes
- Stored audit `metadata` never includes JWTs or refresh tokens
- Stored audit `metadata` never includes temporary passwords

---

## Risk Assessment

### Migration Risk

- Adding a new audit table is low-to-moderate risk, but migration review still matters.
- Index choices should be deliberate to avoid unnecessary write overhead.

### Sensitive Data Risk

- Audit logging can accidentally become a second channel for secret exposure.
- The highest priority design rule is preventing sensitive credentials, hashes, tokens, and temporary passwords from entering audit storage.

### Performance And Log Growth Risk

- Audit logs will grow continuously.
- Write volume may increase quickly around auth and attendance flows.
- Query design, indexing, and pagination should be planned from the start.

### Scope Creep Risk

- It is easy for audit logging work to expand into reporting, dashboards, analytics, exports, retention policies, and external integrations.
- T-057 should remain focused on foundational capture and controlled read access.

---

## Verification Plan

### For This Documentation-Only Task

- `git status --short`
- `git diff --check`
- manually review the created markdown

### For The Future Implementation Task

- `./scripts/verify.sh`
- `npm --prefix apps/api test`
- `./scripts/api-smoke-test.sh`
- security review only if auth/token/RBAC/sensitive handling changes require it

---

## CTO Summary

### Files Changed

- `docs/T057_AUDIT_LOG_FOUNDATION_SPEC.md`

### Scope

- Added a documentation-only specification for the future audit log foundation.
- Defined objective, scope, out-of-scope boundaries, proposed data model fields, RBAC direction, API proposal, phased implementation plan, test plan, risks, and verification guidance.

### Verification Performed

- `git status --short`
- `git diff --check`
- manual markdown review

### Risks

- Future implementation risk remains around schema migration review, sensitive metadata handling, log growth, and scope creep into analytics or reporting.

### Next Recommended Task

- Implement T-057 Phase 1 and Phase 2 only: Prisma model/migration review plus a dedicated backend audit service with sanitization rules and tests.
