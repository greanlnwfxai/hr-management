# Development Workflow

## Collaboration Model

Current delivery work follows a human-controlled collaboration model:

| Actor | Responsibilities |
|---|---|
| **Claude / Codex** | Implement scoped work, update docs, run non-destructive verification, produce summaries, recommend commit messages |
| **User** | Own final `git add`, `git commit`, `git push`, `git tag`, branch decisions, and release decisions |
| **ChatGPT reviewer** | Review outputs and provide PASS / FAIL guidance when used in the workflow |

**Claude / Codex must NEVER run:**
- `git add`
- `git commit`
- `git push`
- `git tag`

This is enforced by `CLAUDE.md` and `AGENTS.md` at the project root.

## Workflow References

- `CLAUDE.md` = Claude workflow guide
- `AGENTS.md` = Codex / agent workflow guide

## Claude / Codex Responsibilities (Detail)

### Per-Step Cycle

1. **Write code** — implement the feature or fix according to the task specification
2. **Run relevant verification** — choose the smallest safe verification set for the task
3. **Avoid destructive Docker** — never run `docker compose down` or related destructive cleanup commands
4. **Report verification clearly** — state what was run and what was intentionally skipped
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

A step is **PASS** only when the required verification for that task has passed. Docs-only tasks should use docs-only verification, not full product verification.

## User And Reviewer Responsibilities

After receiving a PASS CTO Summary:

1. Review the diff (Claude never commits — the user reviews before committing)
2. `git add <specific files>` — never `git add -A` without reviewing
3. `git commit -m "..."` — using the recommended commit message or adapting it
4. `git push` — when ready to push to remote
5. `git tag` — for milestone releases
6. Manage branches and PRs
7. Review PASS / FAIL judgments from ChatGPT or other reviewers as part of the human sign-off loop

## Why This Split

- Keeps final version control authority with the human developer
- Prevents accidental commits of in-progress or broken code
- The human can review the diff before committing even when Claude wrote the code
- CTO Summaries create a paper trail for commit messages and PR descriptions

## Docker Safety

- Do not run `docker compose down`
- Do not run destructive Docker cleanup commands
- Limited inspection commands are acceptable when truly needed
- Some task briefs may allow `docker compose up -d --build`, but that does not override the ban on destructive teardown
- `scripts/docker-verify.sh` is confirmed non-destructive as of `v1.2.65` (see [[ADR-030 Non-destructive Docker Verification]]) — it never runs `docker compose down` internally and can be run as a normal verification step

## Naming Conventions

- Branches are user-managed; do not assume the old `feature/department-module` baseline is current
- Commit style: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- Task numbering: T-016, T-017, … (incremental per feature step)

## Related ADRs

- [[ADR-009 Development Harness]]

## Related Notes

- [[Verification Workflow]]
- [[Project Overview]]

#sop #workflow #process
