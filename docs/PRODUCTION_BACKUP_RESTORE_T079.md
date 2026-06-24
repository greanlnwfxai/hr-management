# Production Backup & Restore Strategy — T-079

> **Docs-only operational record.** This document defines strategy and procedures.
> It does not confirm that a production backup has been executed.
> All production backup and restore operations require explicit user approval before execution.

---

## 1. Purpose

This document defines the safe operational process to:

- Create PostgreSQL production backups before deployments and on a regular schedule
- Verify backup file integrity after creation
- Test restores in an isolated non-production sandbox only
- Avoid dangerous production rollback mistakes (volume deletion, unplanned DB restore, etc.)
- Give the team a clear rollback decision tree to follow under pressure

---

## 2. Current Production Context

| Field | Value |
|---|---|
| Current baseline tag | `v1.2.8-production-baseline-docs` |
| Previous baseline tag | `v1.2.7-production-portainer-deploy-workflow` |
| Deploy method | Portainer Git Stack (pulls from GitHub) |
| Reverse proxy | NPM / Nginx Proxy Manager via private host IP `172.16.2.31` |
| Baseline doc | [docs/PRODUCTION_BASELINE_T078.md](PRODUCTION_BASELINE_T078.md) |

### Production app stack services

| Service | Technology | Role |
|---|---|---|
| `db` | PostgreSQL 16 | Persistent data store |
| `api` | NestJS 11 | REST API |
| `web` | Next.js (App Router) | Web frontend |
| `mobile` | Expo Web / Nginx | Mobile web frontend |

---

## 3. Backup Types

### 3.1 PostgreSQL logical backup (`pg_dump`)

The primary backup. Captures all data as SQL/binary — portable, restorable to any compatible PostgreSQL instance.

- Format: custom binary (`--format=custom`) — supports selective restore and compression
- Contains: all tables, sequences, constraints, indexes, data rows
- Does not contain: PostgreSQL user credentials, server-level settings

### 3.2 Application state (Git release tag)

The Git tag at the time of backup records the exact application version. Redeploying to this tag restores the application code and schema migration history — but **not** database data.

> **Critical:** Git tag rollback does not rollback database state. DB rollback always requires a verified DB backup and explicit approval.

### 3.3 Environment configuration (`.env` secure backup)

A copy of the production `.env` file, stored securely outside the repository.

- Must never be committed to git
- Must be stored with access controls (e.g., password manager, secret vault, encrypted storage)
- Must be re-verified if the production server is re-provisioned

### 3.4 Portainer stack environment backup

Before changing environment variables in Portainer:

- Screenshot or export the current Portainer stack environment configuration
- Record the repository URL, branch/tag reference, and any Portainer-managed env overrides

### 3.5 NPM reverse proxy configuration

Before changing proxy rules:

- Export NPM proxy host configurations from the NPM UI
- Store the export alongside the DB backup with matching timestamp

---

## 4. Production Backup Procedure

> **Manual operation — requires explicit approval before execution on production.**
> All commands below use placeholders. Verify actual values from Portainer before running.

### Step 1 — Record pre-backup state

Before starting, record:

```
Date/time (UTC):
Git tag:
Git commit:
Portainer stack status:
```

### Step 2 — Identify the PostgreSQL container name

From Portainer → Containers, or on the server:

```bash
# Example — list containers to find the db container name
docker ps --filter "name=db" --format "table {{.Names}}\t{{.Status}}"
```

Note: the container name for the `db` service is typically `<stack-name>-db-1` or similar. Verify from your Portainer deployment.

### Step 3 — Run `pg_dump` inside the container

```bash
# Example only — substitute real values before running
docker exec <postgres-container> pg_dump \
  -U <db-user> \
  -d <database-name> \
  --format=custom \
  --file=/tmp/hr-management-<timestamp>.dump
```

### Step 4 — Copy backup out of the container

```bash
docker cp <postgres-container>:/tmp/hr-management-<timestamp>.dump <backup-dir>/
```

### Step 5 — Remove temp file from container

```bash
docker exec <postgres-container> rm /tmp/hr-management-<timestamp>.dump
```

### Step 6 — Verify backup exists on host

```bash
ls -lh <backup-dir>/hr-management-<timestamp>.dump
```

Expected: file exists, size is non-zero, size is plausible relative to data volume.

### Step 7 — Generate checksum

```bash
shasum -a 256 <backup-dir>/hr-management-<timestamp>.dump \
  > <backup-dir>/hr-management-<timestamp>.dump.sha256
cat <backup-dir>/hr-management-<timestamp>.dump.sha256
```

### Step 8 — Move backup to off-server storage

Copy backup and checksum to external storage (remote server, S3, NAS, etc.) before proceeding with the deployment.

---

## 5. Backup Verification Checklist

Run this after every backup before proceeding with a deployment.

- [ ] Backup file exists at the expected path
- [ ] File size is greater than zero
- [ ] File size is plausible (compare to previous backups — a dramatically smaller file may indicate an error)
- [ ] Backup timestamp is recorded and matches the filename
- [ ] SHA256 checksum file created alongside the dump
- [ ] Backup is stored outside the Docker volume (on the host filesystem or remote)
- [ ] Backup is stored outside the application repository (not committed, not in the project directory)
- [ ] Backup file permissions restrict access to authorized users only
- [ ] Backup has been (or is scheduled to be) copied to off-server storage
- [ ] Restore test scheduled (at minimum: monthly, or before any high-risk deployment)
- [ ] Backup retention policy documented and enforced (see Section 11)

---

## 6. Restore Dry Run Strategy

> **Restore testing must only be performed in a non-production environment.**
> Never run `pg_restore` pointing at the production database.

### 6.1 Set up an isolated restore target

Options (choose one):

- **Local Docker container** — spin up a fresh `postgres:16` container for testing only
- **Staging server** — a separate server/environment that is not production
- **Local development machine** — using local Docker Compose dev stack

```bash
# Example: start a disposable local PostgreSQL for restore testing only
docker run --rm \
  --name hr-restore-test \
  -e POSTGRES_PASSWORD=restore-test-only \
  -e POSTGRES_DB=hr_restore_test \
  -p 5433:5432 \
  postgres:16
```

### 6.2 Restore the backup into the sandbox

```bash
# --clean: drops and recreates objects — DESTRUCTIVE to restore target, NEVER point at production
# --if-exists: suppresses errors if objects don't exist before drop
# --no-owner: skips ownership reassignment (safe for sandbox)
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --dbname=<sandbox-database-url> \
  <backup-dir>/hr-management-<timestamp>.dump
```

> **Warning:** `--clean` is destructive to the restore target database. It must never be used with a connection string pointing to production. Double-check `<sandbox-database-url>` before running.

### 6.3 Verify checksum before restore

Before restoring, re-verify the backup file:

```bash
shasum -a 256 --check <backup-dir>/hr-management-<timestamp>.dump.sha256
```

Expected output: `OK`

### 6.4 Run migration compatibility check (if applicable)

If the backup was taken from a version with pending migrations, verify the schema state:

```bash
# Example: check migration status against sandbox DB
DATABASE_URL=<sandbox-database-url> npx prisma migrate status
```

---

## 7. Data Verification After Restore

Run these checks against the sandbox only after restore. Compare counts against production estimates.

### Row count verification

```bash
# Example SQL — run against sandbox only
psql <sandbox-database-url> -c "SELECT COUNT(*) FROM \"Employee\";"
psql <sandbox-database-url> -c "SELECT COUNT(*) FROM \"Department\";"
psql <sandbox-database-url> -c "SELECT COUNT(*) FROM \"Position\";"
psql <sandbox-database-url> -c "SELECT COUNT(*) FROM \"Attendance\";"
psql <sandbox-database-url> -c "SELECT COUNT(*) FROM \"LeaveRequest\";"
psql <sandbox-database-url> -c "SELECT COUNT(*) FROM \"AuditLog\";"
```

### Checklist

- [ ] Employee count matches expected value
- [ ] Department count matches expected value
- [ ] Position count matches expected value
- [ ] Attendance record count matches expected value
- [ ] Leave request count matches expected value
- [ ] Audit log count matches expected value
- [ ] Key admin user exists in restored DB
- [ ] No password hash, token, or secret values are printed to terminal or logs during verification
- [ ] API health endpoint returns 200 when pointed at restored sandbox DB
- [ ] Login smoke test passes using sandbox credentials only (never use production credentials against sandbox)

---

## 8. Rollback Decision Tree

When something goes wrong in production, use this tree to choose the right action.

```
Issue detected in production
        │
        ├─► Code/application bug (no data change)?
        │        └─► Rollback: redeploy previous Git tag via Portainer
        │            No DB change needed.
        │
        ├─► DB migration ran but caused issues?
        │        └─► STOP. Do NOT run further migrations.
        │            Assess: is the app still functional on current schema?
        │            If yes: fix the migration in code, redeploy corrected version.
        │            If no: restore from pre-migration backup — requires EXPLICIT APPROVAL.
        │
        ├─► Config / environment variable issue?
        │        └─► Correct the env vars in Portainer stack environment.
        │            Redeploy stack. No DB change needed.
        │
        ├─► Reverse proxy / NPM issue?
        │        └─► Roll back NPM proxy host config.
        │            App stack unchanged. No DB change needed.
        │
        └─► Data corruption or accidental data loss?
                 └─► Isolate: take app offline or block traffic to affected flow.
                     Preserve evidence (do not delete anything yet).
                     Assess scope and identify backup to restore from.
                     Requires EXPLICIT APPROVAL before any restore.
                     Test restore in sandbox first.
                     Only then restore to production with approval.
```

### Key principle

Prefer the least-destructive action first:
1. Redeploy previous code (no data risk)
2. Fix config (no data risk)
3. Fix proxy (no data risk)
4. Restore DB from backup (data risk — approval required)

---

## 9. Manual Approval Gates

The following actions require explicit user approval before execution. Claude Code will never perform these autonomously.

| Action | Why it requires approval |
|---|---|
| Production backup execution | Runs commands against the live production DB container |
| Production restore | Overwrites production data — irreversible without another backup |
| DB schema rollback | `prisma migrate reset` or `DROP` in production destroys data |
| Volume replacement | Replaces production data storage |
| Production `.env` changes | May change auth secrets, API URLs, or DB credentials |
| NPM proxy config change | May take the site offline if misconfigured |
| Portainer stack redeploy | Restarts all services — brief downtime possible |

---

## 10. What Not to Do

### Docker / Container

- Do NOT run `docker compose down` — stops all services, may cause data loss
- Do NOT run `docker compose down -v` — **destroys all Docker volumes including the database**
- Do NOT run `docker system prune`, `docker volume rm`, or `docker volume prune`
- Do NOT stop or remove the `db` container directly

### Database

- Do NOT run `prisma migrate reset` against production
- Do NOT run `DROP DATABASE` against production
- Do NOT run `DROP TABLE` against production without a verified backup and explicit approval
- Do NOT restore into production without explicit approval and a pre-restore backup
- Do NOT print or log secrets, tokens, or password hashes during any DB operation

### Repository / Files

- Do NOT commit backup dump files to git
- Do NOT commit `.env` files
- Do NOT store backups inside the application directory
- Do NOT share `.env` values via Slack, email, or any unencrypted channel

---

## 11. Recommended Backup Schedule

| Trigger | Action |
|---|---|
| Before every production deployment | Manual DB backup + Git tag recorded |
| Daily | Automated logical backup (`pg_dump`) retained on host |
| Weekly | Off-server copy of daily backup verified |
| Monthly | Restore test in sandbox — verify row counts and app health |

### Retention policy (minimum recommended)

| Backup type | Minimum retention |
|---|---|
| Daily backups | 7 days |
| Weekly backups | 4 weeks |
| Pre-deployment backups | Until the next production deployment is verified stable |

Adjust retention limits based on available storage. Backups must be stored outside the Docker volume and outside the application repository.

---

## 12. T-079 Outcome

This task documents the backup and restore strategy. It does not prove that a production backup has been executed.

**Confirmed by this task:**

- Backup procedure is documented with safe placeholders
- Restore dry-run procedure is documented (sandbox only)
- Rollback decision tree is established
- Manual approval gates are defined
- Safety rules are documented

**Not yet performed (future work):**

- An actual production backup has not been run as part of this task
- An actual sandbox restore test has not been run as part of this task
- Automated daily backup is not yet configured

A future task can perform an approved production backup dry run and sandbox restore test once the user is ready to proceed.
