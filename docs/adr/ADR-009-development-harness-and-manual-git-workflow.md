# ADR-009: Development Harness and Manual Git Workflow

## Status
Accepted

## Date
2026-06-12

## Context
Development on the HR Management backend is AI-assisted: Claude Code writes, builds, verifies, and documents each feature step. The user retains full control over version control history. A clear division of responsibilities is needed to prevent accidental commits, ensure verification happens before merge, and keep the git log clean and intentional.

## Decision
Adopt a **two-party workflow**: Claude Code handles implementation and verification; the user (with ChatGPT as advisor) handles all git operations.

### Responsibilities

| Actor | Responsibilities |
|---|---|
| Claude Code | Write code, run builds, run tests, run Docker verification, produce CTO Summary, recommend commit message |
| User + ChatGPT | `git add`, `git commit`, `git push`, `git tag`, branch management, PR review |

Claude Code **must never** run:
- `git add`
- `git commit`
- `git push`
- `git tag`

### Development Harness files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Canonical operating rules for Claude Code: module layout, enum rules, Docker rules, verification order, git restrictions |
| `scripts/verify.sh` | Local build gate: `nest build` + `prisma validate` + `next build` |
| `scripts/docker-verify.sh` | Full-stack Docker gate: tear down → rebuild → start → health check |
| `scripts/api-smoke-test.sh` | Runtime API gate: login + call all module list endpoints |
| `docs/CTO_SUMMARY_TEMPLATE.md` | Standardised output format for every completed step |

### Verification order (per step)
Every step is declared **PASS** only when all three scripts exit 0:
```
1. ./scripts/verify.sh
2. ./scripts/docker-verify.sh
3. ./scripts/api-smoke-test.sh
```

### CTO Summary
Each completed step produces a CTO Summary that includes:
- Step name and status (PASS / FAIL)
- Files created and modified
- Verification results
- Known limitations
- Risk level
- Decision
- Recommended commit message

The recommended commit message is for the user to review and use verbatim or adapt — Claude does not commit it.

### Why this split
- Keeps final version control authority with the human developer.
- Prevents Claude Code from accidentally committing in-progress or broken code.
- The human can review the diff before committing, even when Claude wrote the code.
- CTO Summaries provide a paper trail that can be used to write proper commit messages and PR descriptions.

## Consequences

**Positive**
- No accidental commits; all git history is intentionally authored by the user.
- Verification gates catch regressions before code reaches the repository.
- CTO Summary gives the user full context without reading every changed file.
- Clear responsibility boundary reduces ambiguity when something goes wrong.

**Negative**
- Slightly slower iteration cycle because git operations are manual.
- Smoke test script requires a running Docker stack; it cannot run in a pure CI environment without Docker.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Claude Code commits automatically | Risk of committing broken or partial code; user loses review step |
| Full CI/CD pipeline (GitHub Actions) | Valid for team scale; deferred until branching strategy is decided |
| Pre-commit hooks | Useful addition but do not replace manual review of AI-written code |

## Follow-up Tasks
- Add a GitHub Actions workflow that runs `verify.sh` on pull requests.
- Consider adding a `pre-commit` hook that runs `prisma validate` locally.
- Update `api-smoke-test.sh` as new modules are added (done incrementally in T-022).
- Document the branching strategy (currently on `feature/department-module`; merging to `main` TBD).
