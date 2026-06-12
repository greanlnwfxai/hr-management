# ADR-008: Deployment Strategy

## Status
Accepted

## Date
2026-06-12

## Context
The HR Management system currently runs on Docker Compose for local development and CI verification. A decision is needed on the near-term deployment approach and on what must happen before the system can be considered production-ready.

## Decision
The **current deployment target is local/dev Docker Compose**. A cloud deployment strategy will be decided separately when the frontend phase is complete and stakeholder infrastructure requirements are clearer.

### Current state (Local / Dev)
The system is fully operational on Docker Compose with three containers:

| Container | Image | Port | Notes |
|---|---|---|---|
| `hr-db` | `postgres:16` | 5432 | PostgreSQL with named volume for persistence |
| `hr-api` | Built from `apps/api/Dockerfile` | 4002 | Production mode (`start:prod`) |
| `hr-web` | Built from `apps/web/Dockerfile` | 3002 | Next.js standalone output |

The API runs in **production mode** (compiled `dist/`) rather than dev mode. This means Docker Compose is already closer to a production runtime than a typical dev-only setup.

### Pre-deployment hardening (required before any external deployment)

These items were identified during T-022 Backend Hardening & QA and must be resolved before the system goes beyond local/dev:

1. **JWT_SECRET rotation**
   Currently set to `change_me` in `docker-compose.yml`. Must be replaced with a cryptographically strong random value before any external deployment.
   ```bash
   openssl rand -hex 32   # generate a strong secret
   ```

2. **Credentials externalised**
   `JWT_SECRET`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, and `DATABASE_URL` are currently hardcoded in `docker-compose.yml`. These must be moved to a gitignored `.env` file or a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault, Docker Secrets).

3. **CORS restriction**
   `app.enableCors()` currently allows all origins. This must be replaced with an explicit allowlist:
   ```typescript
   app.enableCors({ origin: process.env.ALLOWED_ORIGIN });
   ```

4. **HTTPS**
   All traffic must be served over TLS before going to production. A reverse proxy (nginx, Caddy, or a cloud load balancer) should terminate TLS.

5. **Database backup**
   The `postgres_data` named volume has no automated backup. A backup strategy (pg_dump schedule, managed DB snapshots) must be in place before production use.

### Candidate deployment targets (to be decided in a future ADR)

| Target | Pros | Cons |
|---|---|---|
| Docker Compose on a VPS (DigitalOcean, Linode) | Simple; familiar; low cost | No auto-scaling; manual updates |
| AWS ECS / Fargate | Managed containers; scales; integrates with RDS | Higher ops complexity |
| Fly.io / Railway | Fast to deploy; managed Postgres; low config | Less control over networking |
| Kubernetes (EKS/GKE) | Industry standard; full control | Significant ops overhead for a small HR tool |

## Consequences

**Positive**
- Docker Compose deployment is already verified end-to-end (`docker-verify.sh`).
- API production build is validated on every Docker verification run.
- Deferring cloud target keeps options open until frontend requirements are clearer.

**Negative**
- System is not production-safe as-is (weak JWT secret, open CORS, plaintext credentials).
- No auto-scaling, no managed database backups, no TLS in the current setup.
- A second deployment ADR is needed once the cloud target is chosen.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Decide cloud target now | Premature; frontend phase not started; infrastructure requirements unknown |
| Serverless (AWS Lambda + RDS Proxy) | Cold starts problematic for JWT validation DB hit on every request; high ops complexity |
| PaaS (Heroku/Render) | Valid option; included as candidate above for future ADR |

## Follow-up Tasks
- Create `.env.example` documenting all required environment variables.
- Add `docker-compose.prod.yml` override that reads credentials from environment variables rather than hardcoding them.
- Decide cloud deployment target in a follow-up ADR after frontend phase begins.
- Implement TLS termination (nginx or Caddy reverse proxy).
- Set up automated database backup before any production data is written.
