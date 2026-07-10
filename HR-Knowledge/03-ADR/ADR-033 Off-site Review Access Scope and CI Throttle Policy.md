# ADR-033: Off-site Review Access Scope, GPS Privacy Display, and CI Throttle Policy

**Status:** Accepted | **Date:** 2026-07-10

## Decision

Three related decisions made during REQ-002F and its CI follow-up, documented
together since none of them changed behavior — each confirms an existing
pattern rather than introducing a new one.

## Key Points

- Admin Web off-site review UI (`/attendance/offsite-review`) **keeps MANAGER
  access** (own department, no self-review) because the backend has always
  authorized it (same mechanism as ADR-023); narrowing the UI would hide a
  capability the backend already grants
- Review cards **never show raw GPS** — only rounded distance/accuracy in
  meters — following the no-raw-GPS precedent from ADR-020/ADR-022; the
  backend `REVIEW_SELECT` projection doesn't even fetch lat/lon
- CI's `e2e-ci` job raises `THROTTLE_LIMIT` to `500` (from production's `100`)
  **only** in that job's env block, because REQ-002F's added Playwright tests
  pushed total suite request volume past the production limit and caused
  unrelated `429`s (`profile.spec.ts`); production and all other CI jobs stay
  at `100` — same precedent as the existing `LOGIN_THROTTLE_LIMIT` 5→20 bump

## Source

`docs/adr/ADR-033-offsite-review-access-scope-and-ci-throttle-policy.md`

#adr #attendance #off-site #rbac #privacy #ci
