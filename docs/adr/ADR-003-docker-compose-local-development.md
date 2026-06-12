# ADR-003: Docker Compose for Local Development

## Status
Accepted

## Date
2026-06-12

## Context
The HR Management stack requires three co-operating processes: a PostgreSQL database, a NestJS API, and a Next.js frontend. These need to start in dependency order and be reachable from a developer's browser and from each other. A container orchestration layer is needed to provide a reproducible, one-command startup for both development and CI verification.

## Decision
Use **Docker Compose** (root `docker-compose.yml`) as the standard local runtime for the full stack.

### Services

| Container | Image / Build | Port | Role |
|---|---|---|---|
| `hr-db`  | `postgres:16` | 5432 | PostgreSQL 16 database |
| `hr-api` | `./apps/api` (Dockerfile) | 4002 | NestJS API |
| `hr-web` | `./apps/web` (Dockerfile) | 3002 | Next.js frontend |

**Ports not used by this stack:** 5433, 6380 (Redis is listed in CLAUDE.md as not yet used).

### Startup order
`hr-db` must be healthy → `hr-api` starts → `hr-api` must be healthy → `hr-web` starts.
Health checks are defined in `docker-compose.yml`:
- `hr-db`: `pg_isready -U hr_user -d hr_management`
- `hr-api`: HTTP probe `GET http://localhost:4002/health`

### API runtime mode
The API container runs in **production mode** (`npm run start:prod` from compiled `dist/`), not `start:dev`. This matches the deployment target and ensures that only committed, compiled code is tested.

### Prisma Client in Docker
The API Dockerfile runs `npx prisma generate` in the **builder** stage and copies `node_modules` from the builder to the runner stage. This guarantees the generated Prisma Client (including its enum objects) is present at runtime, avoiding startup crashes from missing client files.

### Volume persistence
A named volume (`postgres_data`) persists the PostgreSQL data directory across `docker compose down` / `up` cycles. Running `docker compose down -v` removes it for a clean slate.

### Verification scripts
- `./scripts/docker-verify.sh` — tears down, rebuilds, starts the full stack, and asserts all containers are healthy before returning.
- `./scripts/api-smoke-test.sh` — authenticates as admin and calls all module list endpoints to confirm runtime correctness.

## Consequences

**Positive**
- One command (`docker compose up --build`) brings up a fully functional stack.
- Consistent environment across developer machines and CI.
- Health checks prevent integration tests from running against a half-started API.
- Production-mode API build catches compile errors that `start:dev` would hide.

**Negative**
- Rebuilding the API image after every code change is slow (~60–90 s) compared to `start:dev` hot-reload.
- `postgres_data` volume persists test data across runs; requires `-v` flag or manual cleanup for a fresh start.
- Docker is required on every developer's machine.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Bare Node.js processes (no Docker) | Not reproducible across machines; database setup must be manual |
| Docker Compose with `start:dev` API | Hides compile errors; doesn't match production runtime |
| Kubernetes (local via minikube/kind) | Excessive complexity for a local development stack at this scale |
| GitHub Codespaces / Dev Containers | Valid future option; deferred until team grows |

## Follow-up Tasks
- Add a `docker-compose.override.yml` for development mode (hot-reload API via volume mount) without altering the production-equivalent base file.
- Extract sensitive environment variables (`JWT_SECRET`, `POSTGRES_PASSWORD`) into a gitignored `.env` file consumed by `docker-compose.yml`.
- Add Redis service entry (commented out or in override) when the caching layer is needed.
- Investigate `docker compose watch` for automatic API rebuilds during active development.
