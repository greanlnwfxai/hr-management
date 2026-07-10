# CTO Summary

## Step
HOTFIX-CI-PROFILE-E2E-001 — Fix failing Profile E2E after REQ-002F push

## Status
PASS

## Scope
CI run 29027649827 (commit `a0949f8`) failed the E2E job with two named
failures in the pre-existing `apps/web/e2e/profile.spec.ts` (lines 25 and 30),
while all REQ-002F off-site review tests passed. Investigate whether the
Profile page, its E2E test, or something else regressed, and apply the
smallest safe fix.

## Root Cause
**Not a Profile page bug and not a stale test.** The API's global
`ThrottlerGuard` (`apps/api/src/app.module.ts`, `THROTTLE_LIMIT=100` per
`THROTTLE_TTL=60`s) applies to **every** authenticated endpoint, including
`GET /auth/me`. REQ-002F added 10 new Playwright tests
(`attendance-offsite-review.spec.ts`), and the suite as a whole (currently
109 tests) now makes **287 authenticated HTTP requests in total**, measured
directly via a temporary request-timestamp logger in `main.ts` (added for
diagnosis only, reverted before this commit — `git diff apps/api/src/main.ts`
is clean). The busiest 60-second sliding window contains **264 requests** —
already 2.6x the 100/60s CI limit, and the 287 absolute total means no
plausible CI runner speed variance can keep the suite under the limit.

Playwright runs the suite alphabetically with `workers: 1`, so
`profile.spec.ts` executes right after the newly-added
`attendance-offsite-review.spec.ts` burst. Once the rolling window is over
budget, whichever `/auth/me` calls land in that window get HTTP 429 instead
of 200. The frontend's `apiFetch` (`apps/web/lib/api.ts`) treats any non-401
`!res.ok` response as a generic error, so `ProfilePage.fetchMe()` catches it
and renders the “profile load failed” error state instead of the account
info / password-change sections — which is exactly why `getByText('admin@hr.local')`
and `[data-testid="form-change-password"]` were reported as "element not found".

This reproduced deterministically:
- `curl` loop hitting `/auth/me` 110x in <60s: requests 101-110 all returned `429`.
- Full local suite run at the default `THROTTLE_LIMIT=100`: same failure
  pattern as CI (`profile.spec.ts` tests 97-100 failed/retried-failed at
  15s each, then recovered once the window aged out) — **plus** an
  additional flake in `employee-account.spec.ts:65`, confirming the CI
  report's "2 failures" was a timing artifact of *which* requests happened
  to land inside the over-budget window, not an exhaustive list of what the
  root cause affects.
- Full local suite run at `THROTTLE_LIMIT=500`: **all tests pass, zero
  flakes**, including the previously-flaky `employee-account.spec.ts` test.

There is precedent for this exact class of fix already in the workflow:
`LOGIN_THROTTLE_LIMIT` was previously raised from the production default (5)
to 20 specifically to keep Playwright's login-heavy setup from tripping the
login throttle. The general `THROTTLE_LIMIT` for the E2E job was never
similarly adjusted when off-site review tests were added, so it was only a
matter of time before total request volume crossed 100/60s.

## Files Created
- `docs/CTO_SUMMARY_HOTFIX_CI_PROFILE_E2E_001.md`

## Files Modified
- `.github/workflows/ci.yml` — raised `THROTTLE_LIMIT` from `100` to `500`
  **only** in the `e2e-ci` job's `env:` block, with an inline comment
  explaining why and pointing at this summary.

No application code, no test code, and no `.env` changes. `apps/api/src/main.ts`
was temporarily modified with a request-logging middleware to measure real
traffic and was fully reverted before finishing (confirmed via `git diff`
showing no changes to that file).

## Whether App Code Changed
Neither app code nor test code changed. This is a **CI-workflow-config-only**
fix: a rate-limit tuning knob for the E2E job's test-execution environment,
mirroring the same tuning already applied to `LOGIN_THROTTLE_LIMIT`. The
production `.env` default (`THROTTLE_LIMIT=100`) and every other CI job
(`api-ci`, `integration-ci`, `compose-ci`) are untouched.

## Verification Result
- `./scripts/verify.sh` → **PASS** (API build, Prisma validate, Web build)
- `./scripts/docker-verify.sh` → **PASS** (stack healthy, non-destructive, left running)
- `./scripts/api-smoke-test.sh` → **PASS**
- `npx playwright test e2e/profile.spec.ts e2e/attendance-offsite-review.spec.ts`
  → **PASS** (17/17), run twice (once immediately after the fix, once again
  after `docker-verify.sh` rebuilt the web image)
- Full local suite (`npx playwright test`) at `THROTTLE_LIMIT=500` (matching
  the fix) → **PASS**, 106/109 passed + 3 skipped, 0 failures, 0 flakes
- Full local suite at `THROTTLE_LIMIT=100` (pre-fix baseline) →
  reproduced the CI failure pattern exactly (profile.spec.ts + one
  additional flake elsewhere)

Note: mid-verification, `docker-verify.sh`'s image rebuild picked up a
pre-existing stale value in the local (untouched, per instructions) `.env`
file — `NEXT_PUBLIC_API_URL=https://hr.eds-center.com/api` — which is a
leftover from prior manual/production testing of this local stack, unrelated
to this task or to CI (CI's `e2e-ci` job sets this correctly to
`http://localhost:4002` in its own `env:` block). This caused one
throwaway local test run to fail for an unrelated reason (browser tried to
reach a production hostname); it was diagnosed, explained, and the web image
was rebuilt with the correct URL passed explicitly to reconfirm the actual
fix. No repo file was changed to address this — it's purely a local
Docker Compose environment artifact.

## CI Impact
The next CI run on this branch should show `E2E — Playwright Critical Flows`
passing in full, including `profile.spec.ts` and the REQ-002F off-site
review tests, with no retries needed.

## Issues Found
- Global API throttle (`THROTTLE_LIMIT=100`/60s) is too low for the current
  E2E suite's real request volume (287 total, 264 peak-window) — fixed here
  for CI only.
- (Observation, out of scope — not acted on) The 100/60s production default
  is a per-IP limit; a single power user driving several data-heavy pages
  with parallel GETs could plausibly approach that ceiling in real usage.
  Worth a separate look if this ever surfaces in production, but the
  production value is intentionally left unchanged by this hotfix.
- `employee-account.spec.ts:65` flaked under the same root cause during
  local reproduction at the old limit; it is not separately named in the
  CI report but is covered by the same fix.

## Risk
Low — CI-only environment variable change, no production or app-code impact,
verified with a full local suite pass at the new value and a full local
suite failure reproduction at the old value.

## Decision
PASS

## Next Step
See `## Next Recommended Task` in
`HR-Knowledge/01-START-HERE/Current Status.md` (not modified by this hotfix —
no roadmap-level change resulted from this CI fix).

## Recommended Commit Message
```
fix(ci): raise e2e job throttle limit to stop profile.spec.ts flaking

REQ-002F's off-site review tests pushed the full Playwright suite's request
volume to 287 total / 264-in-60s peak, tripping the global ThrottlerGuard
(100/60s) on unrelated /auth/me calls in profile.spec.ts. Raise THROTTLE_LIMIT
to 500 in the e2e-ci job only; production default and other CI jobs unchanged.
```

---

## Security Review

| Field | Answer |
|---|---|
| Auth impact | None. No auth endpoint, guard, or flow logic changed. |
| RBAC impact | None. No role/permission logic touched. |
| Data privacy impact | None. No new data exposure or access path. |
| Password/token/hash impact | None. |
| Mobile security impact | None. Mobile app/config untouched. |
| Dependency/advisory impact | None. No packages added or changed. |
| Secrets/logging check | None. The diagnostic request-logger added to `apps/api/src/main.ts` during investigation logged only `method` + `path` (no headers, tokens, or bodies) to local stdout, and was fully reverted before this change was finalized — confirmed via `git diff apps/api/src/main.ts` showing no diff. It was never committed. |
| New endpoints protected | No new endpoints. |
| Risk level | LOW |
| Security decision | PASS |

Rate limiting is itself a security control, so it's addressed explicitly
rather than waved through: the **production** rate limit
(`THROTTLE_LIMIT=100` in `.env`, and in the `api-ci`, `integration-ci`, and
`compose-ci` jobs) is **unchanged**. Only the `e2e-ci` job's test-execution
environment value is raised, for the same reason and following the same
precedent as the existing `LOGIN_THROTTLE_LIMIT` 5→20 bump in that same job.
No source file under `apps/api/src` or `apps/web` differs from before this
change.

`./scripts/security-review.sh` was **not** run, because this change touches
only a CI workflow's environment variables — no application source, no
dependency manifests, and no secrets. Rerunning the full security harness
for a rate-limit env var in a test-execution job would not exercise anything
this change actually touches.
