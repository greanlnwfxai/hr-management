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

**What it does:**
1. Validates the Dockerized stack flow for runtime verification
2. Rebuilds and starts services as defined by the script
3. Waits for health checks
4. Confirms expected healthy service state

**When to run:** Only when the task explicitly requires Docker/runtime verification and the task rules allow it.

**PASS criteria:** All containers healthy. `GET /health` returns `{"status":"ok"}`.

**What it catches:** Docker build failures, Prisma generate issues, container startup failures, environment variable problems.

**Safety note:** Some repository/task rules forbid destructive Docker commands such as `docker compose down`. Follow the active task brief and root workflow guidance before running any Docker verification.

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

## Related Notes

- [[Development Workflow]]
- [[Backend QA Checklist]]

#sop #verification #workflow
