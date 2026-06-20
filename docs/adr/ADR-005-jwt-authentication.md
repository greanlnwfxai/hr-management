# ADR-005: JWT Authentication

## Status
Accepted

## Date
2026-06-12

## Context
The HR Management API serves browser and mobile clients and needs a stateless authentication mechanism. Later milestones extended the original JWT design with username-based login, employee-linked user context, `mustChangePassword` behavior, and inactive-account rejection. The system must prevent unauthenticated access to protected endpoints and must never expose sensitive data such as password hashes.

## Decision
Use **JSON Web Tokens (JWT)** via `@nestjs/passport` + `passport-jwt` for all API authentication.

### Implementation details (actual codebase)

**Login flow:**
1. Client sends `POST /auth/login` with `{ login, password }` or legacy `{ email, password }`.
2. `AuthService.login` resolves `login ?? email`, trims and lowercases it, then searches by email when the identifier contains `@`, otherwise by username.
3. Login rejects inactive accounts (`isActive = false`) with the same generic invalid-credentials response used for wrong credentials.
4. On success, updates `lastLoginAt`, signs a JWT payload `{ sub, email, username, role, employeeId }`, and returns:
   ```json
   {
     "accessToken": "<JWT>",
     "user": { "id", "email", "username", "role", "mustChangePassword", "employeeId" }
   }
   ```
5. Password hash is selected from DB only for comparison and is **never returned** to the caller.

**Token configuration:**
- Secret: `process.env.JWT_SECRET ?? 'change_me'` (fallback for local dev only)
- Expiry: `8h` (configured in `AuthModule`)
- Algorithm: HS256 (Passport default)

**Token validation (per request):**
- `JwtStrategy.validate` re-queries the database on every request to confirm the user still exists.
- Validation also rejects inactive users (`isActive = false`).
  - If the user is deleted after token issuance, subsequent requests fail with 401.
  - Returns `{ id, email, username, role, mustChangePassword, employeeId }` — no password, no sensitive fields.

**Guards:**
- `JwtAuthGuard` — extends `AuthGuard('jwt')`; applied via `@UseGuards(JwtAuthGuard)` or at controller class level.
- `RolesGuard` — reads `@Roles(...)` metadata, checks `user.role`; used together with `JwtAuthGuard`.
- Both guards are exported from `AuthModule` and imported by all feature modules.

**Decorators:**
- `@CurrentUser()` — extracts the validated user object from the request (set by `JwtStrategy.validate`).
- `@Roles(...UserRole[])` — metadata decorator; consumed by `RolesGuard`.

**Public endpoints** (no guard applied):
- `GET /health`
- `POST /auth/login`

**Protected self-service auth endpoints:**
- `GET /auth/me` — returns current profile plus linked employee summary if present
- `POST /auth/change-password` — current-password verified self-service password change

## Consequences

**Positive**
- Stateless — no server-side session storage required.
- Works with browser clients, mobile clients, and curl without session cookies.
- Each feature module gets auth by simply importing `AuthModule` and using `@UseGuards(JwtAuthGuard, RolesGuard)`.
- DB re-validation on every request means deleted users are immediately rejected.
- Username or email login reduces friction for HR-provisioned employee accounts.
- JWT/user context now carries enough identity information for web and mobile self-service flows without exposing sensitive data.

**Negative**
- Tokens issued before a password change or role change remain valid until expiry (8h window).
- No token revocation list — logout is client-side only (discard the token).
- `JWT_SECRET = 'change_me'` in `docker-compose.yml` is a critical security risk if deployed without rotation.
- `mustChangePassword` is currently enforced at the UX layer, not by a backend request-level hard block.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| Session-based auth (server-side) | Requires session store (Redis or DB); adds stateful dependency |
| OAuth 2.0 / OIDC (external IdP) | Correct for enterprise SSO; over-engineered for an internal HR tool at this stage |
| API keys | Not suitable for user-level authentication and role-based access |
| Refresh tokens | Adds complexity (refresh endpoint, token rotation); deferred until token expiry UX is a real user problem |

## Follow-up Tasks
- **Before any production deployment:** Replace `JWT_SECRET: change_me` in `docker-compose.yml` with a cryptographically strong random secret (≥ 32 characters, e.g., `openssl rand -hex 32`). Move it to a gitignored `.env` file.
- Consider backend request-level enforcement that rejects non-password-change requests when `mustChangePassword = true`.
- Consider adding a `POST /auth/logout` endpoint that clears client-side auth state intentionally.
- Consider refresh token support (sliding sessions) if 8h expiry causes UX friction.
