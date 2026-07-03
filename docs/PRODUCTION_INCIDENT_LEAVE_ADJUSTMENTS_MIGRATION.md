# Production Incident — Missing `leave_adjustments` Table / Pending Migration Drift

> **Deployment-state record.** This document describes a production incident and
> its recovery, and captures the recovery procedure for future migration-drift
> cases. It is not an architecture decision — no schema, RBAC, or application
> behavior changed as a result of this recovery.

---

## 1. Summary

| Field | Value |
|---|---|
| Symptom | Manager Dashboard ("My Summary") returned Internal Server Error in production |
| Root cause | Prisma `P2021` — table `public.leave_adjustments` did not exist in the production database |
| Affected release | Schema introduced by REQ-001B (`v1.2.33-vacation-balance-adjustment-ledger`); migration had not yet been deployed to production |
| Resolution | Backup taken, then `npx prisma migrate deploy` applied the missing migration |
| Secondary issue | A later migration failed to apply because its enum type already existed in the production schema |
| Secondary resolution | Read-only schema inspection confirmed equivalence, then `npx prisma migrate resolve --applied` synced the migration ledger only — no schema or data was changed by this step |
| Final state | `npx prisma migrate status` → "Database schema is up to date"; Manager My Summary recovered |
| Credentials/data exposed | None — no password, token, or secret was read, printed, or logged during this recovery |

---

## 2. Timeline

1. **Symptom observed**: Manager Dashboard's "My Summary" section (introduced in
   v1.2.62, see [[Dashboard Module]] / ADR-032) returned a 500 Internal Server
   Error in production.
2. **Diagnosis**: Prisma error `P2021: The table 'public.leave_adjustments' does
   not exist in the current database.` The `LeaveAdjustment` model (see
   [[Leave Balance Module]] and ADR-026) had been part of the schema since
   REQ-001B, but the corresponding migration had never been deployed to the
   production database.
3. **Backup**: A `pg_dump` backup of the production database was created inside
   the `hr-db-prod` container before any schema change was applied:
   `/tmp/pre_leave_adjustments_fix.dump`.
4. **Primary fix**: `npx prisma migrate deploy` was run against production,
   applying migration `20260627151952_add_leave_adjustment_ledger`. This
   created the missing `leave_adjustments` table (additive only — no existing
   table was altered or dropped).
5. **Secondary failure**: The next pending migration,
   `20260628081857_add_offsite_attendance_fields`, failed to apply. The error
   indicated the `AttendanceSource` enum type already existed in the
   production database — i.e. the underlying schema objects (enum type,
   attendance columns) were already present, but the migration was not
   recorded as applied in Prisma's `_prisma_migrations` ledger.
6. **Read-only inspection**: Before taking any corrective action, the
   production schema was inspected read-only (no `ALTER`/`DROP`/`CREATE`
   executed) and confirmed that the `AttendanceSource` enum and this
   migration's target schema objects already existed in production. The
   authoritative list of objects this migration creates is its source file,
   `apps/api/prisma/migrations/20260628081857_add_offsite_attendance_fields/migration.sql`
   (two new enums, sixteen new `attendances` columns, two indexes, two foreign
   keys). See §4 below for the general read-only-inspection procedure to
   follow before ever running `migrate resolve --applied`.
7. **Ledger-only resolution**: Since the schema was already correct, the
   migration was marked as applied without re-running its DDL:
   `npx prisma migrate resolve --applied 20260628081857_add_offsite_attendance_fields`.
   This command only updates Prisma's internal `_prisma_migrations` tracking
   table — it does not execute the migration's SQL. No table, column, enum,
   or data row was changed by this step.
8. **Final verification**: `npx prisma migrate status` reported "Database
   schema is up to date." Manager My Summary was confirmed recovered.

---

## 3. Why This Happened

Production had drifted from the migration history recorded in the repository:
one migration (`add_leave_adjustment_ledger`) had simply never been deployed,
and a second migration's target schema objects existed in production ahead of
the migration itself being recorded as applied (most likely from an earlier
manual or partial deployment step). Neither case involved data loss or a
destructive operation — both were drift-detection and ledger-synchronization
issues, not schema corruption.

---

## 4. Recovery Procedure (for future migration-drift incidents)

Use this sequence whenever `npx prisma migrate deploy` fails in production,
whether due to a missing table (`P2021`) or an "already exists" error on an
enum/table/column:

1. **Back up first.** Take a `pg_dump --format=custom` backup of the
   production database before any corrective action. See
   [docs/PRODUCTION_BACKUP_RESTORE_T079.md](PRODUCTION_BACKUP_RESTORE_T079.md).
2. **Check status.** Run `npx prisma migrate status` to see which migrations
   are pending vs. applied according to the `_prisma_migrations` ledger.
3. **If the failure is "table/column does not exist" (`P2021` or similar):**
   the migration is genuinely missing. Run `npx prisma migrate deploy` to
   apply it normally.
4. **If the failure is "already exists" (enum/table/column conflict):** do
   **not** force-apply or drop the conflicting object. First, inspect the
   production schema **read-only** (`\d <table>`, `\dT <enum>`, or
   `information_schema` queries — no `ALTER`/`DROP`/`CREATE`) and diff it
   against the migration's `.sql` file to confirm the existing objects exactly
   match what the migration would have created.
5. **Only if they match exactly:** mark the migration as applied without
   re-running its DDL: `npx prisma migrate resolve --applied <migration_name>`.
   This updates the ledger only.
6. **Re-verify.** Run `npx prisma migrate status` again and confirm "Database
   schema is up to date" before considering the incident closed.
7. **Never** use `prisma migrate reset`, drop objects, or force-apply
   conflicting DDL against production to resolve a drift issue — this is a
   destructive path and is out of scope for routine recovery.

---

## 5. Confirmations

- No production data was deleted or overwritten.
- No password, token, hash, or other secret was read, printed, or logged
  during this recovery.
- No Docker container was stopped, restarted, or reset as part of this
  recovery.
- No application code, DTO, or RBAC guard was changed — this was a database
  migration-state recovery only.

## Related Notes

- [[Leave Balance Module]] — `LeaveAdjustment` ledger this migration introduced
- [[Attendance Module]] / [[Off-site Work Mode]] — fields introduced by the offsite attendance migration
- [docs/PRODUCTION_BACKUP_RESTORE_T079.md](PRODUCTION_BACKUP_RESTORE_T079.md) — backup/restore strategy referenced in step 1
- ADR-026 (Vacation Leave Entitlement and Adjustment Ledger)
- ADR-032 (Manager/Employee Dashboard Scope and Personal Summary) — the feature whose failure surfaced this drift
