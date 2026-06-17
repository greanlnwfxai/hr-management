# CTO Summary

## Step
T-047.5 — Mobile CI Integration

## Status
PASS

## Scope
Added the mobile app as a first-class CI participant. A dedicated GitHub Actions job (`mobile-ci`) runs TypeScript typecheck and Expo web export on every push and PR to `main`. A standalone local verification script (`scripts/mobile-verify.sh`) mirrors the CI job for local runs. Documentation in `docs/CI_CD.md`, `docs/BRANCH_PROTECTION.md`, `apps/mobile/README.md`, and the new `docs/MOBILE_CI.md` was updated to reflect six CI jobs. No product features, API contracts, Prisma schema, or Docker configuration were changed.

## Files Created
- `scripts/mobile-verify.sh` — local mobile verification script (typecheck + Expo export)
- `docs/MOBILE_CI.md` — full mobile CI reference: job steps, install strategy, local verification, limitations, future roadmap

## Files Modified
- `.github/workflows/ci.yml` — added `mobile-ci` job (runs in parallel, no `needs:`)
- `docs/CI_CD.md` — updated job count (five → six), added `mobile-ci` to jobs table and section, updated branch protection check list, updated "What CI Does Not Do Yet" table, updated Future Improvements
- `docs/BRANCH_PROTECTION.md` — updated required check count (four → five), added `HR Management CI / Mobile — Typecheck & Export` to all check lists, updated validation checklist
- `apps/mobile/README.md` — added CI section with job name, commands, install strategy note, and link to `MOBILE_CI.md`

## CI Job Summary

| Job ID | Display Name | Depends on | New? |
|--------|-------------|------------|------|
| `api-ci` | API — Build & Validate | — | existing |
| `web-ci` | Web — Build & Validate | — | existing |
| `mobile-ci` | Mobile — Typecheck & Export | — | **NEW** |
| `compose-ci` | Compose — Config Validation | — | existing |
| `integration-ci` | Integration — Runtime API Test | `api-ci` | existing |
| `e2e-ci` | E2E — Playwright Critical Flows | `api-ci`, `web-ci`, `compose-ci` | existing |

Total: **6 jobs** (was 5). `mobile-ci` runs in parallel with the other build jobs. It does not gate `e2e-ci`.

## Mobile CI Commands

```bash
# In CI (apps/mobile working directory):
npm ci
npm run typecheck        # tsc --noEmit
npx expo export --platform web
```

## Dependency Install Strategy

**Command**: `npm ci` (plain, no `--legacy-peer-deps`)

`npm ci` exits 0 against the committed lockfile. The lockfile resolves peer deps at install time, bypassing the peer-dep negotiation that requires `--legacy-peer-deps` during interactive `npm install`. The mobile `README.md` documents `--legacy-peer-deps` for local setup only.

**Verified**: A clean `rm -rf node_modules && npm ci` was run locally before writing the job — exit code 0, no ERESOLVE errors.

## Root / Local Verification Script Summary

A **separate** script `scripts/mobile-verify.sh` was created rather than folding into `scripts/verify.sh`. Rationale: Expo export adds ~5–10 s and is not needed for every backend change. Keeping it separate keeps `./scripts/verify.sh` fast for day-to-day API/web work.

```bash
./scripts/mobile-verify.sh   # mobile typecheck + Expo export
./scripts/verify.sh          # API build + Prisma validate + web build (unchanged)
```

## Documentation Updated

| Document | Change |
|----------|--------|
| `docs/CI_CD.md` | Job count five → six; new `mobile-ci` section; updated jobs table, branch protection list, "What CI Does Not Do Yet", Future Improvements, Related Docs |
| `docs/BRANCH_PROTECTION.md` | Required check count four → five; added mobile check to all lists, steps, and checklist |
| `apps/mobile/README.md` | Added CI section: job name, commands, install note, local script |
| `docs/MOBILE_CI.md` | New file: full mobile CI reference |

## Verification Results

| Check | Result |
|-------|--------|
| `./scripts/mobile-verify.sh` — Mobile typecheck | PASS |
| `./scripts/mobile-verify.sh` — Expo web export | PASS |
| `./scripts/verify.sh` — API build | PASS |
| `./scripts/verify.sh` — Prisma schema validate | PASS |
| `./scripts/verify.sh` — Web build | PASS |
| `./scripts/docker-verify.sh` — Full stack healthy | PASS |
| `./scripts/api-smoke-test.sh` — Authenticated smoke | PASS |
| `./scripts/e2e-test.sh` — Playwright E2E (51 tests) | PASS |
| API unit tests (`npm test`) — 143 tests | PASS |

All verification checks pass.

## Expected GitHub Actions Impact

After push to `main`:
- CI will show **6 jobs** (was 5)
- `mobile-ci` will run in parallel with `api-ci`, `web-ci`, `compose-ci`
- `e2e-ci` dependency chain is unchanged (`api-ci`, `web-ci`, `compose-ci`)
- All 5 existing jobs remain unmodified and are expected to stay green
- New required status check to add in GitHub branch ruleset: `HR Management CI / Mobile — Typecheck & Export`

## Existing Web / API / Mobile Impact

| Area | Impact |
|------|--------|
| Web Admin (`apps/web`) | None — no changes |
| API (`apps/api`) | None — no changes |
| Mobile app (`apps/mobile`) | README updated (CI section added); no runtime changes |
| Docker Compose | None — `mobile-ci` job requires no containers |
| Prisma schema | None |
| API contracts | None |

## Known Limitations

- `mobile-ci` does not run native iOS or Android builds
- No real GPS / location permission tested in CI
- No mobile E2E tests (Detox / Maestro not yet configured)
- No EAS cloud builds
- No artifact upload for the Expo export output

## Risk
Low — CI-only change. No product code modified. Existing jobs are unaffected. New job runs in parallel; a failure in `mobile-ci` does not block `e2e-ci`.

## Decision
PASS

## Next Recommended Task
**T-048 — Mobile Leave Request**  
Add a leave request submission flow to the mobile app: browse leave balances, submit a leave request form, and view pending/approved leave history.

## Recommended Commit Message
```
ci(mobile): add mobile typecheck and Expo export job (T-047.5)

- Add mobile-ci GitHub Actions job: npm ci, tsc --noEmit, expo export
- Add scripts/mobile-verify.sh for local mobile verification
- Update docs/CI_CD.md: six jobs, mobile-ci section, branch protection list
- Update docs/BRANCH_PROTECTION.md: five required checks (add mobile)
- Update apps/mobile/README.md: CI section with commands and install note
- Add docs/MOBILE_CI.md: full mobile CI reference and known limitations

CI goes from 5 → 6 jobs. mobile-ci runs in parallel with no needs.
Install uses plain npm ci (no --legacy-peer-deps needed from lockfile).
```
