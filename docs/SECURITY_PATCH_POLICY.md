# Security Patch Policy

## Purpose

This document defines how dependency vulnerabilities discovered by
`scripts/security-audit.sh` or manual advisory review are handled.

---

## Severity Handling

### CRITICAL
- **Action required before PASS.**
- Either apply a targeted patch (see Safe Patch Rules below) OR document an
  accepted-risk note in `docs/SECURITY_REVIEW_LOG.md` with justification.
- Example justification: "vulnerability requires an attack vector not present
  in our deployment (e.g. requires filesystem access, no such route exposed)."

### HIGH
- **Action required before PASS.**
- Same as CRITICAL: patch or document accepted-risk.
- If a patch is available and safe, prefer patching.

### MODERATE
- **Document and schedule**, unless the patch is trivially safe (patch-level bump,
  no API changes, passes full verification).
- Add an entry in `docs/SECURITY_REVIEW_LOG.md` with a scheduled resolution task.
- Does NOT block PASS.

### LOW / INFO
- **Document only**, unless trivially safe to apply.
- Does NOT block PASS.

---

## Safe Patch Rules

1. **Prefer patch or minor targeted updates.**
   Use `npm install pkg@x.y.z --prefix apps/<workspace>` for the specific
   vulnerable package. Avoid broad `npm update`.

2. **Major version upgrades require explicit user approval.**
   A major version bump may have breaking API changes. Raise with the user
   before applying.

3. **Never run `npm audit fix --force` without explicit written user approval.**
   `--force` can install breaking major versions and create regressions.

4. **Never auto-update unrelated packages.**
   Only patch the vulnerable package and its direct dependency chain.

5. **Always run full verification after any patch:**
   ```bash
   ./scripts/verify.sh
   ./scripts/security-audit.sh
   npm --prefix apps/api test
   ```
   A patch that breaks tests or build is not acceptable.

6. **Update lockfile after patching.**
   Commit the updated `package-lock.json` alongside the `package.json` change.

---

## Rollback Policy

- If a patch causes build or test failures, revert the package to the previous
  version immediately.
- Document the failed patch attempt in `docs/SECURITY_REVIEW_LOG.md`.
- Re-evaluate with accepted-risk or alternative mitigation.

---

## Accepted-Risk Documentation Format

When documenting accepted risk, add an entry to `docs/SECURITY_REVIEW_LOG.md`:

```
### Accepted Risk — [PACKAGE@VERSION] — [SEVERITY] — [DATE]
- CVE / Advisory: [link or advisory ID]
- Attack vector: [description]
- Why accepted: [justification]
- Review by: [task ID, e.g. T-052A.2]
```

---

## Approval Policy

| Action | Who approves |
|---|---|
| Patch-level or minor dependency bump | Claude Code may apply after verification |
| Major version upgrade | User must explicitly approve |
| `npm audit fix` (no force) | User must explicitly approve |
| `npm audit fix --force` | User must explicitly approve — use only as last resort |
| Accepted-risk note without patch | Claude documents; user reviews in next task |
