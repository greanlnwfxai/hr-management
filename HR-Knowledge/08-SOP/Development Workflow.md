# Development Workflow

## Two-Party Model

Development follows a strict two-party workflow:

| Actor | Responsibilities |
|---|---|
| **Claude Code** | Write code, run builds, run tests, Docker verification, CTO Summary, recommend commit messages |
| **User + ChatGPT** | `git add`, `git commit`, `git push`, `git tag`, branch management, PR review |

**Claude Code must NEVER run:**
- `git add`
- `git commit`
- `git push`
- `git tag`

This is enforced by `CLAUDE.md` at the project root.

## Claude Code Responsibilities (Detail)

### Per-Step Cycle

1. **Write code** — implement the feature or fix according to the task specification
2. **Run build** — `./scripts/verify.sh` (API build + prisma validate + web build)
3. **Docker verification** — `./scripts/docker-verify.sh` (full stack rebuild + health check)
4. **Smoke test** — `./scripts/api-smoke-test.sh` (runtime API verification)
5. **CTO Summary** — produce a structured summary per `docs/CTO_SUMMARY_TEMPLATE.md`
6. **Recommend commit message** — conventional commit format; user uses it verbatim or adapts

### CTO Summary Format

Every completed step produces:

```
# CTO Summary
## Step
## Status (PASS / FAIL)
## Scope
## Files Created
## Files Modified
## Verification Result
## Issues Found
## Risk (Low / Medium / High)
## Decision (PASS / FAIL)
## Next Step
## Recommended Commit Message
```

A step is **PASS** only if all three verification scripts exit 0.

## User + ChatGPT Responsibilities (Detail)

After receiving a PASS CTO Summary:

1. Review the diff (Claude never commits — the user reviews before committing)
2. `git add <specific files>` — never `git add -A` without reviewing
3. `git commit -m "..."` — using the recommended commit message or adapting it
4. `git push` — when ready to push to remote
5. `git tag` — for milestone releases
6. Manage branches and PRs

## Why This Split

- Keeps final version control authority with the human developer
- Prevents accidental commits of in-progress or broken code
- The human can review the diff before committing even when Claude wrote the code
- CTO Summaries create a paper trail for commit messages and PR descriptions

## Naming Conventions

- Branches: `feature/<name>` (current: `feature/department-module`)
- Commit style: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- Task numbering: T-016, T-017, … (incremental per feature step)

## Related ADRs

- [[ADR-009 Development Harness]]

## Related Notes

- [[Verification Workflow]]
- [[Project Overview]]

#sop #workflow #process
