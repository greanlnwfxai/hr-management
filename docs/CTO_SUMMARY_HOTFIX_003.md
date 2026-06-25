# CTO Summary

## Step
HOTFIX-003 — Add iOS-specific Apple Touch Icon Sizes

## Status
PASS

## Scope
Mobile web only (`apps/mobile/public/`). No backend, database, auth, or session changes. Generated four iOS-standard sized PNG variants of the branded icon and declared them explicitly in the static HTML template.

## Problem
iOS Web Clip icon selection ignores the generic `apple-touch-icon.png` when no size-matched variant is declared. Safari on iPhone picks the best match from explicit `sizes=` attributes; without them it falls back to the legacy OS-level screenshot, which was still the old grey "H" placeholder from before HOTFIX-001.

## Fix

### 1. Generation script — `scripts/generate-touch-icons.mjs` (new)
Self-contained ESM script using the existing `scripts/node_modules/sharp`:
- Reads `apps/mobile/assets/icon.png` (1024×1024 branded HR MOBILE icon)
- Outputs four resized PNGs to `apps/mobile/public/`

```
apple-touch-icon-180x180.png   180×180   (iPhone retina, primary)
apple-touch-icon-167x167.png   167×167   (iPad Pro retina)
apple-touch-icon-152x152.png   152×152   (iPad retina)
apple-touch-icon-120x120.png   120×120   (iPhone non-retina)
```

Invoke: `node scripts/generate-touch-icons.mjs`

### 2. `apps/mobile/public/index.html` (updated)
Replaced the two generic links with explicit sized links + three PWA meta tags:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="HR Management" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png" />
<link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-167x167.png" />
<link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png" />
<link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120x120.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

The PWA meta tags declare this as a standalone web app (`apple-mobile-web-app-capable`) and set the title and status bar style for when it runs from the Home Screen.

## Files Created
| File | Description |
|---|---|
| `scripts/generate-touch-icons.mjs` | Generation script (sharp, reads `assets/icon.png`) |
| `apps/mobile/public/apple-touch-icon-180x180.png` | 180×180 PNG — iPhone retina |
| `apps/mobile/public/apple-touch-icon-167x167.png` | 167×167 PNG — iPad Pro retina |
| `apps/mobile/public/apple-touch-icon-152x152.png` | 152×152 PNG — iPad retina |
| `apps/mobile/public/apple-touch-icon-120x120.png` | 120×120 PNG — iPhone non-retina |

## Files Modified
| File | Change |
|---|---|
| `apps/mobile/public/index.html` | Replaced 2 generic links with 5 explicit links + 3 PWA meta tags |

## Files Left Unchanged
- `apps/mobile/assets/icon.png` ✓ (read-only source)
- `apps/mobile/assets/adaptive-icon.png` ✓
- `apps/mobile/public/apple-touch-icon.png` ✓ (generic fallback retained)
- `apps/mobile/app.json` ✓
- No root `package.json` or `package-lock.json` created ✓

## Verification Result
| Check | Result |
|---|---|
| `git diff --check` | PASS — no whitespace issues |
| `./scripts/mobile-verify.sh` | PASS — typecheck + Expo export pass |
| `./scripts/verify.sh` | PASS — API build, Prisma schema, web build pass |
| `./scripts/security-review.sh` | PASS — 0 new vulnerabilities |
| `grep apple-touch dist/index.html` | PASS — all 5 link tags present in static HTML |
| `find dist -name "apple-touch-icon*.png"` | PASS — 5 files present in dist/ |
| `sips 180x180` | PASS — 180×180 |
| `sips 167x167` | PASS — 167×167 |
| `sips 152x152` | PASS — 152×152 |
| `sips 120x120` | PASS — 120×120 |

### Confirmed `dist/index.html` head
```html
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png" />
<link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-167x167.png" />
<link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png" />
<link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120x120.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="icon" href="/favicon.ico" />
```

## Issues Found
None.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — static PNG assets only |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None — `apple-mobile-web-app-capable` enables standalone mode but does not change token storage or API call behavior |
| Dependency/advisory impact | No new packages; `sharp` already audited (0 vulnerabilities) |
| Secrets/logging check | None |
| New endpoints protected | None |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Expected Production Verification (post-deploy)
```bash
# Confirm sized icons are served
curl -I https://mobilehr.eds-center.com/apple-touch-icon-180x180.png
# Expected: content-type: image/png

# Confirm HTML contains sized links
curl -sL https://mobilehr.eds-center.com/ | grep -i "apple-touch"
# Expected: 5 link tags with sizes= attributes
```
Then:
1. **Clear Cloudflare cache** for `/apple-touch-icon*.png` paths (important — CF was caching stale responses)
2. Remove old Home Screen shortcut from iPhone
3. Open `https://mobilehr.eds-center.com` in Safari → Share → Add to Home Screen
4. Preview should show the branded HR MOBILE icon at 180×180

## Recommended Commit Message
```
fix(mobile): add iOS sized apple touch icons

Generate 180/167/152/120px variants from assets/icon.png via
scripts/generate-touch-icons.mjs. Update public/index.html
to declare explicit sizes= links so iOS picks the correct icon
size instead of falling back. Add apple-mobile-web-app-* meta
tags for standalone PWA behaviour.
```
