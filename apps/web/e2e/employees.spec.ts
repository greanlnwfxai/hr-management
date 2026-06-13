import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Employees', () => {
  test('renders Employees heading', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();
  });

  test('employee table loads without error', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByText('Loading employees…')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Failed to load employees')).not.toBeVisible();
  });

  test('employee table headers are visible', async ({ page }) => {
    await page.goto('/employees');
    // Wait for table to appear
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    for (const header of ['Code', 'Name', 'Email', 'Department', 'Position', 'Status']) {
      await expect(page.getByRole('columnheader', { name: header })).toBeVisible();
    }
  });

  test('Add Employee button is visible for admin', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByRole('button', { name: '+ Add Employee' })).toBeVisible();
  });

  test('search input is visible', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByPlaceholder('Search employees…')).toBeVisible();
  });

  test('status filter dropdown is visible', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  test('seeded admin employee appears in the list', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    // The seeded admin record has email admin@hr.local
    await expect(page.getByText('admin@hr.local')).toBeVisible();
  });

  test('Actions column is visible for admin (Edit/Deactivate buttons)', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible();
  });

  test('search for a non-existent term shows empty state', async ({ page }) => {
    await page.goto('/employees');
    await page.fill('input[placeholder="Search employees…"]', 'ZZZNOMATCHXXX');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No employees found')).toBeVisible({ timeout: 15000 });
  });
});
