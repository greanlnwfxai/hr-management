# CTO Summary

## Step
HOTFIX-010 — Preserve PWA Standalone Navigation Across Mobile Tabs

## Status
PASS (local verification) — **requires on-device confirmation after production deploy**

---

## Root Cause

The PWA was served without a Web App Manifest (`manifest.json`). Without a manifest, iOS does not have a defined `scope` for the standalone container. When `router.replace()` changes the URL from `/home` to `/calendar` (or any other tab), iOS re-evaluates whether the new URL belongs to the standalone session. Without an explicit scope, iOS may exit the standalone container and open the URL in Safari.

The standard remedy is a manifest with `display: "standalone"`, `scope: "/"`, and `start_url: "/"`, which tells iOS to keep all navigation within the origin inside the app container.

**Important**: The exact internal mechanism by which iOS evaluates scope on client-side History API changes is not publicly documented and may vary by iOS version. This fix applies the correct standard configuration; on-device verification after deploy is required to confirm the fix holds in production.

---

## Navigation Pattern — Before

| Layer | Mechanism |
|-------|-----------|
| No `manifest.json` | iOS has no defined PWA scope |
| `apple-mobile-web-app-capable` only | Legacy meta-only mode; iOS pins to initial URL heuristically |
| `MobileBottomNav` calls `router.replace(href)` | History API path change; iOS evaluates new URL against undefined scope → may exit standalone |
| `apple-mobile-web-app-title` | "HR Management" |
| `mobile-web-app-capable` | Missing |

## Navigation Pattern — After

| Layer | Mechanism |
|-------|-----------|
| `manifest.json` with `scope: "/"`, `display: "standalone"` | iOS has an explicit scope covering all routes |
| `apple-mobile-web-app-capable` + `mobile-web-app-capable` | Both meta tags present |
| `MobileBottomNav` calls `router.replace(href)` | **Unchanged** — already correct JS navigation |
| `apple-mobile-web-app-title` | Updated to "STEP Connect" |

---

## Files Created

| File | Purpose |
|------|---------|
| `apps/mobile/public/manifest.json` | Web App Manifest: `display: standalone`, `scope: /`, `start_url: /`, `theme_color: #0d1e4a`, icons |

## Files Modified

| File | Change |
|------|--------|
| `apps/mobile/public/index.html` | Added `<link rel="manifest" href="/manifest.json">`, added `<meta name="mobile-web-app-capable" content="yes">`, changed `apple-mobile-web-app-title` from `HR Management` to `STEP Connect` |

---

## PWA Standalone Behavior

| Meta / Config | Before | After |
|---|---|---|
| `apple-mobile-web-app-capable` | ✅ present | ✅ preserved |
| `mobile-web-app-capable` | ❌ missing | ✅ added |
| `apple-mobile-web-app-title` | `HR Management` | ✅ `STEP Connect` |
| `apple-mobile-web-app-status-bar-style` | ✅ default | ✅ preserved |
| `apple-touch-icon` links (5 sizes) | ✅ present | ✅ preserved |
| `leaflet.css` link | ✅ present | ✅ preserved |
| `manifest.json` | ❌ none | ✅ added with scope & standalone |
| `display: standalone` in manifest | ❌ N/A | ✅ present |
| `scope: "/"` in manifest | ❌ N/A | ✅ present |
| `start_url: "/"` in manifest | ❌ N/A | ✅ present |

**dist propagation confirmed:**
- `dist/manifest.json` exists ✅
- `dist/index.html` contains `<link rel="manifest" href="/manifest.json">` ✅
- `dist/index.html` shows `apple-mobile-web-app-title` = `STEP Connect` ✅
- `dist/index.html` shows `mobile-web-app-capable` ✅

---

## Verification Results

| Script | Result |
|--------|--------|
| `./scripts/mobile-verify.sh` | PASS (TypeScript typecheck + Expo web export) |
| `./scripts/verify.sh` | PASS (API build + Prisma validate + Web build) |
| `./scripts/security-review.sh` | PASS |

**Source navigation audit:**
```
grep -Rn "window.location|location.href|target=\"_blank\"|https://mobilehr.eds-center.com" apps/mobile/app apps/mobile/src apps/mobile/public
→ 0 matches

grep -Rn "href=" apps/mobile/app apps/mobile/src
→ apps/mobile/app/index.tsx:16  <Redirect href={...}>   ← uses router.replace() internally, not <a>
→ apps/mobile/src/components/GeofenceMapModal.web.tsx:198  OSM attribution string ← static text, not navigation
```

No problematic `<a href>`, `window.location`, or absolute-URL navigation found in source.

---

## Manual iPhone Verification Checklist

Run after production deploy. Users must re-add the app to the Home Screen to pick up the new manifest.

```
[ ] 1. Delete old "HR Management" / "STEP Connect" shortcut from iPhone Home Screen if present
[ ] 2. Open Safari → https://mobilehr.eds-center.com
[ ] 3. Tap Share → Add to Home Screen → confirm name shows "STEP Connect"
[ ] 4. Open STEP Connect from the Home Screen icon
[ ] 5. Confirm: Home screen loads with NO Safari URL bar and NO Safari bottom toolbar
[ ] 6. Tap ปฏิทิน (Calendar) bottom tab
[ ]    Confirm: still NO Safari URL bar / toolbar
[ ] 7. Tap ลงเวลา (Attendance) bottom tab
[ ]    Confirm: still NO Safari URL bar / toolbar
[ ] 8. Tap การลา (Leave) bottom tab
[ ]    Confirm: still NO Safari URL bar / toolbar
[ ] 9. Tap โปรไฟล์ (Profile) bottom tab
[ ]    Confirm: still NO Safari URL bar / toolbar
[ ] 10. Tap หน้าแรก (Home) tab to return
[ ]    Confirm: still standalone
```

---

## Limitations

1. **On-device verification required.** The three CI scripts (`mobile-verify.sh`, `verify.sh`, `security-review.sh`) verify build correctness, not iOS standalone behavior. Standalone mode can only be confirmed on a real iPhone after production deploy.

2. **Old shortcuts must be re-added.** iOS caches the PWA metadata at install time. Existing shortcuts created before this deploy will not pick up the new manifest. Users must delete the old shortcut and re-add via Safari Share → Add to Home Screen.

3. **iOS version variance.** Manifest-based scope handling was improved in iOS 16.4. Earlier iOS versions have limited manifest support and may still show partial browser UI on some navigation. The app will still function correctly; only the standalone chrome behavior varies.

4. **No service worker.** This fix relies on the manifest scope alone. A service worker would provide stronger offline and scope enforcement, but is out of scope for this hotfix.

---

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | None |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | PWA manifest does not affect token storage or API calls |
| Dependency/advisory impact | No new packages added |
| Secrets/logging check | None |
| New endpoints protected | N/A — no new endpoints |
| Risk level | LOW |
| Security decision | PASS |

---

## Issues Found
None.

## Risk
Low

## Decision
PASS (pending on-device verification)

## Next Step
Deploy to production, run manual iPhone verification checklist.

## Recommended Commit Message
```
fix(mobile): keep tab navigation inside standalone PWA
```
