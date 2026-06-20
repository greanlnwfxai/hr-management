# ADR-014: Password Change and mustChangePassword Policy

**Status:** Accepted | **Date:** 2026-06-20

## Decision

Use a JWT-protected self-service password change endpoint and UX-enforced `mustChangePassword` policy across web and mobile.

## Key Points

- `POST /auth/change-password`
- verifies current password
- enforces password complexity
- clears `mustChangePassword` on success
- never returns password hash or raw password
- web and mobile enforce forced-password flow at the UX layer
- profile/change-password and logout remain accessible
- backend request-level hard blocking is future hardening, not current behavior

## Source

`docs/adr/ADR-014-password-change-and-must-change-password-policy.md`

#adr #security #password-policy
