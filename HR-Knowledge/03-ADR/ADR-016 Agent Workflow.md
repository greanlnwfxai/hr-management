# ADR-016: Agent Workflow and Docker Safety Policy

**Status:** Accepted | **Date:** 2026-06-20

## Decision

Use a human-controlled AI workflow with explicit guidance files and Docker safety rules.

## Key Points

- `CLAUDE.md` = Claude guidance
- `AGENTS.md` = Codex / agent guidance
- Claude/Codex implement and verify
- user performs all manual git operations
- ChatGPT may review, give PASS/FAIL, control scope, and advise on git workflow
- destructive Docker actions are forbidden for agents unless the user explicitly asks
- task-scoped verification is preferred over one-size-fits-all verification

## Source

`docs/adr/ADR-016-agent-workflow-and-docker-safety-policy.md`

#adr #workflow #docker-safety
