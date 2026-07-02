# Verification Workflow

## Verification Principle

Use the **smallest relevant verification set** for the task.

- Product/backend changes may require build, runtime, or smoke verification.
- Dependency changes may require `security-audit`.
- Docs-only tasks should use docs-only verification.
- Full security review is **not required for every task**.

## Script 1: verify.sh

**What it does:**
1. Runs `nest build` in `apps/api` — TypeScript compilation
2. Runs `npx prisma validate` — schema validation
3. Runs `next build` in `apps/web` — frontend build

**When to run:** Product code changes that affect API/web build behavior.

**PASS criteria:** All three commands exit 0. No TypeScript errors. Schema valid. Frontend builds cleanly.

**What it catches:** Compile errors, schema drift, frontend build failures.

---

## Script 2: docker-verify.sh

**What it does (confirmed non-destructive as of `v1.2.65` — see [[ADR-030 Non-destructive Docker Verification]]):**
1. Self-check guard: greps its own source for forbidden Docker commands and refuses to run if found
2. `docker compose config` — validates the compose file
3. `docker compose up -d --build` — builds and starts/updates services (never tears down first)
4. Polls `GET /health` (API), then web (`:3002`) and mobile (`:3004`) reachability
5. Prints `docker compose ps`, and on failure, `docker compose logs --tail=100` for the failing service
6. Leaves all containers running on both pass and fail — never stops/removes containers, volumes, images, or networks

**When to run:** Any time Docker/runtime verification is useful for the task. It no longer requires special approval before running — it is a normal, always-safe verification step.

**PASS criteria:** All containers healthy. `GET /health` returns `{"status":"ok"}`. Web and mobile reachable.

**What it catches:** Docker build failures, Prisma generate issues, container startup failures, environment variable problems.

**Safety note:** `docker-verify.sh` itself never runs `docker compose down` or any other teardown/cleanup command. Stopping or resetting containers remains a separate, manual, user-approved action — do not run `docker compose down` yourself as part of verification.

---

## Script 3: api-smoke-test.sh

**What it does (12 checks):**

| # | Check | Assertion |
|---|---|---|
| 1 | `GET /health` | `status = ok` |
| 2 | `POST /auth/login` | `accessToken` present |
| 3 | `GET /auth/me` | `id` present |
| 4 | `GET /employees` | `meta.total` present |
| 5 | `GET /departments` | `meta.total` present |
| 6 | `GET /positions` | `meta.total` present |
| 7 | `GET /attendance` | `meta.total` present |
| 8 | `GET /leave` | `meta.total` present |
| 9 | `GET /leave-balances` | `meta.total` present |
| 10 | `GET /dashboard` | `timezone = Asia/Bangkok` |
| 11 | `GET /dashboard` | `employees.totalEmployees` present |
| 12 | `GET /dashboard` (no token) | HTTP 401 |

**When to run:** After runtime verification when API behavior needs confirmation.

**PASS criteria:** All 12 checks pass. Default admin: `admin@hr.local` / `admin1234`.

**What it catches:** Runtime API failures, RBAC misconfigurations, module registration errors, missing routes.

---

## Security Verification Guidance

- `./scripts/security-audit.sh` is especially relevant when `package.json` or lockfiles change
- `./scripts/secret-scan.sh` is available for local secret checks
- `./scripts/security-review.sh` is reserved for security-sensitive work or when the task requires it
- Docs-only tasks do not need the full security review flow

## Docs-Only Verification

For documentation-only tasks, a valid lightweight verification set can be:

1. `git status --short`
2. `git diff --check`
3. manual markdown review

## Failure Response

If any script fails:

1. **Do not commit.**
2. Diagnose the failure — read the error output carefully.
3. Fix the root cause (do not bypass with `--no-verify` or similar).
4. Re-run the failed verification and any downstream checks that depend on it.
5. Only declare PASS when the required verification set is clean.

## Related ADRs

- [[ADR-009 Development Harness]]
- [[ADR-030 Non-destructive Docker Verification]]

## Related Notes

- [[Development Workflow]]
- [[Backend QA Checklist]]

#sop #verification #workflow
