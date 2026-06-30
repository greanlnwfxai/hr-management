# CTO Summary

## Step
REQ-002F-3 — Admin Mixed Checkout Review UI

## Status
PASS

## Scope
Admin Web UI for HR_ADMIN / SUPER_ADMIN to list, inspect, approve, and reject
off-site attendance records pending review — including mixed checkout exceptions
(employee clocked in at company geofence, then checked out off-site). No backend,
database, or mobile changes were required; the existing API endpoints were already
complete.

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/app/(app)/attendance/offsite-review/page.tsx` | New review page with card list, filter bar, approve/reject modals, loading/empty/error states |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/lib/api.ts` | Added `OffsiteReviewRecord` type (no raw lat/lon), `getOffsiteReview`, `approveOffsiteReview`, `rejectOffsiteReview` |
| `apps/web/lib/i18n.ts` | Added `nav_offsite_review` key to both `en` and `th` dictionaries |
| `apps/web/components/AppLayout.tsx` | Added `/attendance/offsite-review` nav item for SUPER_ADMIN / HR_ADMIN |
| `apps/web/app/(app)/attendance/page.tsx` | Added `Link` import and quick-link banner in the admin section leading to `/attendance/offsite-review` |

## Verification Result

| Check | Result |
|-------|--------|
| `./scripts/verify.sh` | PASS — API build, Prisma schema, Web build (Turbopack) all green; `/attendance/offsite-review` visible in route table |
| `./scripts/docker-verify.sh` | NOT RUN — script contains `docker compose down` (prohibited by Docker Safety Rules). API container verified healthy via smoke test |
| `./scripts/api-smoke-test.sh` | PASS — all endpoints healthy, auth + employees verified |
| `./scripts/security-review.sh` | PASS — dependency audit clean, secret scan clear |

**Note on UI verification**: The review page requires PENDING_REVIEW records in the
database to exercise the approve/reject flow. Automated scripts do not populate such
records. Manual end-to-end testing with a real mixed-checkout submission is required
to confirm the full flow.

## Issues Found

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Raw lat/lon fields in backend `ATTENDANCE_SELECT` traverse the wire even though this task must not display them | Omitted all four coordinate fields (`checkIn/OutLatitude/Longitude`) from `OffsiteReviewRecord` TypeScript type entirely — they cannot be rendered accidentally. Distance and accuracy metrics (safe business data) are included. |
| 2 | GET `/attendance/offsite-review` is guarded with `@Roles(SUPER_ADMIN, HR_ADMIN)` (confirmed line 192 of attendance.controller.ts) | No issue — backend RBAC is correct. Frontend `isAdmin()` guard (excludes MANAGER) aligns with backend. |

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | No new endpoints added. Page consumes three existing endpoints: GET `/attendance/offsite-review`, PATCH `.../approve`, PATCH `.../reject` — all require JWT Bearer token via `apiFetch` |
| RBAC impact | All three endpoints require SUPER_ADMIN or HR_ADMIN (backend `@Roles`). Frontend adds a second gate: `isAdmin()` blocks MANAGER and EMPLOYEE from seeing the page or the nav item |
| Data privacy impact | Raw GPS coordinates (`checkInLatitude`, `checkInLongitude`, `checkOutLatitude`, `checkOutLongitude`) are NOT in the `OffsiteReviewRecord` TypeScript type and are never rendered. Distance from company (meters) and GPS accuracy (meters) are displayed as safe business metrics |
| Password/token/hash impact | None |
| Mobile security impact | None — no mobile changes in this task |
| Dependency/advisory impact | No new packages added. Pre-existing accepted-risk advisories (Multer DoS — GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm) unchanged |
| Secrets/logging check | No sensitive values logged; no tokens in responses; `reviewNote` is plain business text |
| New endpoints protected | No new endpoints created |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low — web-only feature (no backend changes, no schema changes, no mobile changes).
New page is gated by existing JWT + RBAC. No new packages introduced.

## Decision
PASS

## Next Step
User performs manual end-to-end test: submit a mixed checkout from the mobile app,
then log in as HR_ADMIN on the web, navigate to `/attendance/offsite-review`,
and verify approve and reject flows complete with correct toast feedback and card
state update.

## Recommended Commit Message
```
feat(web): add off-site attendance review page

New admin page at /attendance/offsite-review lets HR_ADMIN / SUPER_ADMIN
inspect, approve, and reject pending off-site attendance records including
mixed checkout exceptions (geofence check-in → off-site check-out).

- lib/api.ts: add OffsiteReviewRecord type (no raw GPS coords) and
  getOffsiteReview / approveOffsiteReview / rejectOffsiteReview
- i18n.ts: add nav_offsite_review key (en + th)
- AppLayout.tsx: add nav item for SUPER_ADMIN / HR_ADMIN
- attendance/page.tsx: add quick-link banner to review page for admins
- attendance/offsite-review/page.tsx: new review page with card list,
  status/type badges, approve modal (optional note), reject modal
  (required reason ≥ 3 chars), stale-record 400 handling + reload,
  pagination, loading/empty/error states
```
