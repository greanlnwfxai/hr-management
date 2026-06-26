# ADR-025 — STEP Connect PWA Branding and Standalone Delivery

**Status:** Accepted
**Date:** 2026-06-26
**Tasks:** T-084, HOTFIX-010, HOTFIX-011, T-085
**Related tags:** `v1.2.24-standalone-pwa-navigation-hotfix`, `v1.2.25-step-connect-icon-rebrand`, `v1.2.26-step-connect-icon-cache-bust`
**Implementation reference:** commits `7c51fe2`, `3731f01`, `c51ec4e`

---

## Context

The HR Management mobile app is delivered as an Expo Web PWA hosted at `https://mobilehr.eds-center.com`. Employees access it from iPhones by adding it to the Home Screen via Safari's "Add to Home Screen" flow.

By v1.2.0, the app was feature-complete (attendance, leave, calendar, profile, off-site requests) but was branded "HR Management" — an internal system name not meaningful to employees. The Home Screen icon used a legacy H-logo design.

Three separate production issues were addressed across three releases:

**v1.2.24 (HOTFIX-010):** Tab navigation exited the standalone container. Root cause: no `manifest.json` was present. Without an explicit scope, iOS re-evaluates the standalone session on every `router.replace()` call and may open the URL in Safari.

**v1.2.25 (T-084):** Complete icon and metadata rebrand to STEP Connect. New flat icon design with `#1E3A8A` navy background, bold white "STEP", thin divider, regular white "Connect".

**v1.2.26 (HOTFIX-011):** Cloudflare CDN and iOS Safari served the old HR Mobile icon after T-084 deploy. Root cause: icon filenames were unchanged, so both caches served stale content. Evidence: `cf-cache-status: HIT`, `age: 32080 s`, `content-length: 34203` (old, expected 42973).

---

## Decision

### Employee-Facing Mobile Identity

The employee-facing mobile PWA is named **STEP Connect**. The admin web retains the HR Management identity. These are two distinct product surfaces for two different user groups.

### Web App Manifest — Required for Standalone

`manifest.json` with `display: "standalone"`, `scope: "/"`, `start_url: "/"` is mandatory. Without it, iOS cannot maintain the standalone container across `router.replace()` tab navigation. The manifest is linked via `<link rel="manifest">` in `index.html`.

Both `apple-mobile-web-app-capable` and `mobile-web-app-capable` meta tags are required.

### Icon Design

Flat, legible design:
- Background: solid `#1E3A8A` (dark royal blue)
- "STEP" — white, extra-bold, large
- Thin white horizontal divider
- "Connect" — white, regular weight
- No baked rounded corners — OS applies the mask
- Renders cleanly at 1024, 180, 167, 152, 120 px

### Versioned Icon URLs

All `apple-touch-icon` links and `manifest.json` icon `src` entries carry `?v=1.2.25`. This forces URL-keyed caches (Cloudflare, iOS Safari) to fetch fresh content after deploy.

**Rule:** every future icon or manifest change must increment the version string.

---

## Consequences

Positive:
- "STEP Connect" is the name and icon employees see on their Home Screen
- Standalone PWA works correctly: no Safari URL bar or bottom toolbar
- Tab navigation stays inside the standalone container
- Cache-busting works without CDN token purge operations

Accepted tradeoffs:
- Users must delete the old shortcut and re-add after any icon or manifest change
- Bare PNG URLs without the query string continue to serve old content until Cloudflare TTL expires
- iOS < 16.4 has limited manifest support; standalone chrome behaviour may vary (app functions correctly)
- No service worker; offline capability is future work

---

## Alternatives Considered

### 1. Rename icon files instead of query-string versioning

Would work, but requires updating more references and risks breakage if any consumer hard-codes the filename. Query-string versioning is minimal-diff and universally supported by CDNs.

### 2. Manual Cloudflare cache purge after each deploy

Works, but requires a manual step and Cloudflare API credentials. Versioned URLs are self-sufficient and repeatable without access to CDN settings.

### 3. Keep "HR Management" as mobile name

Rejected. "HR Management" is an internal system label. "STEP Connect" is an employee-facing identity that communicates purpose and is distinct from the admin web interface.

---

## Security Considerations

- Auth impact: none — no endpoints added or changed
- Mobile security impact: none — manifest and icon metadata; no change to token storage or API calls
- `?v=1.2.25` is a static string; no dynamic data is exposed via the query parameter
- Risk level: LOW

---

## Operational Notes

- Production URL: `https://mobilehr.eds-center.com`
- Icon content-length after rebrand: 42973 bytes (apple-touch-icon.png at v1.2.25)
- Verify with: `curl -I "https://mobilehr.eds-center.com/apple-touch-icon.png?v=1.2.25"`
- Full production verification SOP: [[Mobile PWA Production Verification]]
- On-device iPhone testing is mandatory after any icon, manifest, or standalone change

---

## Related Notes

- [[ADR-017 Mobile Expo Router]]
- [[ADR-024 Mobile Employee Self-Service v1.2.0 UI Refresh]]
- [[STEP Connect PWA]]
- [[Mobile PWA Production Verification]]

#adr #mobile #pwa #standalone #branding #step-connect
