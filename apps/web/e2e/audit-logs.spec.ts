import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Audit Logs', () => {
  test('renders Audit Logs heading', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.locator('[data-testid="page-title-audit-logs"]')).toBeVisible();
  });

  test('page loads without error', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.locator('[data-testid="loading-audit-logs"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="error-audit-logs"]')).not.toBeVisible();
  });

  test('audit log list renders (table or empty state)', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.locator('[data-testid="loading-audit-logs"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-audit-logs"]').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('nav-audit-logs item is visible for admin', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.locator('[data-testid="nav-audit-logs"]')).toBeVisible();
  });

  test('filter form has Apply Filters button', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.getByRole('button', { name: 'Apply Filters' })).toBeVisible();
  });

  test('filtering by unknown action shows empty state', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.locator('[data-testid="loading-audit-logs"]')).not.toBeVisible({ timeout: 15000 });
    await page.fill('input[placeholder="e.g. AUTH_LOGIN_SUCCESS"]', 'ACTION_NONEXISTENT_ZZZ999');
    await page.getByRole('button', { name: 'Apply Filters' }).click();
    await expect(page.locator('[data-testid="loading-audit-logs"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="empty-audit-logs"]')).toBeVisible({ timeout: 15000 });
  });

  test('Detail button opens modal when data exists', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.locator('[data-testid="loading-audit-logs"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) return; // Empty state — no detail to test
    await page.locator('[data-testid^="btn-detail-"]').first().click();
    await expect(page.getByRole('heading', { name: 'Audit Log Detail' })).toBeVisible();
  });
});
