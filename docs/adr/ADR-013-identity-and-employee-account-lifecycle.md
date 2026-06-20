# ADR-013: Identity and Employee Account Lifecycle

## Status
Accepted

## Date
2026-06-20

## Context
Later milestones extended the original authentication model beyond email-only login. The system now needs a consistent identity and account lifecycle for HR-managed employee access, including username-based login, employee-linked user accounts, one-time temporary passwords, and read-only account metadata for HR/Admin staff.

## Decision
Adopt an employee-linked account lifecycle with username-or-email login and HR-admin-controlled provisioning/reset flows.

### Login identifier policy
- `POST /auth/login` accepts `login` or legacy `email`.
- The identifier is trimmed and lowercased.
- If the identifier contains `@`, lookup is by email.
- Otherwise, lookup is by username.
- Invalid credentials and inactive accounts return the same generic auth failure response.

### Employee-linked user model
User identity and account state now include:
- `username`
- `employeeId`
- `isActive`
- `mustChangePassword`
- `passwordGeneratedAt`
- `lastLoginAt`

The login response and JWT payload expose only the safe identity subset needed by clients:
- `id`
- `email`
- `username`
- `role`
- `mustChangePassword`
- `employeeId`

### HR-admin account lifecycle endpoints
Verified current employee-account endpoints:
- `GET /employees/:id/account`
- `POST /employees/:id/account`
- `POST /employees/:id/account/reset-password`

These are the live endpoints. Older route guesses such as:
- `POST /employees/:id/provision`
- `POST /employees/:id/reset-password`

are **not** current API routes.

### Provisioning and reset behavior
- HR/Admin provisions a login account for an employee through `POST /employees/:id/account`.
- If the employee already has a linked user, provisioning updates the linked account rather than creating a duplicate.
- Reset uses `POST /employees/:id/account/reset-password`.
- Temporary passwords are generated server-side, shown once in the response, and never stored in plain text.
- Provisioning and reset both set `mustChangePassword = true`.

### Account metadata read model
`GET /employees/:id/account` exposes safe admin-readable fields:
- `id`
- `username`
- `email`
- `role`
- `isActive`
- `mustChangePassword`
- `passwordGeneratedAt`
- `lastLoginAt`
- `createdAt`

Password hashes and raw passwords are never returned.

## Consequences

**Positive**
- Employees can log in with usernames or emails, which fits HR-provisioned onboarding.
- HR/Admin can manage employee account lifecycle without touching raw credentials after one-time display.
- Linked `employeeId` context simplifies downstream web/mobile self-service behavior.
- Generic auth failure responses reduce user enumeration risk.

**Negative**
- HR must communicate one-time temporary passwords through a separate trusted channel.
- Account status toggling is still display-only in the current system; there is no `PATCH /employees/:id/account` endpoint yet.
- Username suggestion and validation rules remain constrained to Latin-character-friendly usernames.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Email-only login forever | Less usable for HR-provisioned internal accounts |
| Separate user provisioning module outside employees | Breaks the employee-to-account lifecycle connection |
| Persist temporary passwords for later retrieval | Unacceptable security risk |
| Multiple competing employee-account endpoints | Creates ambiguity and documentation drift |

## Follow-up Tasks
- Add account activation/deactivation management if product requirements need `isActive` writes.
- Add secure delivery workflow for temporary passwords or onboarding notifications.
- Consider audit logging for provisioning and reset actions when audit log implementation begins.
