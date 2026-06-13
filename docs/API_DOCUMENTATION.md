# API Documentation — HR Management

## Overview

The HR Management API provides OpenAPI / Swagger documentation generated at runtime by `@nestjs/swagger`.

---

## Swagger UI

| Environment | URL |
|-------------|-----|
| Local dev   | http://localhost:4002/docs |
| Docker dev  | http://localhost:4002/docs |

## OpenAPI JSON

| Environment | URL |
|-------------|-----|
| Local dev   | http://localhost:4002/docs-json |
| Docker dev  | http://localhost:4002/docs-json |

The JSON endpoint returns a valid OpenAPI 3.x document with:
- `openapi` version field
- `paths` for every documented endpoint
- `components.securitySchemes` with JWT Bearer auth

---

## Auth

### Login

```
POST /auth/login
Content-Type: application/json

{
  "email": "admin@hr.local",
  "password": "admin1234"
}
```

Response:
```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "admin@hr.local",
    "role": "SUPER_ADMIN"
  }
}
```

### Using Bearer Token in Swagger UI

1. Open http://localhost:4002/docs
2. Click the **Authorize** button (lock icon, top right)
3. In the **BearerAuth** dialog, paste your `accessToken` value (without the `Bearer ` prefix)
4. Click **Authorize**, then **Close**
5. All protected endpoints will now send the token automatically

### Using Bearer Token in HTTP clients

```
Authorization: Bearer <accessToken>
```

---

## Testing Swagger Locally

### Option A — Docker stack

```bash
# Start the full stack
docker compose up -d

# Wait for healthy
docker compose ps

# Open Swagger UI
open http://localhost:4002/docs
```

### Option B — Local dev (without Docker)

```bash
cd apps/api
cp .env.example .env
# Edit .env — set DATABASE_URL to localhost
npm install
npm run start:dev

# Open Swagger UI
open http://localhost:4002/docs
```

### Verify OpenAPI JSON

```bash
curl -s http://localhost:4002/docs-json | jq '.openapi, (.paths | keys | length), .components.securitySchemes'
```

Expected: `"3.0.0"`, path count > 0, `{ BearerAuth: { ... } }`

---

## Environment Variables

| Variable         | Default   | Description |
|------------------|-----------|-------------|
| `SWAGGER_ENABLED` | `true`   | Set to `false` to disable Swagger UI and JSON endpoints |
| `SWAGGER_PATH`    | `docs`   | URL path prefix for Swagger UI (e.g. `docs` → `/docs`) |

Add to `.env` or `apps/api/.env`:
```env
SWAGGER_ENABLED=true
SWAGGER_PATH=docs
```

---

## Production Recommendation

**Disable Swagger in production** or protect it behind a VPN / reverse-proxy auth gate.

Exposing internal API schemas publicly increases the attack surface. Recommended options:

1. **Disable entirely** — set `SWAGGER_ENABLED=false` in your production environment.
2. **IP allow-list** — configure your reverse proxy (Caddy, Nginx, Traefik) to block `/docs` and `/docs-json` from public IPs.
3. **Basic auth gate** — add a proxy-level password to the `/docs` path.

The Swagger routes are never injected into the Express router when `SWAGGER_ENABLED=false`, so there is zero overhead and no accidentally-reachable path.

---

## Related Docs

- [API Routes](API_ROUTES.md) — full endpoint reference table (static)
- [CI/CD Pipeline](CI_CD.md) — GitHub Actions pipeline
- [Pre-deployment Security](PRE_DEPLOYMENT_SECURITY.md) — security hardening checklist
- [Auth Security Hardening](AUTH_SECURITY_HARDENING.md) — auth details
