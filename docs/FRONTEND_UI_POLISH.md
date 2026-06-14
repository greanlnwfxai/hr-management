# Frontend UI Polish

## Dark Mode

### Overview

The app supports light and dark themes. Theme selection is persisted in `localStorage` and respects the OS `prefers-color-scheme` on first load.

### Implementation

**Engine:** Tailwind CSS v4 class-based dark mode via `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`. Dark utilities activate when the `dark` class is present on `<html>`.

**Flash prevention:** `app/layout.tsx` injects an inline `<script>` in `<head>` that reads `localStorage` and sets `document.documentElement.classList` before React hydrates, eliminating flash-of-wrong-theme.

**Hook:** `apps/web/hooks/useTheme.ts` — reads the current state from the DOM after mount and exposes a `toggle()` function that writes to both the DOM class and `localStorage`.

**Toggle component:** `apps/web/components/ThemeToggle.tsx` — renders a sun/moon icon button with `data-testid="theme-toggle"`. On SSR and before mount it renders a placeholder `<div>` of the same size to avoid layout shift.

**Placement:** The toggle appears in two locations:
- Desktop sidebar footer (next to Log out button)
- Mobile top bar (between brand text and hamburger menu)

### Theme Persistence

| Scenario | Behavior |
|----------|----------|
| First visit, no preference saved | Follows `prefers-color-scheme` (OS setting) |
| First visit, OS dark | Dark mode applied |
| User clicks toggle | New theme saved to `localStorage` as `'light'` or `'dark'` |
| Subsequent visits | Saved theme from `localStorage` takes precedence over OS preference |

### Color Palette

| Purpose | Light | Dark |
|---------|-------|------|
| Page background | `zinc-50` | `zinc-900` |
| Card / panel / sidebar | `white` | `zinc-800` |
| Table header | `zinc-50` | `zinc-900/60` |
| Primary text | `zinc-900` | `zinc-50` |
| Secondary text | `zinc-600–700` | `zinc-300–400` |
| Muted text | `zinc-400–500` | `zinc-500` |
| Borders | `zinc-200–300` | `zinc-600–700` |
| Primary button | `zinc-900 / white text` | `zinc-100 / zinc-900 text` |
| Secondary button | `border-zinc-200 / zinc-600 text` | `border-zinc-600 / zinc-300 text` |
| Status — success | `green-100 / green-700` | `green-900/40 / green-400` |
| Status — error | `red-100 / red-600` | `red-900/40 / red-400` |
| Status — warning | `amber-100 / amber-700` | `amber-900/40 / amber-400` |
| Status — info | `blue-100 / blue-700` | `blue-900/40 / blue-400` |

### Coverage

Dark mode is applied to all pages and shared components:

- Login page
- AppLayout (sidebar, topbar, mobile menu)
- Dashboard
- Employees list + detail
- Departments
- Positions
- Attendance
- Leave
- StatCard, Toast, EmptyState, LoadingState, ErrorState, Modal

### Known Limitations

- Browser-native date/time pickers (`<input type="date">`) use OS-level styling; they may appear light-themed even in dark mode on some browsers (particularly macOS Safari/Chrome before switching color scheme). This is a browser constraint.
- Select dropdowns (`<select>`) have limited styling in dark mode on some browsers; the dropdown list inherits the OS theme rather than the app theme.
- The `ThemeToggle` placeholder (empty `<div>`) appears briefly during SSR before the icon renders client-side. This is intentional to avoid hydration mismatches.

### Future Improvements

- Implement a full design token system (e.g., CSS custom properties mapped to semantic names like `--color-surface`, `--color-text-primary`) to decouple color decisions from component code.
- Add a "system" option to the toggle (light / dark / system) for users who prefer automatic switching.
- Use `color-scheme: dark` CSS property for native form element dark styling in dark mode.

---

## Thai/English Localization (T-041)

### Overview

The app supports two UI languages: Thai (default) and English. Language selection is persisted in `localStorage` and broadcast across all mounted components via a custom DOM event.

### Architecture

No external i18n library is used. The implementation consists of three small files:

| File | Role |
|------|------|
| `apps/web/lib/i18n.ts` | Translation dictionary (EN + TH), `makeT(lang)` factory, enum label helpers |
| `apps/web/hooks/useLanguage.ts` | React hook — reads localStorage, dispatches/listens to `hr-lang-change` custom events |
| `apps/web/components/LanguageToggle.tsx` | 🇹🇭 TH / 🇬🇧 EN flag-button pair rendered in sidebar and login card |

**Cross-component sync:** Instead of a React Context, language changes are propagated via `window.dispatchEvent(new CustomEvent('hr-lang-change', { detail: { lang } }))`. Every component using `useLanguage` listens for this event, so all mounted components update simultaneously without needing a top-level Provider.

### localStorage Keys

| Key | Values | Purpose |
|-----|--------|---------|
| `language` | `'th'` \| `'en'` | Persisted UI language |
| `theme` | `'light'` \| `'dark'` | Persisted theme (pre-existing) |

### Default Language

Thai (`'th'`) — users who have never set a preference see the Thai UI.

### Translation Coverage

All visible user-facing text is translated. Backend enum values (e.g., `ACTIVE`, `ANNUAL`, `PRESENT`) are never translated — only their display labels.

Enum label helper functions in `i18n.ts`:
- `leaveTypeLabel(type, lang)` — maps `LeaveType` enum → Thai/English label
- `attendanceStatusLabel(status, lang)` — maps `AttendanceStatus` enum → Thai/English label
- `leaveStatusLabel(status, lang)` — maps `LeaveStatus` enum → Thai/English label
- `employeeStatusLabel(status, lang)` — maps `EmployeeStatus` enum → Thai/English label
- `roleLabel(role, lang)` — maps `Role` enum → Thai/English label

### Toggle Placement

The language toggle (flag buttons) appears in two locations:
- **Desktop sidebar footer** — below the theme toggle, above the logout button
- **Login page** — top-right corner of the login card alongside the theme toggle

### SSR Hydration Safety

`LanguageToggle` renders a blank placeholder `<div>` during SSR/before mount (`if (!mounted) return <div className="h-7 w-16" />`), preventing hydration mismatch. All pages using `useLanguage` are client components (`'use client'`).

### Known Limitations

- Language toggle is not shown in the mobile top bar (only in the desktop sidebar footer and login page).
- No RTL layout support — Thai is left-to-right, so no changes are needed.
- Date and number formatting remains locale-neutral (ISO dates, plain numbers); locale-specific formatting (e.g., Buddhist calendar, Thai digit glyphs) is not implemented.
- If JavaScript is disabled, the page renders in Thai (the default).

### Future Improvements

- Add the language toggle to the mobile top bar.
- Extend to additional languages (e.g., Lao, Japanese) by adding entries to the `translations` object in `i18n.ts`.
- Replace the custom event bus with React Context if a Provider wrapper becomes acceptable (avoids relying on `window`).
- Add locale-aware date formatting (e.g., `Intl.DateTimeFormat` with `th-TH` locale and Buddhist calendar option).

---

## Thai Language Font Support

### Font

`Noto Sans Thai` (Google Fonts) is loaded via `next/font/google` alongside Geist. The CSS variable `--font-noto-sans-thai` is set on `<html>` and included as a fallback in both `--font-sans` (Tailwind) and the body `font-family`.

```
Geist Sans → Noto Sans Thai → Arial → sans-serif
```

Geist handles all Latin/ASCII characters; Noto Sans Thai activates automatically for any Thai (`ก–๛`) characters in UI labels, employee names, or other data.

---

## E2E Test Strategy

### `data-testid` Selectors

All Playwright E2E tests use `data-testid` attribute selectors rather than text content or ARIA role names. This makes tests language-agnostic — they pass regardless of whether the UI is in Thai or English.

### testid Naming Conventions

| Pattern | Examples |
|---------|---------|
| `page-title-<page>` | `page-title-dashboard`, `page-title-employees` |
| `nav-<name>` | `nav-dashboard`, `nav-employees`, `nav-leave` |
| `btn-<action>` | `btn-signin`, `btn-logout`, `btn-add-employee`, `btn-clock-in` |
| `section-<name>` | `section-todays-attendance`, `section-my-history`, `section-balance-admin` |
| `loading-state` / `error-state` / `empty-state` | Default for single-instance pages |
| `loading-<context>` / `empty-<context>` | Distinct IDs when a page has multiple instances (e.g., `loading-my-att`, `loading-leave`, `empty-leave`) |
| `stat-<name>` | `stat-total`, `stat-active`, `stat-departments` |
| `language-toggle`, `language-toggle-th`, `language-toggle-en` | Language selector |
| `theme-toggle` | Theme toggle button |

### Strict Mode Compliance

Playwright's strict mode requires that a locator resolves to exactly one element for `.toBeVisible()` / `.not.toBeVisible()`. Pages that render multiple `LoadingState` or `EmptyState` components (attendance, leave) assign distinct `testid` props to each instance.
