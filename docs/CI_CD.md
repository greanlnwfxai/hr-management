# CI/CD Pipeline

## Overview

The project uses **GitHub Actions** for continuous integration. Every push and pull request to `main` triggers an automated validation pipeline that builds the API, builds the web frontend, validates both Docker Compose configurations, and runs a full runtime integration test against a live PostgreSQL service.

The pipeline does **not** deploy to production or push Docker images to a registry — those are future tasks (see [Future Improvements](#future-improvements)).

The pipeline now has **five jobs**: API build/validate, Web build/validate, Compose config validation, Runtime API integration test, and Playwright E2E critical flows.

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

| Job | Name | Depends on | Runner |
|-----|------|-----------|--------|
| `api-ci` | API — Build & Validate | — | ubuntu-latest |
| `web-ci` | Web — Build & Validate | — | ubuntu-latest |
| `compose-ci` | Compose — Config Validation | — | ubuntu-latest |
| `integration-ci` | Integration — Runtime API Test | `api-ci` | ubuntu-latest |
| `e2e-ci` | E2E — Playwright Critical Flows | `api-ci`, `web-ci`, `compose-ci` | ubuntu-latest |

`integration-ci` and `e2e-ci` run in parallel after the three build/validate jobs complete. They validate different runtime paths: `integration-ci` exercises the NestJS API directly (no browser); `e2e-ci` exercises the full stack through a real Chromium browser.

---

### `api-ci` — API: Build & Validate

**Runner**: `ubuntu-latest`  
**Working directory**: `apps/api`

| Step | Command | Notes |
|------|---------|-------|
| Checkout | `actions/checkout@v4` | |
| Setup Node.js 22 | `actions/setup-node@v4` | npm cache keyed to `apps/api/package-lock.json` |
| Install deps | `npm ci` | Frozen lockfile install |
| Generate Prisma client | `npx prisma generate` | Required before TS compilation and before unit tests |
| Validate Prisma schema | `npx prisma validate` | Schema-only check; no database connection needed |
| Run unit tests | `npm test` | Jest — mocked Prisma/JWT, no database needed |
| Build API | `npm run build` | `nest build` → compiled `dist/` |

**Database note**: The `DATABASE_URL` env var is set to a non-reachable placeholder. `prisma validate`, `npm test`, and `nest build` do not connect to a database — they only need the env var to be parseable.

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

### `integration-ci` — Integration: Runtime API Test

**Runner**: `ubuntu-latest`  
**Depends on**: `api-ci` (runs after a successful build)  
**Service container**: PostgreSQL 16 (see below)

This job starts a real PostgreSQL database, applies migrations, seeds the admin user, compiles and starts the NestJS API, then runs the full `scripts/api-smoke-test.sh` suite against it. It is the only CI job that makes actual HTTP requests to a running API.

| Step | Command | Notes |
|------|---------|-------|
| Checkout | `actions/checkout@v4` | |
| Setup Node.js 22 | `actions/setup-node@v4` | npm cache keyed to `apps/api/package-lock.json` |
| Install API deps | `npm ci` | Frozen lockfile install |
| Generate Prisma client | `npx prisma generate` | Generates `@prisma/client` including enum objects |
| Run migrations | `npx prisma migrate deploy` | Applies `prisma/migrations/` against CI database |
| Seed database | `npx prisma db seed` | Creates `admin@hr.local` if not present (idempotent) |
| Build API | `npm run build` | `nest build` → `dist/` |
| Start API | `npm run start:prod &` | `node dist/main` on `PORT=4002`, runs in background |
| Wait for health | `curl --retry 20 …` | Polls `GET /health` until API is ready |
| Run smoke test | `./scripts/api-smoke-test.sh` | Authenticated test of all v1.0 endpoints |

#### PostgreSQL Service Container

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: hr_management_ci
    ports:
      - 5432:5432
    options: >-
      --health-cmd "pg_isready -U postgres -d hr_management_ci"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

GitHub Actions waits for the health check to pass before running any steps. Steps begin only once `pg_isready` returns successfully.

#### Seed Strategy

The seed script (`apps/api/prisma/seed.ts`) is idempotent — it checks for the `admin@hr.local` user before inserting. Running it twice against the same database is safe and produces no error.

The smoke test expects only:
- `POST /auth/login` with `admin@hr.local` / `admin1234` succeeds
- All module list endpoints (`GET /employees`, `/departments`, etc.) return a `meta.total` field (zero is acceptable)
- `GET /dashboard` returns `timezone: "Asia/Bangkok"` and a `employees.totalEmployees` field

A freshly-migrated and seeded database with a single admin user satisfies all of these.

#### CI Credentials Note

`admin@hr.local` / `admin1234` are dev/CI-only credentials. They are baked into the seed script and smoke test as well-known defaults. Do not use these in production.

---

## CI Environment Variables

All CI environment variables are safe placeholder values. No real secrets are stored in the workflow file or repository.

| Variable | Job(s) | CI Value | Why needed |
|----------|--------|----------|------------|
| `DATABASE_URL` | api-ci, integration-ci | `postgresql://postgres:...@localhost:5432/...` | Prisma; api-ci uses non-reachable placeholder, integration-ci uses live service |
| `JWT_SECRET` | api-ci, integration-ci | `ci_jwt_secret_do_not_use_in_production` | NestJS reads at module load time |
| `CORS_ORIGIN` | api-ci, integration-ci | `http://localhost:3002` | API bootstrap; no CORS requests made in CI |
| `PORT` | integration-ci | `"4002"` | API listens on this port (matches smoke test default) |
| `THROTTLE_TTL` | all | `"60"` | Rate limiter window (seconds) |
| `THROTTLE_LIMIT` | all | `"100"` | Global request limit per window |
| `LOGIN_THROTTLE_TTL` | all | `"60"` | Login rate limiter window |
| `LOGIN_THROTTLE_LIMIT` | api-ci, compose-ci | `"5"` | Login attempts per window |
| `LOGIN_THROTTLE_LIMIT` | integration-ci | `"10"` | Raised to prevent smoke-test retries from triggering throttle |
| `POSTGRES_PASSWORD` | compose-ci | `ci_postgres_password` | Required by production compose `:?` validation |
| `NEXT_PUBLIC_API_URL` | web-ci / compose-ci | `http://localhost:4002` / `https://hr.example.com/api` | Next.js bakes this into the JS bundle at build time |
| `TRUST_PROXY` | compose-ci | `"true"` | Production compose config validation |

---

## What CI Does Not Do Yet

| Capability | Status | See |
|------------|--------|-----|
| Unit tests (Jest) | **Configured** — runs in `api-ci` | `apps/api/src/**/*.spec.ts` |
| Browser E2E tests (Chromium) | **Configured** — `e2e-ci` added in T-040 | `apps/web/e2e/` |
| Build Docker images (standalone) | Not configured | Slow without registry cache; deferred to future task |
| Push images to a container registry | Not configured | Future task |
| Deploy to production | Not configured | Future task — manual deployment via `docker-compose.production.yml` |
| Browser matrix (Firefox, WebKit) | Not configured | Deferred — Chromium-only for now |

---

## How to Read CI Failures

### `api-ci` fails at "Run unit tests" — Jest mock failure
→ A service method was added or renamed but the corresponding mock was not updated. Check the failing test file in `apps/api/src/`. Run `cd apps/api && npm test` locally to reproduce. Update the mock return value or spy setup to match the new method signature.

### `api-ci` fails at "Run unit tests" — TypeScript compile error in spec file
→ A type change in a DTO, service, or enum broke the `.spec.ts` file. Run `cd apps/api && npm test` locally — `ts-jest` will show the exact line. Update the spec to match the new types. Do not cast to `any` to suppress errors unless the cast is intentional.

### `api-ci` fails at "Run unit tests" — timezone-sensitive test is flaky
→ Attendance and dashboard tests that assert Bangkok date/time must use `jest.useFakeTimers()` and `jest.setSystemTime()` to pin the clock. Tests that do not pin time and depend on "what hour it is now" will fail unpredictably. All such tests should call `jest.useRealTimers()` in `afterEach`. Do not assert exact Bangkok date values without pinning the system clock first.

### `api-ci` fails at "Run unit tests" — bcrypt/JWT mock not applied
→ `jest.mock('bcrypt')` or `jest.mock('@nestjs/jwt')` must appear at the top of the spec file (before any imports that trigger the module). If the mock is inside a `describe()` block it will be hoisted by Jest but may not apply in time. Move it to the top level.

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

### `integration-ci` — PostgreSQL service health timeout
→ The `postgres:16` service container failed its `pg_isready` health checks within the allotted retries. This is rare on `ubuntu-latest` but can happen if runner resources are constrained. Re-run the workflow; if it recurs, increase `--health-retries`.

### `integration-ci` fails at "Run Prisma migrations"
→ `prisma migrate deploy` could not connect to the database (check `DATABASE_URL`) or a migration file has an error. Inspect the Prisma output in the CI log. Do not run `prisma migrate dev` in CI — only `migrate deploy` (which applies existing files without prompting).

### `integration-ci` fails at "Seed database"
→ `prisma db seed` (runs `apps/api/prisma/seed.ts`) threw an error. Likely a schema mismatch between the migration and the seed's model usage. Check that the migration ran successfully in the previous step.

### `integration-ci` fails at "Wait for API health endpoint"
→ The API did not respond at `http://localhost:4002/health` within 20 × 2s = ~40 seconds. Check the build step to confirm `dist/` was produced. The most common cause is a runtime startup error — look for NestJS exception output in the step that preceded the wait. If `PORT` is being overridden somewhere, ensure it equals `4002`.

### `integration-ci` fails at "Run API smoke test" — login/auth failure
→ The admin seed did not run or the admin password changed. Confirm the seed step succeeded and that `admin@hr.local` / `admin1234` are the expected credentials.

### `integration-ci` fails at "Run API smoke test" — 429 Too Many Requests
→ The smoke test triggered the login rate limiter. `LOGIN_THROTTLE_LIMIT` in `integration-ci` is set to `10` specifically to avoid this. If you added retry logic that calls `POST /auth/login` many times, reduce the retries or increase the limit further in the CI env block only.

### `e2e-ci` fails at "Wait for database to be ready"
→ The `db` container did not pass `pg_isready` within 30 × 3 s = 90 s. Check `docker compose logs db` output in the step (the step prints logs on timeout). Re-running the workflow usually resolves transient runner resource issues.

### `e2e-ci` fails at "Run Prisma migrations"
→ `prisma migrate deploy` could not reach `localhost:5432` or a migration file has an error. Confirm the "Wait for database" step succeeded. The step-level `DATABASE_URL` override uses `localhost:5432` (the host-exposed port) — ensure no job-level override is shadowing it.

### `e2e-ci` fails at "Wait for API health endpoint" / "Wait for Web app to be reachable"
→ The API container failed to start (check `docker compose logs api`) or the Web container is waiting for the API healthcheck to pass. The API healthcheck has a 15 s `start_period` plus 5 × 10 s retries. Our curl polls for up to 30 × 3 s = 90 s, which should be sufficient. If flakiness persists, raise `--retry` to 40.

### `e2e-ci` fails at "Run Playwright E2E tests" — a test fails once but passes on retry
→ The single automatic retry (`retries: process.env.CI ? 1 : 0`) absorbed a transient timing issue. This is expected occasional behaviour; if the test passes on retry the job still succeeds. If a test fails twice consistently, investigate the root cause.

### `e2e-ci` fails at "Run Playwright E2E tests" — 429 login rate limit
→ `LOGIN_THROTTLE_LIMIT` in `e2e-ci` is set to `20` to handle `globalSetup` (1 login) + `login.spec.ts` (2 logins) plus retries. If more spec files call `getAdminToken()` directly (instead of `getCachedAdminToken()`), the budget will be exhausted. Always use the cached token in spec files.

### `e2e-ci` — Playwright report available
→ Download the `playwright-report` artifact from the GitHub Actions run page. Extract it and open `playwright-report/index.html` locally to see screenshots and traces for each failed test.

---

## Playwright E2E Tests (`e2e-ci` — T-040)

Playwright critical-flow tests run in GitHub Actions as the `e2e-ci` job. They exercise the full stack (browser → Next.js → NestJS API → PostgreSQL) using Chromium.

**Coverage:** 44 tests across 5 spec files — login/logout, navigation, dashboard, employees, leave/attendance.

**Docker strategy:** The API image does not include Prisma migration files (only `dist/` + `node_modules/`). CI runs migrations from the host runner before starting the API container:

```
docker compose up -d db
→ wait for pg_isready
→ npx prisma migrate deploy (host → localhost:5432)
→ npx prisma db seed
→ docker compose up -d --build api web
→ curl --retry on /health and / (3002)
→ npm run test:e2e
```

**`LOGIN_THROTTLE_LIMIT=20`** is set in `e2e-ci` (vs. 5 in production) to absorb Playwright's `globalSetup` token fetch + `login.spec.ts` UI login calls without triggering the rate limiter.

**Retries:** `playwright.config.ts` uses `retries: process.env.CI ? 1 : 0`. In CI each failing test gets one automatic retry to absorb transient Docker startup timing issues.

**Artifacts:** On failure, `playwright-report/` and `test-results/` are uploaded as the `playwright-report` artifact (retained 7 days) so screenshots and traces are available without re-running CI.

**Running locally (unchanged from T-039):**

```bash
# Prerequisite: install browser once
cd apps/web && npx playwright install chromium

# Prerequisite: stack must be running
./scripts/docker-verify.sh

# Run tests
./scripts/e2e-test.sh
# or directly:
cd apps/web && npm run test:e2e
```

See **[E2E_TESTING.md](E2E_TESTING.md)** for full CI troubleshooting and env var reference.

---

## Branch Protection

All five CI jobs should be configured as **required status checks** on `main`. This prevents code from merging if any check fails — including the runtime integration test and the Playwright E2E suite.

Required check names (as they appear in GitHub):

```
HR Management CI / API — Build & Validate
HR Management CI / Web — Build & Validate
HR Management CI / Compose — Config Validation
HR Management CI / Integration — Runtime API Test
HR Management CI / E2E — Playwright Critical Flows
```

Full setup instructions, solo-vs-team policy, emergency bypass guidance, and a validation checklist are in **[BRANCH_PROTECTION.md](BRANCH_PROTECTION.md)**.

> Production deployment should only be performed from `main` after all CI checks pass. See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).

---

## Unit Tests

Unit tests run in `api-ci` via `npm test` (Jest + ts-jest). They mock all external dependencies and require no database connection.

### What `npm test` covers

| Module | File | Tests |
|--------|------|-------|
| `AuthService` | `src/auth/auth.service.spec.ts` | Valid login, wrong password, unknown user, safe response shape, JWT payload fields |
| `AuthController` | `src/auth/auth.controller.spec.ts` | Login delegation, `/me` handler |
| `JwtStrategy` | `src/auth/strategies/jwt.strategy.spec.ts` | Valid payload returns safe user; deleted user throws `UnauthorizedException` |
| `EmployeesService` | `src/employees/employees.service.spec.ts` | Pagination, findOne, NotFoundException, create, ConflictException, update, soft-delete |
| `EmployeesController` | `src/employees/employees.controller.spec.ts` | All five CRUD routes delegate correctly to service |
| `LeaveService` | `src/leave/leave.service.spec.ts` | Create with overlap guard, date validation, findMy, findAll, findOne with RBAC, approve (balance check + atomic transaction), reject |
| `LeaveController` | `src/leave/leave.controller.spec.ts` | All six routes delegate with correct user context |
| `LeaveBalanceService` | `src/leave-balance/leave-balance.service.spec.ts` | Create with conflict guard, findAll, findMy, findOne with RBAC, update with negative-remaining guard, `remainingDays` computed field |
| `LeaveBalanceController` | `src/leave-balance/leave-balance.controller.spec.ts` | All five routes delegate correctly |
| `AttendanceService` | `src/attendance/attendance.service.spec.ts` | clockIn PRESENT/LATE boundary (Bangkok UTC+7 fake timers), clockOut, duplicate-clock guards, findMyAttendance, findAll, findOne with RBAC |
| `AttendanceController` | `src/attendance/attendance.controller.spec.ts` | All five routes delegate correctly |
| `DashboardService` | `src/dashboard/dashboard.service.spec.ts` | Full response shape, employee/attendance/leave counts, `lowLeaveBalanceCount` threshold logic, Bangkok `todayDate` calendar boundary |
| `DashboardController` | `src/dashboard/dashboard.controller.spec.ts` | Delegates to service, returns timezone |

### Mocking strategy

- **PrismaService** — replaced by a typed mock factory in `src/test-utils/prisma.mock.ts`. Covers `user`, `employee`, `leaveRequest`, `leaveBalance`, `attendance`, `department`, `position`, and `$transaction` (both array form and callback form).
- **JwtService** — injected as a plain `{ signAsync: jest.fn() }` object.
- **bcrypt** — module-level `jest.mock('bcrypt')` replaces `compare` with a controllable `jest.fn()`.
- **Guards** (`JwtAuthGuard`, `RolesGuard`) — overridden with `{ canActivate: () => true }` in controller tests.
- **Date / timers** — attendance and dashboard timezone tests use `jest.useFakeTimers()` / `jest.setSystemTime()` for deterministic Bangkok calendar date assertions. Timers are always restored in `afterEach`.

### Running locally

```bash
cd apps/api
npm test          # run once
npm run test:cov  # with coverage report
npm run test:watch  # watch mode during development
```

### Unit tests vs integration-ci

| | Unit tests (`api-ci`) | Integration test (`integration-ci`) |
|---|---|---|
| Database | None (mocked) | Real PostgreSQL 16 |
| Speed | Fast (~seconds) | Slow (~1–2 min) |
| Scope | Service/controller logic | Full HTTP stack + migrations + seed |
| Failures | Mock setup, type errors | DB schema, auth flow, HTTP routing |

---

## Future Improvements

### Short Term
- **Coverage enforcement**: Add `--coverageThreshold` to `jest` config to require minimum coverage on new code
- **E2E browser matrix**: Extend `e2e-ci` to run against Firefox and WebKit (add projects to `playwright.config.ts`); currently Chromium-only to minimise install time

### Medium Term
- **Docker image builds**: Add a `docker-build` job that runs `docker compose build api web` using GitHub Actions cache (`type=gha`)
- **Container registry push**: Push tagged images to GHCR (GitHub Container Registry) on merge to `main`
- **Staging deployment**: Auto-deploy to a staging server on successful merge using SSH + `docker compose pull && up`

### Long Term
- **Scheduled smoke tests**: Nightly run of `api-smoke-test.sh` against staging
- **Multi-environment workflows**: Separate pipelines for `staging` and `production` branches
- **E2E mutating tests**: Add write-path coverage (create employee, submit leave, clock in/out) once a test-data reset strategy is in place

---

## Related Docs

- [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md) — required status checks and GitHub ruleset setup guide
- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — how to deploy using `docker-compose.production.yml`
- [AUTH_SECURITY_HARDENING.md](AUTH_SECURITY_HARDENING.md) — rate limiting, Helmet, brute-force protection
- [PRE_DEPLOYMENT_SECURITY.md](PRE_DEPLOYMENT_SECURITY.md) — JWT, CORS, credentials hardening
