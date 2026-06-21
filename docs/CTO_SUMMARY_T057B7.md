# CTO Summary

## Task
T-057B-7 — Admin Audit Log UI

## Status
PASS

## Scope Completed
Built the Admin Audit Log page at `/audit-logs` in the Next.js web application. The page consumes `GET /audit-logs` (paginated, filterable), shows results in a table with a detail modal, and is protected by role-based nav and a page-level access guard. No backend changes were made.

## Files Changed

### Created
- `apps/web/app/(app)/audit-logs/page.tsx` — Audit Logs page (filter panel, table, pagination, detail modal)

### Modified
- `apps/web/lib/api.ts` — Added `AuditLog` type, `getAuditLogs()` function
- `apps/web/lib/i18n.ts` — Added 5 audit log translation keys (en + th): `nav_audit_logs`, `page_audit_logs`, `loading_audit_logs`, `empty_audit_logs`, `error_audit_logs`
- `apps/web/components/AppLayout.tsx` — Added `Audit Logs` nav item for `SUPER_ADMIN` / `HR_ADMIN` roles

## Page Added
- **Route:** `/audit-logs`
- **File:** `apps/web/app/(app)/audit-logs/page.tsx`

## API Consumed
- `GET /audit-logs` — paginated list with filters (page, limit, action, targetType, actorRole, result, actorUserId, targetId, dateFrom, dateTo)
- Detail view is populated from selected row data in memory; `GET /audit-logs/:id` is not called (all fields including metadata are present in the list response)

## Role / Access Behavior
- **SUPER_ADMIN / HR_ADMIN:** Full access — nav entry visible, page loads, data fetched
- **MANAGER / EMPLOYEE:** Nav entry is not present; direct URL navigation renders `ErrorState` with `status={403}` (displays "Access Denied" per existing convention)
- **Unauthenticated:** Protected by existing `ProtectedLayout` (`app/(app)/layout.tsx`) which redirects to `/login`
- UI role gating is UX-only; backend RBAC (`JwtAuthGuard` + `RolesGuard`) is the authoritative enforcement

## Filters Implemented
All query parameters supported by `GET /audit-logs`:

| Filter | Input type |
|---|---|
| action | Text (e.g. `AUTH_LOGIN_SUCCESS`) |
| targetType | Text (e.g. `EMPLOYEE`) |
| actorRole | Select: SUPER_ADMIN / HR_ADMIN / MANAGER / EMPLOYEE |
| result | Select: SUCCESS / FAILURE |
| actorUserId | Text (UUID) |
| targetId | Text (UUID) |
| dateFrom | Date picker |
| dateTo | Date picker |

Filters use an **Apply / Reset** form pattern: free-text fields are committed on form submit (Enter or "Apply Filters" button) to avoid chatty live requests. The "Clear" button resets all filters to empty.

## Pagination Behavior
- Default limit: 20 records per page
- Previous / Next buttons with disabled state at boundaries
- Page N of M and total record count displayed in filter bar summary and pagination footer
- Page resets to 1 on filter apply or reset

## Detail View Behavior
- Clicking "Detail" in any table row opens a `Modal` (existing `Modal` component, `wide` prop)
- All fields shown: id, timestamp, action, result (badge), actorRole, actorUserId, targetType, targetId, targetLabel, ipAddress, userAgent, metadata
- Metadata rendered as `JSON.stringify(metadata, null, 2)` in a `<pre>` block — no transformation or redaction; backend has already sanitized sensitive keys; `[REDACTED]` values are displayed as-is
- Metadata is only visible in the detail modal, never in the main table

## Security / Privacy Notes

### Security Review

| Field | Assessment |
|---|---|
| Auth impact | No new endpoints added. Existing `GET /audit-logs` and `GET /audit-logs/:id` remain protected by `JwtAuthGuard` + `RolesGuard` (`SUPER_ADMIN`, `HR_ADMIN`). The web UI is read-only. |
| RBAC impact | Nav entry added only for `SUPER_ADMIN` / `HR_ADMIN`. Page renders `ErrorState 403` for all other roles. No new RBAC rules introduced. |
| Data privacy impact | Audit logs may contain actorUserId and targetId (UUIDs). No new PII exposure beyond what the backend already returns. Metadata rendered only in detail modal. |
| Password/token/hash impact | No password, JWT, or hash handling changed. The `api.ts` fetch function attaches `Authorization: Bearer <token>` to requests internally; the token value is never logged, printed to console, or rendered in the UI. |
| Mobile security impact | No mobile changes. Audit log UI is web-only. |
| Dependency/advisory impact | No new packages added. All existing HIGH/CRITICAL findings are documented as accepted-risk (Multer, xmldom, node-tar). `npm audit` passes with existing accepted-risk configuration. |
| Secrets/logging check | No `console.log` calls added. API responses are stored in React state only. No tokens or credentials in logs or UI. |
| New endpoints protected | None — no new backend endpoints added. |
| Risk level | LOW |
| Security decision | PASS |

## Tests Added or Updated

### E2E Spec Added
- **`apps/web/e2e/audit-logs.spec.ts`** (7 tests) — Playwright spec following the existing `e2e/employees.spec.ts` pattern.

Tests cover:
1. Audit Logs heading renders (`data-testid="page-title-audit-logs"`)
2. Page loads without error state
3. Table or empty state renders after load
4. Nav item `nav-audit-logs` is visible for admin
5. Filter form has Apply Filters button
6. Filtering by an unknown action string shows empty state
7. Detail button opens modal when data exists

All 7 tests passed against the live Docker stack (`npm run test:e2e -- --grep "Audit Logs"`, 10.4 s).

## Verification Results

### `./scripts/verify.sh`
```
[PASS] API build
[PASS] Prisma schema valid
[PASS] Web build
[PASS] ALL CHECKS PASSED
```
Route `/audit-logs` confirmed present in the build output.

### `npm --prefix apps/api test`
```
Test Suites: 19 passed, 19 total
Tests:       310 passed, 310 total
```

### `./scripts/secret-scan.sh`
```
[PASS] No committed .env files found
[PASS] No PEM private key blocks found
[PASS] Secret scan completed — no findings
```

### `./scripts/security-review.sh`
```
[PASS] ALL DEPENDENCY AUDITS PASSED
[PASS] Secret scan completed — no findings
[PASS] SECURITY REVIEW PASSED — automated checks clear
```

### Docker runtime
```
hr-api   Up (healthy)   0.0.0.0:4002->4002/tcp
hr-web   Up             0.0.0.0:3002->3002/tcp
hr-db    Up (healthy)   0.0.0.0:5432->5432/tcp
```
`GET /health` → 200 OK. Web container built successfully with `/audit-logs` in route manifest.

### `git diff --check`
No whitespace errors.

## Docker Safety Compliance
- ✅ `docker compose down` was NOT run
- ✅ `docker compose down -v` was NOT run
- ✅ No Docker volumes removed
- ✅ No `docker system prune` or equivalent
- ✅ `./scripts/docker-verify.sh` was NOT run
- ✅ Only allowed commands used: `docker compose up -d --build web`, `docker compose ps`, `curl` health checks, `docker compose logs`

## Out-of-Scope Confirmed
- ✅ Prisma schema not modified
- ✅ No migrations added
- ✅ No package.json or lockfile changes
- ✅ Audit write behavior not modified
- ✅ No export/download feature
- ✅ No audit deletion/retention/cleanup
- ✅ No POST/PATCH/DELETE audit-log endpoints
- ✅ MANAGER/EMPLOYEE cannot access the page (403 guard)
- ✅ No temporary passwords, tokens, or secrets shown
- ✅ No mobile UI changes

## Risks / Limitations
- **Date filter quirk (inherited):** Backend uses `lte: new Date(dateTo)` which resolves a date-only string to midnight UTC. Filtering `dateTo = "2026-06-21"` may exclude records created after 00:00 UTC on that date. This is existing backend behavior, out of scope for this task.
- **Nav route guard is UX-only:** If a MANAGER navigates to `/audit-logs` directly, they see the `ErrorState 403` component rather than a server-side redirect. Backend RBAC is the authoritative enforcement. This matches the existing pattern used across all admin-only features.
- **No component-level unit tests:** The web app uses Playwright e2e for UI verification; there is no Jest/Testing Library setup for isolated component tests.

## Overall Decision
**PASS** — Web build clean, TypeScript passes, all 310 API tests pass, 7/7 Playwright e2e tests pass against live Docker stack, security review automated checks clear, Docker services healthy, no out-of-scope changes made.

## Recommended Commit Message
```
feat(web): add admin audit log page
```

## Next Recommended Task
T-057B-8 — HR-Knowledge & ADR Sync for Audit Log Pack.
