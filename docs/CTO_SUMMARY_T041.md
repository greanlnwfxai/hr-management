# CTO Summary

## Step
T-041 — Thai/English UI Localization + UI Redesign + Light/Dark Mode

## Status
PASS

## Scope
Added Thai/English UI localization (default Thai, persisted in `localStorage`) to the existing web frontend without an external i18n library. Also completed light/dark mode wiring and a professional UI polish pass covering all pages and shared components. All existing Playwright E2E tests were updated to use `data-testid` selectors so they remain language-agnostic.

## Files Created

- `apps/web/lib/i18n.ts` — Translation dictionary (EN + TH, 150+ keys), `makeT(lang)` factory, enum label helpers
- `apps/web/hooks/useLanguage.ts` — React hook; reads `localStorage`, broadcasts/listens to `hr-lang-change` custom event
- `apps/web/components/LanguageToggle.tsx` — 🇹🇭 TH / 🇬🇧 EN flag-button pair (`data-testid="language-toggle"`, `language-toggle-th`, `language-toggle-en`)
- `apps/web/e2e/theme-toggle.spec.ts` — New E2E spec for theme toggle + 4 language toggle tests
- `docs/CTO_SUMMARY_T041.md` — This file

## Files Modified

**Pages:**
- `apps/web/app/login/page.tsx` — Translated labels; added LanguageToggle + ThemeToggle; `data-testid="btn-signin"`, `data-testid="login-error"`
- `apps/web/app/(app)/dashboard/page.tsx` — Full translations; `data-testid` on h1, stat cards, section headings, loading/error states
- `apps/web/app/(app)/employees/page.tsx` — Full translations; `data-testid` on h1, add button, search input/button, edit buttons
- `apps/web/app/(app)/employees/[id]/page.tsx` — Full translations
- `apps/web/app/(app)/departments/page.tsx` — Full translations; `data-testid="page-title-departments"`
- `apps/web/app/(app)/positions/page.tsx` — Full translations; `data-testid="page-title-positions"`
- `apps/web/app/(app)/attendance/page.tsx` — Full translations; `data-testid` on heading, sections, clock buttons; distinct `testid="loading-my-att"` for myLoading to satisfy Playwright strict mode
- `apps/web/app/(app)/leave/page.tsx` — Full translations; `data-testid` on heading, sections, buttons; distinct `testid="loading-leave"`, `testid="empty-leave"`, `testid="error-leave"` to satisfy Playwright strict mode

**Components:**
- `apps/web/components/AppLayout.tsx` — Added LanguageToggle in sidebar footer and mobile bar; nav items use `labelKey` + `data-testid`; `data-testid="btn-logout"`
- `apps/web/components/EmptyState.tsx` — Added optional `testid` prop (default `'empty-state'`)
- `apps/web/components/LoadingState.tsx` — Added optional `testid` prop (default `'loading-state'`)
- `apps/web/components/ErrorState.tsx` — Added optional `testid` prop (default `'error-state'`)
- `apps/web/components/StatCard.tsx` — Added optional `testid` prop (default `'stat-card'`)
- `apps/web/components/Modal.tsx` — Dark mode + translation support
- `apps/web/components/ThemeToggle.tsx` — Dark mode wiring (pre-existing file, finalized)

**E2E Tests:**
- `apps/web/e2e/login.spec.ts` — All selectors converted to `data-testid`
- `apps/web/e2e/navigation.spec.ts` — All selectors converted to `data-testid`
- `apps/web/e2e/dashboard.spec.ts` — All selectors converted to `data-testid`
- `apps/web/e2e/employees.spec.ts` — All selectors converted to `data-testid`
- `apps/web/e2e/leave-attendance.spec.ts` — All selectors converted to `data-testid`; strict mode fixes for multi-instance state components

**Styles / Layout:**
- `apps/web/app/globals.css` — Tailwind v4 dark mode custom variant, base color tokens
- `apps/web/app/layout.tsx` — Inline script for theme flash prevention; Noto Sans Thai font

**Docs:**
- `docs/FRONTEND_UI_POLISH.md` — Updated with Thai/English localization section, localStorage keys, E2E `data-testid` conventions, strict mode notes

## Verification Result

```
./scripts/verify.sh         → PASS  (API build OK, Prisma validate OK, Web build OK)
./scripts/docker-verify.sh  → PASS  (hr-db healthy, hr-api healthy, hr-web up)
./scripts/api-smoke-test.sh → PASS  (login, all endpoints, 401 check)
./scripts/e2e-test.sh       → PASS  (51 / 51 tests pass)
cd apps/api && npm test      → PASS  (114 / 114 unit tests pass)
```

## Issues Found

1. **Playwright strict mode violation — attendance page:** Two `LoadingState` components on the same page both defaulted to `testid="loading-state"`, causing `.not.toBeVisible()` to fail with "resolved to 2 elements." Fixed by assigning `testid="loading-my-att"` to the myLoading instance and updating the test to match.

2. **Playwright strict mode violation — leave page:** Same issue: two `LoadingState` and two `EmptyState` on the leave page. Fixed by assigning `testid="loading-leave"`, `testid="empty-leave"`, and `testid="error-leave"` to the primary (leave requests) instances.

## Risk
Low

## Decision
PASS

## Next Step
STEP 17 — Mobile App (React Native / Expo) foundation, or the next item in the product roadmap as directed by the CTO.

## Recommended Commit Message
```
feat(web): add Thai/English localization and dark mode UI (T-041)

- Add lib/i18n.ts: EN/TH translation dictionary (150+ keys) with makeT()
  factory and enum label helpers; no external i18n library
- Add hooks/useLanguage.ts: localStorage persistence + custom-event bus
  (hr-lang-change) for cross-component sync without React Context
- Add components/LanguageToggle.tsx: flag-button pair with data-testid selectors
- Default language: Thai; persisted in localStorage under key 'language'
- Wire light/dark mode across all pages (ThemeToggle, useTheme, layout script)
- Refactor all E2E tests to data-testid selectors (language-agnostic)
- Fix Playwright strict mode: assign distinct testid to multi-instance
  LoadingState/EmptyState on attendance and leave pages
- Update docs/FRONTEND_UI_POLISH.md with localization, localStorage keys,
  testid conventions, and strict-mode compliance notes

Verification: verify.sh PASS, docker-verify.sh PASS,
api-smoke-test.sh PASS, e2e-test.sh 51/51 PASS, api unit tests 114/114 PASS
```
