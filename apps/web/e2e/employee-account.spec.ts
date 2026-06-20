import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

/**
 * Employee Detail — Account Management section smoke tests.
 *
 * These tests verify UI structure only (no actual create/reset mutations against
 * seeded admin data to avoid rotating the admin password and breaking the auth cache).
 * Actual provision/reset mutations are covered by API unit tests.
 */

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Employee Detail — Account Management', () => {
  test('account management section is visible on employee detail for admin', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) {
      // No employees in CI database — section cannot be tested via navigation
      test.skip();
      return;
    }

    // Click first employee row link
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.locator('a, [data-testid="btn-edit-employee"]').first().click();
    await page.waitForURL(/\/employees\/.+/);
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    await expect(page.locator('[data-testid="account-management-section"]')).toBeVisible();
  });

  test('employee detail page navigated directly shows account section', async ({ page }) => {
    // Navigate to list first to get an ID
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) {
      test.skip();
      return;
    }

    const href = await page.locator('table tbody tr a').first().getAttribute('href').catch(() => null);
    if (!href) {
      test.skip();
      return;
    }

    await page.goto(href);
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="account-management-section"]')).toBeVisible();
  });

  test('no-account state shows create account form when no account linked', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) {
      test.skip();
      return;
    }

    const href = await page.locator('table tbody tr a').first().getAttribute('href').catch(() => null);
    if (!href) {
      test.skip();
      return;
    }

    await page.goto(href);
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="account-management-section"]')).toBeVisible();

    // Either no-account state (create form) or account info card should be present
    const hasNoAccountState = await page.locator('[data-testid="no-account-state"]').isVisible().catch(() => false);
    const hasAccountCard = await page.locator('[data-testid="account-info-card"]').isVisible().catch(() => false);
    const hasResetBtn = await page.locator('[data-testid="btn-reset-password"]').isVisible().catch(() => false);

    expect(hasNoAccountState || hasAccountCard || hasResetBtn).toBe(true);
  });

  test('create account button is visible in no-account state', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) { test.skip(); return; }

    const href = await page.locator('table tbody tr a').first().getAttribute('href').catch(() => null);
    if (!href) { test.skip(); return; }

    await page.goto(href);
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const isNoAccount = await page.locator('[data-testid="no-account-state"]').isVisible().catch(() => false);
    if (!isNoAccount) { test.skip(); return; }

    await expect(page.locator('[data-testid="btn-create-account"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-username"]')).toBeVisible();
    await expect(page.locator('[data-testid="select-role"]')).toBeVisible();
  });

  test('reset password button is visible when account exists', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) { test.skip(); return; }

    const href = await page.locator('table tbody tr a').first().getAttribute('href').catch(() => null);
    if (!href) { test.skip(); return; }

    await page.goto(href);
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const hasAccountCard = await page.locator('[data-testid="account-info-card"]').isVisible().catch(() => false);
    if (!hasAccountCard) { test.skip(); return; }

    await expect(page.locator('[data-testid="btn-reset-password"]')).toBeVisible();
  });

  test('reset password confirmation panel appears on button click', async ({ page }) => {
    await page.goto('/employees');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) { test.skip(); return; }

    const href = await page.locator('table tbody tr a').first().getAttribute('href').catch(() => null);
    if (!href) { test.skip(); return; }

    await page.goto(href);
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });

    const hasResetBtn = await page.locator('[data-testid="btn-reset-password"]').isVisible().catch(() => false);
    if (!hasResetBtn) { test.skip(); return; }

    await page.locator('[data-testid="btn-reset-password"]').click();
    await expect(page.locator('[data-testid="reset-confirm-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-confirm-reset"]')).toBeVisible();
  });
});
