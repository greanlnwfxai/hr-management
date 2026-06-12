# Verification Workflow

## Three-Script Gate

A step is declared **PASS** only when all three scripts exit 0, in this order:

```
1. ./scripts/verify.sh
2. ./scripts/docker-verify.sh
3. ./scripts/api-smoke-test.sh
```

## Script 1: verify.sh

**What it does:**
1. Runs `nest build` in `apps/api` — TypeScript compilation
2. Runs `npx prisma validate` — schema validation
3. Runs `next build` in `apps/web` — frontend build

**When to run:** After every code change before committing.

**PASS criteria:** All three commands exit 0. No TypeScript errors. Schema valid. Frontend builds cleanly.

**What it catches:** Compile errors, schema drift, frontend build failures.

---

## Script 2: docker-verify.sh

**What it does:**
1. `docker compose down` — stop and remove containers
2. `docker compose build --no-cache` — full rebuild
3. `docker compose up -d` — start all services
4. Wait for health checks:
   - `hr-db`: `pg_isready`
   - `hr-api`: `GET /health` → `{"status":"ok"}`
5. Assert all containers are `healthy` / `Up`

**When to run:** After `verify.sh` passes. Required before any commit that touches Docker-related files, Dockerfile, schema, or API startup configuration.

**PASS criteria:** All containers healthy. `GET /health` returns `{"status":"ok"}`.

**What it catches:** Docker build failures, Prisma generate issues, container startup failures, environment variable problems.

**Note:** Uses named volume `postgres_data`. Run `docker compose down -v` for a clean-slate test.

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

**When to run:** After `docker-verify.sh` passes. Requires a running Docker stack.

**PASS criteria:** All 12 checks pass. Default admin: `admin@hr.local` / `admin1234`.

**What it catches:** Runtime API failures, RBAC misconfigurations, module registration errors, missing routes.

---

## Failure Response

If any script fails:

1. **Do not commit.**
2. Diagnose the failure — read the error output carefully.
3. Fix the root cause (do not bypass with `--no-verify` or similar).
4. Re-run the failed script and all subsequent scripts.
5. Only declare PASS when all three exit 0.

## Related ADRs

- [[ADR-009 Development Harness]]

## Related Notes

- [[Development Workflow]]
- [[Backend QA Checklist]]

#sop #verification #workflow
