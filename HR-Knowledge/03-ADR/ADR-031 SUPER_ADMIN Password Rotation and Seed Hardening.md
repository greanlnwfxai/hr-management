# ADR-031: SUPER_ADMIN Password Rotation and Seed Hardening

**Status:** Accepted | **Date:** 2026-07-02

## Decision

Production `SUPER_ADMIN` (`admin@hr.local`) password was rotated via the
existing self-service Profile → Change Password UI. `apps/api/prisma/seed.ts`
was hardened so re-running the seed never overwrites an existing admin
account's password or `mustChangePassword`.

## Key Points

- Rotation was data-only, performed by the account owner; no password/token
  value was seen, stored, or logged by Claude/Codex
- Seed script now checks if `admin@hr.local` already exists — if so, makes
  **no changes** to `password`/`mustChangePassword` and exits
- Fresh-install/CI seeding behavior (no existing admin) is unchanged
- This is seed **safety hardening**, not a runtime auth behavior change — login/
  JWT/hashing logic untouched
- No schema change, no migration
- No password value appears in this note, the ADR, or the CTO summary

## Source

`docs/adr/ADR-031-super-admin-password-rotation-and-seed-hardening.md`

#adr #security #seed #identity
