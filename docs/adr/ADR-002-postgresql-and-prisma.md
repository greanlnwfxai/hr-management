# ADR-002: PostgreSQL and Prisma ORM

## Status
Accepted

## Date
2026-06-12

## Context
The HR Management system needs a relational database to store structured employee, attendance, and leave data with referential integrity (foreign keys, unique constraints, cascades). An ORM or query builder is required to keep database interactions type-safe and maintainable in TypeScript.

## Decision
Use **PostgreSQL 16** as the primary relational database and **Prisma 6** as the ORM and single source of schema truth.

Key choices:
- `apps/api/prisma/schema.prisma` is the authoritative definition of all models, enums, relations, and indexes.
- Prisma Client is generated at build time (`npx prisma generate`) in both the local and Docker builder stages.
- `prisma validate` runs as part of `./scripts/verify.sh` on every build.
- Migrations are created deliberately with `prisma migrate dev` and committed to the repository.
- The database runs as the `hr-db` service in Docker Compose on the default port 5432.

Current schema models:
- `User` — authentication accounts
- `Employee` — HR employee records (linked 1-to-1 with User via `userId`)
- `Department` — organisational units
- `Position` — roles within departments
- `Attendance` — daily clock-in/out records
- `LeaveRequest` — employee leave submissions
- `LeaveBalance` — per-employee leave quota tracking
- `prisma_migrations` — managed by Prisma

Current enums (defined in schema, mirrored in `src/common/enums.ts`):
- `UserRole`: SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE
- `EmployeeStatus`: ACTIVE, INACTIVE, RESIGNED
- `AttendanceStatus`: PRESENT, LATE, ABSENT
- `LeaveType`: SICK, VACATION, PERSONAL, OTHER
- `LeaveStatus`: PENDING, APPROVED, REJECTED

**Runtime-safe enum pattern:** Prisma-generated enum objects are only available after `prisma generate` runs. To avoid decorator crashes at module load time, all `@IsEnum()` validators import from `src/common/enums.ts` (plain TypeScript enums with identical string values). Services cast these strings to Prisma types using `as unknown as PrismaEnum` at call sites.

## Consequences

**Positive**
- Strong referential integrity enforced at the database level.
- Prisma's TypeScript types catch schema/query mismatches at compile time.
- `prisma validate` provides fast feedback in CI/CD.
- Single schema file is easy to audit and diff.
- Prisma Client auto-completion improves developer productivity.

**Negative**
- Adding or renaming an enum value requires a migration — cannot be done in-place while data exists.
- Prisma does not support `SELECT FOR UPDATE` natively (raw SQL needed for strict concurrency control).
- Generated client must be present at runtime; Dockerfile must copy `node_modules` from the builder stage.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| TypeORM | More verbose decorators; less ergonomic schema evolution; less type-safe by default |
| Raw SQL (pg/postgres.js) | No ORM type safety; higher migration maintenance burden |
| MySQL / MariaDB | No technical requirement; PostgreSQL preferred for advanced types and JSON support |
| SQLite | Not suitable for multi-service Docker environments or production scale |
| MongoDB | Relational data (employees, departments, positions) requires referential integrity |

## Follow-up Tasks
- Add UNPAID and ANNUAL to `LeaveType` enum when required (safe migration on empty or low-data tables).
- Rename `LeaveBalance.totalDays` to `entitledDays` to align with API DTO naming (non-breaking migration).
- Add `rejectReason` column to `LeaveRequest` to persist rejection notes.
- Move `DATABASE_URL` from `docker-compose.yml` into a gitignored `.env` file before production.
