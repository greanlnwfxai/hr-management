# Security Review Checklist

Use this checklist when reviewing a task for security impact.
Each task's CTO Summary must include a Security Review section
(required after T-052A.1 — see CLAUDE.md).

Mark each item: ✅ PASS | ❌ FAIL | N/A | ⚠️ REVIEW

---

## Authentication

- [ ] All new/changed endpoints have `@UseGuards(JwtAuthGuard)` applied
- [ ] Login endpoint rate limiting is active (`LOGIN_THROTTLE_TTL`, `LOGIN_THROTTLE_LIMIT`)
- [ ] Login returns a generic error on invalid credentials (no username enumeration)
- [ ] JWT expiry is appropriate for the use case (default: 8h)
- [ ] Health/public endpoints excluded from auth guard intentionally and documented
- [ ] No authentication bypass possible via header manipulation

## Authorization / RBAC

- [ ] `@Roles()` decorator applied to endpoints that require elevated privileges
- [ ] `RolesGuard` is active and wired in the module
- [ ] EMPLOYEE cannot access another employee's personal data
- [ ] EMPLOYEE cannot access admin-only endpoints (department management, employee CRUD, etc.)
- [ ] Manager can only approve/reject leave for employees in their own scope
- [ ] No privilege escalation possible via crafted request payloads
- [ ] New roles (if added) are reflected in all relevant guards

## Password Security

- [ ] Passwords are hashed with bcrypt (cost factor ≥ 10)
- [ ] No plain-text password appears in any log output
- [ ] No plain-text password is returned in any API response
- [ ] Password change flow requires current password verification
- [ ] Seed/demo accounts use strong passwords in production (admin1234 is dev-only)

## JWT / Token Security

- [ ] `JWT_SECRET` is read from environment variable, never hardcoded
- [ ] `JWT_SECRET` is ≥ 32 characters in production
- [ ] Token payload contains minimal claims (id, email, role — no sensitive PII)
- [ ] No access token stored in unencrypted browser localStorage or React Native AsyncStorage
- [ ] Mobile app uses SecureStore (Expo) for token persistence
- [ ] Refresh token flow (if added) is protected and token rotation implemented

## Employee Data Privacy

- [ ] `password` field excluded from all employee API responses (DTO `@Exclude()`)
- [ ] Employee list endpoint does not over-expose PII (phone, national ID, etc.)
- [ ] Employee detail endpoint checks requester is ADMIN or the employee themselves
- [ ] Pagination results are bounded to prevent full data dumps
- [ ] Employee personal data not logged in debug/error output

## Attendance / Location Security

- [ ] Geofence enforcement happens server-side, not client-side only
- [ ] GPS coordinates validation occurs on the server (accuracy, radius)
- [ ] Client-supplied timestamps are not trusted for clock-in/out time (server assigns time)
- [ ] Attendance records require valid JWT; unauthenticated clock-in rejected
- [ ] Geofence config values (`COMPANY_LATITUDE`, `COMPANY_LONGITUDE`, radius) are environment variables

## Leave Approval Security

- [ ] Only ADMIN / manager role can approve or reject leave requests
- [ ] An employee cannot approve their own leave
- [ ] Leave status transitions are validated server-side (no client-controlled state jump)
- [ ] Leave balance deduction occurs atomically with leave approval

## Mobile Security

- [ ] `EXPO_PUBLIC_*` variables contain no secrets (they are bundled into the app binary)
- [ ] API base URL uses HTTPS in production builds
- [ ] No sensitive data (tokens, passwords, PII) stored in unencrypted AsyncStorage
- [ ] SecureStore used for JWT token persistence on device
- [ ] Certificate pinning considered for production (document if deferred)
- [ ] OTA update policy reviewed if Expo Updates is enabled

## API Input Validation

- [ ] All new DTOs use `class-validator` decorators
- [ ] Global `ValidationPipe` has `whitelist: true, transform: true` (set in `main.ts`)
- [ ] No raw SQL queries; all DB access through Prisma ORM
- [ ] Pagination parameters (`page`, `limit`, `skip`) validated and bounded
- [ ] File upload endpoints (if any) validate MIME type and file size
- [ ] Enum fields validated with `@IsEnum()` from `src/common/enums.ts`

## Logging / Error Handling

- [ ] No passwords, tokens, or secret values appear in log output
- [ ] Production error responses return generic messages (no stack traces)
- [ ] Failed authentication attempts are logged with IP (for rate-limiting analysis)
- [ ] Database errors do not expose table/column names in production error responses
- [ ] Unhandled exceptions do not crash the process without logging (global exception filter active)

## Secrets / Environment

- [ ] No secrets hardcoded in source files (`.ts`, `.js`, `.json`, `.yml`)
- [ ] All `.env` files are in `.gitignore` and NOT tracked by git
- [ ] `.env.example` uses only placeholder values
- [ ] `JWT_SECRET` is an environment variable in all environments
- [ ] `DATABASE_URL` is an environment variable in all environments
- [ ] Docker Compose uses environment variable references, not hardcoded credentials
- [ ] `scripts/secret-scan.sh` exits 0 (no committed secrets or PEM blocks found)

## Dependency Vulnerabilities

- [ ] `scripts/security-audit.sh` exits 0 (no HIGH or CRITICAL vulnerabilities)
- [ ] New packages added in this task have been reviewed for known issues
- [ ] Any MODERATE vulnerabilities are documented and scheduled for resolution
- [ ] Any accepted-risk vulnerabilities are noted in `docs/SECURITY_REVIEW_LOG.md`

## Docker / Deployment

- [ ] No destructive Docker commands used without explicit user approval
- [ ] Database credentials in Docker Compose come from environment variables
- [ ] API production container runs with minimal required permissions
- [ ] Debug ports not exposed in production docker-compose
- [ ] `SWAGGER_ENABLED=false` is set or recommended for production
- [ ] Healthcheck endpoints do not expose sensitive system information

## CI / GitHub Actions

- [ ] No secrets hardcoded in workflow `.yml` files
- [ ] Secrets accessed via `${{ secrets.NAME }}` GitHub Secrets references
- [ ] Dependencies pinned or verified in CI (planned: T-052A.2)
- [ ] Security audit job planned for CI (planned: T-052A.2)
- [ ] Dependabot configured (planned: T-052A.2)
