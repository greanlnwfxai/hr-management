# ADR-002: PostgreSQL and Prisma ORM

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Use **PostgreSQL 16** as the primary database and **Prisma 6** as the ORM and single source of schema truth.

## Key Points

- `apps/api/prisma/schema.prisma` is the authoritative definition of all models, enums, and relations
- Prisma Client generated at build time in both local and Docker builder stages
- `prisma validate` runs in every build gate
- Migrations committed to the repository

## Current Models

`User` · `Employee` · `Department` · `Position` · `Attendance` · `LeaveRequest` · `LeaveBalance`

## Current Enums

| Enum | Values |
|---|---|
| UserRole | SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE |
| EmployeeStatus | ACTIVE, INACTIVE, RESIGNED |
| AttendanceStatus | PRESENT, LATE, ABSENT |
| LeaveType | SICK, VACATION, PERSONAL, OTHER |
| LeaveStatus | PENDING, APPROVED, REJECTED |

## Runtime-Safe Enum Pattern

Prisma-generated enums are only available after `prisma generate` runs. To avoid decorator crashes at module load time:

- `src/common/enums.ts` mirrors all enum values as plain TypeScript enums
- All `@IsEnum()` validators import from `src/common/enums.ts`
- Services cast using `as unknown as PrismaEnum` at call sites

**Never import enums from `@prisma/client` in DTOs.**

## Known Follow-ups

- Add `UNPAID` and `ANNUAL` to `LeaveType` (safe migration)
- Rename `LeaveBalance.totalDays` → `entitledDays`
- Add `rejectReason` column to `LeaveRequest`

## Source

`docs/adr/ADR-002-postgresql-and-prisma.md`

## Related Notes

- [[Database Overview]]
- [[ADR Index]]

#adr #database #backend-v1
