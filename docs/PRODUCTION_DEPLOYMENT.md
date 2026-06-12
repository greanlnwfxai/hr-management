# Production Deployment Guide

This guide covers deploying the HR Management stack to a production Linux server using Docker Compose + a reverse proxy (Caddy or Nginx).

---

## Prerequisites

- Docker Engine 24+ and Docker Compose v2 installed on the server
- A domain name with DNS A record pointing to the server IP
- Ports 80 and 443 open in the firewall (reverse proxy only — 3002/4002/5432 must be closed)

---

## Architecture

```
Internet → Reverse Proxy (Caddy/Nginx, port 443)
               ├── /api/*  → hr-api:4002   (Docker internal network)
               └── /*      → hr-web:3002   (Docker internal network)
                                  |
                             hr-db:5432     (Docker internal, no host port)
```

All service-to-service traffic stays on the Docker bridge network. The only public-facing component is the reverse proxy.

---

## Step 1 — Prepare the Server

```bash
# Clone the repository
git clone <repo-url> /opt/hr-management
cd /opt/hr-management

# Copy and fill in the root .env
cp .env.example .env
$EDITOR .env
```

Required changes in `.env` for production:

| Variable | What to set |
|----------|-------------|
| `POSTGRES_PASSWORD` | Strong random password (never the dev default) |
| `DATABASE_URL` | Update the password in the connection string to match |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `CORS_ORIGIN` | `https://app.example.com` (your actual domain) |
| `PUBLIC_APP_URL` | `https://app.example.com` |
| `NEXT_PUBLIC_API_URL` | `https://app.example.com/api` |
| `TRUST_PROXY` | `true` |
| `LOGIN_THROTTLE_LIMIT` | Consider `3` (stricter than dev default of 5) |
| `LOGIN_THROTTLE_TTL` | Consider `300` (5 min window) |

---

## Step 2 — Firewall Configuration

**Required before starting the stack.** Docker on Linux manipulates iptables directly, which can bypass host-level firewall rules (e.g. `ufw`). Restrict access at the network/cloud level:

| Port | Protocol | Action |
|------|----------|--------|
| 22 | TCP | Allow (SSH) |
| 80 | TCP | Allow (HTTP → redirect to HTTPS) |
| 443 | TCP | Allow (HTTPS) |
| 3002, 4002, 5432 | TCP | **Block** (internal only) |

For cloud deployments (AWS, GCP, DigitalOcean), configure a security group / firewall at the infrastructure level to block those ports from external access.

> **Why not `ports: []` in the overlay?**  
> Docker Compose v2 merges array-type fields; setting `ports: []` in an override does not remove ports declared in the base file. The services will still bind to the host. The correct production isolation strategy is a firewall that prevents external traffic from reaching those ports directly.

---

## Step 3 — Start the Stack (via production overlay)

```bash
# Build images and start all services (no host ports — reverse proxy handles traffic)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Verify all services are healthy
docker compose ps
```

Expected output — all three services show `healthy` or `Up`:

```
NAME        IMAGE         STATUS
hr-api      hr-api        Up (healthy)
hr-db       postgres:16   Up (healthy)
hr-web      hr-web        Up
```

---

## Step 4 — Configure the Reverse Proxy

### Caddy (recommended — automatic TLS)

```bash
# Install Caddy: https://caddyserver.com/docs/install
# Copy the example Caddyfile
cp deploy/caddy/Caddyfile.example /etc/caddy/Caddyfile
# Edit: replace app.example.com with your domain
nano /etc/caddy/Caddyfile
systemctl reload caddy
```

See [deploy/caddy/Caddyfile.example](../deploy/caddy/Caddyfile.example) for the full config.

### Nginx + certbot

```bash
# Copy the example vhost config
cp deploy/nginx/hr-management.conf.example /etc/nginx/sites-available/hr-management
# Edit: replace app.example.com with your domain and fix cert paths
nano /etc/nginx/sites-available/hr-management
ln -s /etc/nginx/sites-available/hr-management /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Obtain TLS certificate
certbot --nginx -d app.example.com
```

See [deploy/nginx/hr-management.conf.example](../deploy/nginx/hr-management.conf.example) for the full config.

---

## Step 5 — Smoke Test

```bash
# Health endpoint
curl -sf https://app.example.com/api/health && echo "API OK"

# Login
curl -s -X POST https://app.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hr.local","password":"admin1234"}' | jq .accessToken

# Confirm TLS and security headers
curl -I https://app.example.com/api/health | grep -iE "(strict-transport|x-frame|x-content)"
```

---

## What the Production Overlay Does

`docker-compose.prod.yml` extends the base `docker-compose.yml` with:

| Setting | Base (dev) | Production overlay |
|---------|------------|--------------------|
| `web` host ports | `3002:3002` | removed (none) |
| `api` host ports | `4002:4002` | removed (none) |
| `db` host ports | `5432:5432` | removed (none) |
| `TRUST_PROXY` | unset | `"true"` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4002` | `${PUBLIC_APP_URL}/api` |

By removing host port bindings, the database and API are unreachable from outside the Docker network. All traffic must pass through the reverse proxy.

---

## Trust Proxy and Rate Limiting

When `TRUST_PROXY=true`, the NestJS Express adapter reads `X-Forwarded-For` to determine the real client IP. This is required for the per-IP rate limiting (Throttler) to work correctly — without it, every request appears to come from the proxy's IP, and the rate limit applies to the proxy, not individual clients.

**Ensure your reverse proxy always sets `X-Forwarded-For`:**
- Caddy: sets it automatically via `reverse_proxy`
- Nginx: requires `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` (included in the example config)

---

## Updating the Application

```bash
cd /opt/hr-management
git pull

# Rebuild and restart (zero-downtime for stateless services)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# If Prisma schema changed, run migrations inside the api container
docker compose exec api npx prisma migrate deploy
```

---

## Backup

The only stateful service is PostgreSQL. Back up the `postgres_data` Docker volume regularly:

```bash
# Dump to a compressed file
docker compose exec -T db pg_dump -U hr_user hr_management | gzip > backup_$(date +%Y%m%d).sql.gz
```

---

## Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Single-instance | No horizontal scaling | Scale with a load balancer + shared DB |
| In-memory rate limiter | Resets on restart; not shared across instances | Add `@nestjs/throttler-storage-redis` |
| `JWT_EXPIRES_IN` hardcoded to `8h` | Cannot configure via env var | Code change required |
| No refresh tokens | Users log in again after 8h | Implement refresh token flow if needed |

---

## Related Docs

- [PRE_DEPLOYMENT_SECURITY.md](PRE_DEPLOYMENT_SECURITY.md) — JWT, CORS, credentials hardening
- [AUTH_SECURITY_HARDENING.md](AUTH_SECURITY_HARDENING.md) — Rate limiting, Helmet, brute-force protection
