# CTO Summary

## Step
T-042 — Mobile App Foundation (Expo React Native)

## Status
PASS

## Scope Completed
Created the initial mobile app foundation under `apps/mobile` using Expo SDK 52 + Expo Router 4 + TypeScript. Includes three placeholder screens (Login, Home with API health check, Index redirect), an API client with `getHealth()`, environment configuration via `EXPO_PUBLIC_*` variables, a light/dark color token system, documentation, and a verified TypeScript build. No changes to API, Prisma schema, or existing web app.

## Files Created

**apps/mobile/**
- `package.json` — Expo project, scripts: start / ios / android / web / typecheck
- `app.json` — Expo config (slug, scheme, expo-router plugin, iOS/Android identifiers)
- `tsconfig.json` — extends expo/tsconfig.base, strict mode, path aliases
- `babel.config.js` — babel-preset-expo
- `expo-env.d.ts` — expo-router type reference
- `.env.example` — EXPO_PUBLIC_API_BASE_URL template with per-platform notes
- `README.md` — Setup, scripts, environment variables, connectivity notes

**apps/mobile/app/**
- `_layout.tsx` — Root Stack layout + StatusBar
- `index.tsx` — Entry point → Redirect to /login
- `login.tsx` — Login placeholder (Thai + English text; Continue to Home button)
- `home.tsx` — Home screen (4 feature cards; API health check with loading/success/error states)

**apps/mobile/src/config/**
- `env.ts` — EXPO_PUBLIC_API_BASE_URL with fallback to localhost:4002

**apps/mobile/src/api/**
- `client.ts` — getHealth() → GET /health; typed HealthResponse

**apps/mobile/src/styles/**
- `colors.ts` — Light/dark color tokens (Colors.light.*, Colors.dark.*); ready for theme toggle

**apps/mobile/src/components/**
- `index.ts` — Placeholder (T-043+)

**apps/mobile/src/hooks/**
- `index.ts` — Placeholder (T-043+)

**apps/mobile/src/screens/**
- `index.ts` — Placeholder (T-043+)

**docs/**
- `MOBILE_APP_FOUNDATION.md` — Stack rationale, folder structure, local API connectivity, what's in/out, future tasks

## Files Modified

- `.gitignore` — Added Expo build artifact exclusions (`.expo/`, `ios/`, `android/`, `dist/`, `node_modules/` under apps/mobile)

## Mobile Stack Summary

| Layer | Choice | Reason |
|---|---|---|
| Framework | Expo SDK 52 | Managed workflow; no native Xcode/Gradle config needed for dev |
| Navigation | Expo Router 4 | File-based routing; mirrors Next.js App Router pattern used in apps/web |
| Language | TypeScript (strict) | Consistent with API and web apps |
| Styling | React Native StyleSheet | No heavy UI library needed for foundation |
| Safe area | SafeAreaView (RN built-in) | Sufficient for foundation; no extra package required |

## Mobile Folder Structure

```
apps/mobile/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root Stack navigator
│   ├── index.tsx           # / → redirects to /login
│   ├── login.tsx           # Login placeholder
│   └── home.tsx            # Home with feature cards + health check
├── src/
│   ├── api/client.ts       # API client (getHealth)
│   ├── config/env.ts       # EXPO_PUBLIC_* env vars
│   ├── components/         # Placeholder
│   ├── hooks/              # Placeholder
│   ├── screens/            # Placeholder
│   └── styles/colors.ts    # Light/dark color tokens
├── app.json
├── babel.config.js
├── expo-env.d.ts
├── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

## Screens Added

| Route | Screen | Status |
|---|---|---|
| `/` | Index | Redirects to /login |
| `/login` | Login placeholder | Thai + English text; Continue to Home button (no auth) |
| `/home` | Home | 4 feature cards (Profile, Attendance, Leave, Dashboard) + API health check |

## API Client Summary

- File: `src/api/client.ts`
- Function: `getHealth(): Promise<HealthResponse>`
- Endpoint: `GET /health`
- States handled: loading, success (with status string), error (with message)
- Base URL source: `src/config/env.ts` → `EXPO_PUBLIC_API_BASE_URL`

## Environment Config Summary

| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `http://localhost:4002` | API base URL; embedded at build time |

Platform-specific values documented in `.env.example` and `README.md`:
- iOS Simulator: `localhost:4002`
- Android Emulator: `10.0.2.2:4002`
- Physical device: `<LAN-IP>:4002`

## Documentation Updated

- `apps/mobile/README.md` — Developer setup, scripts, env vars, connectivity notes
- `docs/MOBILE_APP_FOUNDATION.md` — Stack choice, folder structure, how to run, API connectivity, included/not-included, future tasks

## Verification Results

| Check | Result |
|---|---|
| `./scripts/verify.sh` (API build + Prisma validate + Web build) | **PASS** |
| `./scripts/docker-verify.sh` (full stack healthy) | **PASS** |
| `./scripts/api-smoke-test.sh` (login + all endpoints) | **PASS** |
| `./scripts/e2e-test.sh` (51 Playwright tests) | **PASS** |
| `apps/api npm test` (114 unit tests) | **PASS** |
| `apps/mobile npm run typecheck` | **PASS** (zero errors) |
| `apps/mobile npm run start` | Not run interactively — Expo dev server is interactive; run `npm run start` manually |

## Existing Web / API Impact

None. No changes to `apps/api`, `apps/web`, Prisma schema, migrations, API contracts, Docker Compose, or CI configuration. The only root-level change is `.gitignore` additions for Expo build artifacts.

## Known Limitations

- Login screen is a placeholder — the "Continue to Home" button navigates without authentication. Real auth is T-043.
- No Thai/English toggle; Thai and English text are shown side-by-side as hardcoded strings. Full i18n is T-043/T-044.
- Color tokens for light/dark exist in `src/styles/colors.ts` but are not wired to a theme provider. Theme toggle is T-043/T-044.
- `npm install` requires `--legacy-peer-deps` due to `react-native@0.76.5` peer dep declaring `^18.2.0` while Expo SDK 52 ships with React 18.3.1. This is a known upstream version-string issue; no runtime impact.
- React `18.3.2` (referenced in Expo SDK 52 docs) does not exist on npm — `18.3.1` is used instead; functionally equivalent.
- Expo dev server (`npm run start`) must be started manually and tested on a simulator or device — non-interactive verification is not possible for the runtime UI.
- No EAS Build or OTA update configuration; production build is a future concern.

## Risk
Low — new directory only; zero changes to existing API, web, or CI pipeline.

## Decision
**PASS**

## Recommended Commit Message

```
feat(mobile): add Expo mobile app foundation (T-042)

- Expo SDK 52 + Expo Router 4 + TypeScript strict
- Screens: Index redirect, Login placeholder, Home with API health check
- API client: getHealth() → GET /health
- Env config: EXPO_PUBLIC_API_BASE_URL with iOS/Android/device notes
- Color tokens ready for future light/dark theme toggle
- Docs: MOBILE_APP_FOUNDATION.md + apps/mobile/README.md
- .gitignore: exclude Expo build artifacts
- All existing checks green: verify, docker, smoke test, E2E (51), API tests (114)
```

## Next Recommended Task
**T-043 — Mobile Auth**
Implement JWT login flow: POST /auth/login, store accessToken securely (expo-secure-store), protect routes, add logout. Add Thai/English toggle and light/dark theme toggle.
