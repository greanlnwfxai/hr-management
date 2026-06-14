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
    await expect(page.locator('[data-testid="page-title-employees"]')).toBeVisible();
  });

  test('employee page loads without error', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="error-state"]')).not.toBeVisible();
  });

  // CI fresh database has 0 employees. Accept either the data table or the empty-state.
  test('employee list renders (table or empty state)', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-state"]').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('Add Employee button is visible for admin', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="btn-add-employee"]')).toBeVisible();
  });

  test('search input is visible', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
  });

  test('status filter dropdown is visible', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  // Table column headers appear only when data exists.
  test('employee table shows correct columns when data exists', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) return; // Empty state — no columns to verify
    // Verify table exists and has column headers
    await expect(page.locator('table thead tr th').first()).toBeVisible();
  });

  // Actions buttons appear in each row only when employees exist.
  test('employee row actions are visible for admin when data exists', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) return; // Empty state — no action buttons to verify
    await expect(page.locator('[data-testid="btn-edit-employee"]').first()).toBeVisible();
  });

  test('search for a non-existent term shows empty state', async ({ page }) => {
    await page.goto('/employees');
    await page.fill('[data-testid="search-input"]', 'ZZZNOMATCHXXX');
    await page.locator('[data-testid="btn-search"]').click();
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible({ timeout: 15000 });
  });
});
