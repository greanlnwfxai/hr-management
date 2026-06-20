# ADR-015: Security Harness and Review Policy

## Status
Accepted

## Date
2026-06-20

## Context
As the project expanded beyond initial backend delivery, security checks needed to become structured, repeatable, and visible in both local workflow and CI. At the same time, the team needed a policy that avoids running heavyweight security review on every trivial task while still requiring the right checks for security-sensitive changes.

## Decision
Adopt a lightweight security harness, CI enforcement, Dependabot automation, accepted-risk tracking, and a scoped review policy.

### Security scripts
- `./scripts/security-audit.sh`
- `./scripts/secret-scan.sh`
- `./scripts/security-review.sh`

### CI enforcement
GitHub Actions includes a blocking job:
- `Security — Audit & Secret Scan`

### Dependency automation
Dependabot is enabled for:
- `apps/api`
- `apps/web`
- `apps/mobile`
- GitHub Actions

### Accepted-risk tracking
Security exceptions are tracked in:
- `.security-accepted-risks`
- `docs/SECURITY_REVIEW_LOG.md`

### Review cadence policy
- Full security review is monthly, not required for every task.
- Security review or focused security checks are still required when work touches:
  - auth
  - password handling
  - token handling
  - RBAC
  - dependency manifests or lockfiles
  - other security-sensitive behavior

### Task-scoped guidance
- `security-audit` is especially relevant when `package.json` or lockfiles change.
- `secret-scan` remains available locally and is enforced in CI.
- Docs-only or low-risk UI polish tasks may use lighter verification if the task brief permits it.

## Consequences

**Positive**
- Security checks are now explicit, automatable, and reviewable.
- CI catches likely secrets and high-severity dependency issues before merge.
- Review effort can scale with actual task risk rather than treating every task the same.

**Negative**
- Some false positives remain possible in keyword-based secret scanning.
- Monthly full review still requires human discipline and process follow-through.
- Accepted-risk tracking must be maintained carefully to avoid becoming stale.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Full security review on every task | Too expensive for ordinary low-risk work |
| No local security scripts; CI only | Slower feedback loop and weaker developer visibility |
| Dependabot without accepted-risk tracking | Hides the reasoning for deferred vulnerabilities |

## Follow-up Tasks
- Continue refining accepted-risk discipline and review log quality.
- Add deeper tooling later if needed (container scanning, SAST, historical secret scanning).
- Reassess review cadence if the system’s exposure or compliance burden changes.
