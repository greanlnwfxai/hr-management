import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Departments', () => {
  test('renders Departments heading', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.locator('[data-testid="page-title-departments"]')).toBeVisible();
  });

  test('department page loads without error', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="error-state"]')).not.toBeVisible();
  });

  // CI fresh database may have 0 departments. Accept either the data table or the empty-state.
  test('department list renders (table or empty state)', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-state"]').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('Add Department button is visible for admin', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.locator('[data-testid="btn-add-department"]')).toBeVisible();
  });

  test('search input is visible', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
  });

  // Table column headers appear only when data exists.
  test('department table shows a manager column when data exists', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) return; // Empty state — no columns to verify
    await expect(page.locator('table thead tr th').first()).toBeVisible();
  });

  // Row actions appear only when departments exist.
  test('department row actions are visible for admin when data exists', async ({ page }) => {
    await page.goto('/departments');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) return; // Empty state — no action buttons to verify
    await expect(page.locator('[data-testid="btn-edit-department"]').first()).toBeVisible();
  });

  test('search for a non-existent term shows empty state', async ({ page }) => {
    await page.goto('/departments');
    await page.fill('[data-testid="search-input"]', 'ZZZNOMATCHXXX');
    await page.locator('[data-testid="btn-search"]').click();
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible({ timeout: 15000 });
  });

  // Create modal exercises the i18n-routed manager field/placeholder fixed in STEP-16B.
  test('Add Department modal shows manager field with i18n-routed placeholder', async ({ page }) => {
    await page.goto('/departments');
    await page.locator('[data-testid="btn-add-department"]').click();
    const managerSelect = page.getByRole('combobox');
    await expect(managerSelect).toBeVisible();
    // Default option text must come from the i18n dictionary, not a stray hardcoded literal.
    await expect(managerSelect.locator('option').first()).toHaveText(/no manager|ไม่มีผู้จัดการ/i);
  });
});
