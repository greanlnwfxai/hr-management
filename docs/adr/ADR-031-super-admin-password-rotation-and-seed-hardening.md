# ADR-031 — SUPER_ADMIN Password Rotation and Seed Hardening

**Status:** Accepted
**Date:** 2026-07-02
**Tasks:** HOTFIX-SEC-002 (v1.2.67)
**Related tags:** `v1.2.67-rotate-default-super-admin-password`
**Implementation reference:** `docs/CTO_SUMMARY_HOTFIX_SEC_002.md`

---

## Context

The default `SUPER_ADMIN` account (`admin@hr.local`) in production still
accepted the seed/default password (the same value documented throughout this
repository's dev/CI docs as the standard local seed credential — see
`CLAUDE.md`). `apps/api/prisma/seed.ts` used `prisma.user.upsert(...)`, whose
`update` branch unconditionally reset `password` (to the hardcoded default) and
`mustChangePassword: false` on **every** seed run. This meant any manual
production rotation of `admin@hr.local`'s password would have been silently
undone the next time the seed script executed — a rotate-then-revert trap.

## Decision

**1. Production password rotation (data-only):** The production `SUPER_ADMIN`
password was rotated by the account owner via the existing self-service
**Profile → Change Password** UI (`POST /auth/change-password`, JWT-guarded,
requires the correct current password, complexity policy per ADR-014). No
password value, token, or credential was generated, seen, stored, logged, or
transmitted by Claude/Codex at any point in this process. The role remains
`SUPER_ADMIN`; only the password value changed.

**2. Seed script hardening (code-only):** `apps/api/prisma/seed.ts` now looks up
`admin@hr.local` by email first:
- If the user **already exists**, the seed makes no changes to `password` or
  `mustChangePassword` and exits. Existing credentials — including a rotated
  password — are left untouched.
- Only a brand-new `admin@hr.local` (fresh database / first bootstrap) is
  created with the existing default seed password, unchanged from prior
  behavior for that fresh-install/CI case.

This is a **seed safety hardening**, not a runtime authentication behavior
change: `POST /auth/login`, JWT issuance, and password validation logic in
`AuthModule` are untouched.

## Consequences

**Positive:**
- Re-running the seed script (fresh deploy, CI reset, local `npm run seed`) can
  no longer silently revert a rotated production admin password back to the
  default.
- Fresh-install/CI behavior is unchanged: a database with no existing
  `admin@hr.local` still gets the standard seeded default account.
- No schema change, no migration, no change to the login/JWT/password-hashing
  code paths.

**Negative / Trade-offs:**
- The seed script no longer has a way to force-reset `admin@hr.local`'s
  password back to the default (e.g. for a "lost the rotated password"
  recovery scenario). That must now go through the existing HR admin
  reset-password flow (`POST /employees/:id/account/reset-password`, see
  ADR-013) or direct DB intervention, not the seed script.

## Security Notes

- No password, token, or hash value appears in this ADR, in the associated CTO
  summary, or in any commit related to this task.
- The default dev/CI seed password remains documented and valid for **local and
  CI environments only** — this ADR does not change local/dev/CI seeding
  behavior, only production's already-rotated account and future seed-safety.

## Related ADRs

- ADR-013 — Identity and Employee Account Lifecycle (HR-admin reset-password
  flow, now the correct path for recovering a lost rotated password)
- ADR-014 — Password Change and `mustChangePassword` Policy (self-service
  change-password endpoint used for the rotation)
- ADR-015 — Security Harness and Review Policy (review cadence this hardening
  falls under)
