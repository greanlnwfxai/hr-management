# CI/CD Pipeline

## Overview

The project uses **GitHub Actions** for continuous integration. Every push and pull request to `main` triggers an automated validation pipeline that builds the API, builds the web frontend, and validates both Docker Compose configurations.

The pipeline does **not** deploy to production or push Docker images to a registry — those are future tasks (see [Future Improvements](#future-improvements)).

Workflow file: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

---

## Trigger Rules

| Event | Branch | Result |
|-------|--------|--------|
| `push` | `main` | Full CI pipeline runs |
| `pull_request` (open, sync, reopen) | `main` | Full CI pipeline runs |
| `workflow_dispatch` | any | Manual trigger from GitHub Actions UI |

Concurrent runs on the same branch or PR are automatically cancelled to save runner minutes (`concurrency.cancel-in-progress: true`).

---

## Jobs

### `api-ci` — API: Build & Validate

**Runner**: `ubuntu-latest`  
**Working directory**: `apps/api`

| Step | Command | Notes |
|------|---------|-------|
| Checkout | `actions/checkout@v4` | |
| Setup Node.js 22 | `actions/setup-node@v4` | npm cache keyed to `apps/api/package-lock.json` |
| Install deps | `npm ci` | Frozen lockfile install |
| Generate Prisma client | `npx prisma generate` | Required before TS compilation |
| Validate Prisma schema | `npx prisma validate` | Schema-only check; no database connection needed |
| Build API | `npm run build` | `nest build` → compiled `dist/` |

**Database note**: The `DATABASE_URL` env var is set to a non-reachable placeholder. `prisma validate` and `nest build` do not connect to a database — they only need the env var to be parseable.

---

### `web-ci` — Web: Build & Validate

**Runner**: `ubuntu-latest`  
**Working directory**: `apps/web`

| Step | Command | Notes |
|------|---------|-------|
| Checkout | `actions/checkout@v4` | |
| Setup Node.js 22 | `actions/setup-node@v4` | npm cache keyed to `apps/web/package-lock.json` |
| Install deps | `npm ci` | Frozen lockfile install |
| Build web | `npm run build` | `next build` with `NEXT_PUBLIC_API_URL` placeholder |

**API URL note**: `NEXT_PUBLIC_API_URL=http://localhost:4002` is injected at build time (Next.js bakes it into the JS bundle). A placeholder is sufficient to validate the build. Changing this for a real deployment requires rebuilding the image with the correct value (see `docker-compose.production.yml` build args).

---

### `compose-ci` — Compose: Config Validation

**Runner**: `ubuntu-latest`  
**Working directory**: repository root

| Step | Command | Notes |
|------|---------|-------|
| Checkout | `actions/checkout@v4` | |
| Validate dev compose | `docker compose -f docker-compose.yml config` | Resolves env vars, renders full config |
| Validate prod compose | `docker compose -f docker-compose.production.yml config` | Same, using CI placeholder vars |
| Port exposure check | See below | Fails CI if any host-bound ports exist in production config |

**Port exposure check**: The CI checks that `published:` does not appear in the rendered production compose config. This field is only present when a `ports: HOST:CONTAINER` mapping exists. `expose:` does not produce it, so the check is reliable.

```bash
if docker compose -f docker-compose.production.yml config | grep -q "published:"; then
  echo "FAIL: production compose has host-bound port mappings"
  exit 1
fi
```

**Environment variables required for compose-ci**: `docker-compose.production.yml` uses `:?` required-variable syntax (fails if unset). The CI job provides safe placeholder values via the job-level `env:` block — no GitHub secrets are needed.

---

## CI Environment Variables

All CI environment variables are safe placeholder values. No real secrets are stored in the workflow file or repository.

| Variable | CI Value | Why needed |
|----------|----------|-----------|
| `DATABASE_URL` | `postgresql://postgres:...@localhost:5432/hr_management` | Prisma needs it parseable (not connectable) |
| `JWT_SECRET` | `ci_test_secret_do_not_use_in_production` | NestJS reads it at module load time |
| `CORS_ORIGIN` | `http://localhost:3002` | API env var (no CORS requests made in CI) |
| `POSTGRES_PASSWORD` | `ci_postgres_password` | Required by production compose `:?` validation |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4002` (api-ci) / `https://hr.example.com/api` (compose-ci) | Next.js build bakes this in |
| `TRUST_PROXY` | `"true"` | Production compose config validation |
| `THROTTLE_*` | `60`, `100` | Rate limiter defaults |

---

## What CI Does Not Do Yet

| Capability | Status | See |
|------------|--------|-----|
| Run automated tests (unit/integration) | Not configured | No test suite exists beyond build validation |
| Start a real database service | Not configured | Would enable prisma migrate + full API test |
| Run the API smoke test (`api-smoke-test.sh`) | Not configured | Requires running stack + seeded database |
| Build Docker images | Not configured | Slow without registry cache; deferred to future task |
| Push images to a container registry | Not configured | Future task |
| Deploy to production | Not configured | Future task — manual deployment via `docker-compose.production.yml` |
| E2E / browser tests | Not configured | Future task |

---

## How to Read CI Failures

### `api-ci` fails at "Install dependencies"
→ `package-lock.json` is out of sync with `package.json`. Run `npm install` locally and commit the updated lockfile.

### `api-ci` fails at "Validate Prisma schema"
→ A change to `prisma/schema.prisma` introduced a syntax error. Check the Prisma error output in the CI log.

### `api-ci` fails at "Build API"
→ TypeScript compilation error in the NestJS source. The CI log shows the failing file and line number.

### `web-ci` fails at "Build web"
→ TypeScript compilation error or Next.js build error in `apps/web`. The `next build` output in the CI log pinpoints the problem.

### `compose-ci` fails at "Validate dev compose config"
→ `docker-compose.yml` has a YAML syntax error or references an undefined env var without a default. Check the error in the CI log.

### `compose-ci` fails at "Validate production standalone compose config"
→ `docker-compose.production.yml` has a missing required variable (`:?` fired) or a YAML syntax error.

### `compose-ci` fails at "Confirm no host-bound ports"
→ A change to `docker-compose.production.yml` introduced a `ports: HOST:CONTAINER` mapping. Remove it and use `expose:` instead.

---

## Future Improvements

### Short Term
- **Branch protection rules**: Require all three CI jobs to pass before merging to `main`
- **Unit tests**: Add Jest unit tests for NestJS services and enable `npm test` in `api-ci`
- **Database service**: Add a PostgreSQL service container in `api-ci` to run `prisma migrate deploy` and `api-smoke-test.sh`

### Medium Term
- **Docker image builds**: Add a `docker-build` job that runs `docker compose build api web` using GitHub Actions cache (`type=gha`)
- **Container registry push**: Push tagged images to GHCR (GitHub Container Registry) on merge to `main`
- **Staging deployment**: Auto-deploy to a staging server on successful merge using SSH + `docker compose pull && up`

### Long Term
- **E2E tests**: Playwright or Cypress tests against a fully running test stack
- **Scheduled smoke tests**: Nightly run of `api-smoke-test.sh` against staging
- **Multi-environment workflows**: Separate pipelines for `staging` and `production` branches

---

## Related Docs

- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — how to deploy using `docker-compose.production.yml`
- [AUTH_SECURITY_HARDENING.md](AUTH_SECURITY_HARDENING.md) — rate limiting, Helmet, brute-force protection
- [PRE_DEPLOYMENT_SECURITY.md](PRE_DEPLOYMENT_SECURITY.md) — JWT, CORS, credentials hardening
