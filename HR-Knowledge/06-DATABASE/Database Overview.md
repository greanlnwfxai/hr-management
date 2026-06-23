# Database Overview

## Primary Database

**PostgreSQL 16** running as the `hr-db` container on port **5432**.

Named volume `postgres_data` persists data across normal local runtime cycles.

Safety note:
- For Claude/Codex/agent workflow, destructive Docker commands such as `docker compose down`, `docker compose down -v`, prune, remove, or reset commands are not part of normal workflow.
- If such a command is ever considered, it requires explicit user approval.

## ORM

**Prisma 6** — the ORM and single source of schema truth.

- Schema file: `apps/api/prisma/schema.prisma`
- All models, enums, relations, and indexes are defined in this single file
- Prisma Client generated at build time (`npx prisma generate`)
- `prisma validate` runs in every build gate (`./scripts/verify.sh`)

## Schema Models

| Model | Description |
|---|---|
| `User` | Authentication accounts (email, password hash, role) |
| `Employee` | HR employee records; linked 1-to-1 with User via `userId` |
| `Department` | Organisational units; `managerId` designates the department manager |
| `Position` | Job roles within departments |
| `Attendance` | Daily clock-in/out records with Bangkok timezone status and `workMode` |
| `LeaveRequest` | Employee leave submissions with lifecycle status |
| `LeaveBalance` | Per-employee leave quota (entitlement) per type per year |
| `OffSiteRequest` | Pre-approval requests for off-site work on a specific date (v1.2.0) |
| `GeofenceConfig` | Singleton geofence configuration (DB-first, env fallback) |
| `AuditLog` | Append-only audit event log |

## Enums

| Enum | Values |
|---|---|
| `UserRole` | SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE |
| `EmployeeStatus` | ACTIVE, INACTIVE, RESIGNED |
| `AttendanceStatus` | PRESENT, LATE, ABSENT |
| `WorkMode` | ONSITE, OFFSITE (v1.2.0) |
| `LeaveType` | SICK, VACATION, PERSONAL, OTHER |
| `LeaveStatus` | PENDING, APPROVED, REJECTED |
| `OffSiteStatus` | PENDING, APPROVED, REJECTED (v1.2.0) |

All enums are also mirrored in `apps/api/src/common/enums.ts` as plain TypeScript enums for runtime safety. **Never import enums from `@prisma/client` in DTOs** — use `src/common/enums.ts`.

## Migration Policy

- Migrations are created with `npx prisma migrate dev` and **committed to the repository**
- All migrations live in `apps/api/prisma/migrations/`
- Schema is the source of truth — never edit the database directly
- `prisma validate` is a gate in `./scripts/verify.sh`

## Known Schema Issues

### 1. `totalDays` vs `entitledDays` Naming

The `LeaveBalance` table has a column named `totalDays` representing the entitled leave quota. The API create/update DTO accepts a field named `entitledDays` which maps to `totalDays`. The API response exposes `totalDays` from the DB plus a computed `remainingDays`.

This naming inconsistency is documented. A column rename migration (`totalDays → entitledDays`) is planned for v1.1.

### 2. Leave Enum Compatibility

The `LeaveType` enum has `SICK | VACATION | PERSONAL | OTHER`. Commonly needed values:
- `ANNUAL` — not in schema; `VACATION` covers annual leave in practice
- `UNPAID` — not in schema; deferred; will require an enum migration and approval bypass logic

### 4. OffSiteRequest has no attendance FK

`Attendance.workMode` records off-site clock-ins, but there is no foreign key from `Attendance` to `OffSiteRequest`. The off-site request ID is included in the `ATTENDANCE_CLOCK_IN` audit log metadata only, not persisted on the attendance row.

### 3. rejectReason Column Missing

`LeaveRequest` has no `rejectReason` column. The API DTO accepts it but the value is silently discarded. Schema migration planned for v1.1.

## Unique Constraints

| Model | Unique On |
|---|---|
| `User` | `email` |
| `Employee` | `email`, `employeeCode` |
| `LeaveBalance` | `(employeeId, leaveType, year)` |
| `Attendance` | `(employeeId, date)` (one record per employee per day) |
| `Department` | `managerId` (unique — one manager per department) |

## Related Notes

- [[System Architecture]]
- [[ADR-002 PostgreSQL and Prisma]]
- [[Leave Balance Module]]
- [[Attendance Module]]

#database #backend-v1 #prisma #rag-ready
