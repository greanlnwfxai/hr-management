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
- destructive Compose teardown commands are forbidden unless the user explicitly asks
- prune, remove, reset, or destructive volume cleanup commands are forbidden unless the user explicitly asks

Allowed Docker interaction should stay limited to non-destructive inspection or task-approved startup flows.

## Verification

```bash
./scripts/docker-verify.sh   # build/start + health checks — non-destructive as of v1.2.65
./scripts/api-smoke-test.sh  # login + all module list endpoints
```

Safety note (updated — see [[ADR-030 Non-destructive Docker Verification]]):
- As of `v1.2.65`, `docker-verify.sh` no longer runs `docker compose down`. It
  only validates config, builds/starts the stack, polls health/reachability,
  and leaves containers running on both pass and fail.
- It can be treated as an always-safe default verification step. Stopping or
  resetting containers remains a separate, manual, user-approved action.

## Source

`docs/adr/ADR-003-docker-compose-local-development.md`

## Related Notes

- [[Verification Workflow]]
- [[System Architecture]]
- [[ADR-030 Non-destructive Docker Verification]]
- [[ADR Index]]

#adr #infrastructure #docker
