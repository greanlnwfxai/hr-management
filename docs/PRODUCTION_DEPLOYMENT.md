# Production Deployment Guide

This guide covers deploying the HR Management stack to a production Linux server.

---

## Compose File Strategy

| File | Purpose | Recommended? |
|------|---------|:---:|
| `docker-compose.yml` | Local development — all ports host-bound | Dev only |
| `docker-compose.prod.yml` | Overlay (historical) — inherits dev ports due to Compose v2 merge limitation | Not preferred |
| `docker-compose.production.yml` | **Standalone production** — no host port bindings, named network, mandatory-var validation | **Yes** |

### Why the Overlay Is Not the Preferred Production Path

`docker-compose.prod.yml` was created as a quick override to add `TRUST_PROXY=true`. However, Docker Compose v2 merges array-type fields — `ports: []` in an override cannot remove ports declared in the base file. Running:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

still binds ports 3002, 4002, and 5432 to the host, requiring a firewall to block them externally.

`docker-compose.production.yml` is a standalone file that starts from scratch and never binds any host ports.

---

## Architecture

```
Internet (443/80)
       │
       ▼
Reverse Proxy (Caddy or Nginx)
       │  Docker network: hr_production
       ├──────────────────────────────────────┐
       │                                      │
       ▼                                      ▼
  web:3002 (Next.js)              api:4002 (NestJS)
  [expose only, no host port]     [expose only, no host port]
                                       │
                                       ▼
                                  db:5432 (PostgreSQL)
                                  [expose only, no host port]
```

All inter-service traffic stays on the `hr_production` Docker bridge network. No service binds to a host port. Public traffic enters only via the reverse proxy on 80/443.

---

## Port Exposure Policy

| Service | Port | Host-bound in production? |
|---------|------|:---:|
| Web (Next.js) | 3002 | No — `expose` only |
| API (NestJS) | 4002 | No — `expose` only |
| Database (PostgreSQL) | 5432 | No — `expose` only |
| Reverse proxy | 80, 443 | Yes — only these two |

---

## Step 1 — Prepare the Server

```bash
# Clone the repository
git clone <repo-url> /opt/hr-management
cd /opt/hr-management

# Copy and fill in ALL production values
cp .env.example .env
$EDITOR .env
```

### Required Production `.env` Values

The standalone compose will refuse to start if these are unset:

| Variable | What to set | Generate with |
|----------|-------------|---------------|
| `POSTGRES_PASSWORD` | Strong random password | `openssl rand -hex 16` |
| `DATABASE_URL` | `postgresql://hr_user:<password>@db:5432/hr_management` | — |
| `JWT_SECRET` | Min 32-char random string | `openssl rand -hex 32` |
| `CORS_ORIGIN` | `https://hr.example.com` | — |
| `NEXT_PUBLIC_API_URL` | `https://hr.example.com/api` | — |

### Recommended Production Tuning

| Variable | Production recommendation |
|----------|--------------------------|
| `TRUST_PROXY` | `true` (already defaulted in standalone compose) |
| `LOGIN_THROTTLE_LIMIT` | `3` (stricter than dev default of `5`) |
| `LOGIN_THROTTLE_TTL` | `300` (5-minute window instead of 60s) |

---

## Step 2 — Firewall Configuration

Configure your server firewall (or cloud security group) **before** starting Docker. Docker on Linux bypasses `ufw` by manipulating iptables directly — a security-group rule at the infrastructure level is the reliable barrier.

| Port | Allow from | Purpose |
|------|-----------|---------|
| 22 | Your IP only | SSH admin |
| 80 | 0.0.0.0/0 | HTTP (redirects to HTTPS) |
| 443 | 0.0.0.0/0 | HTTPS |
| 3002, 4002, 5432 | **Block all** | Internal Docker only |

---

## Step 3 — Validate the Production Config

Before starting, confirm the generated config has no host port bindings:

```bash
docker compose -f docker-compose.production.yml config > /tmp/hr-prod-config.txt

# Must show nothing under ports: for any service
grep -n "ports:" /tmp/hr-prod-config.txt || echo "No host ports — OK"

# These must appear ONLY under expose: or environment/command (not ports:)
grep -n "5432" /tmp/hr-prod-config.txt
grep -n "4002" /tmp/hr-prod-config.txt
grep -n "3002" /tmp/hr-prod-config.txt
```

---

## Step 4 — Build and Start the Stack

```bash
docker compose -f docker-compose.production.yml up -d --build

# Verify all services are healthy
docker compose -f docker-compose.production.yml ps
```

Expected output:

```
NAME           IMAGE               STATUS
hr-api-prod    hr-management-api   Up (healthy)
hr-db-prod     postgres:16         Up (healthy)
hr-web-prod    hr-management-web   Up
```

---

## Step 5 — Configure the Reverse Proxy

Services have no host port bindings, so the reverse proxy **must be on the same Docker network** (`hr_production`) to reach them.

### Caddy (recommended — automatic TLS)

```bash
# Option A: Connect an existing Caddy container to the production network
docker network connect hr_production <caddy-container-name>

# Option B: Run Caddy as a container joined to hr_production
docker run -d --name caddy \
  --network hr_production \
  -p 80:80 -p 443:443 \
  -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data \
  caddy:2

# Edit the Caddyfile (replace app.example.com with your domain)
cp deploy/caddy/Caddyfile.example /etc/caddy/Caddyfile
$EDITOR /etc/caddy/Caddyfile
```

See [deploy/caddy/Caddyfile.example](../deploy/caddy/Caddyfile.example).

### Nginx (in Docker, connected to hr_production)

```bash
# Run Nginx as a container joined to hr_production
docker run -d --name nginx \
  --network hr_production \
  -p 80:80 -p 443:443 \
  -v /etc/nginx/nginx.conf:/etc/nginx/nginx.conf \
  nginx:stable

cp deploy/nginx/hr-management.conf.example /etc/nginx/conf.d/hr-management.conf
$EDITOR /etc/nginx/conf.d/hr-management.conf
```

See [deploy/nginx/hr-management.conf.example](../deploy/nginx/hr-management.conf.example).

---

## Step 6 — Internal Health Check

Since the API has no host port, use `docker exec` to check it from inside the container:

```bash
docker compose -f docker-compose.production.yml exec api \
  wget -qO- http://localhost:4002/health
```

Expected response:
```json
{"status":"ok"}
```

---

## Step 7 — Public Smoke Test

```bash
# Health endpoint
curl -sf https://hr.example.com/api/health && echo "API OK"

# Login
curl -s -X POST https://hr.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hr.local","password":"admin1234"}' | jq .accessToken

# Confirm TLS and security headers
curl -sI https://hr.example.com/api/health | grep -iE "(strict-transport|x-frame|x-content)"
```

---

## Logs

```bash
# All services
docker compose -f docker-compose.production.yml logs -f

# Individual services
docker compose -f docker-compose.production.yml logs -f api
docker compose -f docker-compose.production.yml logs -f web
docker compose -f docker-compose.production.yml logs -f db
```

---

## Trust Proxy and Rate Limiting

`TRUST_PROXY` defaults to `true` in `docker-compose.production.yml`. This enables the NestJS Express adapter to read `X-Forwarded-For` for the real client IP. Without it, every request appears to come from the proxy IP and the rate limit applies globally rather than per client.

**Both Caddy and Nginx set `X-Forwarded-For` automatically** (included in the example configs). Do not disable this header.

---

## Updating the Application

```bash
cd /opt/hr-management
git pull

# Rebuild and restart
docker compose -f docker-compose.production.yml up -d --build

# If Prisma schema changed, run migrations
docker compose -f docker-compose.production.yml exec api \
  npx prisma migrate deploy
```

---

## Rollback

```bash
# Roll back to a previous image tag (if images are tagged and pushed to a registry)
docker compose -f docker-compose.production.yml down
# Edit docker-compose.production.yml to pin the image tag, then:
docker compose -f docker-compose.production.yml up -d

# Or roll back the git repo and rebuild
git checkout <previous-tag>
docker compose -f docker-compose.production.yml up -d --build
```

---

## Backup

PostgreSQL data is stored in the `postgres_data` Docker volume. Back up regularly:

```bash
# Dump to a compressed file
docker compose -f docker-compose.production.yml exec -T db \
  pg_dump -U hr_user hr_management | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore from backup
gunzip -c backup_20260101_000000.sql.gz | \
  docker compose -f docker-compose.production.yml exec -T db \
  psql -U hr_user hr_management
```

---

## Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Single-instance | No horizontal scaling | Add load balancer + shared DB |
| In-memory rate limiter | Resets on restart; not shared across replicas | Use `@nestjs/throttler-storage-redis` |
| `JWT_EXPIRES_IN` hardcoded to `8h` | Cannot configure via env var | Code change required |
| No refresh tokens | Users re-login after 8h | Implement refresh token flow |
| `NEXT_PUBLIC_API_URL` baked at build time | Cannot change API URL without rebuild | Pass `--build-arg` or rebuild image |

---

## Related Docs

- [PRE_DEPLOYMENT_SECURITY.md](PRE_DEPLOYMENT_SECURITY.md) — JWT, CORS, credentials hardening
- [AUTH_SECURITY_HARDENING.md](AUTH_SECURITY_HARDENING.md) — Rate limiting, Helmet, brute-force protection
