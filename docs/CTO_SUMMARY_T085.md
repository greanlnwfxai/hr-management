# CTO Summary

## Step
T-085 — HR-Knowledge & ADR Sync for STEP Connect PWA Milestone

## Status
PASS

---

## Scope

Documentation and knowledge sync only. No runtime code, backend, database, Docker, or production configuration was changed.

Synchronized HR-Knowledge vault and ADR documentation to capture the STEP Connect PWA milestone delivered across three consecutive releases (v1.2.24, v1.2.25, v1.2.26).

---

## Why This Sync Was Needed

Three releases changed the mobile PWA's identity, delivery mechanism, and cache strategy in ways that were not captured in the knowledge base:

| Release | Change | Knowledge gap |
|---|---|---|
| v1.2.24 HOTFIX-010 | Added `manifest.json`; fixed standalone PWA navigation | No ADR or domain note explaining manifest scope requirement |
| v1.2.25 T-084 | STEP Connect icon and metadata rebrand | No domain note for STEP Connect identity; no ADR for branding strategy |
| v1.2.26 HOTFIX-011 | Cache-bust icon URLs with `?v=1.2.25` | No SOP documenting versioned URL strategy or production verification steps |

Without this sync, a new developer or operator encountering the PWA setup would have no structured explanation of why `manifest.json` exists, what `?v=1.2.25` means, or what to check after a deploy.

---

## Releases Covered

### v1.2.24 — Standalone PWA Navigation Fix
- **Tag:** `v1.2.24-standalone-pwa-navigation-hotfix`
- **Commit:** `7c51fe2`
- **Root cause:** No `manifest.json` — iOS could not determine PWA scope; tab navigation via `router.replace()` exited standalone container
- **Fix:** Added `apps/mobile/public/manifest.json` with `display: standalone`, `scope: "/"`, `start_url: "/"`; added `mobile-web-app-capable` meta tag; updated `apple-mobile-web-app-title` to "STEP Connect"
- **Verified on iPhone:** all 5 tabs (หน้าแรก, ปฏิทิน, ลงเวลา, การลา, โปรไฟล์) stay inside standalone container

### v1.2.25 — STEP Connect Icon Rebrand
- **Tag:** `v1.2.25-step-connect-icon-rebrand`
- **Commit:** `3731f01`
- **Scope:** New STEP Connect icon (navy `#1E3A8A`, bold STEP, divider, Connect); `app.json` name and permission strings updated; 7 PNG assets regenerated
- **Icon master size:** 1024×1024 (`assets/icon.png`)
- **PWA icon sizes:** 1024, 180, 167, 152, 120 px

### v1.2.26 — Icon Cache-Bust
- **Tag:** `v1.2.26-step-connect-icon-cache-bust`
- **Commit:** `c51ec4e`
- **Root cause:** Cloudflare `cf-cache-status: HIT`, `age: 32080`, `content-length: 34203` (old); new icon is 42973 bytes
- **Fix:** `?v=1.2.25` appended to all `apple-touch-icon` links and `manifest.json` icon `src` entries; manifest link also versioned
- **Verified on iPhone:** STEP Connect icon visible after delete-and-re-add; `content-length: 42973` confirmed

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/adr/ADR-025-step-connect-pwa-branding-and-standalone-delivery.md` | ADR-025 in docs/adr (canonical project ADR location) |
| `HR-Knowledge/03-ADR/ADR-025 STEP Connect PWA Branding and Standalone Delivery.md` | ADR-025 in HR-Knowledge vault (Obsidian-linked) |
| `HR-Knowledge/08-SOP/Mobile PWA Production Verification.md` | SOP checklist for production PWA verification |
| `HR-Knowledge/04-DOMAINS/Mobile/STEP Connect PWA.md` | Domain knowledge note for STEP Connect PWA |

---

## Files Modified

| File | Change |
|------|--------|
| `HR-Knowledge/03-ADR/ADR Index.md` | Added ADR-025 row; updated ADR policy sentence to reflect count 25; added ADR-025 to source file list |
| `HR-Knowledge/01-START-HERE/Current Status.md` | Updated to v1.2.26; added STEP Connect PWA to completed areas; added STEP Connect release table; added ADR-025 entry; updated Next Recommended Task |

---

## Key Knowledge Captured

| Topic | Captured in |
|---|---|
| STEP Connect as employee-facing mobile identity | ADR-025, STEP Connect PWA domain note |
| iOS standalone mode requires `manifest.json` with `scope: /` | ADR-025, STEP Connect PWA domain note |
| Root cause of tab navigation exiting standalone | ADR-025 context section |
| STEP Connect icon design (navy `#1E3A8A`, STEP/divider/Connect) | ADR-025, STEP Connect PWA domain note |
| Cloudflare/iOS icon cache issue and evidence | ADR-025, STEP Connect PWA domain note |
| Cache-busting via `?v=1.2.25` query string | ADR-025, SOP |
| Rule: increment version string for every future icon change | ADR-025 consequences, SOP |
| iOS limitations (iOS < 16.4, no App Store, no service worker) | ADR-025, STEP Connect PWA domain note |
| STEP Connect vs HR Management identity split | STEP Connect PWA domain note |
| Production verification steps after each deploy | SOP |

---

## ADR Added

**ADR-025 — STEP Connect PWA Branding and Standalone Delivery**

- **Location (docs/adr):** `docs/adr/ADR-025-step-connect-pwa-branding-and-standalone-delivery.md`
- **Location (HR-Knowledge):** `HR-Knowledge/03-ADR/ADR-025 STEP Connect PWA Branding and Standalone Delivery.md`
- **Status:** Accepted
- **Tasks:** T-084, HOTFIX-010, HOTFIX-011, T-085
- **Covers:** STEP Connect brand decision; manifest.json standalone delivery; flat icon design; versioned URL cache-busting; iOS limitations; operational rules

---

## SOP Added

**Mobile PWA Production Verification**

- **Location:** `HR-Knowledge/08-SOP/Mobile PWA Production Verification.md`
- **9-step checklist:** Portainer pull → verify manifest → verify icon content-length → clear Safari data → delete old shortcut → Add to Home Screen → confirm standalone → confirm tab navigation → functional smoke test
- **Pass/fail table:** 7 explicit criteria including `content-length: 42973`, standalone mode, and all 5 tabs

---

## Domain Note Added

**STEP Connect PWA**

- **Location:** `HR-Knowledge/04-DOMAINS/Mobile/STEP Connect PWA.md`
- **Covers:** product identity, PWA vs native distinction, standalone requirements, tab navigation, icon identity, cache-bust strategy, iOS limitations, release history

---

## Verification Commands and Results

```
git status --short
→  M "HR-Knowledge/01-START-HERE/Current Status.md"
   M "HR-Knowledge/03-ADR/ADR Index.md"
  ?? "HR-Knowledge/03-ADR/ADR-025 STEP Connect PWA Branding and Standalone Delivery.md"
  ?? HR-Knowledge/04-DOMAINS/Mobile/
  ?? "HR-Knowledge/08-SOP/Mobile PWA Production Verification.md"
  ?? docs/adr/ADR-025-step-connect-pwa-branding-and-standalone-delivery.md

git diff --check
→ PASS — no whitespace errors

grep -R "STEP Connect" HR-Knowledge docs/adr/ADR-025* | wc -l
→ 51 matches

grep -R "ADR-025" HR-Knowledge docs/adr | (grep -v .obsidian)
→ 9 references across 5 files (SOP, Current Status, ADR Index, ADR-025 itself × 2, STEP Connect PWA domain note)

grep -R "v1.2.24\|v1.2.25\|v1.2.26" HR-Knowledge docs/adr/ADR-025* | (grep -v .obsidian)
→ 16 matches — all three release tags captured

grep -R "standalone" HR-Knowledge docs/adr/ADR-025* | wc -l
→ 35 matches

./scripts/verify.sh
→ PASS (API build PASS, Prisma schema valid, Web build PASS)
```

---

## Scope Confirmation

| Area | Changed? |
|---|---|
| Runtime code (API, web, mobile) | NO |
| Database schema or migrations | NO |
| Docker or production compose | NO |
| Auth, RBAC, or security | NO |
| Test files | NO |
| Documentation and HR-Knowledge only | YES |

---

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | None — documentation only |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None — no runtime code change |
| Dependency/advisory impact | No new packages |
| Secrets/logging check | None — no credentials, tokens, or secret values in any doc |
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
T-086 (TBD) — further STEP Connect PWA enhancements or next roadmap feature.

## Recommended Commit Message
```
docs(hr): sync STEP Connect PWA knowledge and ADR
```
