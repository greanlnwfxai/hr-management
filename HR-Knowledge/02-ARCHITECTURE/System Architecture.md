# System Architecture

## High-Level Overview

```
Browser / Client
       │
       ▼
┌──────────────┐        ┌──────────────────────┐
│  Next.js     │        │  NestJS API           │
│  Web App     │◄──────►│  (apps/api)           │
│  Port 3002   │        │  Port 4002            │
│  (apps/web)  │        │                      │
└──────────────┘        └──────────┬───────────┘
                                   │ Prisma ORM
                                   ▼
                         ┌─────────────────────┐
                         │  PostgreSQL 16       │
                         │  Port 5432           │
                         │  Named volume:       │
                         │  postgres_data       │
                         └─────────────────────┘
```

All three services are orchestrated by **Docker Compose** (root `docker-compose.yml`).

## Components

### Frontend — Next.js (apps/web)

- Next.js with App Router
- React + TailwindCSS
- Runs on port **3002** in Docker
- Depends on API being healthy before starting

**Status:** Not yet implemented (backend-first strategy — see [[ADR Index]] → ADR-004).

### Backend API — NestJS (apps/api)

- NestJS 11 with flat feature-module layout
- Passport JWT authentication
- class-validator with GlobalValidationPipe
- Runs on port **4002** in Docker (production mode — `npm run start:prod`)
- All protected routes require `Authorization: Bearer <token>`

See [[Backend v1 Architecture]] for full module detail.

### ORM — Prisma 6

- `apps/api/prisma/schema.prisma` is the single source of truth for all models and enums
- Prisma Client generated at build time (`npx prisma generate`)
- Migrations committed to the repository
- `prisma validate` runs in every build gate

### Database — PostgreSQL 16

- Runs as `hr-db` container
- Named volume `postgres_data` persists data across restarts
- Health-checked with `pg_isready` before API starts

## Docker Compose Services

| Container | Image | Port | Depends On |
|---|---|---|---|
| `hr-db` | `postgres:16` | 5432 | — |
| `hr-api` | Built from `apps/api/Dockerfile` | 4002 | hr-db healthy |
| `hr-web` | Built from `apps/web/Dockerfile` | 3002 | hr-api healthy |

Startup order: `hr-db` → `hr-api` → `hr-web`

## Backend Module Design

The API uses a **flat feature-module layout**:

```
apps/api/src/
├── auth/
├── employees/
├── departments/
├── positions/
├── attendance/   # Clock-in/out; mobile geofence enforcement; GeofenceConfig singleton (T-060)
├── leave/
├── leave-balance/
├── dashboard/
├── audit-log/    # Append-only audit trail; AuditLogModule must not import AuthModule
├── prisma/       # Global PrismaService
├── common/       # Runtime-safe enums
├── app.module.ts
└── main.ts
```

**GeofenceConfig:** The `attendance/` module owns geofence config lookup via `GeofenceConfigService.getEffectiveConfig()`. Config is DB-first (singleton `geofence_config` table) with env-var fallback. No raw employee GPS is ever persisted — coordinates are used only for validation at request time.

No `src/modules/` wrapper. New features follow the pattern `src/<feature>/<feature>.module.ts`.

## Runtime-Safe Enum Pattern

Prisma-generated enums are not available at module load time if `prisma generate` hasn't run. To prevent crashes:

- All `@IsEnum()` validators import from `src/common/enums.ts` (plain TypeScript enums, identical values)
- Services cast to Prisma types using `as unknown as PrismaEnum`
- This pattern is enforced project-wide — never import enums directly from `@prisma/client` in DTOs

See [[ADR Index]] → ADR-002 for the full rationale.

## Related Notes

- [[Backend v1 Architecture]]
- [[Database Overview]]
- [[API Route Index]]
- [[ADR Index]]

#hr-management #architecture #backend-v1
