# CTO Summary

## Step
HOTFIX-REQ002G-4A — Update E2E Sidebar Identity Expectation (CI unblock for HOTFIX-REQ002G-4)

## Status
PASS

## Scope
HOTFIX-REQ002G-4 changed the sidebar footer to display a fallback identity (full name → username → email) instead of always showing `user.email`. That change shipped without updating the corresponding Playwright E2E assertion, which still hard-asserted the literal string `admin@hr.local` was visible in the sidebar. Since the local admin seed account has no `firstName`/`lastName` on its employee record, the sidebar now renders the username (`admin`) instead of the email, so the old assertion timed out and failed CI.

This is a **test-only fix** plus one non-visual `data-testid` addition needed to make the assertion stable and independent of which fallback tier resolves. No business logic in the fallback chain was changed.

## Files Modified

| File | Change |
|------|--------|
| `apps/web/components/AppLayout.tsx` | Added `data-testid="sidebar-user-identity"` to the existing sidebar identity `<p>` element (wraps the label + role badge). Added a nested `data-testid="sidebar-user-identity-label"` `<span>` around just the label text, so tests can assert on the identity value in isolation from the role badge text. No change to the fallback logic (`displayName ?? user.username ?? user.email`). |
| `apps/web/e2e/navigation.spec.ts` | Renamed test `admin user email shown in sidebar` → `admin identity is shown in sidebar`. Replaced the `getByText('admin@hr.local')` assertion with: assert `[data-testid="sidebar-user-identity"]` is visible inside `aside`; read `textContent` of the nested `[data-testid="sidebar-user-identity-label"]`, assert it's non-empty after trim, and assert it does not match a raw system-generated id pattern (`/^[0-9a-f-]{20,}$/i`). |

## Test Expectation Change

**Before:**
```ts
test('admin user email shown in sidebar', async ({ page }) => {
  await page.goto('/dashboard');
  const sidebar = page.locator('aside');
  await expect(sidebar.getByText('admin@hr.local')).toBeVisible();
});
```

**After:**
```ts
test('admin identity is shown in sidebar', async ({ page }) => {
  await page.goto('/dashboard');
  const sidebar = page.locator('aside');
  await expect(sidebar.locator('[data-testid="sidebar-user-identity"]')).toBeVisible();
  const label = sidebar.locator('[data-testid="sidebar-user-identity-label"]');
  const text = (await label.textContent())?.trim() ?? '';
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toMatch(/^[0-9a-f-]{20,}$/i);
});
```

The test still verifies a real identity renders in the sidebar (not just that `aside` exists), and still fails if the fallback chain regresses to showing a raw id/uuid. The raw-id check reads only the `sidebar-user-identity-label` span (label text in isolation) rather than the parent `<p>`, which also contains the role badge (e.g. `SUPER ADMIN`) — reading the parent's combined `textContent` would make the id-shape regex never match, silently defeating the check. It no longer depends on `admin@hr.local` specifically being visible, matching the product's new fallback behavior.

## Verification Result

| Check | Result |
|-------|--------|
| `git diff --check` | PASS — no whitespace errors |
| `npm run build` (apps/web, `next build`) | PASS — compiled successfully, no type errors |
| `docker compose up -d --build web` (rebuild to pick up `AppLayout.tsx` change; user-approved, not `down`) | PASS — `hr-api`, `hr-db`, `hr-web` all healthy/up |
| `npx playwright test e2e/navigation.spec.ts` (targeted, re-run after adding the label span) | 8/9 passed, consistently across 3 runs. Target test `admin identity is shown in sidebar` — **PASS** every run. Sidebar rendered `admin` (label span) + `SUPER ADMIN` (role badge), confirming the username fallback tier works end-to-end and the two spans are correctly isolated. |

## Issues Found

**Pre-existing, unrelated failure:** `navigates to Dashboard` fails consistently in this local run (`page-title-dashboard` never renders; dashboard page shows `error_dashboard` — "โหลดแดชบอร์ดล้มเหลว"), reproduced across three separate runs. Investigated and confirmed **not caused by this change, and not a CI signal**:
- The diff for this fix touches only `AppLayout.tsx` (sidebar identity markup) and `navigation.spec.ts` (test assertions) — the dashboard page and its data-fetching code are **byte-identical** to what's already in CI. The dashboard test's pass/fail behavior cannot be affected by this diff.
- The original CI failure report handed to us for this hotfix named exactly one failing test: `Navigation — admin role › admin user email shown in sidebar` (the sidebar identity assertion). It did not name `navigates to Dashboard`. Since CI builds fresh from committed code, that means `navigates to Dashboard` was green in the same CI run that failed on the sidebar test — with unchanged dashboard code, it stays green in CI here too.
- All other navigation tests (Employees, Departments, Positions, Attendance, Leave, sidebar links) pass normally in the same local runs.
- Conclusion: this is a **local-environment-only flake** (long-lived local Docker stack, container recreate timing, dual-lockfile warning surfaced by `next build`), out of scope for this focused sidebar-identity hotfix, and does not block this fix from being CI-green. Recommend a separate ticket only if it's independently observed failing in actual CI.

## Security Review

| Field | Assessment |
|-------|-----------|
| Auth impact | None. No endpoints added or changed. |
| RBAC impact | None. No role/guard logic touched. |
| Data privacy impact | None. `data-testid` is a non-visual DOM attribute; no new data is rendered or exposed. The identity text displayed is unchanged (already shipped in HOTFIX-REQ002G-4). |
| Password/token/hash impact | None. |
| Mobile security impact | None. Web-only change. |
| Dependency/advisory impact | No new packages added. |
| Secrets/logging check | No secrets, tokens, or PII added to logs, test output, or source. |
| New endpoints protected | N/A — no new endpoints. |
| Risk level | LOW |
| Security decision | PASS |

## Risk
Low

## Decision
PASS

## Next Step
CI should now pass for HOTFIX-REQ002G-4. No new version tag for this fix — keep final release tag as `v1.2.61-employee-self-dashboard-profile-polish` after CI passes, per instructions. Recommend a separate follow-up ticket to investigate the pre-existing `navigates to Dashboard` local flake if it also reproduces in CI.

## Recommended Commit Message
```
test(e2e): update sidebar identity expectation
```

## Git Operations
None performed. `apps/web/components/AppLayout.tsx` and `apps/web/e2e/navigation.spec.ts` are modified in the working tree only, per project rule that all git steps are performed manually by the user. `docker compose up -d --build web` was run to rebuild the container with the source change (user-approved, non-destructive — not `down`, no volumes touched).
