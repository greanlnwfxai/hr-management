# E2E Testing — Playwright

## Purpose

Playwright end-to-end tests validate critical HR Management user flows through the real browser UI against the running local Docker stack.

These are smoke-level, read-only flows that confirm the full system works together: frontend ↔ API ↔ database.

---

## Test Coverage

| Spec file | What it covers |
|-----------|---------------|
| `login.spec.ts` | Unauthenticated redirect, login form renders, invalid credentials error, valid login → dashboard redirect, logout clears session |
| `navigation.spec.ts` | Sidebar renders for admin, all six nav links present, each page navigates correctly, admin email shown in sidebar |
| `dashboard.spec.ts` | Dashboard heading, employee/attendance/leave stat cards visible, recent sections render, no loading/error state remaining, timezone indicator |
| `employees.spec.ts` | Employees heading, table loads without error, table headers visible, Add Employee button (admin), search input, status filter, seeded admin record visible, empty state on no-match search |
| `leave-attendance.spec.ts` | Leave heading, page loads, Request Leave button, form toggle, Leave Balance Admin section (admin), attendance heading, Today's Attendance panel, Clock In/Out buttons visible, Bangkok time clock, history sections |

**What tests do NOT cover yet:**
- Creating / editing / deleting employees, departments, positions, leave balances (mutating tests deferred to T-040)
- Clock In / Clock Out interactions (deferred — not idempotent without reset)
- Submitting leave requests (deferred)
- Role-based access (MANAGER, EMPLOYEE roles — admin only for T-039)
- Mobile / responsive navigation drawer
- Pagination beyond page 1
- Error state retry interactions
- CI execution (local-only for T-039 — see below)

---

## Prerequisites

### 1. Docker stack running and healthy

```bash
./scripts/docker-verify.sh
```

All three services (`db`, `api`, `web`) must be healthy before running E2E tests.

### 2. Playwright browsers installed

Run **once** on a fresh clone or after upgrading `@playwright/test`:

```bash
cd apps/web
npx playwright install chromium
```

Chromium is the only browser configured for T-039 to minimise install weight.

---

## Running Tests

### From `apps/web` directory

```bash
# Headless (CI-style)
npm run test:e2e

# Headed (watch Chromium run)
npm run test:e2e:headed

# Interactive UI mode
npm run test:e2e:ui
```

### From repo root (via helper script)

```bash
./scripts/e2e-test.sh
```

The script verifies the web app and API are reachable before invoking Playwright.

---

## Required Environment Variables

All variables have sensible defaults for the local Docker stack and do not need to be set manually.

| Variable | Default | Description |
|----------|---------|-------------|
| `E2E_BASE_URL` | `http://localhost:3002` | Web app base URL |
| `E2E_API_URL` | `http://localhost:4002` | API base URL (for token fetch) |
| `E2E_ADMIN_EMAIL` | `admin@hr.local` | Seeded admin email |
| `E2E_ADMIN_PASSWORD` | `admin1234` | Seeded admin password |

To override:

```bash
E2E_BASE_URL=http://staging.example.com npm run test:e2e
```

---

## Auth Strategy

- **`login.spec.ts`** — uses real browser UI login to test the login flow itself.
- **All other specs** — fetch a JWT from the API once per spec file (`beforeAll`), then inject it into `localStorage` via `page.evaluate` before each test. This avoids hitting the API rate limiter repeatedly and keeps tests fast.

---

## Output Artifacts

Playwright writes artifacts to `apps/web/`:

| Path | Content | Git-ignored |
|------|---------|-------------|
| `playwright-report/` | HTML test report (`open: never` in config) | Yes |
| `test-results/` | Screenshots, traces on failure | Yes |

To open the report after a run:

```bash
cd apps/web && npx playwright show-report
```

---

## Troubleshooting

### Browser not installed
```
Error: browserType.launch: Executable doesn't exist
```
Fix: `cd apps/web && npx playwright install chromium`

### Web app not reachable (`ERR_CONNECTION_REFUSED` on 3002)
Fix: start the Docker stack → `./scripts/docker-verify.sh`

### API not reachable (token fetch fails in `beforeAll`)
Fix: check `docker compose ps` — `api` container must be healthy.

### Login failed / 401 during token fetch
Verify the seed ran successfully: `./scripts/api-smoke-test.sh`

### Rate limit 429 on login tests
The login spec calls `/auth/login` only twice (valid-login test + logout test).  
If you run specs repeatedly in quick succession, wait 30–60 seconds before re-running.

### Flaky loading state (`Loading…` still visible)
The Docker stack on a slower Mac may take longer to respond. The Playwright `expect` timeout is 15 s per assertion. Increase `timeout` in `playwright.config.ts` if needed.

### `useEffect` redirect race
The protected layout uses `useEffect` to check `localStorage` and redirect if no token. Playwright's `expect(page).toHaveURL(/\/login/)` waits up to the configured timeout — this handles the async redirect gracefully.

---

## CI Integration (T-040)

E2E tests run in GitHub Actions as the **`e2e-ci`** job. The job starts the real Docker stack, seeds the database, and runs all 44 Playwright tests in Chromium.

### Job name

```
HR Management CI / E2E — Playwright Critical Flows
```

### Job dependency

`e2e-ci` runs after `api-ci`, `web-ci`, and `compose-ci` pass. It runs in parallel with `integration-ci` (which validates the API via a different runtime path).

### CI Docker strategy

The API Docker image does not include `prisma/` migration files (only `dist/` and `node_modules/`), so migrations run from the host runner before the API container starts:

1. Start database only: `docker compose up -d db`
2. Wait for `pg_isready` inside the container
3. Run `npx prisma migrate deploy` (host → `localhost:5432`, the exposed db port)
4. Run `npx prisma db seed` (creates `admin@hr.local`)
5. Build and start API + Web: `docker compose up -d --build api web`
6. Poll `http://localhost:4002/health` and `http://localhost:3002` with `curl --retry`
7. Run `npm run test:e2e`
8. Upload artifacts on failure
9. CI-only cleanup may use container teardown after the test run. This is infrastructure cleanup behavior, not a normal Claude/Codex/agent workflow step.

### Required CI environment variables

All values are safe CI-only placeholders — no real secrets.

| Variable | CI Value | Notes |
|----------|----------|-------|
| `POSTGRES_USER` | `postgres` | DB superuser for CI |
| `POSTGRES_PASSWORD` | `postgres` | CI-only placeholder password |
| `POSTGRES_DB` | `hr_management` | Database name |
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/hr_management?schema=public` | Used by API container (Docker-internal hostname) |
| `JWT_SECRET` | `ci_jwt_secret_do_not_use_in_production` | API JWT signing key |
| `CORS_ORIGIN` | `http://localhost:3002` | API CORS allowed origin |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4002` | Baked into web bundle at Docker build time |
| `PORT` | `4002` | API listen port |
| `TRUST_PROXY` | `false` | Not behind a reverse proxy in CI |
| `THROTTLE_TTL` | `60` | Rate limiter window (seconds) |
| `THROTTLE_LIMIT` | `100` | Global request limit per window |
| `LOGIN_THROTTLE_TTL` | `60` | Login rate limiter window |
| `LOGIN_THROTTLE_LIMIT` | `20` | Raised from default (5) to absorb Playwright login calls |
| `SWAGGER_ENABLED` | `true` | Swagger UI enabled |
| `SWAGGER_PATH` | `docs` | Swagger endpoint path |
| `E2E_BASE_URL` | `http://localhost:3002` | Playwright base URL |
| `E2E_API_URL` | `http://localhost:4002` | API URL for token fetch |
| `E2E_ADMIN_EMAIL` | `admin@hr.local` | Seeded admin credentials |
| `E2E_ADMIN_PASSWORD` | `admin1234` | Seeded admin credentials |

### Artifact upload

On failure, the job uploads:

| Path | Content |
|------|---------|
| `apps/web/playwright-report/` | HTML test report |
| `apps/web/test-results/` | Screenshots and traces for failed tests |

Artifacts are retained for **7 days** under the name `playwright-report` in the GitHub Actions run.

### Retries

`playwright.config.ts` sets `retries: process.env.CI ? 1 : 0`. In CI, each failing test gets one retry to absorb transient Docker timing issues. Locally, retries stay at 0 for immediate feedback.

---

## Troubleshooting CI Failures

### Docker build failed (`api` or `web` image)
Check the build output in the "Build and start API and Web" step. Common causes: network timeout fetching npm packages, lockfile mismatch, or TypeScript error that slipped past `api-ci`/`web-ci`.

### API health timeout (`localhost:4002/health` never responds)
The API container failed to start. Check:
1. The "Build and start API and Web" step for Docker error output.
2. Run `docker compose logs api` in a subsequent debug step if needed.
3. Confirm `DATABASE_URL` points to `db:5432` (not `localhost:5432`) for the API container.

### Web health timeout (`localhost:3002` never responds)
The web container starts only after the API is healthy (due to `depends_on: api: condition: service_healthy`). If the API health check never passes, web never starts. Fix the API first.

### Login failed / 401 during Playwright `globalSetup`
The admin seed did not run or the API is not yet serving. Confirm:
1. The "Seed database" step succeeded.
2. The "Wait for API health endpoint" step passed.

### 429 Too Many Requests in login tests
`LOGIN_THROTTLE_LIMIT` is set to `20` in CI to absorb `globalSetup` + `login.spec.ts` calls. If tests are added that call `/auth/login` many more times, raise this value in the CI job env only.

### Playwright browser install failed
`npx playwright install --with-deps chromium` failed to download the browser binary. This is usually a transient network issue on the runner. Re-run the workflow; it will retry from scratch.

### `NEXT_PUBLIC_API_URL` baked incorrectly (browser calls go to wrong host)
This happens if `NEXT_PUBLIC_API_URL` is passed only as a runtime env var instead of a Docker build arg. The `docker-compose.yml` passes it as `build.args.NEXT_PUBLIC_API_URL`, which bakes the value into the Next.js bundle at image build time. Verify the job-level `NEXT_PUBLIC_API_URL` env var is set before `docker compose up --build`.

### Database migration timeout
The "Wait for database to be ready" step polls `pg_isready` up to 30 times (90 s). If it times out, check `docker compose logs db` output in the step. Likely cause: runner resource contention. Re-run the workflow.

---

## Local-Only Usage (original T-039 behavior)

Running E2E tests locally still works exactly as before:

```bash
# Prerequisite: install browser once
cd apps/web && npx playwright install chromium

# Prerequisite: stack must be running and seeded
./scripts/docker-verify.sh

# Run tests
./scripts/e2e-test.sh
# or directly:
cd apps/web && npm run test:e2e
```
