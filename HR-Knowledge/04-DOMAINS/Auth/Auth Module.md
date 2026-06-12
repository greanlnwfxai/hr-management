# Auth Module

## Purpose

Provides JWT-based authentication for the HR Management API. All other modules depend on `AuthModule` to obtain `JwtAuthGuard`, `RolesGuard`, `@CurrentUser()`, and `@Roles()`.

## Module Path

`apps/api/src/auth/`

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/login | ❌ Public | Authenticate; returns `{ accessToken, user }` |
| GET | /auth/me | ✅ Any role | Return authenticated user profile |

## Login Flow

1. Client sends `POST /auth/login` with `{ email, password }`
2. `AuthService.login` fetches user by email, runs `bcrypt.compare`
3. On success, signs JWT payload `{ sub, email, role }` with 8h expiry
4. Returns `{ accessToken, user: { id, email, role } }`
5. Password hash is **never returned**

## Token Details

| Setting | Value |
|---|---|
| Secret | `process.env.JWT_SECRET ?? 'change_me'` |
| Expiry | 8 hours |
| Algorithm | HS256 |
| DB re-validation | Yes — on every request via `JwtStrategy.validate` |

## Exported Guards and Decorators

| Export | Usage |
|---|---|
| `JwtAuthGuard` | Validates JWT on every protected route |
| `RolesGuard` | Checks `@Roles(...)` metadata against `user.role` |
| `@CurrentUser()` | Parameter decorator — extracts user from request |
| `@Roles(...roles)` | Metadata decorator for method-level role restriction |

## Access Control

- `POST /auth/login` — public, no guard
- `GET /auth/me` — JWT required, no role restriction (any authenticated user)
- All other API routes: import `AuthModule` and apply guards

## Business Rules

- A deleted user's existing token returns 401 on the next request (DB re-validation catches it)
- Role changes take effect on next login (JWT carries the role at login time)
- No server-side session; logout is client-side (discard the token)

## Known Limitations

- No token revocation list
- No refresh token — sessions expire after 8h requiring re-login
- `JWT_SECRET = 'change_me'` in docker-compose must be rotated before production
- No rate-limiting on `POST /auth/login` (brute-force risk)

## Related ADRs

- [[ADR-005 JWT Authentication]]
- [[ADR-006 RBAC]]

## Related Notes

- [[RBAC Rules]]
- [[API Route Index]]

#domain #auth #backend-v1
