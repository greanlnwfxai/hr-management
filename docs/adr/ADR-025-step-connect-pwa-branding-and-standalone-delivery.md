# ADR-025 — STEP Connect PWA Branding and Standalone Delivery

**Status:** Accepted
**Date:** 2026-06-26
**Tasks:** T-084, HOTFIX-010, HOTFIX-011, T-085
**Supersedes:** —
**Related:** ADR-017 Mobile Expo Router, ADR-024 Mobile Self-Service v1.2.0 UI Refresh

---

## Context

The HR Management mobile app is delivered as an Expo Web PWA hosted at `https://mobilehr.eds-center.com`. Employees access it from iPhones by adding it to the Home Screen via Safari's "Add to Home Screen" flow.

By v1.2.0, the app was feature-complete (attendance, leave, calendar, profile, off-site requests) but was branded "HR Management" — an internal system name not meaningful to employees. The Home Screen icon was based on a legacy H-logo design.

Two separate iOS/PWA issues also surfaced in production:

1. **Standalone navigation breaking** — After HOTFIX-010 trigger: tapping bottom tabs (ปฏิทิน, ลงเวลา, etc.) caused iOS to exit the standalone container and open the URL in Safari, because no `manifest.json` was present. Without an explicit `scope`, iOS cannot determine whether a new URL belongs to the standalone session.

2. **Cloudflare icon cache** — After T-084 regenerated the icon PNG files in-place (same filenames), Cloudflare's CDN and iOS Safari continued serving the old HR Mobile icon. Evidence: `cf-cache-status: HIT`, `age: 32080`, `content-length: 34203` (old) vs. `42973` (new STEP Connect icon). URL-keyed caches do not detect content changes.

---

## Decision

### 1. STEP Connect as Employee-Facing Mobile Identity

The employee-facing mobile PWA is named **STEP Connect**. The admin web at `hr.eds-center.com` retains the HR Management identity.

Metadata updated:
- `app.json` `expo.name` → `STEP Connect`
- `apple-mobile-web-app-title` in `index.html` → `STEP Connect`
- iOS permission strings → reference `STEP Connect`

### 2. Icon Design — Flat, Legible, Brandable

The STEP Connect icon uses a flat design optimised for PWA/iOS rendering:

| Property | Value |
|---|---|
| Background | Solid `#1E3A8A` (dark royal blue) |
| Primary text | "STEP" — white, extra-bold (800), font-size 230, letter-spacing 6 |
| Divider | Thin white rule, 500 px wide, opacity 0.80 |
| Secondary text | "Connect" — white, regular (400), font-size 158 |
| Rounded corners | None baked in — OS applies mask at render time |
| Safe zone | All elements ≥ 262 px from 1024 px edge |

This avoids SVG `dominant-baseline` attributes that are unreliable in librsvg when a divider separates two text blocks. The flat design renders cleanly at all required sizes (1024, 180, 167, 152, 120 px).

### 3. Web App Manifest — Standalone Delivery

`apps/mobile/public/manifest.json` is added with:

```json
{
  "name": "STEP Connect",
  "short_name": "STEP Connect",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "theme_color": "#0d1e4a",
  "background_color": "#0d1e4a"
}
```

`<link rel="manifest" href="/manifest.json?v=1.2.25">` is added to `index.html`.

`display: standalone` suppresses the Safari URL bar and bottom toolbar when the app is launched from the Home Screen. `scope: "/"` tells iOS that all same-origin routes belong to the standalone session — preventing iOS from exiting the container on `router.replace()` tab navigation.

`mobile-web-app-capable` meta tag is also added alongside the existing `apple-mobile-web-app-capable`.

### 4. Versioned Icon URLs for Cache-Busting

All `apple-touch-icon` links and `manifest.json` icon `src` entries use `?v=1.2.25` query strings:

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=1.2.25" />
```

```json
{ "src": "/apple-touch-icon-180x180.png?v=1.2.25", "sizes": "180x180" }
```

This forces Cloudflare to treat the new URLs as distinct cache keys (cache MISS on first request after deploy) and instructs iOS Safari to discard its cached copy when the user visits the page to add to Home Screen.

**Rule:** every future icon change must increment the version string (e.g., `?v=1.2.26`).

---

## Consequences

**Positive:**
- Employees see "STEP Connect" on their Home Screen — a meaningful product name
- Standalone PWA works correctly: no Safari URL bar or bottom toolbar after launch
- Tab navigation stays inside the standalone container on all tabs
- Cloudflare cache is busted reliably without requiring manual CDN purge tokens
- Icon design renders correctly at all required iOS sizes

**Negative / Trade-offs:**
- Users must delete the old Home Screen shortcut and re-add after any icon or manifest change. iOS caches PWA metadata at install time.
- Bare PNG URLs (without `?v=1.2.25`) continue to serve the old icon from Cloudflare until its TTL expires. Only the Add to Home Screen flow goes through the HTML head — so this is not a concern for the targeted use case.
- iOS standalone scope handling was improved in iOS 16.4. Earlier iOS versions have limited manifest support and may show partial browser UI on some navigation. The app functions correctly regardless; only standalone chrome behaviour varies.
- No service worker is included. The manifest scope provides standalone delivery; a service worker would provide offline capability (future work).

---

## Related Files

| File | Role |
|---|---|
| `apps/mobile/public/manifest.json` | Web App Manifest |
| `apps/mobile/public/index.html` | `<link rel="manifest">`, `apple-touch-icon` links |
| `apps/mobile/public/apple-touch-icon*.png` | PWA icon assets (5 sizes) |
| `apps/mobile/assets/icon.png` | Master icon (1024×1024) |
| `apps/mobile/assets/adaptive-icon.png` | Android adaptive icon |
| `apps/mobile/app.json` | App name, permissions, adaptive icon colour |
| `scripts/generate-icon.mjs` | Icon generation script |
| `docs/CTO_SUMMARY_T084.md` | T-084 icon rebrand summary |
| `docs/CTO_SUMMARY_HOTFIX_010.md` | HOTFIX-010 standalone navigation fix |
| `docs/CTO_SUMMARY_HOTFIX_011.md` | HOTFIX-011 icon cache-bust summary |

---

## See Also

- ADR-017 Mobile Expo Router and Web-Compatible Shell
- ADR-024 Mobile Employee Self-Service v1.2.0 UI Refresh
