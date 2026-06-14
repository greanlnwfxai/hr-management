import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Navigation — admin role', () => {
  test('sidebar renders all six nav links after login', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = page.locator('aside');
    for (const testid of [
      'nav-dashboard', 'nav-employees', 'nav-departments',
      'nav-positions', 'nav-attendance', 'nav-leave',
    ]) {
      await expect(sidebar.locator(`[data-testid="${testid}"]`)).toBeVisible();
    }
  });

  test('navigates to Dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="page-title-dashboard"]')).toBeVisible();
  });

  test('navigates to Employees', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="page-title-employees"]')).toBeVisible();
  });

  test('navigates to Departments', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.locator('[data-testid="page-title-departments"]')).toBeVisible();
  });

  test('navigates to Positions', async ({ page }) => {
    await page.goto('/positions');
    await expect(page.locator('[data-testid="page-title-positions"]')).toBeVisible();
  });

  test('navigates to Attendance', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="page-title-attendance"]')).toBeVisible();
  });

  test('navigates to Leave', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('[data-testid="page-title-leave"]')).toBeVisible();
  });

  test('sidebar links navigate correctly', async ({ page }) => {
    await page.goto('/dashboard');
    // Click Employees from sidebar
    await page.locator('aside [data-testid="nav-employees"]').click();
    await expect(page).toHaveURL(/\/employees/);
    await expect(page.locator('[data-testid="page-title-employees"]')).toBeVisible();
  });

  test('admin user email shown in sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('admin@hr.local')).toBeVisible();
  });
});
