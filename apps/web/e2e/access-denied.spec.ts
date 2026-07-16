import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, injectRoleAuth, type AuthCreds } from './helpers/auth';

/**
 * ACCESS-UX-001 — explicit access-denied UX on admin-only Admin Web routes.
 *
 * /departments and /positions are SUPER_ADMIN/HR_ADMIN-only pages (BUG-003).
 * /employees is SUPER_ADMIN/HR_ADMIN + MANAGER (team view) — EMPLOYEE only is denied (BUG-004).
 *
 * MANAGER/EMPLOYEE cases use a synthetic localStorage role (no real backend login) because
 * the access-denied gate is evaluated client-side from the stored user role before any
 * authenticated API call fires, so a fake token never reaches a protected endpoint.
 */

let adminCreds: AuthCreds;

test.beforeAll(() => {
  adminCreds = getCachedAdminToken();
});

test.describe('Access Denied — Departments', () => {
  test('SUPER_ADMIN sees the full Departments page, not access denied', async ({ page }) => {
    await injectAuth(page, adminCreds);
    await page.goto('/departments');
    await expect(page.locator('[data-testid="page-title-departments"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-departments"]')).not.toBeVisible();
  });

  test('MANAGER sees explicit access denied on /departments', async ({ page }) => {
    await injectRoleAuth(page, 'MANAGER');
    await page.goto('/departments');
    await expect(page.locator('[data-testid="access-denied-departments"]')).toBeVisible();
    // Localized message text, not just an empty card — a raw/unresolved i18n key must not pass.
    await expect(page.locator('[data-testid="access-denied-departments"]')).toHaveText(/ไม่มีสิทธิ์|do not have permission/i);
    await expect(page.locator('[data-testid="page-title-departments"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="btn-add-department"]')).not.toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('EMPLOYEE sees explicit access denied on /departments', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/departments');
    await expect(page.locator('[data-testid="access-denied-departments"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-departments"]')).toHaveText(/ไม่มีสิทธิ์|do not have permission/i);
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('access denied card has a safe navigation link back to the dashboard', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/departments');
    const link = page.locator('[data-testid="access-denied-departments"] a');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard');
  });
});

test.describe('Access Denied — Positions', () => {
  test('SUPER_ADMIN sees the full Positions page, not access denied', async ({ page }) => {
    await injectAuth(page, adminCreds);
    await page.goto('/positions');
    await expect(page.locator('[data-testid="page-title-positions"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-positions"]')).not.toBeVisible();
  });

  test('MANAGER sees explicit access denied on /positions', async ({ page }) => {
    await injectRoleAuth(page, 'MANAGER');
    await page.goto('/positions');
    await expect(page.locator('[data-testid="access-denied-positions"]')).toBeVisible();
    await expect(page.locator('[data-testid="page-title-positions"]')).not.toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('EMPLOYEE sees explicit access denied on /positions', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/positions');
    await expect(page.locator('[data-testid="access-denied-positions"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-positions"]')).toHaveText(/ไม่มีสิทธิ์|do not have permission/i);
    await expect(page.locator('table')).toHaveCount(0);
  });
});

test.describe('Access Denied — Employees', () => {
  test('SUPER_ADMIN sees the full Employees page, not access denied', async ({ page }) => {
    await injectAuth(page, adminCreds);
    await page.goto('/employees');
    await expect(page.locator('[data-testid="page-title-employees"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-employees"]')).not.toBeVisible();
  });

  // MANAGER is authorized by policy for the team-scoped view — must NOT be denied.
  // Unlike Departments/Positions/EMPLOYEE-on-Employees, this page's load() does fire a
  // real GET /employees call for MANAGER, so stub it too (empty page) — the synthetic
  // token isn't backend-signed and would otherwise 401 into the global logout redirect.
  test('MANAGER is not shown access denied on /employees (team view by policy)', async ({ page }) => {
    await injectRoleAuth(page, 'MANAGER');
    await page.route('**/employees?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
      }),
    );
    await page.goto('/employees');
    await expect(page.locator('[data-testid="access-denied-employees"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="page-title-employees"]')).toBeVisible();
    // Admin-only create action must stay hidden for MANAGER regardless of denial state.
    await expect(page.locator('[data-testid="btn-add-employee"]')).not.toBeVisible();
  });

  test('EMPLOYEE sees explicit access denied on /employees', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/employees');
    await expect(page.locator('[data-testid="access-denied-employees"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-employees"]')).toHaveText(/ไม่มีสิทธิ์|do not have permission/i);
    await expect(page.locator('[data-testid="page-title-employees"]')).not.toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('EMPLOYEE access denied card has a safe navigation link back to the dashboard', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/employees');
    const link = page.locator('[data-testid="access-denied-employees"] a');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard');
  });
});

/**
 * UX-POLISH-002 — consolidation of the /audit-logs and /attendance/risk-reviews
 * full-page gates onto the shared AccessDeniedCard. Both previously rendered
 * <ErrorState status={403} /> directly, which is hardcoded English regardless
 * of the language toggle and has no safe navigation link.
 */
test.describe('Access Denied — Audit Logs', () => {
  test('SUPER_ADMIN sees the full Audit Logs page, not access denied', async ({ page }) => {
    await injectAuth(page, adminCreds);
    await page.goto('/audit-logs');
    await expect(page.locator('[data-testid="page-title-audit-logs"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-audit-logs"]')).not.toBeVisible();
  });

  test('EMPLOYEE sees the shared access denied card on /audit-logs', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/audit-logs');
    await expect(page.locator('[data-testid="access-denied-audit-logs"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-audit-logs"]')).toHaveText(/ไม่มีสิทธิ์|do not have permission/i);
    await expect(page.locator('[data-testid="page-title-audit-logs"]')).not.toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('audit logs access denied card has a safe navigation link back to the dashboard', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/audit-logs');
    const link = page.locator('[data-testid="access-denied-audit-logs"] a');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard');
  });
});

test.describe('Access Denied — Risk Reviews', () => {
  test('SUPER_ADMIN sees the full Risk Reviews page, not access denied', async ({ page }) => {
    await injectAuth(page, adminCreds);
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="page-title-risk-reviews"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-risk-reviews"]')).not.toBeVisible();
  });

  test('EMPLOYEE sees the shared access denied card on /attendance/risk-reviews', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="access-denied-risk-reviews"]')).toBeVisible();
    await expect(page.locator('[data-testid="access-denied-risk-reviews"]')).toHaveText(/ไม่มีสิทธิ์|do not have permission/i);
    await expect(page.locator('[data-testid="page-title-risk-reviews"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="filter-status"]')).not.toBeVisible();
  });
});

test.describe('Access Denied — Off-site Review (manager-authorized route stays open)', () => {
  // /attendance/offsite-review is admin-or-manager (SEC-OFFSITE-001). Only EMPLOYEE
  // should be denied; MANAGER must keep working exactly as before this consolidation.
  //
  // Unlike departments/audit-logs/risk-reviews, this page's load() does not gate on
  // role internally — it fires GET /attendance/offsite-review on every mount regardless
  // of the caller's role (the render-time isAdminOrManager check still hides the data,
  // but the fetch still goes out). With a real EMPLOYEE JWT the backend would just
  // 403 that call, which the page ignores in favor of the access-denied gate. But this
  // synthetic role token isn't backend-signed, so an un-stubbed call 401s and trips the
  // app's global-401 hard-redirect-to-login handler before the gate is ever observed.
  // Stub the endpoint so the test observes the same UI a real EMPLOYEE would.
  async function stubOffsiteReviewList(page: import('@playwright/test').Page) {
    await page.route('**/attendance/offsite-review?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
      }),
    );
  }

  test('EMPLOYEE sees the shared access denied card on /attendance/offsite-review', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await stubOffsiteReviewList(page);
    await page.goto('/attendance/offsite-review');
    const card = page.locator('[data-testid="access-denied-offsite-review"]');
    await expect(card).toBeVisible();
    await expect(card).toHaveText(/ไม่มีสิทธิ์|don't have access/i);
    await expect(page.locator('[data-testid="page-title-offsite-review"]')).not.toBeVisible();
  });

  test('access denied card on /attendance/offsite-review links back to /attendance, not /dashboard', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await stubOffsiteReviewList(page);
    await page.goto('/attendance/offsite-review');
    const link = page.locator('[data-testid="access-denied-offsite-review"] a');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/attendance');
  });

  test('MANAGER is not shown access denied on /attendance/offsite-review (policy unchanged)', async ({ page }) => {
    await injectRoleAuth(page, 'MANAGER');
    await stubOffsiteReviewList(page);
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="access-denied-offsite-review"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="page-title-offsite-review"]')).toBeVisible();
  });
});

test.describe('Access Denied — Geofence Settings', () => {
  // Previously a bare, testid-less <div> with no back link — the weakest of the
  // four pre-consolidation variants (UX-AUDIT-001, Section B).
  test('EMPLOYEE sees the shared access denied card on /attendance/geofence-settings', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/attendance/geofence-settings');
    const card = page.locator('[data-testid="access-denied-geofence-settings"]');
    await expect(card).toBeVisible();
    await expect(card).toHaveText(/ไม่มีสิทธิ์|do not have permission/i);
    const link = card.locator('a');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard');
  });
});

test.describe('Access Denied — language toggle affects copy', () => {
  test('switching language updates the access denied card text live', async ({ page }) => {
    await injectRoleAuth(page, 'EMPLOYEE');
    await page.goto('/departments');
    const card = page.locator('[data-testid="access-denied-departments"]');
    await expect(card).toBeVisible();

    // Two toggles exist (desktop sidebar + mobile header); only one is visible per viewport.
    await page.locator('[data-testid="language-toggle-en"]:visible').first().click();
    await expect(card).toHaveText(/do not have permission/i);

    await page.locator('[data-testid="language-toggle-th"]:visible').first().click();
    await expect(card).toHaveText(/ไม่มีสิทธิ์/);
  });
});
