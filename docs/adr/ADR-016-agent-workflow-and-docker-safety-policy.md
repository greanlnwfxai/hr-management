# ADR-016: Agent Workflow and Docker Safety Policy

## Status
Accepted

## Date
2026-06-20

## Context
The project now uses multiple AI collaborators with different guidance files and responsibilities. At the same time, local Docker commands can be destructive if used carelessly. A unified workflow decision is needed so implementation, review, and safety responsibilities stay clear.

## Decision
Use a human-controlled AI workflow with explicit guidance files and a strict Docker safety overlay.

### Workflow roles
- `CLAUDE.md` = Claude workflow guidance
- `AGENTS.md` = Codex / agent workflow guidance
- Claude / Codex implement and verify scoped work
- User performs all manual git operations
- ChatGPT may perform review, PASS/FAIL assessment, scope control, and git guidance

### Git restrictions
Claude / Codex / agents must not run:
- `git add`
- `git commit`
- `git push`
- `git tag`

### Docker safety policy
- `docker compose up -d --build` may be allowed for runtime verification when the active task explicitly allows it.
- Destructive Docker commands are forbidden for Claude/Codex/agents unless the user explicitly asks.
- Reset, prune, remove, or teardown flows require explicit user approval.

### Verification policy
- Verification should be task-scoped.
- Do not assume every task requires the full Docker/runtime flow.
- Report clearly what was run and what was intentionally skipped.

## Consequences

**Positive**
- Git history remains under explicit human control.
- Review and release responsibility stays with the user.
- Docker safety policy reduces accidental local-environment disruption.
- The workflow can support multiple AI roles without blurring authority boundaries.

**Negative**
- Manual git steps slow delivery slightly.
- Review coordination can be more complex when multiple AI personas are involved.
- Some historical scripts remain available but are not always safe defaults for agent use.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Let agents commit directly | Too risky for intentional history and review control |
| Treat Docker teardown as normal verification | Conflicts with current safety requirements |
| Single AI workflow file only | No longer fits the current multi-agent collaboration pattern |

## Follow-up Tasks
- Keep `CLAUDE.md` and `AGENTS.md` synchronized as rules evolve.
- Continue documenting which verification patterns are safe by task type.
- Revisit workflow roles if future automation expands beyond current review boundaries.
