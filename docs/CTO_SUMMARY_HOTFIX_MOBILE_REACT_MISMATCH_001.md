# CTO Summary

## Step
HOTFIX-MOBILE-REACT-MISMATCH-001 — Fix production Mobile/PWA blank page after leave calendar hotfix

## Status
PASS

## Scope
After `bee4478` (`fix(mobile): show approved leave on calendar`, tagged `v1.2.85-hotfix-mobile-leave-calendar`), STEP Connect Mobile/PWA rendered a blank white page in production with browser console error **Minified React error #527** (`args[]=19.2.7`, `args[]=19.1.0`) — a `react`/`react-dom` version mismatch. This hotfix realigns `apps/mobile`'s React dependency tree to a single, Expo SDK 54-compatible version without touching the leave-calendar overlay logic, backend, or database.

## Root Cause
`bee4478` added `jest`, `jest-expo@^57.0.1`, and `@types/jest` as devDependencies to add test coverage for the new `leaveOverlay` utility. `jest-expo@57.x` is versioned for a **later** Expo SDK than this project uses (Expo `~54.0.0`) and depends on `@react-native/jest-preset@^0.86.0`, whose peer dependency requires `react@^19.2.3`. Running `npm install` at that time resolved the shared, deduped top-level `react` entry in `package-lock.json` up to `19.2.7` to satisfy that peer, while `react-dom` (not touched by that dependency chain) stayed resolved at `19.1.0` — the version Expo SDK 54 actually bundles (`expo/bundledNativeModules.json` pins both `react` and `react-dom` to exactly `19.1.0`). Because `react` is a production dependency (not dev-only), the drift landed in the real app bundle, not just the test environment, producing the mismatched production build that crashed with React error #527 (react/react-dom version mismatch) and rendered a blank page.

`jest-expo`'s versioning is meant to track the Expo SDK version (e.g. `jest-expo@54.x` for Expo SDK 54), not semver-range off `jest`; `^57.0.1` was an incorrect version for this project's SDK and was the actual source of the drift, not the `jest`/`@types/jest` additions.

## Exact React Versions

| | Before hotfix (bee4478, working) | After hotfix (bee4478, broken) | After this fix |
|---|---|---|---|
| `react` | 19.1.0 | 19.2.7 | 19.1.0 |
| `react-dom` | 19.1.0 | 19.1.0 | 19.1.0 |
| `jest-expo` | (not present) | ^57.0.1 | ~54.0.17 |

Verified via `npm ls react react-dom --prefix apps/mobile`: every dependency in the tree now resolves to a single deduped `react@19.1.0` / `react-dom@19.1.0`, with zero `ERESOLVE` peer warnings (the prior install attempt with `jest-expo@57.0.1` produced an unresolvable peer conflict demanding `react@^19.2.3`, confirming that package was the source of the drift).

The actual nginx-served production bundle in the rebuilt `hr-mobile` Docker image was inspected directly: the only version-like string (`19\.\d+\.\d+`) present anywhere in `_expo/static/js/web/entry-*.js` is `19.1.0`.

## Files Modified
- `apps/mobile/package.json` — pinned `react` and `react-dom` from `^19.1.0` (range) to exact `19.1.0`; changed `jest-expo` from `^57.0.1` to `~54.0.17` (the version matching this project's Expo SDK 54, which does not carry the `@react-native/jest-preset` peer that forced `react@^19.2.3`)
- `apps/mobile/package-lock.json` — regenerated via `npm install` after the `package.json` change; net effect is removing the stray `react@19.2.7` resolution and the newer `jest-expo@57.x` subtree (added 1 package, removed 5, changed 1 — a small, contained diff, not a broad dependency upgrade)

No other files were changed. `apps/mobile/app/calendar.tsx`, `home.tsx`, `src/hooks/useApprovedLeave.ts`, `src/utils/leaveOverlay.ts`, and `leaveOverlay.test.ts` (the leave-calendar overlay fix from `bee4478`) are untouched.

## Runtime Impact
Mobile/PWA only. Restores a single, consistent React runtime version across the entire dependency tree, matching what Expo SDK 54 bundles and tests against. No behavior change to app functionality — the leave-calendar overlay fix from `bee4478` is preserved and its test suite still passes unmodified.

## Backend/API Impact
None. `apps/api` was not touched.

## Database/Migration Impact
None. No schema or migration changes.

## Verification Commands and Results

```
npm ls react react-dom --prefix apps/mobile
  → react@19.1.0 and react-dom@19.1.0 resolve consistently everywhere in the tree, no ERESOLVE warnings

cd apps/mobile && npx jest
  → PASS — leaveOverlay.test.ts: 6/6 tests pass (leave-calendar overlay logic unaffected)

cd apps/mobile && npx tsc --noEmit
  → PASS — no type errors

./scripts/mobile-verify.sh
  → PASS — mobile typecheck PASS, Expo web export PASS (794 modules, 1.48 MB web bundle built successfully)

./scripts/verify.sh
  → PASS — API build PASS, Prisma schema valid PASS, Web build PASS

./scripts/docker-verify.sh   (non-destructive; stack left running)
  → PASS — hr-management-api/mobile/web images rebuilt; hr-db/hr-api/hr-mobile/hr-web all healthy/Up;
    API health check OK, Web app reachable (3002), Mobile app reachable (3004)

./scripts/api-smoke-test.sh
  → PASS — all 10 checks pass (health, login, /auth/me, /employees, /departments, /positions,
    /attendance, /leave, /leave-balances, /dashboard, unauthenticated 401 guard)

./scripts/security-review.sh
  → PASS — dependency audits clean (Multer HIGH findings remain pre-existing accepted risk,
    unrelated to this change), no secrets found

Direct inspection of the rebuilt hr-mobile container's served bundle
  → HTML root div present; only "19.1.0" appears as a version-like string in the
    production JS bundle (_expo/static/js/web/entry-*.js, 1.48 MB)

Headless browser render check (Playwright, against http://localhost:3004 — the actual
rebuilt production container, not a dev server)
  → PASS — #root mounts real content (innerHTML length 2647, not blank), the login
    screen renders correctly in Thai ("HR Management" / "ระบบบริหารทรัพยากรบุคคล" /
    login form fields), and zero console or page errors were captured — confirming
    React error #527 no longer occurs and the blank-page regression is resolved
```

All required verification commands exit 0.

## Production Deployment Notes
- This fix only changes `apps/mobile/package.json` and `apps/mobile/package-lock.json`. Redeploying the rebuilt `hr-mobile` image (or re-running the existing build pipeline against these two files) is sufficient — no `.env`, infra, or Docker Compose config changes are needed.
- No new environment variables, secrets, or migrations to run.
- Recommend deploying this hotfix ahead of / alongside any pending work on `bee4478`'s leave-calendar changes so the blank-page regression is resolved as soon as possible.
- For future dependency additions to `apps/mobile`, when adding an Expo-ecosystem package (e.g. `jest-expo`, `expo-*`), match its version to the project's Expo SDK line (`~54.x`) rather than taking the latest tag, to avoid re-introducing a similar peer-dependency-driven version drift.

## Issues Found
`jest-expo@^57.0.1` (added in `bee4478`) was mismatched with this project's Expo SDK 54 and its `@react-native/jest-preset` peer dependency forced a newer `react` resolution than `react-dom`, causing the production React version mismatch. Resolved by pinning `jest-expo` to `~54.0.17` (correct SDK-54-compatible line) and exact-pinning `react`/`react-dom` to `19.1.0`.

## Risk
Low — narrow, mechanical dependency fix; no application logic, API, or schema changes. Verified end-to-end against a rebuilt Docker image serving the actual production bundle.

## Security Review (per project policy)
| Field | Answer |
|---|---|
| Auth impact | None — no endpoints added/changed |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None — no change to token storage or API calls; this is a dependency-version fix only |
| Dependency/advisory impact | Changed `jest-expo` from `^57.0.1` to `~54.0.17` (net downgrade to the SDK-matching version) and pinned `react`/`react-dom` to exact `19.1.0`. `security-audit.sh`/`security-review.sh` → PASS, no new HIGH/CRITICAL findings (pre-existing accepted-risk Multer findings unaffected) |
| Secrets/logging check | No logging or secret-handling code touched |
| New endpoints protected | None — no new endpoints |
| Risk level | LOW |
| Security decision | PASS |

## Decision
PASS

## Next Step
Deploy this hotfix to production to restore the Mobile/PWA. No further mobile dependency work required unless a future feature needs a newer Expo SDK line (which should update `expo`, `react`, `react-dom`, and `jest-expo` together, in lockstep, rather than individually).

## Recommended Commit Message
```
fix(mobile): pin react/react-dom to 19.1.0 and correct jest-expo version

The prior leave-calendar hotfix (bee4478) added jest-expo@^57.0.1, whose
@react-native/jest-preset peer dependency pulled the shared react resolution
up to 19.2.7 while react-dom stayed at 19.1.0 (the version Expo SDK 54
actually bundles). The resulting react/react-dom mismatch triggered
minified React error #527 in production, blanking the Mobile/PWA.

Pin react and react-dom to exact 19.1.0 and change jest-expo to ~54.0.17
(the version matching this project's Expo SDK 54 line) so the whole
dependency tree resolves to a single consistent React version again.
```
