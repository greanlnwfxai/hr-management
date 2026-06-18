# CTO Summary

## Step
T-049 — Mobile HR Polish & Role-Based UX

## Status
PASS

## Scope
Polish the mobile HR app and implement role-based UX so the app shows different navigation and feature cards depending on the authenticated user's role (SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE). Prepare UI entry points for T-050 Manager Approval without implementing approval logic. All existing mobile features (auth, dashboard, attendance, leave) remain fully working.

## Files Created
- `apps/mobile/src/utils/roles.ts` — role helper functions (roleLabel, isAdmin, isManager, canUseManagerApproval, canUseEmployeeSelfService, canSeeDashboard)
- `apps/mobile/src/components/FeatureCard.tsx` — reusable feature card component (enabled/disabled, badge, icon, title, description, onPress)
- `apps/mobile/.dockerignore` — excludes node_modules/dist/.expo/.git from Docker build context (fixes 948s → 1.7s context transfer)
- `docs/MOBILE_ROLE_BASED_UX.md` — role-based UX reference documentation

## Files Modified
- `apps/mobile/app/home.tsx` — complete role-based rewrite: profile card with role badge, conditional org-summary section, role-filtered feature cards, "เร็ว ๆ นี้" disabled cards for coming features
- `apps/mobile/src/hooks/useDashboard.ts` — skip `getDashboard` API call for EMPLOYEE role to prevent 403; use `canSeeDashboard(role)` helper
- `apps/mobile/src/components/index.ts` — export `FeatureCard`
- `apps/mobile/README.md` — updated Screens table, Dashboard & Profile section with role-based notes
- `docs/MOBILE_DASHBOARD_PROFILE.md` — updated Known Limitations (EMPLOYEE 403 issue resolved in T-049)

## Role-Based UX Summary

| Feature Card | SUPER_ADMIN | HR_ADMIN | MANAGER | EMPLOYEE |
|---|:-----------:|:--------:|:-------:|:--------:|
| ลงเวลา | ✅ | ✅ | ✅ | ✅ |
| ขออนุมัติลา | ✅ | ✅ | ✅ | ✅ |
| โปรไฟล์ของฉัน | 🔜 | 🔜 | 🔜 | 🔜 |
| ภาพรวมองค์กร (dashboard section) | ✅ | ✅ | ✅ | ❌ hidden |
| อนุมัติคำขอลา | 🔜 T-050 | 🔜 T-050 | 🔜 T-050 | ❌ hidden |
| ภาพรวม HR | 🔜 | 🔜 | ❌ | ❌ |
| จัดการพนักงาน | 🔜 | 🔜 | ❌ | ❌ |

✅ = active, navigates to screen | 🔜 = visible, disabled "เร็ว ๆ นี้" card | ❌ = hidden

## Role Permission Helper Summary

File: `apps/mobile/src/utils/roles.ts`

| Function | Behavior |
|---|---|
| `roleLabel(role)` | SUPER_ADMIN→ผู้ดูแลระบบสูงสุด, HR_ADMIN→HR Admin, MANAGER→ผู้จัดการ, EMPLOYEE→พนักงาน |
| `isAdmin(role)` | true for SUPER_ADMIN or HR_ADMIN |
| `isManager(role)` | true for MANAGER |
| `canUseManagerApproval(role)` | true for MANAGER, HR_ADMIN, SUPER_ADMIN |
| `canUseEmployeeSelfService(role)` | true for all roles |
| `canSeeDashboard(role)` | true for MANAGER, HR_ADMIN, SUPER_ADMIN |

Single source of truth. No string comparisons in screen components.

## Mobile Home Polish Summary

- Profile card: avatar initial, email, role badge (styled blue chip), online status dot
- Replaced inline `roleTh()` function with centralized `roleLabel()` from `roles.ts`
- Dashboard overview section conditionally rendered (admin/manager only)
- Feature grid uses `FeatureCard` component — consistent enabled/disabled states
- Section headers as uppercase subdued labels ("เมนูหลัก", "สำหรับผู้จัดการ", "สำหรับ HR / ผู้ดูแลระบบ")
- Loading/error Thai text: "กำลังโหลดข้อมูล...", "ไม่สามารถโหลดข้อมูลได้", "ลองใหม่อีกครั้ง"

## Feature Card / Component Summary

File: `apps/mobile/src/components/FeatureCard.tsx`

Props: `title`, `description`, `icon`, `enabled`, `badge?`, `onPress?`

- Enabled card: white background, blue border, pressable, "เปิดใช้งาน" green badge
- Disabled card: grey background, grey border, not pressable, "เร็ว ๆ นี้" grey badge (or custom badge text)
- Custom badge text accepted (used for T-050 entry point: "เร็ว ๆ นี้")
- No navigation attempted from disabled cards — safe for missing screens

## Navigation Safety Summary

- Attendance card: navigates to `/attendance` ✅
- Leave card: navigates to `/leave` ✅
- Manager approval card: `enabled={false}` — no navigation, badge "เร็ว ๆ นี้"
- HR Overview card: `enabled={false}` — no navigation
- Employee Management card: `enabled={false}` — no navigation
- Profile card: `enabled={false}` — no navigation
- No new routes added. `_layout.tsx` unchanged.
- EMPLOYEE never sees manager/admin cards.

## Documentation Updated

- `docs/MOBILE_ROLE_BASED_UX.md` — created (role table, helper reference, security note, T-050 prep, known limitations)
- `apps/mobile/README.md` — updated Screens table and Dashboard section
- `docs/MOBILE_DASHBOARD_PROFILE.md` — updated EMPLOYEE 403 known limitation note

## Verification Results

| Check | Command | Result |
|---|---|---|
| Mobile typecheck | `npm run typecheck` (apps/mobile) | **PASS** |
| Expo web export | `npx expo export --platform web` | **PASS** |
| mobile-verify.sh | `./scripts/mobile-verify.sh` | **PASS** (typecheck + export) |
| API unit tests | `npm test` (apps/api) | **PASS** 143/143 |
| verify.sh | `./scripts/verify.sh` | **PASS** |
| docker-verify.sh | `./scripts/docker-verify.sh` | **PASS** — all 4 services healthy (api, db, web, mobile) |
| api-smoke-test.sh | `./scripts/api-smoke-test.sh` | **PASS** — 11/11 checks (health, login, me, employees, departments, positions, attendance, leave, leave-balances, dashboard, 401 guard) |
| e2e-test.sh | `./scripts/e2e-test.sh` | **PASS** — 51/51 Playwright tests |

**Docker note:** Added `apps/mobile/.dockerignore` (node_modules, dist, .expo, .git) as part of T-049. Mobile Docker context transfer reduced from ~948s to ~1.7s. CI was already unaffected (node_modules is gitignored).

## Manual Mobile Verification Notes

Manual interactive verification is not available in this automated environment (no headed browser). The following items were verified by code-path analysis and static type-check only:

- Home screen renders role-based sections conditionally (gated by `canSeeDashboard`, `canUseManagerApproval`, `isAdmin`)
- `FeatureCard` with `enabled={false}` renders as `View` (not `Pressable`) — navigation impossible from disabled cards
- `FeatureCard` with `enabled={true}` renders as `Pressable` — attendance and leave cards navigate to `/attendance` and `/leave`
- `roleLabel('SUPER_ADMIN')` returns `'ผู้ดูแลระบบสูงสุด'` (verified by static reading of roles.ts)
- TypeScript strict-mode typecheck passes with no errors (all role paths typed as `AppRole`)

**EMPLOYEE account test:** Only one seed user exists (`admin@hr.local` — SUPER_ADMIN). No EMPLOYEE-role seed. EMPLOYEE code paths are type-safe and verified by reading the role from AuthContext, but cannot be tested interactively in this environment. See docs/MOBILE_ROLE_BASED_UX.md Known Limitations.

**Recommended manual verification steps (to be performed by user):**
1. `docker compose up -d` then `cd apps/mobile && npm run web` (http://localhost:3004)
2. Login with `admin@hr.local` / `admin1234` (SUPER_ADMIN)
3. Verify: role badge "ผู้ดูแลระบบสูงสุด", org summary visible, attendance/leave cards clickable, manager/HR sections shown, disabled cards not clickable
4. Tap "ออกจากระบบ" → redirects to login

## Existing Web/API/Mobile Impact

- Backend (API): **no changes**
- Web UI (Next.js): **no changes**
- Mobile Auth: **unchanged** — login, session restore, signOut all work
- Mobile Attendance: **unchanged** — attendance.tsx not modified
- Mobile Leave: **unchanged** — leave.tsx not modified
- API unit tests: all 143 tests pass

## Known Limitations

1. Only SUPER_ADMIN seed exists — EMPLOYEE role UI paths are untested manually
2. "โปรไฟล์ของฉัน" card is disabled (no /profile screen yet)
3. "อนุมัติคำขอลา" card does not navigate — T-050 will implement the approval screen
4. "ภาพรวม HR" and "จัดการพนักงาน" are placeholder cards
5. No role-aware bottom tabs (future enhancement)

## Risk
Low — mobile-only changes, no backend modifications, no schema changes, no new routes. All existing features preserved.

## Decision
PASS

## Next Step
T-050 — Mobile Manager Approval Screen

## Recommended Commit Message
```
feat(mobile): polish HR UX and add role-based feature cards (T-049)

- Add roles.ts helper (roleLabel, isAdmin, canUseManagerApproval, canSeeDashboard)
- Add FeatureCard component with enabled/disabled/badge states
- Rewrite Home screen with role-based sections and profile role badge
- Gate /dashboard API call to admin/manager roles to prevent EMPLOYEE 403
- Add disabled entry points for manager approval and HR admin features
- Create docs/MOBILE_ROLE_BASED_UX.md
```
