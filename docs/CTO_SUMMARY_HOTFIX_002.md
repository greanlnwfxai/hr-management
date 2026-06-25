# CTO Summary

## Step
HOTFIX-002 — Ensure Apple Touch Icon Appears in Static HTML

## Status
PASS

## Scope
Mobile web only (`apps/mobile`). No backend, database, auth, or session changes. Fixed the apple-touch-icon not appearing in the static HTML by adding `public/index.html` as a custom HTML template.

## Root Cause Analysis

### Why HOTFIX-001 failed
HOTFIX-001 added `<Head><link rel="apple-touch-icon" /></Head>` in `_layout.tsx` using `expo-router/head` (react-helmet-async). This is **JavaScript-injected at runtime** — iOS Safari reads `<link rel="apple-touch-icon">` from the raw HTML response *before* JS executes. If the tag isn't in the static HTML, iOS never sees it for Web Clip generation.

### How Expo generates HTML for `output: "single"` (SPA mode)

After deep inspection of `@expo/cli/build/src/`:

| File | Role |
|---|---|
| `export/exportApp.js` | Orchestrates the export |
| `start/server/webTemplate.js` | `createTemplateHtmlAsync` builds the HTML template |
| `export/favicon.js` | Injects `<link rel="icon">` via string replace on `</head>` |
| `start/server/metro/serializeHtml.js` | Injects CSS/JS into template |

`createTemplateHtmlAsync` → `getTemplateIndexHtmlAsync`:
1. **First**: checks `public/index.html` in the project root
2. **Fallback**: uses `@expo/cli/static/template/index.html`

Since no `public/index.html` existed, the built-in template was used — it has no apple-touch-icon tags.

**Note on `+html.tsx`:** The `+html.tsx` special file is only used by `renderStaticContent.js` → `getStaticRenderFunctionAsync`, which is invoked in `output: "server"` and `output: "static"` modes only. For `output: "single"` (this project's config), `+html.tsx` has no effect on the generated HTML. The `+html.tsx` file added in HOTFIX-001 is retained for forward compatibility.

## Fix

### `apps/mobile/public/index.html` (new)
Created a custom HTML template that mirrors the Expo built-in template (`@expo/cli/static/template/index.html`) with two apple-touch-icon `<link>` tags added to `<head>`:
```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="1024x1024" href="/apple-touch-icon.png" />
```

The `%LANG_ISO_CODE%` and `%WEB_TITLE%` placeholders are preserved — Expo substitutes them at export time from `app.json`.

### `apps/mobile/app/_layout.tsx` (already cleaned in HOTFIX-001)
No changes needed — the redundant `<Head>` injection was already removed.

## Files Created
| File | Description |
|---|---|
| `apps/mobile/public/index.html` | Custom HTML template — bakes apple-touch-icon into static output |
| `apps/mobile/app/+html.tsx` | Created in HOTFIX-001; retained for server/static output mode compatibility |
| `docs/CTO_SUMMARY_HOTFIX_002.md` | This document |

## Files Modified
| File | Change |
|---|---|
| `apps/mobile/app/_layout.tsx` | `Head` import and `<Head>` block removed (done in HOTFIX-001) |

## Files Left Unchanged
- `apps/mobile/assets/icon.png` ✓
- `apps/mobile/assets/adaptive-icon.png` ✓
- `apps/mobile/public/apple-touch-icon.png` ✓
- `apps/mobile/app.json` ✓

## Verification Result
| Check | Result |
|---|---|
| `./scripts/mobile-verify.sh` | PASS — typecheck + Expo export both pass |
| `./scripts/verify.sh` | PASS — API build, Prisma schema, web build all pass |
| `./scripts/security-review.sh` | PASS — 0 new vulnerabilities |
| `git diff --check` | PASS — no whitespace issues |
| `grep apple-touch dist/index.html` | PASS — 2 link tags present in static HTML |
| `find dist -name apple-touch-icon.png` | PASS — `dist/apple-touch-icon.png` present |
| `sips apple-touch-icon.png` | PASS — 1024×1024 |

### Confirmed static HTML output (`dist/index.html`)
```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="1024x1024" href="/apple-touch-icon.png" />
<link rel="icon" href="/favicon.ico" />
```

## Issues Found
- `+html.tsx` created in HOTFIX-001 has **no effect** on `output: "single"` HTML generation. The fix mechanism for SPA mode must go through `public/index.html`. `+html.tsx` is retained since it would apply if `web.output` is ever changed to `"static"` or `"server"`.

## Security Review

| Field | Assessment |
|---|---|
| Auth impact | None — HTML template only |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None — static link tag; JS token storage unchanged |
| Dependency/advisory impact | No new packages |
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
curl -sL https://mobilehr.eds-center.com/ | grep -i "apple-touch"
# Expected: two <link rel="apple-touch-icon"> tags in output
```
Then:
1. Remove old Home Screen shortcut from iPhone
2. Open `https://mobilehr.eds-center.com` in Safari → Share → Add to Home Screen
3. Preview should show the branded HR MOBILE icon

## Recommended Commit Message
```
fix(mobile): expose apple touch icon in static html

Add public/index.html as a custom Expo HTML template so the
apple-touch-icon link is baked into the static dist/index.html
at export time. For output:single SPA mode, Expo reads
public/index.html before the built-in template — the +html.tsx
approach only applies to output:server/static modes.

Fixes HOTFIX-002. iOS Add to Home Screen should now pick up
the branded HR MOBILE icon from the raw HTML response.
```
