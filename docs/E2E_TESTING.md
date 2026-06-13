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

## CI Decision (T-039)

E2E tests are **local-only** for T-039. They are not wired into GitHub Actions.

**Reasons:**
- Browser install (`npx playwright install`) adds ~200 MB and significant time on CI runners.
- Tests require a fully running Docker stack with seeded data, which means a full `docker compose up` on CI (additional time + cost).
- The existing GitHub Actions integration test (`runtime-integration`) already validates the API end-to-end with a real PostgreSQL service.
- Adding a reliable Playwright CI job requires a stable test database with guaranteed seed data — best addressed in T-040 or T-041.

When E2E CI is added (future task), the recommended approach is:
1. Add a `test:e2e:ci` script with `--reporter=github`.
2. Add a new CI job that starts the Docker stack, waits for health, runs `npm run test:e2e:ci`, and uploads the report artifact.
