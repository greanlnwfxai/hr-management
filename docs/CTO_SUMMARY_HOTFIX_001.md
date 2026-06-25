# CTO Summary

## Step
HOTFIX-001 — iOS Add to Home Screen Icon Uses Grey Fallback

## Status
PASS

## Scope
Mobile web only (`apps/mobile`). No backend, database, auth, or session changes. Fixed the iOS "Add to Home Screen" grey placeholder icon by supplying `/apple-touch-icon.png` at the web root and declaring it explicitly in the HTML `<head>`.

## Root Cause
iOS Safari looks for `/apple-touch-icon.png` at the web root when generating a Web Clip icon. The previous implementation only set `web.favicon` in `app.json` (which Expo uses for the browser tab favicon), but did not expose `apple-touch-icon.png` at the served root. iOS auto-discovery of the touch icon therefore failed and fell back to the grey "H" placeholder.

## Fix
Two complementary mechanisms added — belt and suspenders:

**1. Static asset at web root (`/apple-touch-icon.png`)**
- Created `apps/mobile/public/apple-touch-icon.png` (1024×1024 branded HR icon, copied from `assets/icon.png`)
- Expo copies the `public/` directory to the static export root during `npx expo export --platform web`
- Confirmed: `dist/apple-touch-icon.png` present after export
- Served by nginx at `https://mobilehr.eds-center.com/apple-touch-icon.png`

**2. Explicit `<link>` tag in HTML head**
- Added `import Head from 'expo-router/head'` to `app/_layout.tsx`
- Added `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` inside `<Head>` in the root layout
- `expo-router/head` is backed by `react-helmet-async` — it injects the tag on web and is a no-op on native (iOS/Android)
- No platform-guard needed; Expo Router handles the conditional rendering

## Files Created
| File | Description |
|---|---|
| `apps/mobile/public/apple-touch-icon.png` | 1024×1024 branded HR icon served at `/apple-touch-icon.png` |
| `docs/CTO_SUMMARY_HOTFIX_001.md` | This document |

## Files Modified
| File | Change |
|---|---|
| `apps/mobile/app/_layout.tsx` | Added `Head` import from `expo-router/head`; injected `<link rel="apple-touch-icon">` |

## Files Left Unchanged
- `apps/mobile/assets/icon.png` ✓
- `apps/mobile/assets/adaptive-icon.png` ✓
- `apps/mobile/app.json` ✓

## Verification Result
| Check | Result |
|---|---|
| `./scripts/mobile-verify.sh` | PASS — typecheck + Expo export both pass |
| `./scripts/verify.sh` | PASS — API build, Prisma schema, web build all pass |
| `./scripts/security-review.sh` | PASS — 0 new vulnerabilities; accepted-risk entries unchanged |
| `git diff --check` | PASS — no whitespace issues |
| `sips -g pixelWidth/Height apple-touch-icon.png` | PASS — 1024×1024 |
| `find apps/mobile/dist -name "apple-touch-icon.png"` | PASS — `dist/apple-touch-icon.png` present after export |

## Issues Found
None.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — static asset only |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None — `<Head>` is web-only; native token storage unchanged |
| Dependency/advisory impact | No new packages added; mobile audit still 0 HIGH/CRITICAL |
| Secrets/logging check | No secrets or tokens involved |
| New endpoints protected | None — this is a static file served by nginx |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Expected Production Verification (post-deploy)
1. Open `https://mobilehr.eds-center.com/apple-touch-icon.png` — should display the branded HR icon
2. Remove old Home Screen shortcut from iPhone
3. Open `https://mobilehr.eds-center.com` in Safari → Share → Add to Home Screen
4. Preview should show the navy-blue "HR" icon, not the grey placeholder

## Recommended Commit Message
```
fix(mobile): add apple touch icon for iOS home screen

Add public/apple-touch-icon.png to the mobile web root so iOS
uses the branded HR icon when adding to Home Screen. Also declare
it explicitly via <Head> in the root layout (expo-router/head,
no-op on native). Fixes HOTFIX-001 grey fallback icon.
```
