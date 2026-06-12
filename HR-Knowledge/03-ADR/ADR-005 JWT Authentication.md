# ADR-005: JWT Authentication

**Status:** Accepted | **Date:** 2026-06-12

## Decision

Use **JSON Web Tokens (JWT)** via `@nestjs/passport` + `passport-jwt` for all API authentication.

## Login Flow

1. Client sends `POST /auth/login` with `{ email, password }`
2. API verifies with `bcrypt.compare` against stored hash
3. On success, returns `{ accessToken, user: { id, email, role } }`
4. Password hash is **never returned** to the caller

## Token Configuration

| Setting | Value |
|---|---|
| Secret | `process.env.JWT_SECRET ?? 'change_me'` |
| Expiry | `8h` |
| Algorithm | HS256 (Passport default) |

**Critical:** The fallback `'change_me'` must be replaced with a strong random secret before any production deployment.

## Token Validation Per Request

`JwtStrategy.validate` re-queries the database on every request:
- Confirms the user still exists
- Returns `{ id, email, role }` — no password, no sensitive fields
- If user deleted after token issuance → 401 on next request

## Guards and Decorators

| Item | Description |
|---|---|
| `JwtAuthGuard` | Validates JWT; applied at controller class level |
| `RolesGuard` | Reads `@Roles(...)` metadata, checks `user.role` |
| `@CurrentUser()` | Extracts validated user from request object |
| `@Roles(...)` | Metadata decorator consumed by RolesGuard |

## Public Endpoints (no guard)

- `GET /health`
- `POST /auth/login`

## Source

`docs/adr/ADR-005-jwt-authentication.md`

## Related Notes

- [[Auth Module]]
- [[RBAC Rules]]
- [[ADR Index]]

#adr #security #authentication
