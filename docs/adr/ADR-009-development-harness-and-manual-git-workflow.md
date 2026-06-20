# ADR-009: Development Harness and Manual Git Workflow

## Status
Accepted

## Date
2026-06-12

## Context
Development on the HR Management project is AI-assisted across backend, web, mobile, and documentation work. Later milestones added `AGENTS.md` for Codex/agent workflow, ChatGPT review checkpoints, task-scoped verification, and stricter Docker safety rules. The user retains full control over version control history. A clear division of responsibilities is needed to prevent accidental commits, ensure verification happens before merge, and keep the git log clean and intentional.

## Decision
Adopt a **human-controlled AI collaboration workflow**: Claude/Codex implement and verify; the user performs all git mutations; ChatGPT or other reviewers may perform PASS/FAIL review, scope control, and git guidance.

### Responsibilities

| Actor | Responsibilities |
|---|---|
| Claude / Codex | Implement scoped work, update docs, run non-destructive verification, produce summaries, recommend commit message |
| User | `git add`, `git commit`, `git push`, `git tag`, branch management, final release authority |
| ChatGPT reviewer | Review changes, enforce scope, provide PASS / FAIL guidance, advise on manual git steps when used in the workflow |

Claude / Codex **must never** run:
- `git add`
- `git commit`
- `git push`
- `git tag`

### Development Harness files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Canonical Claude workflow guidance |
| `AGENTS.md` | Codex / agent workflow guidance |
| `scripts/verify.sh` | Local build gate: `nest build` + `prisma validate` + `next build` |
| `scripts/docker-verify.sh` | Historical full-stack Docker gate; only run when the active task allows it |
| `scripts/api-smoke-test.sh` | Runtime API gate: login + call all module list endpoints |
| `docs/CTO_SUMMARY_TEMPLATE.md` | Standardised output format for every completed step |

### Verification policy (per step)
Use the smallest relevant verification set for the task:
- product code changes may require build, runtime, or smoke verification
- dependency changes may require security audit checks
- docs-only tasks may use docs-only verification
- full security review is not required for every task

Docker-based verification must follow the active task brief and current safety rules.

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

### Docker safety overlay
- Non-destructive inspection is acceptable when needed.
- Destructive Docker teardown or reset actions are forbidden for Claude/Codex/agents unless the user explicitly asks.
- Allowed startup flows such as `docker compose up -d --build` still depend on the active task brief.

### Why this split
- Keeps final version control authority with the human developer.
- Prevents Claude Code from accidentally committing in-progress or broken code.
- The human can review the diff before committing, even when Claude wrote the code.
- CTO Summaries provide a paper trail that can be used to write proper commit messages and PR descriptions.

## Consequences

**Positive**
- No accidental commits; all git history is intentionally authored by the user.
- Verification stays proportional to task risk instead of forcing the same heavyweight flow on every task.
- CTO Summary gives the user full context without reading every changed file.
- Clear responsibility boundary reduces ambiguity when something goes wrong.

**Negative**
- Slightly slower iteration cycle because git operations are manual.
- Review handoff can involve more than one AI persona or tool, which requires good scope discipline.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Claude Code commits automatically | Risk of committing broken or partial code; user loses review step |
| Full CI/CD pipeline (GitHub Actions) | Valid for team scale; deferred until branching strategy is decided |
| Pre-commit hooks | Useful addition but do not replace manual review of AI-written code |

## Follow-up Tasks
- Keep `CLAUDE.md` and `AGENTS.md` aligned as workflow rules evolve.
- Continue refining task-scoped verification guidance as security and mobile workflows mature.
- Update smoke/build guidance when new runtime surfaces are added.
