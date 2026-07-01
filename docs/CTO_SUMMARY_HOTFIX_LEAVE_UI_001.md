# CTO Summary

## Step
HOTFIX-LEAVE-UI-001 — Fix Leave Employee Dropdown and Thai Localization

## Status
PASS

## Root Cause
`apps/web/app/(app)/leave/page.tsx` loaded the employee list for the two admin leave modals with:

```ts
getEmployees({ limit: 200 }).then((d) => setEmployees(d.data)).catch(() => {});
```

The backend's `QueryEmployeeDto` (`apps/api/src/employees/dto/query-employee.dto.ts`) caps `limit` at `@Max(100)`. `limit=200` fails validation and the API returns `400 Bad Request`:

```
GET /employees?limit=200 → 400 {"message":["limit must not be greater than 100"]}
```

The `.catch(() => {})` silently swallowed that error, leaving `employees` as an empty array forever. Both the **Vacation Balance Setup** modal and the **Add Balance** modal ("Add Leave" in the bug report — its Thai button label `+ เพิ่มวันลา` literally means "+ Add Leave") render their `<select>` options from this same `employees` state, so both dropdowns showed only the placeholder with zero selectable options — exactly matching the reported screenshots. This was a pure data-fetch bug, not a component-rendering, CSS/z-index, or RBAC-scoping issue (all of which were ruled out by inspection: the `<select>`/`<option>` JSX was correct, and `GET /employees` is not filtered incorrectly for SUPER_ADMIN/HR_ADMIN).

Separately, the **Vacation Balance Setup** modal had never been wired to `i18n` at all — every label, placeholder, and button (`"Vacation Balance Setup"`, `"Employee *"`, `"Year *"`, `"Entitled Days *"`, `"Remaining Days *"`, `"Setup Note (optional)"`, `"Cancel"`, `"Set Up Balance"`, plus the suggestion/preview/warning copy) was a hardcoded English string, unlike the rest of the Leave page which already uses `t()`.

## Summary of Fix

**1. Employee data loading (root cause):** Replaced the single oversized `getEmployees({ limit: 200 })` call with a paged loader (`loadEmployees`) that requests `limit: 100` (the backend max) and, if `meta.totalPages > 1`, fetches the remaining pages in parallel and concatenates them — so the dropdown always contains the full roster regardless of how many employees exist, not just whichever happened to fit under 100. Errors are no longer silently swallowed: a new `employeesError` state is surfaced as an inline red message with a **Retry** button next to both dropdowns.

**2. Active-only scoping:** Added `status: 'ACTIVE'` to the employee query, matching the requirement that these dropdowns list active employees only (previously no status filter was applied at all, so inactive/resigned employees would also have appeared once the fetch bug was fixed).

**3. Option rendering:** Left the existing option label format (`firstName lastName (employeeCode)`, value = employee `id`) — it already matched the requested "full name + employee code" convention and didn't need to change.

**4. Full Thai localization of the Vacation Balance Setup modal:** Added 24 new i18n keys (`leave_vacation_setup_*` plus a few shared ones) and replaced every hardcoded string in that modal — title, field labels, placeholders, the eligibility/suggestion panel, the override warning, the live entitled/remaining/used preview, and the Cancel/Submit buttons — with `t()` calls. The Thai strings match the task's exact spec (title "ตั้งค่าวันลาพักร้อน", "พนักงาน", placeholder "เลือกพนักงาน", "ปี", "จำนวนวันลาที่ได้รับสิทธิ์", "วันลาคงเหลือ", "หมายเหตุการตั้งค่า (ไม่บังคับ)", "ยกเลิก", "บันทึกการตั้งค่า").

**5. Two smaller hardcoded strings fixed:** the "Vacation Setup" button that opens this modal, and the bare `placeholder="Year"` on the year filter input next to it.

The **Add Balance** modal was already fully wired to `t()` (that's why its Thai placeholder "เลือกพนักงาน" already appeared correctly in the bug screenshot) — it only needed the data-fetch fix, plus the same inline error/retry affordance.

## Files Changed

| File | Change |
|------|--------|
| `apps/web/app/(app)/leave/page.tsx` | Replaced the single `getEmployees({ limit: 200 })` call with a paginated, `status: 'ACTIVE'`-filtered `loadEmployees()` loader; added `employeesError` state with inline error + Retry UI on both employee `<select>` fields; fully localized the Vacation Balance Setup modal (title, all fields, suggestion/warning/preview copy, buttons); localized the "Vacation Setup" button and year-filter placeholder. |
| `apps/web/lib/i18n.ts` | Added 26 new keys in both `en` and `th`: `leave_employees_load_error`, `leave_year_filter_placeholder`, `leave_vacation_setup_btn`, and 23 `leave_vacation_setup_*` keys covering every string in the modal. |
| `apps/web/e2e/leave-balance-modals.spec.ts` | New — 5 focused Playwright tests (see Verification below). |

No files created outside the above plus this CTO summary. No backend/schema/migration changes.

## Before / After Behavior

| | Before | After |
|---|---|---|
| Vacation Balance Setup — employee dropdown | Placeholder only, 0 options (silent 400 from backend) | Lists all active employees (paginated fetch, `status=ACTIVE`) |
| Add Balance ("Add Leave") — employee dropdown | Placeholder only, 0 options (same root cause) | Lists all active employees |
| Employee fetch failure | Silently swallowed (`.catch(() => {})`), no user feedback | Inline red error message + Retry button next to the dropdown |
| Vacation Balance Setup modal copy (TH mode) | 100% English, hardcoded | 100% Thai, matches task's exact spec strings |
| Vacation Balance Setup modal copy (EN mode) | English (unchanged content) | English, now via `t()` (same wording, now translatable) |
| Add Balance modal copy | Already Thai-correct via existing `t()` keys | Unchanged (was already correct) |
| MANAGER access to these modals | Not shown (gated by `admin = isAdmin(user)`, i.e. SUPER_ADMIN/HR_ADMIN only) | Unchanged — still not shown to MANAGER |
| EMPLOYEE access to these modals | Not shown | Unchanged — verified still hidden (see Verification) |

## RBAC / Privacy Notes
- No backend changes. `GET /employees` is called with the same JWT-scoped identity as before; SUPER_ADMIN/HR_ADMIN already receive the unrestricted roster server-side (confirmed by reading `employees.service.ts findAll`, which only restricts by department for `MANAGER` and forbids `EMPLOYEE` entirely — unchanged).
- The Balance Admin section (including both modals) is still gated client-side by `admin = isAdmin(user)` (`SUPER_ADMIN` / `HR_ADMIN` only) — this line was not touched. Manually verified: an `EMPLOYEE`-role session shows `section-balance-admin`, `btn-vacation-setup`, and `btn-add-balance` with count `0` — i.e. the whole admin leave-setup UI is absent, consistent with pre-existing behavior (requirement C).
- MANAGER was already excluded from this admin section before this change (requirement B, "preserve existing product behavior") — untouched, not expanded.
- Adding `status: 'ACTIVE'` to the employee query is a client-side query-parameter change only; it uses an existing, already-supported backend filter and narrows (never widens) what's returned.
- No PII beyond what these admin-only modals already displayed (name, employee code) is newly exposed.

## Localization Notes
- All 8 explicitly-specified Thai strings for the Vacation Balance Setup modal are implemented verbatim: title "ตั้งค่าวันลาพักร้อน", "พนักงาน", placeholder "เลือกพนักงาน", "ปี", "จำนวนวันลาที่ได้รับสิทธิ์", "วันลาคงเหลือ", "หมายเหตุการตั้งค่า (ไม่บังคับ)", "ยกเลิก" (reused the existing shared `cancel` key, which already matched exactly), "บันทึกการตั้งค่า".
- Required-field fields keep the page's existing " *" suffix convention (e.g. `พนักงาน *`) applied outside the translated string, matching how the sibling Add Balance modal already marks required fields — the translated word itself matches the spec exactly.
- Went beyond the 8 explicitly-listed strings to localize the remaining supplementary copy in the same modal (eligibility/suggestion panel, override warning, existing-balance conflict warning, live preview) — left in English before, this would still have produced the "mixed English/Thai" complaint the bug report called out. Scope was kept to this one modal; the separate **Adjust Vacation Balance** modal (not mentioned in the bug report or screenshots) still has hardcoded English strings and was intentionally left untouched — flagged below as a follow-up.
- `formatDate`/other Leave page date formatting was not touched — out of scope for this ticket, which is specifically about the employee dropdown and this one modal's localization.

## Verification Results

| Check | Result |
|---|---|
| `git diff --check` | PASS — no whitespace errors |
| `next build` (web) | PASS — no type errors |
| `./scripts/verify.sh` | PASS — Prisma schema valid, web build clean |
| `./scripts/api-smoke-test.sh` | PASS — all endpoints OK |
| Direct API reproduction | Confirmed `GET /employees?limit=200` → `400 Bad Request` ("limit must not be greater than 100"); `GET /employees?limit=100` → `200 OK`. Matches the root cause exactly. |
| `npx playwright test e2e/leave-balance-modals.spec.ts` (new) | PASS — 5/5: Vacation Setup dropdown has options; Add Balance dropdown has options; Vacation Setup modal shows Thai labels in TH mode; Add Balance modal shows Thai labels in TH mode; Vacation Setup modal shows English labels in EN mode |
| `npx playwright test e2e/leave-attendance.spec.ts e2e/dashboard.spec.ts e2e/navigation.spec.ts` (existing) | PASS — 28/28, no regressions |
| Manual RBAC check (local Docker, headless Playwright, `localStorage` token injection) | `EMPLOYEE` session on `/leave`: `section-balance-admin`, `btn-vacation-setup`, `btn-add-balance` all count `0` — admin leave-setup UI correctly absent |

`docker-verify.sh` was not run (still contains `docker compose down`, per the standing note from prior hotfixes). Used `docker compose up -d --build web` instead — once with a temporary local-only `NEXT_PUBLIC_API_URL` override for browser/e2e verification, then rebuilt again to restore the original `.env`-configured (production-API-pointed) build. No `.env` changes were made.

## Issues Found
1. (Fixed by this change) Root cause described above.
2. (Follow-up, not fixed here) The same `limit: 200`-style bug does not exist elsewhere — checked all `getEmployees(...)` call sites in `apps/web`; `departments/page.tsx` already uses `limit: 100` safely. However, any admin employee-picker capped at a single 100-row page (including this fix) will silently truncate again once the organization exceeds 100 active employees; this fix pages through all results so it does not have that limit, but other pickers using a single fixed page (if any are added later) should follow the same paginate-until-complete pattern.
3. (Follow-up, not fixed here) The **Adjust Vacation Balance** modal (`balModal === 'adjust'`) still has hardcoded English strings ("Adjust Vacation Balance", "Adjustment Delta *", "Reason *", "Apply Adjustment", "Adjustment History", etc.). It was not part of the reported bug/screenshots and was left out of scope to keep this fix focused; recommend a follow-up ticket if full Leave-page localization is desired.

## Risk
Low

## Decision
PASS

## Next Step
Tag this commit as `v1.2.64-leave-employee-dropdown-thai-localization` after user review. Consider a follow-up ticket for the Adjust Vacation Balance modal's localization.

## Recommended Commit Message
```
fix(web): restore leave employee dropdown and Thai labels

- Root cause: getEmployees({ limit: 200 }) exceeded the backend's
  @Max(100) validation on QueryEmployeeDto.limit, so GET /employees
  returned 400, which was silently swallowed (.catch(() => {})),
  leaving the employee list empty for both the Vacation Balance
  Setup and Add Balance ("Add Leave") admin modals
- Replaced with a paginated loadEmployees() that fetches all pages
  at the backend's max page size and filters to status: ACTIVE
- Employee fetch failures now show an inline error + Retry button
  instead of failing silently
- Fully localized the Vacation Balance Setup modal (title, all
  field labels/placeholders, eligibility/suggestion panel, override
  and conflict warnings, live preview, Cancel/Set Up Balance
  buttons) — added 26 new i18n keys in en/th
- Add Balance modal was already localized; only needed the data fix
- No backend/RBAC/schema changes; added e2e coverage for both
  dropdowns having options and for Thai/English label correctness
```
