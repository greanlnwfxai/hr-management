# ADR-008: Deployment Strategy

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Current deployment target: **local/dev Docker Compose only**.

Cloud deployment strategy deferred until frontend phase is complete and infrastructure requirements are clearer.

## Current State

The stack is operational on Docker Compose (three containers: db, api, web). The API runs in **production mode** — the Docker setup is already closer to a production runtime than a typical dev-only setup.

## Pre-Deployment Hardening Required

These must be resolved before any external deployment:

1. **JWT_SECRET rotation** — replace `change_me` with `openssl rand -hex 32`
2. **Credentials externalised** — move `JWT_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL` to a gitignored `.env` or secrets manager
3. **CORS restriction** — replace `app.enableCors()` with an explicit origin allowlist
4. **HTTPS** — TLS termination via nginx, Caddy, or cloud load balancer
5. **Database backup** — automated pg_dump schedule or managed snapshots

## Candidate Cloud Targets (Future ADR)

| Target | Pros | Cons |
|---|---|---|
| Docker Compose on VPS | Simple, low cost | No auto-scaling |
| AWS ECS / Fargate | Managed, scalable | Higher ops complexity |
| Fly.io / Railway | Fast deploy, managed Postgres | Less control |
| Kubernetes | Full control | High ops overhead for small HR tool |

## Source

`docs/adr/ADR-008-deployment-strategy.md`

## Related Notes

- [[Current Status]]
- [[Verification Workflow]]
- [[ADR Index]]

#adr #infrastructure #deployment
