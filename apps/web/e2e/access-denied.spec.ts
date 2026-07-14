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
