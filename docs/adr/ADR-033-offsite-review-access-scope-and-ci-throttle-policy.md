# ADR-033: Off-site Review Access Scope, GPS Privacy Display, and CI-only Throttle Policy

**Status:** Accepted
**Date:** 2026-07-10
**Tasks:** REQ-002F (v1.2.89), HOTFIX-CI-PROFILE-E2E-001 (included in v1.2.89 tag)
**Related tags:** `v1.2.89-req-002f-offsite-review-ui`
**Implementation reference:** `docs/CTO_SUMMARY_REQ_002F_OFFSITE_ADMIN_REVIEW_UI.md`, `docs/CTO_SUMMARY_HOTFIX_CI_PROFILE_E2E_001.md`

---

## Context

REQ-002F closed out the Admin Web off-site attendance review page
(`/attendance/offsite-review`) by retrofitting i18n and adding an employee
filter. During that work, and in the CI hotfix that followed it, three
decisions were made that are extensions of prior ADRs rather than new
architecture — but were not yet written down as decisions in their own right:

1. Whether the Admin Web review UI should keep showing to MANAGER, or be
   narrowed to SUPER_ADMIN/HR_ADMIN only.
2. Whether the review UI should ever surface raw GPS coordinates.
3. Why the CI end-to-end job's rate limit (`THROTTLE_LIMIT=500`) is higher
   than the production default (`THROTTLE_LIMIT=100`).

## Decision

### 1. Off-site review UI keeps MANAGER access

The backend (`GET/PATCH /attendance/offsite-review*`) has authorized
`SUPER_ADMIN`, `HR_ADMIN`, and `MANAGER` (own managed department only, no
self-review) since the off-site review endpoints were built — this is not a
new grant, it follows the same department-scoping mechanism established by
ADR-023 (Department Manager Leave Approval Scope). REQ-002F's task brief
suggested narrowing the Admin Web nav/page to SUPER_ADMIN/HR_ADMIN only; this
was **not** done. Narrowing the UI would hide a capability the backend already
grants correctly, forcing managers to fall back to some other channel to
review their own department's off-site records. The Admin Web guard is kept
identical to the backend's `@Roles` guard, consistent with this project's
standing rule that backend RBAC is the source of truth and UI role gating is
UX-only.

### 2. Raw GPS is never displayed on the review UI

The off-site review card shows only `checkInAccuracyMeters`,
`checkInDistanceFromCompanyMeters`, `checkOutAccuracyMeters`, and
`checkOutDistanceFromCompanyMeters` — rounded distance/accuracy in meters,
never `latitude`/`longitude`. This is not a new privacy control; it follows
the no-raw-GPS-storage/display precedent already established by ADR-020
(Attendance Geofence and Admin Configuration) and ADR-022 (Off-site Work
Request Workflow), and mirrors the equivalent SEC-ATT-007B risk-review UI
pattern. The backend's `REVIEW_SELECT` Prisma projection does not even fetch
the raw coordinate columns, so there is no code path by which the Admin Web
page could accidentally render them.

### 3. CI e2e throttle limit is intentionally higher than production

The global `ThrottlerGuard` (`THROTTLE_LIMIT=100` per 60s) is a production
security control (abuse/DoS mitigation) and is left unchanged. REQ-002F's new
Playwright coverage pushed the full e2e suite's authenticated request volume
past that limit purely as a side effect of test volume, causing unrelated
tests (`profile.spec.ts`) to receive `429`s from the shared global limiter.
`THROTTLE_LIMIT` is raised to `500` **only** in the `e2e-ci` GitHub Actions
job's `env:` block — the production `.env` default, and every other CI job
(`api-ci`, `integration-ci`, `compose-ci`), keep `THROTTLE_LIMIT=100`. This
follows the same precedent already set for `LOGIN_THROTTLE_LIMIT` (raised
5→20 in the same job for the same reason: test-execution volume, not a
production risk-tolerance change).

## Consequences

**Positive:**
- Admin Web RBAC stays exactly aligned with backend RBAC — no UI-side
  capability gap for managers reviewing their own department's records.
- No raw GPS exposure surface was introduced or considered; the review UI
  inherits the existing privacy posture by construction (the projection
  doesn't fetch the data), not by convention alone.
- CI is green without weakening the production rate-limit security control.

**Negative / Trade-offs:**
- The CI throttle value now diverges from production, which means CI does
  not exercise the production throttle threshold end-to-end. This is an
  accepted trade-off: a dedicated throttle-limit test (if ever added) would
  need to run in isolation, not as part of the full suite.
- No resolver name (`reviewedBy`) is shown on the off-site review card today —
  a separate, smaller backend projection gap (see
  `docs/CTO_SUMMARY_REQ_002F_OFFSITE_ADMIN_REVIEW_UI.md` §Known Limitations),
  unrelated to the three decisions above, left open as future polish.

## Related ADRs

- ADR-020 — Attendance Geofence and Admin Configuration (no raw GPS storage)
- ADR-022 — Off-site Work Request Workflow (privacy baseline for off-site data)
- ADR-023 — Department Manager Leave Approval Scope (MANAGER department-scoping mechanism this UI reuses)
- ADR-019 — Audit Trail and Admin Audit Log Review (RBAC-restricted admin UI precedent)
