# Security Harness

## Purpose

This document describes the security review harness added in **T-052A.1** and
promoted into CI in **T-052A.3**. The harness provides lightweight,
non-destructive security checks that run locally and in GitHub Actions before
any task is declared PASS.

It does NOT replace production-grade tooling such as full SAST/DAST, historical
secret scanning, or external vulnerability intelligence feeds. Dependabot and
the blocking GitHub Actions security job are now in place; richer external
advisory intelligence remains a later enhancement.

---

## Scripts Added

| Script | Purpose |
|---|---|
| `scripts/security-audit.sh` | npm dependency audit — all workspaces |
| `scripts/secret-scan.sh` | Source file secret / sensitive-value scan |
| `scripts/security-review.sh` | Combined runner + manual checklist reminder |

## CI Enforcement

GitHub Actions CI now includes a seventh blocking job named
`Security — Audit & Secret Scan`.

The full CI job list is now:

1. `API — Build & Validate`
2. `Web — Build & Validate`
3. `Mobile — Typecheck & Export`
4. `Compose — Config Validation`
5. `Integration — Runtime API Test`
6. `E2E — Playwright Critical Flows`
7. `Security — Audit & Secret Scan`

The security job installs dependencies for `apps/api`, `apps/web`, and
`apps/mobile`, then runs:

```bash
./scripts/security-review.sh
```

It is intentionally blocking. CI fails when:

- `scripts/security-audit.sh` finds any HIGH or CRITICAL advisory that is not
  documented in `.security-accepted-risks`
- `scripts/secret-scan.sh` finds likely real committed secrets or private keys

Accepted risks remain transparent and reviewable:

- Machine-readable registry: `.security-accepted-risks`
- Human-readable rationale log: `docs/SECURITY_REVIEW_LOG.md`

## Dependabot

Dependabot is configured in `.github/dependabot.yml` for:

- npm at `/apps/api`
- npm at `/apps/web`
- npm at `/apps/mobile`
- GitHub Actions at `/`

Update policy:

- Weekly schedule
- Timezone: `Asia/Bangkok`
- Open PR limit: `5`
- Commit prefix: `chore(deps)`
- Patch/minor updates grouped per ecosystem where safe
- Major updates remain separate
- Auto-merge is not enabled

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

## What Does NOT Get Automated Here

- Historical git history scanning (truffleHog, git-secrets)
- External CVE / advisory intelligence feeds
- Automatic dependency patching
- SAST / DAST tooling
- Container image scanning (Trivy, Grype)

These remain future enhancements beyond the current harness and CI integration.

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

## Future Security Enhancements

- External advisory workflow beyond npm audit output
- Patch automation policy and triage refinement
- Container image scanning
- SAST integration (for example, CodeQL)
- Historical secret scanning against git history
