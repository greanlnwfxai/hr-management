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
./scripts/docker-verify.sh  # full stack up + /health check
./scripts/api-smoke-test.sh # login + GET /employees
```

A step is **PASS** only if all three exit 0.

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
