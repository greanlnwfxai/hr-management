# ADR-015: Security Harness and Review Policy

**Status:** Accepted | **Date:** 2026-06-20

## Decision

Adopt local security scripts, CI enforcement, Dependabot, accepted-risk tracking, and a scoped review cadence.

## Key Points

- scripts:
  - `security-audit.sh`
  - `secret-scan.sh`
  - `security-review.sh`
- CI job: `Security — Audit & Secret Scan`
- Dependabot enabled for API, Web, Mobile, and GitHub Actions
- accepted risks tracked in `.security-accepted-risks` and `docs/SECURITY_REVIEW_LOG.md`
- full security review is monthly, not required for every task
- auth/password/token/RBAC/dependency/security work still requires focused security checks
- v1.2.67: production `SUPER_ADMIN` default password rotated + seed hardened
  against reverting a rotated password on re-run — see [[ADR-031 SUPER_ADMIN Password Rotation and Seed Hardening]]

## Source

`docs/adr/ADR-015-security-harness-and-review-policy.md`

#adr #security #process
