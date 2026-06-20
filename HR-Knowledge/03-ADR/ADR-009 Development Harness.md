# ADR-009: Development Harness and Manual Git Workflow

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Adopt a **human-controlled AI collaboration workflow**: Claude/Codex handle scoped implementation and verification; the user handles git mutations; ChatGPT may act as reviewer and scope controller.

## Responsibilities

| Actor | Responsibilities |
|---|---|
| Claude / Codex | Implement scoped work, run non-destructive verification, produce summaries, recommend commit message |
| User | `git add`, `git commit`, `git push`, `git tag`, branch management, final release authority |
| ChatGPT reviewer | PASS / FAIL review, scope control, git guidance when used |

**Claude / Codex must never run:** `git add`, `git commit`, `git push`, `git tag`.

## Development Harness Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Claude workflow guidance |
| `AGENTS.md` | Codex / agent workflow guidance |
| `scripts/verify.sh` | API build + prisma validate + web build |
| `scripts/docker-verify.sh` | Historical Docker gate; only run when allowed by the active task |
| `scripts/api-smoke-test.sh` | Runtime API gate (12 checks) |
| `docs/CTO_SUMMARY_TEMPLATE.md` | Standardised output format per completed step |

## Verification Policy

Use the smallest relevant verification set for the task. Docker/runtime verification is not an automatic default for every task.

## Docker Safety Overlay

- destructive Docker teardown/reset actions are not normal agent workflow
- task-approved startup commands may be allowed
- follow the active task brief and root workflow files

## Why This Split

- Keeps final version control authority with the human developer
- Prevents accidental commits of in-progress or broken code
- CTO Summaries provide a paper trail for commit messages and PR descriptions

## Source

`docs/adr/ADR-009-development-harness-and-manual-git-workflow.md`

## Related Notes

- [[Development Workflow]]
- [[Verification Workflow]]
- [[ADR Index]]

#adr #process #workflow
