# STEP Connect PWA

> **Domain:** Mobile
> **Production URL:** `https://mobilehr.eds-center.com`
> **First established:** v1.2.24 through v1.2.26
> **ADR:** [[ADR-025 STEP Connect PWA Branding and Standalone Delivery]]

---

## Product Identity

**STEP Connect** is the employee-facing mobile PWA. It is the HR Management System from the employee's point of view — an app for attendance, leave, calendar, and profile management.

| Surface | Name | URL | Audience |
|---|---|---|---|
| Mobile PWA | STEP Connect | `mobilehr.eds-center.com` | Employees (all roles) |
| Admin Web | HR Management | `hr.eds-center.com` | HR Admin, Managers |

These are two distinct product identities. The mobile app name "STEP Connect" communicates purpose to employees; it is not an internal system label.

---

## What STEP Connect Is

STEP Connect is delivered as a **Progressive Web App (PWA)** built with Expo Web (Expo Router, React Native Web). It is:

- **Not** a native iOS or Android app from the App Store
- **Not** a standalone React Native binary
- A web application that runs in Safari and can be added to the iPhone Home Screen

When launched from the Home Screen after "Add to Home Screen", it runs in **standalone mode**: no Safari URL bar, no Safari toolbar, full-screen.

When opened directly in Safari (not from the Home Screen), Safari's UI is visible. This is expected behaviour.

---

## Standalone Mode Requirements

For STEP Connect to run in standalone mode on iOS, all three of the following must be true:

1. **`manifest.json` is linked** via `<link rel="manifest" href="/manifest.json?v=...">` in `index.html`
2. **`manifest.json` contains** `"display": "standalone"`, `"scope": "/"`, `"start_url": "/"`
3. **User added via Home Screen**: the shortcut was created via Safari Share → Add to Home Screen (not pinned from Chrome, or opened directly)

Without `manifest.json` (pre-v1.2.24), iOS exits the standalone container when `router.replace()` changes the tab — the URL change causes iOS to re-evaluate scope against an undefined manifest, and it falls back to opening in Safari.

---

## Icon Identity

| Property | Value |
|---|---|
| Background | Solid `#1E3A8A` (dark royal blue) |
| Primary text | "STEP" — white, extra-bold |
| Divider | Thin white horizontal rule |
| Secondary text | "Connect" — white, regular weight |
| Rounded corners | Applied by iOS at render time (not baked in) |
| Current version | `?v=1.2.25` |
| Master icon content-length | 42973 bytes (apple-touch-icon.png) |

---

## Tab Navigation

STEP Connect uses a bottom navigation bar with 5 tabs:

| Tab | Thai label | Route |
|---|---|---|
| Home | หน้าแรก | `/home` |
| Calendar | ปฏิทิน | `/calendar` |
| Attendance | ลงเวลา | `/attendance` |
| Leave | การลา | `/leave` |
| Profile | โปรไฟล์ | `/profile` |

Navigation uses `router.replace()` (Expo Router). With the manifest scope set to `/`, all same-origin routes belong to the standalone session and iOS does not exit the container.

---

## Cache-Busting Strategy

iOS Safari and Cloudflare both use URL-based cache keys. When icons are updated in-place (same filename, new content), both caches continue serving stale content.

**Strategy:** append `?v=<version>` to all icon links and manifest link.

```html
<!-- index.html -->
<link rel="manifest" href="/manifest.json?v=1.2.25" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=1.2.25" />
```

```json
// manifest.json
{ "src": "/apple-touch-icon-180x180.png?v=1.2.25", "sizes": "180x180" }
```

**Rule:** increment the version string for every icon or manifest change. The version string is a cache-bust marker — it does not need to match the app release version.

---

## iOS Safari Limitations

| Limitation | Impact |
|---|---|
| Standalone mode requires Add to Home Screen | Opening in Safari directly always shows Safari UI |
| Icon cached at install time | Users must delete and re-add shortcut after icon changes |
| iOS < 16.4 has limited manifest support | Standalone chrome may vary; app still functions |
| No App Store presence | Users cannot find STEP Connect in the App Store |
| No service worker (current version) | No offline capability; future work |
| No native push notifications (current version) | Future work |

---

## Production Verification

After every deploy that touches icons, manifest, or routing, run the production SOP:

→ [[Mobile PWA Production Verification]]

Key checks:
- `curl -I "https://mobilehr.eds-center.com/apple-touch-icon.png?v=1.2.25"` → `content-length: 42973`
- On-device: Add to Home Screen → STEP Connect name and icon
- On-device: All 5 tabs stay in standalone (no Safari URL bar)

---

## Release History

| Version tag | Commit | Change |
|---|---|---|
| `v1.2.24-standalone-pwa-navigation-hotfix` | `7c51fe2` | Added `manifest.json`; fixed standalone tab navigation |
| `v1.2.25-step-connect-icon-rebrand` | `3731f01` | Rebranded icon and metadata to STEP Connect |
| `v1.2.26-step-connect-icon-cache-bust` | `c51ec4e` | Added `?v=1.2.25` cache-busting to all icon and manifest links |

---

## Related Notes

- [[ADR-025 STEP Connect PWA Branding and Standalone Delivery]]
- [[ADR-017 Mobile Expo Router]]
- [[ADR-024 Mobile Employee Self-Service v1.2.0 UI Refresh]]
- [[Mobile PWA Production Verification]]

## Related Docs

- `docs/CTO_SUMMARY_T084.md`
- `docs/CTO_SUMMARY_HOTFIX_010.md`
- `docs/CTO_SUMMARY_HOTFIX_011.md`
- `apps/mobile/public/manifest.json`
- `apps/mobile/public/index.html`

#mobile #pwa #standalone #step-connect #branding
