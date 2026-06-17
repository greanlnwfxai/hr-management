# Mobile CI — Typecheck & Export

Added in **T-047.5**. This document describes the `mobile-ci` GitHub Actions job, how to run the same checks locally, and what the job does not cover.

---

## CI Job

**Job ID:** `mobile-ci`  
**Display name:** `Mobile — Typecheck & Export`  
**Runner:** `ubuntu-latest`  
**Depends on:** nothing (runs in parallel with `api-ci`, `web-ci`, `compose-ci`)  
**Blocks `e2e-ci`:** no

### Steps

| Step | Command | Notes |
|------|---------|-------|
| Checkout | `actions/checkout@v4` | |
| Setup Node.js 22 | `actions/setup-node@v4` | npm cache keyed to `apps/mobile/package-lock.json` |
| Install dependencies | `npm ci` | Plain frozen-lockfile install |
| TypeScript typecheck | `npm run typecheck` | `tsc --noEmit` — fails CI on any type error |
| Expo web export | `npx expo export --platform web` | Static Metro bundle — fails CI on bundler errors |

---

## Dependency Install Strategy

**Command used in CI:** `npm ci`

Plain `npm ci` from the committed lockfile exits 0. No `--legacy-peer-deps` flag is needed in CI.

**Why the README says `--legacy-peer-deps`:** The mobile `README.md` documents `npm install --legacy-peer-deps` for interactive local setup. This flag is needed during `npm install` (which re-resolves the dependency graph) because some Expo/React Native packages declare strict peer-dep constraints that conflict with sibling packages. In CI we run `npm ci`, which reads the already-resolved lockfile and installs exactly those versions without re-negotiating peer deps — so no flag is required.

---

## Local Verification

### Run mobile checks only

```bash
./scripts/mobile-verify.sh
```

This runs:
1. `npm run typecheck` — TypeScript typecheck
2. `npx expo export --platform web` — Expo static web export

The script is kept **separate from `verify.sh`** because the Expo export (~5–10 s) is significantly slower than the API and web builds and is not needed for every backend change.

### Run all checks (API + web + Docker)

```bash
./scripts/verify.sh          # API build, Prisma validate, web build
./scripts/docker-verify.sh   # Full stack up + /health check
./scripts/api-smoke-test.sh  # Login + GET /employees
./scripts/mobile-verify.sh   # Mobile typecheck + Expo export
```

### Run mobile checks manually

```bash
cd apps/mobile
npm run typecheck
npx expo export --platform web
```

---

## Port Reference

| Service | URL |
|---------|-----|
| Mobile Expo Web (dev) | http://localhost:3004 |
| Web Admin | http://localhost:3002 |
| API Backend | http://localhost:4002 |
| PostgreSQL | localhost:5432 |

The CI job does not start a dev server. `http://localhost:3004` is only used during local `npm run web`.

---

## What `mobile-ci` Does Not Test

| Capability | Reason not tested |
|------------|-------------------|
| Real GPS / location permission | Requires a physical device or simulator |
| Native iOS build (`.ipa`) | Requires a macOS runner with Xcode |
| Native Android build (`.apk`) | Requires an Android SDK / emulator |
| App store / EAS cloud builds | Requires EAS secrets and paid plan |
| Mobile E2E tests (Detox / Maestro) | Not yet set up |
| Physical device rendering | Not applicable in CI |
| Google Maps rendering | Not applicable — no native map component yet |

---

## Future Improvements

- **Mobile unit tests** — add Jest tests for hooks/services and run in `mobile-ci`
- **Mobile component tests** — React Native Testing Library
- **EAS build job** — iOS/Android production builds via EAS CI (requires GitHub secret for EAS token)
- **Expo export artifact upload** — upload `apps/mobile/dist/` as a GitHub Actions artifact on success
- **Native Android/iOS CI** — macOS runner with simulator for `.ipa`/`.apk` artifacts
- **Mobile E2E (Detox/Maestro)** — end-to-end tests on simulator

---

## Gitignore Note

`apps/mobile/dist/` (the Expo export output) is already listed in the root `.gitignore`. Running the export locally or in CI will not produce a file that needs to be staged or cleaned up manually.

---

## Related Docs

- [CI_CD.md](CI_CD.md) — full CI pipeline reference (all six jobs)
- [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md) — required status checks setup
