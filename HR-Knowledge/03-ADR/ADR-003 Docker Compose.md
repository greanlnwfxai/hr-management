# ADR-003: Docker Compose for Local Development

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Use **Docker Compose** (root `docker-compose.yml`) as the standard local runtime for the full stack.

## Services

| Container | Image | Port | Depends On |
|---|---|---|---|
| `hr-db` | `postgres:16` | 5432 | — |
| `hr-api` | Built from `apps/api/Dockerfile` | 4002 | hr-db healthy |
| `hr-web` | Built from `apps/web/Dockerfile` | 3002 | hr-api healthy |

Ports **5433** and **6380** are not used by this stack.

## Key Decisions

- **API runs in production mode** (`npm run start:prod`) — not `start:dev`. Catches compile errors.
- **Health-gated startup**: db → api → web. The web container does not start until the API is healthy.
- **`prisma generate` in builder stage**: The Dockerfile runs `npx prisma generate` in the builder and copies `node_modules` to the runner. Guarantees the Prisma Client (including enum objects) is present at runtime.
- **Named volume `postgres_data`**: Persists data across normal local runtime use.

## Current Agent Safety Overlay

This ADR documents the original local-development architecture, but it does **not** override current workflow safety rules.

For Claude/Codex/agent workflow:
- `docker compose down` is forbidden unless the user explicitly asks
- `docker compose down -v` is forbidden unless the user explicitly asks
- prune, remove, reset, or destructive volume cleanup commands are forbidden unless the user explicitly asks

Allowed Docker interaction should stay limited to non-destructive inspection or task-approved startup flows.

## Verification

```bash
./scripts/docker-verify.sh   # historical backend v1 verification script
./scripts/api-smoke-test.sh  # login + all module list endpoints
```

Safety note:
- Because `docker-verify.sh` may perform teardown operations, do not treat it as an always-safe default in agent workflow.
- Run it only when the active task rules allow it.

## Source

`docs/adr/ADR-003-docker-compose-local-development.md`

## Related Notes

- [[Verification Workflow]]
- [[System Architecture]]
- [[ADR Index]]

#adr #infrastructure #docker
