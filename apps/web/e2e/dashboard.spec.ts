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

  test('KPI cards are visible', async ({ page }) => {
    await page.goto('/dashboard');
    for (const id of ['stat-total', 'stat-active', 'stat-att-rate', 'stat-pending', 'stat-pending-offsite', 'stat-low-balance']) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
  });

  test('recent sections render without error state', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="section-recent-employees"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-recent-attendance"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-recent-leave"]')).toBeVisible();
  });

  test('dashboard data loads — no loading/error state remaining', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="loading-state"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="error-state"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="page-title-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="section-recent-employees"]')).toBeVisible();
  });

  test('timezone indicator is visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Asia/Bangkok')).toBeVisible();
  });
});
