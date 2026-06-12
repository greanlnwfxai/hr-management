# ADR-009: Development Harness and Manual Git Workflow

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Adopt a **two-party workflow**: Claude Code handles implementation and verification; the user (with ChatGPT as advisor) handles all git operations.

## Responsibilities

| Actor | Responsibilities |
|---|---|
| Claude Code | Write code, run builds, run tests, Docker verification, CTO Summary, recommend commit message |
| User + ChatGPT | `git add`, `git commit`, `git push`, `git tag`, branch management, PR review |

**Claude Code must never run:** `git add`, `git commit`, `git push`, `git tag`.

## Development Harness Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Canonical operating rules for Claude Code |
| `scripts/verify.sh` | API build + prisma validate + web build |
| `scripts/docker-verify.sh` | Full-stack Docker gate |
| `scripts/api-smoke-test.sh` | Runtime API gate (12 checks) |
| `docs/CTO_SUMMARY_TEMPLATE.md` | Standardised output format per completed step |

## Verification Order

Every step is PASS only when all three exit 0:
1. `./scripts/verify.sh`
2. `./scripts/docker-verify.sh`
3. `./scripts/api-smoke-test.sh`

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
