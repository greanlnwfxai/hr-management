# CTO Summary

## Step
T-087 — Mobile UI Polish Pass (STEP Connect)

## Status
PASS

---

## Scope

Focused visual polish of the STEP Connect PWA front-end. No backend, database, auth/session logic, business logic (attendance, geofence, leave), Docker, or API contracts were changed. Changes are limited to color constants, StyleSheet values, and one icon size in shared components.

---

## Constraints Observed

| Area | Change allowed? |
|---|---|
| Backend / API / NestJS | NO |
| Database / Prisma schema | NO |
| Auth or session logic | NO |
| Attendance / geofence business logic | NO |
| Leave business logic | NO |
| Docker / production compose | NO |
| git add / commit / push / tag | NO (user performs manually) |
| `docker compose down` or destructive Docker commands | NO |
| `./scripts/docker-verify.sh` | NOT RUN (not approved for this task) |

---

## What Changed and Why

### 1. Header color alignment — `#3b82f6` → `#1e3a8a` (brand navy)

The STEP Connect brand color is `#1e3a8a` (ADR-025, icon background). All secondary-screen headers were using `#3b82f6` (Tailwind Blue-500 — a brighter medium blue) instead of the brand navy. This created a jarring color shift when moving between the deep-navy Home hero and the bright-blue headers on Calendar, Attendance, Leave, Profile, and Off-site Request.

Files changed: `MobileScreenHeader.tsx`, `attendance.tsx` (custom `AttendanceHeader`), `attendance-detail.tsx` (CAL_BG), `calendar.tsx` (CAL_BG).

### 2. Interactive/accent color alignment — `#3b82f6` → `#1a56db`

Body-level interactive elements (tab underlines, active tab text, card title left-border, retry text, go-to-leave button, ActivityIndicator spinners, RefreshControl tint, off-site submit button) were using `#3b82f6`. The home screen already used `#1a56db` for links, buttons, and CTAs. Standardized all body accents to `#1a56db` for a consistent interactive color.

Files changed: `attendance.tsx`, `offsite-request.tsx`, `calendar.tsx` (RefreshControl, timeAccent inline override).

### 3. Donut ring colors — `#3399FF` → `#1a56db`

All `DonutRing` components on the home screen's stat cards and summary cards used `#3399FF` (a washed-out off-brand blue). Updated to `#1a56db` to match the home screen's own button/link blue. Leave type semantic colors (`PERSONAL: '#3b82f6'`) and the GeofenceMapModal legend dot were not changed; they are semantic, not surface, colors.

Files changed: `home.tsx`.

### 4. Bottom nav icon size — `14` → `18`

The tab bar icon font size was 14px, which at high pixel density on iPhone reads as very small and underweight relative to the 11px labels beneath. Increased to 18px for better legibility and more app-like tab affordance.

Files changed: `MobileBottomNav.tsx`.

---

## Color Roles Established

| Role | Color | Used for |
|---|---|---|
| Brand navy (header/hero) | `#1e3a8a` | All screen headers, hero areas, timeline badges |
| Very dark navy (home hero only) | `#0d1e4a` | Home screen hero (unchanged — left as designed) |
| Brand interactive blue | `#1a56db` | Buttons, tab underlines, card accents, spinners, CTAs |
| Leave-type PERSONAL | `#3b82f6` | Semantic badge color for PERSONAL leave type — intentional, unchanged |
| Dark theme token | `#3b82f6` | `colors.ts` dark mode primary — not consumed by any live screen, unchanged |
| Geofence legend | `#3b82f6` | Legend dot inside GeofenceMapModal — semantic, unchanged |

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/CTO_SUMMARY_T087.md` | This CTO summary |

---

## Files Modified

| File | What changed |
|------|-------------|
| `apps/mobile/src/components/MobileScreenHeader.tsx` | `headerDark.backgroundColor` `#3b82f6` → `#1e3a8a`; `shadowColor` → `#0d1e4a` |
| `apps/mobile/src/components/MobileBottomNav.tsx` | `icon.fontSize` `14` → `18` |
| `apps/mobile/app/attendance.tsx` | Header bg → `#1e3a8a`; `shadowColor` → `#0d1e4a`; `timeBubble` bg → `rgba(255,255,255,0.2)`; body accents (`tabBtnTextActive`, `tabBtnUnderline`, `cardTitle` borderLeft, `offSiteHistoryBadgeText`, `goLeaveBtnText`, `retryText`) → `#1a56db`; ActivityIndicator / RefreshControl → `#1a56db` |
| `apps/mobile/app/attendance-detail.tsx` | `CAL_BG` `#3b82f6` → `#1e3a8a` (header, hero, tab underlines, time badges) |
| `apps/mobile/app/calendar.tsx` | `CAL_BG` `#3b82f6` → `#1e3a8a`; RefreshControl tintColor → `#1a56db`; inline `timeAccent` override → `#1e3a8a` |
| `apps/mobile/app/offsite-request.tsx` | `submitBtn.backgroundColor` and `shadowColor` `#3b82f6` → `#1a56db` |
| `apps/mobile/app/home.tsx` | All `DonutRing color="#3399FF"` → `#1a56db` (7 instances) |

---

## Verification Commands and Results

```
./scripts/verify.sh
→ [PASS] API build
→ [PASS] Prisma schema valid
→ [PASS] Web build
→ [PASS] ALL CHECKS PASSED

./scripts/mobile-verify.sh
→ [PASS] Mobile typecheck
→ [PASS] Expo web export
→ [PASS] ALL MOBILE CHECKS PASSED
```

`./scripts/docker-verify.sh` — not run (not approved for this task; Docker state was not changed).

---

## Scope Confirmation

| Area | Changed? |
|---|---|
| Backend / NestJS / API controllers or services | NO |
| Database schema or migrations | NO |
| Docker or production compose | NO |
| Auth, JWT, guards, or session logic | NO |
| Attendance or geofence business logic | NO |
| Leave business logic | NO |
| DTO validation or API contracts | NO |
| Mobile UI color constants and icon size | YES |

---

## Deferred / Future Work

| # | Area | Note |
|---|---|---|
| FW-1 | `home.tsx` `otCard` style | Exact duplicate of `statCard`; safe to merge in a refactor task |
| FW-2 | `colors.ts` dark mode `primary` | Still `#3b82f6`; update when dark mode is enabled |
| FW-3 | Calendar "ปฏิทินทีม" tab | Non-functional placeholder; future feature |
| FW-4 | `scheduleCard` background | Currently `#f3f4f6`; could become white with shadow in a future design pass |

---

## Security Review

| Field | Assessment |
|-------|------------|
| Auth impact | None — no endpoint or guard changes |
| RBAC impact | None |
| Data privacy impact | None |
| Password/token/hash impact | None |
| Mobile security impact | None — only color values and font size changed; no API calls, token handling, or storage logic modified |
| Dependency/advisory impact | No new packages added |
| Secrets/logging check | No secrets, tokens, or credentials in any changed file |
| New endpoints protected | N/A |
| Risk level | LOW |
| Security decision | PASS |

---

## Visual Verification Limitation

`./scripts/mobile-verify.sh` confirms TypeScript typecheck and Expo web export. It does not render pixels on a device. On-device visual verification should be performed on an iPhone using the production SOP (`HR-Knowledge/08-SOP/Mobile PWA Production Verification.md`) after the next deploy.

---

## Issues Found

None. All changes were clean; no TypeScript errors; no build failures.

---

## Risk

Low

## Decision

PASS

## Next Step

T-088 (TBD) — On-device visual verification of T-087 polish changes using T-086 QA checklist, or next roadmap feature.

## Recommended Commit Message

```
style(mobile): polish STEP Connect PWA interface

Align all secondary-screen headers to brand navy (#1e3a8a).
Standardise body interactive colour to #1a56db.
Replace washed-out #3399FF donut rings with brand blue.
Increase bottom nav icon size from 14 to 18 for legibility.
No backend, auth, business logic, or Docker changes.
```
