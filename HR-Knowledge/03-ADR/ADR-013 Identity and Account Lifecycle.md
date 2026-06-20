# ADR-013: Identity and Employee Account Lifecycle

**Status:** Accepted | **Date:** 2026-06-20

## Decision

Adopt an employee-linked account lifecycle with username-or-email login and HR-admin-controlled provisioning/reset flows.

## Key Points

- `POST /auth/login` accepts username or email
- User identity now includes `username`, `employeeId`, `isActive`, `mustChangePassword`, `passwordGeneratedAt`, `lastLoginAt`
- HR/Admin account endpoints are:
  - `GET /employees/:id/account`
  - `POST /employees/:id/account`
  - `POST /employees/:id/account/reset-password`
- Temporary passwords are generated server-side, shown once only, and never stored in plain text
- Provisioning and reset both set `mustChangePassword = true`

## Endpoint Ambiguity Resolved

Current source confirms:
- active: `/employees/:id/account`
- active: `/employees/:id/account/reset-password`
- not current: `/employees/:id/provision`
- not current: `/employees/:id/reset-password`

## Source

`docs/adr/ADR-013-identity-and-employee-account-lifecycle.md`

#adr #security #identity
