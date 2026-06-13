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
    for (const label of ['Dashboard', 'Employees', 'Departments', 'Positions', 'Attendance', 'Leave']) {
      await expect(sidebar.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('navigates to Dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('navigates to Employees', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();
  });

  test('navigates to Departments', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.getByRole('heading', { name: 'Departments' })).toBeVisible();
  });

  test('navigates to Positions', async ({ page }) => {
    await page.goto('/positions');
    await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible();
  });

  test('navigates to Attendance', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible();
  });

  test('navigates to Leave', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.getByRole('heading', { name: 'Leave', exact: true })).toBeVisible();
  });

  test('sidebar links navigate correctly', async ({ page }) => {
    await page.goto('/dashboard');
    // Click Employees from sidebar
    await page.locator('aside').getByRole('link', { name: 'Employees' }).click();
    await expect(page).toHaveURL(/\/employees/);
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();
  });

  test('admin user email shown in sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('admin@hr.local')).toBeVisible();
  });
});
