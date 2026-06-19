# Security Harness

## Purpose

This document describes the local security review harness added in **T-052A.1**.
The harness provides lightweight, non-destructive security checks that run locally
before any task is declared PASS.

It does NOT replace production-grade tooling (GitHub Actions security job,
Dependabot, external advisory scanning). Those are planned for **T-052A.2**.

---

## Scripts Added

| Script | Purpose |
|---|---|
| `scripts/security-audit.sh` | npm dependency audit — all workspaces |
| `scripts/secret-scan.sh` | Source file secret / sensitive-value scan |
| `scripts/security-review.sh` | Combined runner + manual checklist reminder |

### Local Usage

```bash
# Run all security checks (recommended before declaring any task PASS)
./scripts/security-review.sh

# Run dependency audit only
./scripts/security-audit.sh

# Run secret scan only
./scripts/secret-scan.sh
```

---

## What Blocks PASS

### security-audit.sh
- Any HIGH or CRITICAL vulnerability in api, web, or mobile workspaces.
- Patch or document an accepted-risk note (per `docs/SECURITY_PATCH_POLICY.md`) before PASS.

### secret-scan.sh
- Committed `.env` files tracked by git (not `.env.example`).
- PEM private key block found in any source file (`.ts`, `.js`, `.json`, `.yml`, `.pem`, `.key`).

### security-review.sh
- FAIL from either sub-script above.

---

## What Does NOT Get Automated Here (T-052A.1)

- Historical git history scanning (truffleHog, git-secrets)
- External CVE / advisory lookups
- Automatic dependency patching
- GitHub Actions security job
- Dependabot configuration
- SAST / DAST tooling
- Container image scanning (Trivy, Grype)

These are all planned for **T-052A.2**.

---

## Known Limitations

1. **Secret scan is keyword-based** — it does not parse AST or understand code semantics.
   Patterns like `apiKey` or `secretKey` may flag legitimate code variable names.
   All WARN-level findings require manual review.

2. **No git history scan** — secrets committed in past commits and later removed are
   NOT detected. Use `truffleHog` or `git-secrets` for historical scans.

3. **Placeholder filtering is not exhaustive** — novel placeholder patterns not in
   `PLACEHOLDER_REGEX` may produce false negatives.

4. **npm audit is local** — reflects the current local `node_modules` lockfile state.
   Results may differ from CI if lockfiles are out of sync.

5. **Mobile workspace** — `apps/mobile` uses Expo and may have peer dependency
   warnings that are Expo-managed. Review these carefully before accepting risk.

---

## Future T-052A.2 Scope

- GitHub Actions security job (run `security-review.sh` on every PR)
- Dependabot for automated dependency update PRs
- External advisory workflow (manual CVE lookup and documentation process)
- Patch automation policy (safe auto-merge criteria)
- Container image scanning
- SAST integration (e.g., CodeQL)
