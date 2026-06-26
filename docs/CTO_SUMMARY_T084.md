# CTO Summary

## Step
T-084 — Rebrand Mobile App Icon and PWA Metadata to STEP Connect

## Status
PASS

---

## Scope
Replace all mobile/PWA icon assets and metadata branding with the STEP Connect identity:
- Rewrite icon generation script to produce new STEP Connect design
- Regenerate all 7 icon assets (master + adaptive + 5 touch-icon sizes)
- Update `app.json` app name, adaptive icon background colour, and permission strings
- `dist/index.html` `<title>` auto-updates from `app.json` `name` on next export

---

## Files Created
None.

## Files Modified

| File | Change |
|------|--------|
| `scripts/generate-icon.mjs` | Replaced old H-logo/swoosh/HR Mobile SVG with flat `#1E3A8A` background, bold "STEP", thin white divider, regular "Connect". Removed `dominant-baseline` (unreliable in librsvg when a divider separates two text blocks). |
| `apps/mobile/app.json` | `name`: `HR Management` → `STEP Connect`; `android.adaptiveIcon.backgroundColor`: `#0f172a` → `#1E3A8A`; iOS/location permission strings: `HR Management` → `STEP Connect` |
| `apps/mobile/assets/icon.png` | Regenerated — 1024×1024 STEP Connect master icon |
| `apps/mobile/assets/adaptive-icon.png` | Regenerated — 1024×1024 transparent foreground (composited over `#1E3A8A` at Android runtime) |
| `apps/mobile/public/apple-touch-icon.png` | Regenerated — 1024×1024 (PWA full-res) |
| `apps/mobile/public/apple-touch-icon-180x180.png` | Regenerated — 180×180 |
| `apps/mobile/public/apple-touch-icon-167x167.png` | Regenerated — 167×167 |
| `apps/mobile/public/apple-touch-icon-152x152.png` | Regenerated — 152×152 |
| `apps/mobile/public/apple-touch-icon-120x120.png` | Regenerated — 120×120 |

---

## Icon Design

| Property | Value |
|----------|-------|
| Background | Solid `#1E3A8A` (dark royal blue) |
| Primary text | "STEP" — white, extra-bold (800), font-size 230, letter-spacing 6 |
| Divider | Thin white rule (500 px wide, stroke-width 5, opacity 0.80) |
| Secondary text | "Connect" — white, regular (400), font-size 158 |
| Rounded corners | None baked in (OS applies mask at render time) |
| Layout | Vertically centred (content span 338–687 px; centre = 512) |
| Safe zone | All elements ≥ 262 px from edge; within iOS 87 px / Android 174 px margins |

**Visual verification confirmed at both 1024×1024 and 120×120:**
- Background: dark royal blue ✅
- "STEP": large, bold, prominent ✅
- Divider: clearly visible at full size; subtle at 120px ✅
- "Connect": regular weight, clearly readable at both sizes ✅
- No gradients, swoosh, or 3D effects ✅

---

## `app.json` Metadata Changes

| Field | Before | After |
|-------|--------|-------|
| `expo.name` | HR Management | STEP Connect |
| `android.adaptiveIcon.backgroundColor` | `#0f172a` | `#1E3A8A` |
| iOS `NSLocationWhenInUseUsageDescription` | HR Management … | STEP Connect … |
| `expo-location` `locationWhenInUsePermission` | HR Management … | STEP Connect … |
| `slug` | hr-mobile | hr-mobile (unchanged) |
| `bundleIdentifier` / `package` | unchanged | unchanged |

**`dist/index.html` title:**
`%WEB_TITLE%` in `public/index.html` is substituted from `app.json name` during Expo export.
Confirmed: `<title>STEP Connect</title>` ✅

---

## Verification Result

| Check | Result |
|-------|--------|
| `node scripts/generate-icon.mjs` | PASS — icon.png + adaptive-icon.png generated |
| `node scripts/generate-touch-icons.mjs` | PASS — 5 touch-icon sizes generated |
| `sips` dimensions (7 files) | PASS — all correct (1024/1024/1024/180/167/152/120) |
| `grep "HR Mobile" source` | PASS — 0 matches |
| `grep "STEP Connect" key files` | PASS — present in manifest.json, index.html, app.json |
| `dist/index.html <title>` | PASS — `STEP Connect` |
| `./scripts/mobile-verify.sh` | PASS |
| `./scripts/verify.sh` | PASS |
| `./scripts/security-review.sh` | PASS |

---

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | None — no endpoints changed |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None — icon and metadata only; no change to token storage or API calls |
| Dependency/advisory impact | `sharp` already installed in `scripts/node_modules`; `npm install` in scripts/ had 0 vulnerabilities |
| Secrets/logging check | None |
| New endpoints protected | N/A |
| Risk level | LOW |
| Security decision | PASS |

---

## Issues Found
None.

## Risk
Low

## Decision
PASS

## Next Step
Deploy to production (`npm run export` + upload `apps/mobile/dist/` to hosting). Users must re-add the Home Screen shortcut to see the new icon.

## Recommended Commit Message
```
feat(mobile): rebrand app icon and metadata to STEP Connect
```
