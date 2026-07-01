# HR Management System

## Project
HR Management System — internal tooling for employees, departments, attendance, and leave.

## Stack
- **Frontend:** Next.js (App Router), React, TailwindCSS
- **Backend:** NestJS 11, Passport JWT, class-validator
- **ORM:** Prisma 6 (PostgreSQL)
- **Database:** PostgreSQL 16
- **Runtime:** Node.js 22
- **Orchestration:** Docker Compose

## Ports
| Service     | Port | Notes          |
|-------------|------|----------------|
| Web         | 3002 |                |
| API         | 4002 |                |
| PostgreSQL  | 5432 |                |
| Redis       | —    | not used yet   |

## Backend Structure
The API uses a **flat feature-module layout**, NOT a `src/modules/` container:

```
apps/api/src/
├── auth/        # AuthModule — login, JWT strategy, guards, decorators
├── employees/   # EmployeesModule — CRUD, DTOs
├── prisma/      # PrismaModule — global PrismaService
├── common/      # runtime-safe enums for DTO validation
├── health.controller.ts
├── app.module.ts
└── main.ts
```

> Do not introduce `src/modules/`. New features follow the existing pattern: `src/<feature>/<feature>.module.ts`.

## Completed Milestone
- **STEP 05–15 completed** — auth, employee CRUD, Prisma schema/migrations, Docker foundation.
- Commit: `feat: complete phase 1 auth employee docker foundation`

## Current Next Step
- **STEP 16 — Department Module**

---

## Claude Operating Rules
Claude Code **is responsible for**:
- Writing code
- Running build
- Running tests
- Docker verification
- Producing the CTO Summary

Claude Code **must NOT** perform any git mutation:
- ❌ `git add`
- ❌ `git commit`
- ❌ `git push`
- ❌ `git tag`

**All git steps are performed manually by the user.** Claude only *recommends* a commit message.

## Required Verification Commands
Run these (in order) before declaring a step done:

```bash
./scripts/verify.sh         # API build + prisma validate + web build
./scripts/docker-verify.sh  # non-destructive: build/start + /health + web/mobile reachability check
./scripts/api-smoke-test.sh # login + GET /employees
```

A step is **PASS** only if all three exit 0.

`docker-verify.sh` is **non-destructive**: it never stops or removes containers,
volumes, images, or networks, and it leaves the stack running when it finishes
(pass or fail). It does not run `docker compose down`. Stopping or resetting
containers is a manual decision made by the user only — Claude/Codex must never
run `docker compose down` or any other teardown/cleanup command as part of
verification.

## Docker Rules
- The full stack runs via root `docker-compose.yml`: `web`, `api`, `db`.
- `api` runs in **production mode** (`npm run start:prod`, compiled `dist/`), not `start:dev`.
- The Dockerfile **must** run `npx prisma generate` in the builder stage and copy `node_modules` from **builder** (so the generated Prisma client — including enum objects — is present at runtime).
- `api` healthcheck probes `GET /health`. `web` depends on `api` being healthy.
- Verify with `docker compose ps` — all services must be `healthy` / `Up`.

## API Rules
- Auth: `POST /auth/login` → `{ accessToken, user }`. Default admin: `admin@hr.local` / `admin1234`.
- All protected routes require `Authorization: Bearer <token>`.
- DTO validation uses `class-validator` with a **global `ValidationPipe`** (`whitelist: true, transform: true`).
- **Enums for `@IsEnum` come from `src/common/enums.ts`**, never directly from `@prisma/client` (the generated client's enum objects are undefined if `prisma generate` hasn't run, which crashes decorators at load time). Services map these string values to Prisma with type-only imports.
- Never weaken validation to `@IsString` to dodge an enum problem.

---

## CTO Summary Format
Every completed step produces a CTO Summary using [docs/CTO_SUMMARY_TEMPLATE.md](docs/CTO_SUMMARY_TEMPLATE.md):

```
# CTO Summary
## Step
## Status (PASS / FAIL)
## Scope
## Files Created
## Files Modified
## Verification Result
## Issues Found
## Risk (Low / Medium / High)
## Decision (PASS / FAIL)
## Next Step
## Recommended Commit Message
```

---

## Security Review Requirements (added T-052A.1)

Every task after T-052A.1 **must** include a **Security Review** section in the CTO Summary.

Required fields:

| Field | Description |
|---|---|
| Auth impact | Does this task add/change guarded endpoints? |
| RBAC impact | Does this task add/change role checks? |
| Data privacy impact | Does this expose new PII or change data access? |
| Password/token/hash impact | Any change to password, JWT, or hash handling? |
| Mobile security impact | Does this affect mobile token storage or API calls? |
| Dependency/advisory impact | Were new packages added? Any new audit findings? |
| Secrets/logging check | Any risk of secrets or tokens in logs or responses? |
| New endpoints protected | List new endpoints and their guards |
| Risk level | LOW / MEDIUM / HIGH / CRITICAL |
| Security decision | PASS / FAIL |

**Security FAIL conditions** (task must NOT be declared PASS):
- Password, token, or hash value exposed in logs, response, or source
- New endpoint missing JWT guard or role check
- RBAC bypass possible via crafted request
- Secret committed to source control
- HIGH or CRITICAL dependency vulnerability without patch or accepted-risk note
- Destructive Docker command used without explicit user approval
- Fabricated external advisory details in CTO Summary

Run before declaring done:
```bash
./scripts/security-review.sh
```

Full policy: [docs/SECURITY_HARNESS.md](docs/SECURITY_HARNESS.md)
Checklist:   [docs/SECURITY_REVIEW_CHECKLIST.md](docs/SECURITY_REVIEW_CHECKLIST.md)
Patch rules: [docs/SECURITY_PATCH_POLICY.md](docs/SECURITY_PATCH_POLICY.md)
Findings:    [docs/SECURITY_REVIEW_LOG.md](docs/SECURITY_REVIEW_LOG.md)

---

## Docker Safety Rules

- ❌ Do NOT run `docker compose down`
- ❌ Do NOT run `docker compose down -v`
- ❌ Do NOT remove Docker volumes
- ❌ Do NOT run `docker system prune`, `docker volume rm`, `docker volume prune`
- ❌ Do NOT stop, remove, or reset containers without explicit user approval
- ✅ Ask the user before restarting Docker or running any destructive Docker command

Allowed inspection commands (no approval needed):
`docker ps`, `docker ps -a`, `docker compose ps`, `docker compose logs`, `docker volume ls`, `docker compose config`, health check curls, `docker compose up -d --build` (as run by `scripts/docker-verify.sh`)

`scripts/docker-verify.sh` (T-091) is verified non-destructive: it builds/starts
the stack and checks health only, never tears it down. See
[docs/CTO_SUMMARY_T091_DOCKER_VERIFY_NON_DESTRUCTIVE.md](docs/CTO_SUMMARY_T091_DOCKER_VERIFY_NON_DESTRUCTIVE.md).
