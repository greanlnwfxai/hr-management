# CTO Summary

## Step
HOTFIX-011 — Cache-bust STEP Connect PWA Icon Links

## Status
PASS

---

## Root Cause

T-084 regenerated the icon PNG files in-place (same filenames, new content). Cloudflare's CDN cache and iOS Safari's icon cache both key on URL — not content. Because the URLs did not change, both caches continued to serve the old HR Mobile icon after redeploy.

**Cloudflare cache evidence (post-T-084 deploy):**

| Header | Value |
|--------|-------|
| URL | `https://mobilehr.eds-center.com/apple-touch-icon.png` |
| `content-length` | 34203 bytes (old icon) |
| `cf-cache-status` | **HIT** |
| `age` | 32080 s (~8.9 hours) |
| `expires` | Sat, 27 Jun 2026 00:30:00 GMT |
| Expected size (new icon) | 42973 bytes |

Cloudflare served the stale 34 kB asset well within its TTL; the new 43 kB STEP Connect icon was never fetched. iOS Safari also holds `apple-touch-icon` URLs in its own internal cache, which persists across page visits until the URL changes.

---

## Cache-Busting Strategy

Append `?v=1.2.25` to every icon and manifest URL in the HTML `<head>` and inside `manifest.json` icon entries. This changes the URLs seen by Cloudflare and Safari without requiring filename renames or CDN cache purge tokens.

**Why query-string versioning works here:**
- Cloudflare treats `?v=1.2.25` as a distinct cache key → forces an origin fetch on first request after deploy.
- iOS Safari sees a new `href` on `<link rel="apple-touch-icon">` → discards its cached copy when the user re-visits the page to add it to the Home Screen.
- `manifest.json` itself is fetched via its new URL `?v=1.2.25`, so the browser picks up the updated icon `src` values atomically.

**Limitation:** Static PNG files served directly (not via HTML head) — e.g., a user pasting `/apple-touch-icon.png` bare into Safari — will still hit the Cloudflare cache until its TTL expires or a manual cache purge is performed. The Add to Home Screen flow goes through the HTML head, so this is not a concern for the targeted use case.

---

## Files Modified

| File | Change |
|------|--------|
| `apps/mobile/public/index.html` | `manifest.json` → `manifest.json?v=1.2.25`; all 5 `apple-touch-icon` hrefs → `…png?v=1.2.25` |
| `apps/mobile/public/manifest.json` | All 4 icon `src` entries → `…png?v=1.2.25` |

No PNG binary files changed. No backend, DB, auth, or Docker changes.

---

## Exact Changes

### `apps/mobile/public/index.html` (lines 26–35 after change)

```html
<link rel="manifest" href="/manifest.json?v=1.2.25" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="STEP Connect" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png?v=1.2.25" />
<link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-167x167.png?v=1.2.25" />
<link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png?v=1.2.25" />
<link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120x120.png?v=1.2.25" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=1.2.25" />
```

### `apps/mobile/public/manifest.json` icons array (after change)

```json
"icons": [
  { "src": "/apple-touch-icon-120x120.png?v=1.2.25", "sizes": "120x120", "type": "image/png" },
  { "src": "/apple-touch-icon-152x152.png?v=1.2.25", "sizes": "152x152", "type": "image/png" },
  { "src": "/apple-touch-icon-167x167.png?v=1.2.25", "sizes": "167x167", "type": "image/png" },
  { "src": "/apple-touch-icon-180x180.png?v=1.2.25", "sizes": "180x180", "type": "image/png" }
]
```

---

## Verification Results

| Check | Result |
|-------|--------|
| `git diff --check` | PASS — no whitespace errors |
| `grep "apple-touch-icon.*v=1.2.25" index.html manifest.json` | PASS — 9 matches (5 in index.html, 4 in manifest.json) |
| `grep "manifest.json?v=1.2.25" index.html` | PASS — 1 match |
| `grep "STEP Connect" index.html manifest.json app.json` | PASS — 6 matches |
| `dist/index.html` propagation | PASS — all `?v=1.2.25` strings present in rebuilt dist |
| `./scripts/mobile-verify.sh` | PASS |
| `./scripts/verify.sh` | PASS |
| `./scripts/security-review.sh` | PASS |

---

## Production Redeploy Checklist

```
[ ] 1. Commit and tag:
       git add apps/mobile/public/index.html apps/mobile/public/manifest.json
       git commit -m "fix(mobile): cache-bust STEP Connect PWA icons"
       git tag v1.2.26-hotfix-011

[ ] 2. Run Expo web export to regenerate dist/:
       cd apps/mobile && npx expo export --platform web

[ ] 3. Upload apps/mobile/dist/ to production hosting (Cloudflare Pages / nginx / S3).

[ ] 4. Optional but recommended: purge Cloudflare cache for the mobile origin
       - Dashboard → Caching → Cache Purge → Purge Everything
       (or target: /apple-touch-icon*.png, /manifest.json, /index.html)

[ ] 5. Confirm the new index.html is live:
       curl -s https://mobilehr.eds-center.com/ | grep "manifest.json?v=1.2.25"
       curl -s https://mobilehr.eds-center.com/ | grep "apple-touch-icon.*v=1.2.25"

[ ] 6. Confirm Cloudflare now fetches fresh icons (cf-cache-status: MISS on first hit):
       curl -I "https://mobilehr.eds-center.com/apple-touch-icon.png?v=1.2.25"
       → Expect: cf-cache-status: MISS  content-length: 42973
```

---

## iPhone Add to Home Screen Retest Checklist

Run after production redeploy completes.

```
[ ] 1. Delete the old STEP Connect / HR Management shortcut from iPhone Home Screen.
[ ] 2. Open Safari → https://mobilehr.eds-center.com
[ ] 3. Hard-reload: hold the refresh button → Reload Without Content Blockers (or clear cache).
[ ] 4. Tap Share → Add to Home Screen.
[ ] 5. Confirm the icon preview shows the new STEP Connect icon
       (dark royal blue background, bold "STEP", thin divider, "Connect").
[ ] 6. Confirm the name shown is "STEP Connect".
[ ] 7. Tap Add. Open the new shortcut.
[ ] 8. Confirm standalone mode (no Safari URL bar).
[ ] 9. Tap all bottom tabs (ปฏิทิน, ลงเวลา, การลา, โปรไฟล์) and confirm standalone is preserved.
```

---

## Risks / Limitations

| Risk | Mitigation |
|------|------------|
| Cloudflare may still cache bare `/apple-touch-icon.png` (no query string) from old in-memory hits | Optional manual cache purge; bare URL is not referenced from HTML after this fix |
| Users who added the old shortcut will not see the new icon until they delete and re-add | Expected behaviour — iOS caches icons at install time; instruct users to re-add |
| Future icon updates must increment the version string (e.g., `?v=1.2.26`) | Add to release checklist |
| Query strings on PNG assets may confuse certain CDN rules that strip query parameters | Verify with `curl -I "…/apple-touch-icon.png?v=1.2.25"` — should return HTTP 200 |

---

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | None |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None — `?v=1.2.25` is a static cache-bust parameter; no dynamic data exposed |
| Dependency/advisory impact | No new packages |
| Secrets/logging check | None |
| New endpoints protected | N/A |
| Risk level | LOW |
| Security decision | PASS |

---

## Issues Found
None beyond the root cause (stale Cloudflare cache on unchanged icon URLs).

## Risk
Low

## Decision
PASS

## Next Step
Commit, export dist, deploy to production, run iPhone Add to Home Screen retest checklist.

## Recommended Commit Message
```
fix(mobile): cache-bust STEP Connect PWA icons
```
