# Pre-Deployment Security Hardening

## Summary

Applied as part of **T-029** before any external deployment.  
All security-sensitive settings are now environment-driven; no secrets are hardcoded in committed files.

---

## What Changed

| Item | Before | After |
|------|--------|-------|
| `JWT_SECRET` | Hardcoded `change_me` in `docker-compose.yml`; `?? 'change_me'` fallback in code | Read exclusively from `JWT_SECRET` env var; app **throws at startup** if unset |
| Database password | Hardcoded `hr_password` in `docker-compose.yml` | Read from `POSTGRES_PASSWORD` env var via root `.env` |
| Database URL | Hardcoded in `docker-compose.yml` | Read from `DATABASE_URL` env var |
| CORS | `app.enableCors()` — wildcard (all origins) | `CORS_ORIGIN` env var; comma-separated allow-list, defaults to `http://localhost:3002` |
| Root `.gitignore` | Did not ignore `.env` | Now ignores `.env`, `.env.local`, `.env.*.local` |

---

## Required Environment Variables

### API (`apps/api`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `JWT_SECRET` | ✅ Yes | JWT signing secret — **min 32 chars, random** |
| `JWT_EXPIRES_IN` | No | Token TTL (default: `8h`) |
| `CORS_ORIGIN` | No | Comma-separated allowed browser origins (default: `http://localhost:3002`) |
| `PORT` | No | API listen port (default: `4002`) |

### PostgreSQL (`db` service)

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_USER` | No | DB user (default: `hr_user`) |
| `POSTGRES_PASSWORD` | ✅ Yes | DB password — **no default** |
| `POSTGRES_DB` | No | DB name (default: `hr_management`) |

### Frontend (`apps/web`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | No | API base URL as seen by the browser (default: `http://localhost:4002`) |

---

## Local Development Setup

### Docker Compose (recommended)

```bash
# 1. Copy the example
cp .env.example .env

# 2. Edit .env — set a real JWT_SECRET and POSTGRES_PASSWORD
#    For local dev, the placeholder values work as-is.
#    For production, generate with: openssl rand -hex 32

# 3. Start the stack
docker compose up -d --build

# 4. Verify
curl http://localhost:4002/health
```

### Local non-Docker (API only)

```bash
# 1. Copy the example
cp apps/api/.env.example apps/api/.env

# 2. Edit apps/api/.env — set DATABASE_URL, JWT_SECRET, CORS_ORIGIN
# 3. Start PostgreSQL separately on localhost:5432
# 4. npm run start:dev from apps/api/
```

### Frontend local dev

```bash
# apps/web/.env.local is already gitignored and should already exist.
# If not:
cp apps/web/.env.example apps/web/.env.local
# Edit NEXT_PUBLIC_API_URL if needed.
```

---

## Production Deployment Checklist

- [ ] Generate a strong JWT_SECRET: `openssl rand -hex 32`
- [ ] Set a strong POSTGRES_PASSWORD (never reuse dev password)
- [ ] Set CORS_ORIGIN to your actual frontend domain (e.g. `https://app.example.com`)
- [ ] Set DATABASE_URL to point to your production database host
- [ ] Set NEXT_PUBLIC_API_URL to your production API URL
- [ ] Confirm `.env` is NOT committed to git: `git check-ignore .env`
- [ ] Confirm no secrets appear in `git log --all -p`
- [ ] Rotate JWT_SECRET from the development placeholder before first prod deploy
- [ ] Use a secrets manager (AWS Secrets Manager, Vault, etc.) for production env vars
- [ ] Enable TLS/HTTPS for both frontend and API in production
- [ ] Restrict PostgreSQL network access to API service only (no public port 5432)

---

## Secret Rotation

### JWT_SECRET rotation

1. Set new `JWT_SECRET` on all API instances
2. Restart API — all existing tokens are immediately invalidated
3. Users must log in again (expected, short session disruption)

> There is no token blacklist; rotation is a clean break.

### POSTGRES_PASSWORD rotation

1. Update `POSTGRES_PASSWORD` in production secrets store
2. Update `DATABASE_URL` accordingly
3. Restart the API to pick up the new connection string
4. Use a connection pool manager (PgBouncer) if zero-downtime rotation is required

---

## CORS Configuration

CORS is configured in `apps/api/src/main.ts`:

```typescript
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3002')
  .split(',')
  .map((o) => o.trim());
app.enableCors({ origin: corsOrigins, credentials: true });
```

**Single origin:**
```
CORS_ORIGIN=https://app.example.com
```

**Multiple origins:**
```
CORS_ORIGIN=https://app.example.com,https://staging.example.com
```

**Never use:**
```
# Do not set to * in production — this disables CORS protection
CORS_ORIGIN=*
```

---

## Database Credential Handling

- `POSTGRES_PASSWORD` has no default value in `docker-compose.yml` — Docker Compose will warn and fail if unset
- `DATABASE_URL` must be explicitly set in `.env`; no fallback is provided
- The `apps/api/.env` file (used for local Prisma CLI and non-Docker dev) is gitignored via `apps/api/.gitignore`
- The root `.env` (used by Docker Compose) is gitignored via the root `.gitignore`

---

## What Must NOT Be Committed

| File | Reason |
|------|--------|
| `.env` | Contains real or dev passwords and JWT secret |
| `apps/api/.env` | Contains DATABASE_URL with credentials |
| `apps/web/.env.local` | Contains NEXT_PUBLIC_API_URL (low risk but consistent policy) |
| Any `*.pem`, `*.key`, `*.cert` files | TLS private keys |

All of the above are covered by `.gitignore` patterns. Verify anytime with:

```bash
git check-ignore .env apps/api/.env apps/web/.env.local
```

---

## Verification Commands

```bash
# Build + schema + web build
./scripts/verify.sh

# Full Docker stack up + health check
./scripts/docker-verify.sh

# Login + API smoke test
./scripts/api-smoke-test.sh

# Confirm .env is ignored
git check-ignore -v .env

# Inspect Docker Compose env interpolation (no secrets in output)
docker compose config

# Confirm API is reachable
curl http://localhost:4002/health

# Confirm frontend loads
curl -I http://localhost:3002

# Confirm login works
curl -s -X POST http://localhost:4002/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hr.local","password":"admin1234"}' | jq .accessToken
```

---

## Known Remaining Risks (Pre-Production)

1. **Dev placeholder JWT_SECRET in `.env`** — The local dev `.env` uses a human-readable placeholder. Replace with `openssl rand -hex 32` output before any external exposure.
2. **Dev DB password** — `hr_password` is a weak password. Replace before production.
3. **HTTP only** — No TLS configured. Production must terminate TLS at a load balancer or reverse proxy.
4. **No rate limiting** — `/auth/login` is not rate-limited. Add before production.
5. **PostgreSQL port exposed** — Port `5432` is mapped to the host in `docker-compose.yml`. Remove the `ports` mapping for the `db` service in production.
6. **No secrets manager** — Secrets are in flat `.env` files. Use a secrets manager for production deployments.
