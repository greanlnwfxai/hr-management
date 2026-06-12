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
- **Named volume `postgres_data`**: Persists data across `docker compose down/up`. Use `down -v` for a clean slate.

## Verification

```bash
./scripts/docker-verify.sh   # teardown → rebuild → start → health check
./scripts/api-smoke-test.sh  # login + all module list endpoints
```

## Source

`docs/adr/ADR-003-docker-compose-local-development.md`

## Related Notes

- [[Verification Workflow]]
- [[System Architecture]]
- [[ADR Index]]

#adr #infrastructure #docker
