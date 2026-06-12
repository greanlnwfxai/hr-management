# ADR-007: API Design Standards

## Status
Accepted

## Date
2026-06-12

## Context
Eight backend modules were built across multiple development sessions. Consistent conventions for route naming, response shapes, error codes, validation, and pagination prevent the API surface from diverging into inconsistent patterns that are hard to document, test, or consume from a frontend.

## Decision
Apply the following API standards uniformly across all modules. These conventions are the result of what was actually implemented, verified, and documented in `docs/API_ROUTES.md` as of Backend v1.0.

### Route naming
- **Plural nouns** for resource collections: `/employees`, `/departments`, `/positions`, `/attendance`, `/leave-balances`.
- **Exception — Leave Requests:** routes use `/leave` (not `/leave-requests`) to match the established endpoint style. Changing it would be a breaking change.
- **Action sub-routes:** `POST /leave/request`, `PATCH /leave/:id/approve`, `PATCH /leave/:id/reject`, `POST /attendance/clock-in`, `POST /attendance/clock-out`.
- **Self-service sub-routes:** `GET /leave/me`, `GET /leave-balances/my`, `GET /attendance/me`.

### Authentication
- All endpoints require `Authorization: Bearer <token>` except:
  - `GET /health` — public liveness probe
  - `POST /auth/login` — credentials exchange
- `@UseGuards(JwtAuthGuard, RolesGuard)` is applied at the **controller class level**, not per method, so it covers all routes in the class by default.
- `@Roles(...)` is applied at the **method level** when a subset of roles is required.

### Request validation
- All request bodies are validated via DTOs using `class-validator` decorators.
- The global `ValidationPipe` (`whitelist: true, transform: true`) is applied in `main.ts`:
  - `whitelist: true` — strips undeclared fields silently.
  - `transform: true` — coerces types (e.g., query string numbers).
- UUID path parameters use `ParseUUIDPipe`: `@Param('id', ParseUUIDPipe)`.
- Enum fields use `@IsEnum()` with values from `src/common/enums.ts` (not `@prisma/client`).
- Date fields use `@IsDateString()`.
- Pagination: `page` and `limit` use `@Type(() => Number) @IsInt @Min(1) @Max(100)`.

### Paginated list response shape
All `GET` list endpoints return:
```json
{
  "data": [...],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  }
}
```

### Error response shape
NestJS default exception filter:
```json
{ "statusCode": 4xx, "message": "Human-readable message" }
```
Error messages must not expose:
- Password hashes
- JWT secrets
- Database credentials
- Internal stack traces (in production)

### HTTP status codes used
| Status | Usage |
|---|---|
| 200 | GET, PATCH success |
| 201 | POST create success |
| 400 | Validation error, business rule violation |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but insufficient role or ownership |
| 404 | Resource not found |
| 409 | Duplicate / conflict (unique constraint, leave overlap) |
| 422 | Unprocessable (negative remaining balance on update) |

### Select projection
All service methods use explicit Prisma `select` objects (named `EMPLOYEE_SELECT`, `LEAVE_SELECT`, etc.) to avoid over-fetching and to enforce that sensitive fields (e.g., `password`, internal IDs not needed by the caller) are never returned.

### Module layout
All feature modules follow the same flat structure:
```
src/<feature>/
├── dto/
│   ├── create-<feature>.dto.ts
│   ├── update-<feature>.dto.ts
│   └── query-<feature>.dto.ts
├── <feature>.controller.ts
├── <feature>.service.ts
└── <feature>.module.ts
```
No `src/modules/` container. New features follow this pattern.

## Consequences

**Positive**
- Predictable patterns make the API easy to consume from frontend and easy to document.
- Consistent pagination shape means a single client-side utility handles all list responses.
- Whitelist pipe prevents mass-assignment vulnerabilities.
- Explicit `select` projections prevent unintended data leakage.

**Negative**
- `/leave` instead of `/leave-requests` is non-standard REST naming; could confuse new developers.
- Enum values come from `common/enums.ts` rather than `@prisma/client` — developers must remember not to import from Prisma directly in DTOs.

## Alternatives Considered

| Alternative | Reason Not Selected |
|---|---|
| GraphQL | Valid for complex query flexibility; over-engineered for the current team and use case |
| OpenAPI-first (generate routes from spec) | Correct approach for strict contract-first; deferred in favour of code-first given the small team |
| Cursor-based pagination | More scalable for large tables; offset/page is sufficient at current HR data volumes |

## Follow-up Tasks
- Add Swagger/OpenAPI decorator support (`@nestjs/swagger`) so the frontend team can browse the API without reading source code.
- Document any future API version prefix strategy (e.g., `/v1/`) before public or third-party consumers are added.
- Enforce `@MaxLength` on all string fields that accept free text (currently applied to `note`, `reason`, `rejectReason`; check remaining fields).
