# Auth Security Hardening

Applied as part of **T-030** — extends [PRE_DEPLOYMENT_SECURITY.md](PRE_DEPLOYMENT_SECURITY.md).

---

## Rate Limiting Policy

Implemented using `@nestjs/throttler@6.5.0` as a global NestJS guard.

### ⚠️ TTL Unit Note

`@nestjs/throttler` v5+ uses **milliseconds** internally.  
Environment variables use **seconds** (human-friendly). The API multiplies by 1000 at startup:
```typescript
ttl: parseInt(process.env.THROTTLE_TTL ?? '60') * 1000
```

### Default API Rate Limit (all routes)

| Setting | Env Var | Default | Effective Value |
|---------|---------|---------|-----------------|
| Window  | `THROTTLE_TTL` | `60` (sec) | 60 000 ms |
| Max requests | `THROTTLE_LIMIT` | `100` | 100 req / 60 s per IP |

### Login Endpoint Rate Limit (`POST /auth/login`)

| Setting | Env Var | Default | Effective Value |
|---------|---------|---------|-----------------|
| Window  | `LOGIN_THROTTLE_TTL` | `60` (sec) | 60 000 ms |
| Max requests | `LOGIN_THROTTLE_LIMIT` | `5` | 5 req / 60 s per IP |

The `@Throttle({ default: { ... } })` decorator on the login handler **overrides** the global default for that route only.

### Rate Limit Response

When exceeded, NestJS throttler returns:

```
HTTP 429 Too Many Requests
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

The response does not expose internal details (IP, counter value, etc.).

Response headers when within limit:
```
x-ratelimit-limit: 5
x-ratelimit-remaining: 4
x-ratelimit-reset: 1234567890
```

---

## Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `THROTTLE_TTL` | integer (seconds) | Global rate limit window |
| `THROTTLE_LIMIT` | integer | Global max requests per window per IP |
| `LOGIN_THROTTLE_TTL` | integer (seconds) | Login window |
| `LOGIN_THROTTLE_LIMIT` | integer | Max login attempts per window per IP |

All four have safe defaults. Override in `.env` for production tightening.

---

## Login Security Behavior

### Error Messages (safe — no information leakage)

Both bad email and bad password return the identical response:

```json
HTTP 401
{ "statusCode": 401, "message": "Invalid credentials", "error": "Unauthorized" }
```

This prevents enumeration attacks (attacker cannot distinguish unknown email from wrong password).

### Password Handling

- Passwords are stored as bcrypt hashes (Prisma seed uses `bcrypt.hash("...", 10)`)
- Password hash is **never** returned in any API response
- `AuthService.login()` selects `{ id, email, password, role }` internally, then discards `password` before returning

### Brute-Force Protection

Login attempts (both successful and failed) count toward the `LOGIN_THROTTLE_LIMIT` window. After 5 attempts in 60 seconds from the same IP, all further attempts receive HTTP 429 until the window resets.

---

## JWT Safety

| Property | Value |
|----------|-------|
| Secret source | `JWT_SECRET` env var only — fails to start if unset |
| Algorithm | HS256 (default passport-jwt) |
| Payload fields | `sub` (user ID), `email`, `role` — no PII beyond email |
| Expiration | `8h` (hardcoded; `JWT_EXPIRES_IN` env var reserved for future use) |
| Password hash in token | Never included |
| Refresh tokens | Not implemented — out of scope |

To verify a token is safe, decode (don't verify) at jwt.io — confirm only `sub`, `email`, `role`, `iat`, `exp` are present.

---

## Security Headers (Helmet)

`helmet@8.2.0` is applied in `main.ts`:

```typescript
app.use(helmet());
```

Default Helmet v8 sets the following headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | default-src 'self' | Prevents XSS via injected scripts |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `SAMEORIGIN` | Prevents clickjacking |
| `Strict-Transport-Security` | max-age=15552000 | Forces HTTPS (production) |
| `X-DNS-Prefetch-Control` | `off` | Prevents DNS prefetch leaks |
| `Referrer-Policy` | `no-referrer` | Hides referrer from cross-origin |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks Flash/PDF cross-domain reads |

**Helmet is applied before CORS** in `main.ts`, which is the correct order: Helmet sets the response headers, CORS adds `Access-Control-*` headers.

Verify with:
```bash
curl -I http://localhost:4002/health
```
Expected: `content-security-policy`, `x-content-type-options`, `x-frame-options` headers present.

---

## Local Verification Commands

```bash
# 1. Build + schema + web
./scripts/verify.sh

# 2. Full Docker stack
./scripts/docker-verify.sh

# 3. API smoke test
./scripts/api-smoke-test.sh

# 4. Normal login
curl -s -X POST http://localhost:4002/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hr.local","password":"admin1234"}' | jq .accessToken

# 5. Trigger rate limit (6 rapid login attempts — 6th should be 429)
for i in {1..6}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4002/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@hr.local","password":"admin1234"}')
  echo "Attempt $i: HTTP $STATUS"
done

# 6. Confirm security headers
curl -I http://localhost:4002/health 2>&1 | grep -iE "(x-frame|x-content|content-security|strict-transport)"

# 7. Confirm CORS still allows localhost:3002
curl -sI -X OPTIONS http://localhost:4002/auth/login \
  -H 'Origin: http://localhost:3002' \
  -H 'Access-Control-Request-Method: POST' | grep -i "access-control-allow-origin"
```

---

## Production Recommendations

1. **Reduce login limit further** — Consider `LOGIN_THROTTLE_LIMIT=3` and `LOGIN_THROTTLE_TTL=300` (3 attempts per 5 min) for production
2. **IP-based tracking** — Default throttler uses `X-Forwarded-For` if available; ensure your reverse proxy sets this header correctly
3. **Redis-backed throttler** — Default is in-memory (resets on restart, not shared across instances). For multi-instance deployments, use `@nestjs/throttler-storage-redis`
4. **HSTS preload** — Add `includeSubDomains` and `preload` to Helmet's HSTS config for production domains
5. **Content Security Policy** — Default Helmet CSP may need relaxation for the frontend; review if server-side rendering is added
6. **Account lockout** — Rate limiting is IP-based only. A distributed attack from multiple IPs bypasses it. Consider adding per-account failed-attempt tracking for production

---

## Known Limitations

| Issue | Impact | Mitigation |
|-------|--------|------------|
| In-memory throttle storage | Resets on container restart; not shared across replicas | Use Redis storage in production |
| IP-only rate limiting | Distributed botnet bypasses single-IP limit | Account lockout (not implemented) |
| `JWT_EXPIRES_IN` not env-driven | Hardcoded `8h` due to `ms` TypeScript type constraints | Code change required to override |
| No refresh token | Users must log in after 8h | Out of scope; implement if needed |
| HTTP (no TLS) | Man-in-the-middle possible | Terminate TLS at reverse proxy |
