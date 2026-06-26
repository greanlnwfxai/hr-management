# Mobile PWA Production Verification

> **Applies to:** STEP Connect PWA at `https://mobilehr.eds-center.com`
> **First established:** v1.2.26-step-connect-icon-cache-bust
> **ADR reference:** [[ADR-025 STEP Connect PWA Branding and Standalone Delivery]]

---

## When to Run This SOP

Run after every release that changes any of the following:
- Icon PNG files
- `manifest.json`
- `index.html` `<head>` metadata
- App name or branding
- Tab navigation or routing

Also run after any production redeploy (Portainer pull, Docker restart) that touches the mobile service.

---

## Step 1 — Portainer Pull and Redeploy

1. Login to Portainer
2. Navigate to the `mobile` service (or `web` stack if mobile is co-deployed)
3. Pull latest image
4. Redeploy / recreate container
5. Wait for container status: **running / healthy**

---

## Step 2 — Verify Manifest

Confirm the manifest is live and contains the expected icon version:

```bash
curl -sL "https://mobilehr.eds-center.com/manifest.json?v=1.2.25" | python3 -m json.tool
```

Expected output (key fields):
```json
{
  "name": "STEP Connect",
  "short_name": "STEP Connect",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "icons": [
    { "src": "/apple-touch-icon-120x120.png?v=1.2.25", "sizes": "120x120" },
    { "src": "/apple-touch-icon-152x152.png?v=1.2.25", "sizes": "152x152" },
    { "src": "/apple-touch-icon-167x167.png?v=1.2.25", "sizes": "167x167" },
    { "src": "/apple-touch-icon-180x180.png?v=1.2.25", "sizes": "180x180" }
  ]
}
```

Checklist:
- [ ] `display` is `standalone`
- [ ] `scope` is `/`
- [ ] `start_url` is `/`
- [ ] All icon `src` values include `?v=1.2.25` (or current version)

---

## Step 3 — Verify Icon (Cloudflare Cache-Bust)

Confirm the new icon is being served (not old cached content):

```bash
curl -I "https://mobilehr.eds-center.com/apple-touch-icon.png?v=1.2.25"
```

Expected response headers:

| Header | Expected value |
|--------|----------------|
| `HTTP/2` | `200` |
| `content-length` | `42973` (STEP Connect icon at v1.2.25) |
| `cf-cache-status` | `MISS` on first request after deploy; `HIT` on subsequent |
| `content-type` | `image/png` |

- [ ] `content-length: 42973` ✅
- [ ] Status `200` ✅

> If `content-length` is `34203`, the old HR Mobile icon is being served. Increment the query-string version (e.g., `?v=1.2.26`) in `index.html` and `manifest.json`.

---

## Step 4 — Clear Safari Website Data (when needed)

If the previous step passes but iPhone still shows old icon:

**Settings → Safari → Advanced → Website Data → Search `mobilehr.eds-center.com` → Delete**

Only required when the iOS icon cache has persisted beyond normal expiry.

---

## Step 5 — Delete Old iPhone Shortcut

Remove the old STEP Connect / HR Management shortcut:

1. Long-press the old shortcut on the Home Screen
2. Tap **Remove App** → **Remove from Home Screen** (not "Delete App")

---

## Step 6 — Add to Home Screen

1. Open Safari → `https://mobilehr.eds-center.com`
2. Wait for full page load
3. Tap the **Share** icon (box with arrow) at the bottom of Safari
4. Tap **Add to Home Screen**
5. Confirm the shortcut name shows **STEP Connect**
6. Confirm the icon preview shows the STEP Connect icon:
   - Dark royal blue background (`#1E3A8A`)
   - Bold white "STEP"
   - Thin white horizontal divider
   - Regular white "Connect"
7. Tap **Add**

Checklist:
- [ ] Name: **STEP Connect** ✅
- [ ] Icon: dark navy, bold STEP, divider, Connect ✅

---

## Step 7 — Confirm Standalone Mode

Launch STEP Connect from the Home Screen shortcut.

- [ ] No Safari URL bar at the top ✅
- [ ] No Safari bottom toolbar (Back/Forward/Share/Tabs) ✅
- [ ] App launches directly to the Home screen ✅

---

## Step 8 — Confirm Tab Navigation Stays in Standalone

Tap each bottom navigation tab in sequence and verify standalone is preserved on each:

| Tab label | Thai | Expected |
|-----------|------|----------|
| Home | หน้าแรก | No Safari UI ✅ |
| Calendar | ปฏิทิน | No Safari UI ✅ |
| Attendance | ลงเวลา | No Safari UI ✅ |
| Leave | การลา | No Safari UI ✅ |
| Profile | โปรไฟล์ | No Safari UI ✅ |

- [ ] All 5 tabs: standalone mode confirmed ✅

---

## Step 9 — Functional Smoke Test

While on device, verify key flows are reachable:

- [ ] Login screen loads / user is logged in ✅
- [ ] Home screen shows greeting and summary cards ✅
- [ ] Calendar screen loads ✅
- [ ] Attendance screen loads ✅
- [ ] Leave screen loads ✅
- [ ] Profile screen loads ✅

---

## Pass / Fail Criteria

| # | Check | Pass | Fail action |
|---|-------|------|-------------|
| 1 | Manifest `display: standalone` | ✅ | Check index.html manifest link |
| 2 | Manifest `scope: /` | ✅ | Update manifest.json |
| 3 | `content-length: 42973` | ✅ | Increment icon query-string version |
| 4 | Shortcut name: STEP Connect | ✅ | Check apple-mobile-web-app-title in index.html |
| 5 | Icon: navy/STEP/Connect | ✅ | Confirm PNG regenerated and cache-busted |
| 6 | No Safari UI after launch | ✅ | Check manifest scope and display |
| 7 | All tabs: standalone preserved | ✅ | Check manifest scope; check router.replace() navigation |

All 7 items must be PASS before declaring the release verified on-device.

---

## Future Icon Update Checklist

When updating the PWA icon in future releases:

1. Regenerate PNG files: `node scripts/generate-icon.mjs && node scripts/generate-touch-icons.mjs`
2. Bump version string in `apps/mobile/public/index.html` (all 5 `apple-touch-icon` links + `manifest.json` link)
3. Bump version string in `apps/mobile/public/manifest.json` (all 4 icon `src` entries)
4. Run `./scripts/mobile-verify.sh` — confirm PASS
5. Export dist: `cd apps/mobile && npx expo export --platform web`
6. Deploy
7. Run this full SOP

> The version string is not semantically linked to the app version — it is a cache-bust marker. Increment it for any icon or manifest change.

---

## Related Notes

- [[ADR-025 STEP Connect PWA Branding and Standalone Delivery]]
- [[STEP Connect PWA]]
- [[ADR-017 Mobile Expo Router]]

## Related Docs

- `docs/CTO_SUMMARY_HOTFIX_010.md` — standalone navigation fix details
- `docs/CTO_SUMMARY_HOTFIX_011.md` — cache-bust strategy details
- `docs/CTO_SUMMARY_T084.md` — icon rebrand details

#sop #mobile #pwa #standalone #step-connect #production #operations
