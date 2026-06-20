# ADR-014: Password Change and mustChangePassword Policy

## Status
Accepted

## Date
2026-06-20

## Context
Once HR-admin account provisioning introduced one-time temporary passwords, the system needed a consistent self-service password change flow and a policy for forcing users off temporary credentials. This behavior now spans both API and client UX.

## Decision
Use a JWT-protected self-service password change endpoint and a UX-enforced `mustChangePassword` policy across web and mobile.

### Password change endpoint
`POST /auth/change-password`

Behavior:
- requires JWT authentication
- verifies the current password with bcrypt
- rejects when `newPassword === currentPassword`
- enforces password complexity
- updates the stored password hash
- clears `mustChangePassword` on success
- returns `{ success: true, mustChangePassword: false }`

### Response safety
- no password hash is ever returned
- no raw password is ever returned
- wrong current password returns an auth failure response

### mustChangePassword policy
- Provisioned or reset temporary passwords set `mustChangePassword = true`.
- Web and mobile enforce this at the UX layer.
- Profile / password-change access remains available.
- Logout remains available.
- Backend request-level hard blocking is **not** current behavior and remains future hardening.

### Current UX enforcement
Web:
- redirects protected routes to `/profile` when `mustChangePassword = true`
- suppresses normal navigation until password change completes

Mobile:
- deep screens such as attendance, leave, and approvals redirect to `/profile`
- profile remains accessible
- home keeps profile access and warning visibility available

## Consequences

**Positive**
- Temporary-password onboarding now has a complete self-service completion path.
- Password policy is enforced server-side, not only in UI hints.
- Clients can immediately clear forced-password state without re-login after successful change.

**Negative**
- `mustChangePassword` remains a UX policy flag rather than a backend-enforced request blocker.
- Any future backend hard enforcement must be introduced carefully to avoid locking users out of recovery paths.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Informational banner only | Too weak once temporary password onboarding became normal |
| Backend hard-block immediately | Stronger security, but deferred to avoid broader regression risk across clients |
| Admin-driven password change only | Poor employee self-service UX and unnecessary operational load |

## Follow-up Tasks
- Evaluate backend middleware or guard enforcement for non-profile routes when `mustChangePassword = true`.
- Add audit logging for password-change completion when audit logging is implemented.
- Consider future password age / expiry policy if the organization requires it.
