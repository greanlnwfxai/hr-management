# Production Baseline — T-078

> **Docs-only record.** This file describes the production state at the time of tagging.
> Do not use it as an operational runbook without verifying against current infrastructure.

---

## 1. Baseline Identity

| Field | Value |
|---|---|
| Project | HR Management System |
| Environment | Production |
| Current baseline tag | `v1.2.7-production-portainer-deploy-workflow` |
| Current baseline commit | `8c11532` |
| Production status | Live and working normally, confirmed by user after deployment. |

### Prior important tags

| Tag | Description |
|---|---|
| `v1.2.5-step-employee-master-import` | Employee master data import completed |
| `v1.2.6-production-deployment-guide` | Production deployment guide added |
| `v1.2.7-production-portainer-deploy-workflow` | **Current baseline** — Portainer Git Stack workflow, private-IP port binding policy, CI validation |

---

## 2. Deployment Architecture

```
GitHub Repository
       │  (Portainer Git Stack polls / redeploys on trigger)
       ▼
Portainer Git Stack
       │  docker-compose.production.yml
       ▼
Docker Compose Production Stack
       │
       ├── db       (PostgreSQL 16)
       ├── api      (NestJS — port 172.16.2.31:4002)
       ├── web      (Next.js — port 172.16.2.31:3002)
       └── mobile   (Expo Web / Nginx — port 172.16.2.31:3004)
                                │
                                │  private host IP 172.16.2.31
                                ▼
                  NPM / Nginx Proxy Manager (reverse proxy)
                                │
                                ▼
                  Public Internet (port 80 / 443 only)
```

### Key architectural decisions

- **Portainer Git Stack** is the production deployment mechanism. No SSH deployment to the server is required for normal deploys.
- **NPM / Nginx Proxy Manager** is the reverse proxy. It reaches app services through the private host IP `172.16.2.31`, not through a shared Docker network.
- **Service ports bind only to `172.16.2.31`**, not to `0.0.0.0`. This is intentional — it restricts direct access to LAN-only while still allowing NPM to proxy.
- **Public direct exposure is blocked.** No service binds host ports on `0.0.0.0` or the public IP.
- **Database** (`db:5432`) is internal-only via Docker `expose:` — it has no host-port binding at all.

### CI compose validation policy

CI validates that production compose service ports use only:
- No host binding (expose-only) — allowed
- `172.16.2.31:<host-port>:<container-port>` — allowed (private IP)
- `0.0.0.0:<port>:<port>` or `<port>:<port>` (unqualified) — **rejected by CI**

This policy was introduced with commit `8c11532`.

---

## 3. Production Services

| Service | Technology | Container port | Host binding | Notes |
|---|---|---|---|---|
| `db` | PostgreSQL 16 | 5432 | None (expose only) | Internal only |
| `api` | NestJS 11 | 4002 | `172.16.2.31:4002` | NPM proxies to this |
| `web` | Next.js (App Router) | 3002 | `172.16.2.31:3002` | NPM proxies to this |
| `mobile` | Expo Web (Nginx) | 80 | `172.16.2.31:3004` | NPM proxies to this |
| Reverse proxy | NPM / Nginx Proxy Manager | 80, 443 | Public | External to app stack |

---

## 4. Required Environment Variables

> **Security rule:** Never store real values in source control. Set all secrets in Portainer environment or `.env` on the server outside of the repository.

### Database

| Variable | Description |
|---|---|
| `POSTGRES_USER` | PostgreSQL superuser name |
| `POSTGRES_PASSWORD` | PostgreSQL superuser password — use a strong random value |
| `POSTGRES_DB` | Database name |
| `DATABASE_URL` | Full Prisma connection string: `postgresql://<user>:<pass>@db:5432/<db>` |

### API / Auth

| Variable | Description |
|---|---|
| `JWT_SECRET` | JWT signing secret — minimum 32 characters, random |
| `JWT_EXPIRES_IN` | Token TTL, e.g. `8h` |
| `CORS_ORIGIN` | Allowed CORS origin(s) — set to your production domain |
| `TRUST_PROXY` | `true` — required when running behind NPM reverse proxy |
| `THROTTLE_TTL` | General rate-limit window in seconds |
| `THROTTLE_LIMIT` | General rate-limit max requests per window |
| `LOGIN_THROTTLE_TTL` | Login-specific rate-limit window |
| `LOGIN_THROTTLE_LIMIT` | Login-specific max attempts per window |
| `SWAGGER_ENABLED` | `false` in production |

### Frontend / Mobile

| Variable | Description | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | API URL as seen by browser | **Build-time variable** — image rebuild required to change |
| `EXPO_PUBLIC_API_BASE_URL` | API URL as seen by mobile app | **Build-time variable** — image rebuild required to change |

### Geofence / Attendance

| Variable | Description |
|---|---|
| `ATTENDANCE_GEOFENCE_ENABLED` | `true` / `false` |
| `COMPANY_LATITUDE` | Company location latitude |
| `COMPANY_LONGITUDE` | Company location longitude |
| `COMPANY_GEOFENCE_RADIUS_METERS` | Geofence radius in metres |
| `ATTENDANCE_GPS_MAX_ACCURACY_METERS` | Maximum acceptable GPS accuracy for clock-in |

> **Build-time variable warning:** `NEXT_PUBLIC_API_URL` and `EXPO_PUBLIC_API_BASE_URL` are baked into the built image at build time. Changing them in the environment without rebuilding the image has no effect.

---

## 5. Backup Checklist

Run this checklist **before any major deployment** (schema migrations, bulk data changes, major version upgrades).

### Pre-deployment backup

- [ ] Confirm the PostgreSQL volume name in Portainer (Volumes tab → note the exact name, e.g. `hr-management_postgres_data`)
- [ ] Confirm there is adequate disk space on the host for the backup file
- [ ] Export a PostgreSQL backup to the host filesystem (example — verify paths for your server):
  ```bash
  # Example only — verify container name and host path before running
  docker exec <db-container-name> pg_dump -U <POSTGRES_USER> <POSTGRES_DB> \
    > /opt/backups/hr_management_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Move or copy the backup to storage **outside the Docker volume** (external drive, S3, backup server, etc.)
- [ ] Record the backup timestamp and file name
- [ ] Verify the backup file size is non-zero and reasonable (compare to previous backups)
- [ ] Optionally test restore in a sandbox environment before proceeding with production-risk changes

### Git / config backup

- [ ] Record the current Git tag and commit hash before deployment
  ```bash
  git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD
  ```
- [ ] Back up the production `.env` file securely outside the repository (never commit it)
- [ ] Back up NPM / Nginx Proxy Manager configuration if you have made recent proxy changes

> **Full backup and restore procedure:** See [PRODUCTION_BACKUP_RESTORE_T079.md](PRODUCTION_BACKUP_RESTORE_T079.md) for the complete pg_dump procedure, verification checklist, sandbox restore dry-run, and rollback decision tree.

---

## 6. Rollback Checklist

> **Database rollback is separate from application rollback.** Do not restore the database without explicit approval — application rollback alone is often sufficient and much safer.

### Application rollback (Portainer Git Stack)

1. Identify the last known good tag and its commit hash.
   - Current last known good baseline: `v1.2.7-production-portainer-deploy-workflow` (`8c11532`)
2. In Portainer, open the Git Stack for this project.
3. Change the repository reference (branch or tag) back to the last known good release.
4. Click **Redeploy** (or **Update the stack**).
5. Wait for Portainer to pull and redeploy.
6. Verify all services are running:
   - Web loads at the production domain
   - `GET /health` returns 200
   - Mobile web loads
   - Login works
7. Document what went wrong and the outcome in the incident log.

### Database rollback (only if application rollback is insufficient)

- **Do not roll back the database without explicit approval from the team.**
- If a schema migration was part of the failed deployment, assess whether the application at the rollback version is compatible with the current DB schema before deciding.
- If a DB restore is required, restore from the backup taken in the Backup Checklist above.
- Test the restore in a sandbox first if at all possible.
- Record the decision, approver, and outcome.

---

## 7. Post-Deploy Verification Checklist

Run after every production deployment.

### Infrastructure

- [ ] All containers are running and healthy (`docker compose ps` or Portainer Containers tab)
- [ ] No service exposes public host ports directly (no `0.0.0.0` port binding)
- [ ] Reverse proxy TLS certificate is valid and auto-renews
- [ ] CI is green on the deployed commit

### Application

- [ ] Web app loads (dashboard or login page visible)
- [ ] API health endpoint returns 200: `GET https://<domain>/api/health`
- [ ] Mobile web loads at the mobile subdomain
- [ ] Login works with a valid account
- [ ] Dashboard loads after login
- [ ] Employees page loads and shows data
- [ ] Departments / Positions page loads
- [ ] Attendance flow works (check-in / check-out)
- [ ] Leave request flow works
- [ ] Audit logs are visible (for admin accounts)

---

## 8. Production Safety Rules

### Never do these without explicit approval

- `docker compose down` — stops all services and may cause data loss
- `docker compose down -v` — **destroys all Docker volumes including the database**
- `docker system prune`, `docker volume rm`, `docker volume prune` — data destruction risk
- Database reset / `DROP TABLE` / `prisma migrate reset` in production
- Expose Portainer (port 9443) publicly — must stay on `127.0.0.1` or behind VPN

### Never commit these to the repository

- `.env` or any file containing real secret values
- Real employee data import files (CSV, Excel, JSON with PII)
- `node_modules/`
- Private keys or certificates

### Do not use sandbox/dev credentials in production

- Dev default admin (`admin@hr.local` / `admin1234`) must be rotated before production use
- JWT secrets must be regenerated fresh for production, never reused from dev

---

## 9. Known Production Notes

- **Portainer Git Stack** is the current production deployment method. Portainer pulls from the GitHub repository and rebuilds images on redeploy. No manual Docker commands on the server are needed for normal deployments.
- **NPM private-IP routing** (`172.16.2.31`) is intentional — this is required by the NPM reverse proxy architecture on this server. The CI policy explicitly allows this binding pattern. Do not "fix" it by removing the IP binding.
- **Employee master data import** was completed as part of `v1.2.5-step-employee-master-import`. Production database state should be verified directly via Portainer or an authorized DB session — this document does not make claims about current production row counts.
- **Placeholder emails** may have been introduced during the employee master import. A real-email cleanup pass may be needed before enabling email notifications.
- **Build-time API URLs** — if the production domain changes, the web and mobile images must be rebuilt with the new `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_BASE_URL` values, not just the environment variables updated.
