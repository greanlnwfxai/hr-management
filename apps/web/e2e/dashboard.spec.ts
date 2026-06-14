import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Dashboard', () => {
  test('renders Dashboard heading', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="page-title-dashboard"]')).toBeVisible();
  });

  test('employee stat cards are visible', async ({ page }) => {
    await page.goto('/dashboard');
    // The employee section label
    await expect(page.locator('[data-testid="stat-section-employees"]')).toBeVisible();
    // Key stat cards
    for (const id of ['stat-total', 'stat-active', 'stat-departments', 'stat-positions']) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
  });

  test('attendance stat section renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="stat-present"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-late"]')).toBeVisible();
  });

  test('leave stat section renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="stat-pending"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-approved"]')).toBeVisible();
  });

  test('recent sections render without error state', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="section-recent-employees"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-recent-attendance"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-recent-leave"]')).toBeVisible();
  });

  test('dashboard data loads — no loading/error state remaining', async ({ page }) => {
    await page.goto('/dashboard');
    // Wait for loading state to disappear
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    // No error state
    await expect(page.locator('[data-testid="error-state"]')).not.toBeVisible();
    // Page title and recent sections are present
    await expect(page.locator('[data-testid="page-title-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-recent-employees"]')).toBeVisible();
  });

  test('timezone indicator is visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Asia/Bangkok')).toBeVisible();
  });
});
