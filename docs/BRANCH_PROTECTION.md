# Branch Protection Rules

## Purpose

Branch protection rules prevent code from reaching `main` unless all required CI jobs pass. Without them, a push or merge can bypass the CI pipeline entirely — even if GitHub Actions is configured. This document describes the recommended ruleset for the HR Management repository and provides step-by-step setup instructions.

---

## Why Each CI Check Matters

| Check | Job ID | Why it's required |
|-------|--------|------------------|
| `API — Build & Validate` | `api-ci` | Catches TypeScript errors, broken Prisma schema, and missing imports before runtime |
| `Web — Build & Validate` | `web-ci` | Catches Next.js build failures and type errors in the frontend bundle |
| `Compose — Config Validation` | `compose-ci` | Validates both compose files and ensures production config has no host-bound port leaks |
| `Integration — Runtime API Test` | `integration-ci` | Proves the API actually starts, migrations apply cleanly, and all v1.0 endpoints respond correctly against a real PostgreSQL instance |

`integration-ci` is the most valuable gate: it is the only check that exercises the full runtime stack (database + API + HTTP smoke test). The other three checks validate build correctness. All four together mean code that reaches `main` has been verified at every layer.

---

## Recommended Ruleset: `protect-main-ci`

This is the recommended configuration using **GitHub Rulesets** (the modern path, available on all plans since 2023). The legacy Branch Protection Rules path is documented in [Legacy Branch Protection Rules](#legacy-branch-protection-rules-ui) below.

### Required Status Check Names

When GitHub Actions runs a workflow, each job reports a status check whose name is:

```
<workflow name> / <job display name>
```

For this repository, the four required check context strings are:

```
HR Management CI / API — Build & Validate
HR Management CI / Web — Build & Validate
HR Management CI / Compose — Config Validation
HR Management CI / Integration — Runtime API Test
```

> **Tip**: GitHub's search box autocompletes status check names from checks that have already run on the repository. Since CI has already passed on `main`, all four names will appear in the dropdown as you type.

### Ruleset Settings

| Setting | Solo Developer | Team |
|---------|:---:|:---:|
| Enforcement | Active | Active |
| Target branches | `main` | `main` |
| Require status checks to pass | ✅ | ✅ |
| — `HR Management CI / API — Build & Validate` | ✅ | ✅ |
| — `HR Management CI / Web — Build & Validate` | ✅ | ✅ |
| — `HR Management CI / Compose — Config Validation` | ✅ | ✅ |
| — `HR Management CI / Integration — Runtime API Test` | ✅ | ✅ |
| Require branches to be up to date before merging | Optional | ✅ |
| Require a pull request before merging | Optional | ✅ |
| — Require approvals (minimum 1) | — | ✅ |
| — Dismiss stale approvals on new commits | — | ✅ |
| — Require conversation resolution | — | ✅ |
| Block force pushes | ✅ | ✅ |
| Block deletions | ✅ | ✅ |
| Restrict who can bypass the ruleset | Optional | ✅ (admins only) |

---

## Step-by-Step: GitHub Rulesets UI

### Path
**Repository → Settings → Rules → Rulesets → New ruleset → New branch ruleset**

### Steps

1. Open the repository on GitHub.
2. Click **Settings** (top navigation bar).
3. In the left sidebar, click **Rules** → **Rulesets**.
4. Click **New ruleset** → **New branch ruleset**.
5. Fill in the form:

   **Ruleset name**: `protect-main-ci`

   **Enforcement status**: `Active`

6. Under **Target branches**, click **Add target** → **Include by pattern** → enter `main`.

7. Under **Branch rules**, enable:
   - **Restrict deletions** → ON
   - **Block force pushes** → ON

8. Under **Branch rules**, enable **Require status checks to pass**:
   - Click **Add checks**.
   - In the search box, type `API` — select **HR Management CI / API — Build & Validate**.
   - Repeat for the remaining three checks:
     - `HR Management CI / Web — Build & Validate`
     - `HR Management CI / Compose — Config Validation`
     - `HR Management CI / Integration — Runtime API Test`
   - (Optional — recommended for teams) Enable **Require branches to be up to date before merging**.

9. **(Team only)** Enable **Require a pull request before merging**:
   - Set required approvals to **1**.
   - Enable **Dismiss stale pull request approvals when new commits are pushed**.
   - Enable **Require conversation resolution before merging**.

10. **(Team only)** Under **Bypass list**, remove any automatic bypass entries or restrict to repository admins only.

11. Click **Create** to save the ruleset.

---

## Legacy Branch Protection Rules UI

If Rulesets is not available in your GitHub plan or UI, use the legacy path:

**Repository → Settings → Branches → Branch protection rules → Add rule**

1. Under **Branch name pattern**, enter `main`.
2. Enable **Require status checks to pass before merging**.
3. Enable **Require branches to be up to date before merging** (recommended for teams).
4. In the status checks search box, add all four checks:
   - `HR Management CI / API — Build & Validate`
   - `HR Management CI / Web — Build & Validate`
   - `HR Management CI / Compose — Config Validation`
   - `HR Management CI / Integration — Runtime API Test`
5. Enable **Do not allow bypassing the above settings** (team) or leave it unchecked (solo, allows admin bypass in emergencies).
6. Enable **Restrict who can push to matching branches** if restricting direct pushes.
7. Click **Save changes**.

---

## Solo Developer Policy

For a solo developer or small project owner, the minimum recommended configuration is:

- ✅ Require all four status checks to pass
- ✅ Block force pushes to `main`
- ✅ Block deletion of `main`
- ⬜ Pull request requirement — optional (direct push to `main` is allowed if CI passes)
- ⬜ Up-to-date branch requirement — optional
- ⬜ Bypass restrictions — leave as admin bypass allowed (for emergencies)

**Rationale**: Status checks ensure code is always tested before it lands on `main`, even when pushing directly. Force-push and deletion protection prevent accidental history rewrites. The PR requirement adds review overhead that may not be worth it when working alone.

---

## Team Policy

For a team of 2 or more developers:

- ✅ Require all four status checks to pass
- ✅ Require a pull request before merging
- ✅ Require at least 1 approval
- ✅ Dismiss stale approvals when new commits are pushed
- ✅ Require all conversations to be resolved
- ✅ Require branch to be up to date before merging
- ✅ Block force pushes
- ✅ Block deletion
- ✅ Restrict bypasses to repository administrators only

**Rationale**: The PR + approval requirement ensures code review happens before merge. Up-to-date branch prevents integration surprises. Stale approval dismissal ensures the reviewer sees the final version of the code.

---

## Emergency Bypass

In a genuine emergency (e.g., critical hotfix, CI infrastructure down), repository administrators can bypass branch protection:

**For Rulesets**: Add yourself to the ruleset's **Bypass list** temporarily, make the change, then remove yourself from the bypass list.

**For legacy Branch Protection Rules**: Uncheck **Do not allow bypassing the above settings** (if it was enabled), make the change, then re-enable it.

> Always document emergency bypasses in the commit message or a GitHub issue. Example: `hotfix: urgent security patch — CI bypassed due to runner outage (see #123)`.

Do not leave bypass permissions permanently relaxed after the emergency is resolved.

---

## Validation Checklist

Use this checklist after configuring branch protection:

- [ ] Confirm the latest CI run on `main` is green (all four jobs pass)
- [ ] Open **Repository → Settings → Rules → Rulesets**
- [ ] Create ruleset `protect-main-ci` targeting `main`
- [ ] Add all four required status checks
- [ ] Enable block force pushes
- [ ] Enable block deletions
- [ ] Save the ruleset
- [ ] Open a test pull request from a feature branch
- [ ] Confirm the PR shows "Required checks must pass before merging"
- [ ] Confirm merge is blocked until all four checks pass (or is not available if checks fail)
- [ ] Confirm a force push to `main` is rejected

---

## Known Limitations

| Limitation | Detail |
|------------|--------|
| Status check names must match exactly | If the workflow `name:` or job `name:` field changes in `ci.yml`, the required check strings here will become stale and must be updated in the ruleset |
| Autocomplete requires at least one prior run | Status check names only appear in GitHub's search dropdown after CI has run at least once on that repository — both conditions are already met here |
| `workflow_dispatch` runs do not block PRs | Manually triggered runs do not count as PR-gating checks; only runs triggered by `push` or `pull_request` events create blocking status checks |
| `integration-ci` can take ~2–4 minutes | The runtime integration job starts a PostgreSQL service container, runs migrations, and starts the NestJS API before executing the smoke test. PRs will need to wait for it to complete |
| No E2E or browser tests yet | Branch protection gates on what CI checks exist; browser-level tests are not yet configured |

---

## Future Improvements

- **CODEOWNERS**: Add a `CODEOWNERS` file to auto-assign reviewers to specific paths (e.g., infra changes require a second review)
- **Required signed commits**: Enable GPG-signed commit requirement for production-sensitive repositories
- **Protected tags**: Restrict who can create version tags (`v*`) to prevent accidental or unauthorized releases
- **E2E gate**: Once Playwright/Cypress tests are configured, add an `e2e-ci` job as a fifth required check
- **Deployment gate**: When a staging deploy job is added, gate it on all four current checks before triggering

---

## Related Docs

- [CI_CD.md](CI_CD.md) — full CI pipeline documentation
- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — production deployment guide
- [AUTH_SECURITY_HARDENING.md](AUTH_SECURITY_HARDENING.md) — rate limiting and security configuration
