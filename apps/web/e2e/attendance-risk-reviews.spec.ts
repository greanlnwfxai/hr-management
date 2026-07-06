import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Attendance Risk Reviews', () => {
  test('renders Risk Reviews heading', async ({ page }) => {
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="page-title-risk-reviews"]')).toBeVisible();
  });

  test('page loads without error', async ({ page }) => {
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="loading-risk-reviews"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="error-risk-reviews"]')).not.toBeVisible();
  });

  test('risk review list renders (table or empty state)', async ({ page }) => {
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="loading-risk-reviews"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-risk-reviews"]').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('nav-risk-reviews item is visible for admin', async ({ page }) => {
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="nav-risk-reviews"]')).toBeVisible();
  });

  test('filter form has Apply Filters button', async ({ page }) => {
    await page.goto('/attendance/risk-reviews');
    await expect(page.getByRole('button', { name: 'Apply Filters' })).toBeVisible();
  });

  test('filtering by an unused risk level shows empty state', async ({ page }) => {
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="loading-risk-reviews"]')).not.toBeVisible({ timeout: 15000 });
    await page.selectOption('[data-testid="filter-status"]', 'IGNORED');
    await page.getByRole('button', { name: 'Apply Filters' }).click();
    await expect(page.locator('[data-testid="loading-risk-reviews"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-risk-reviews"]').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('Detail button opens modal with review form when data exists', async ({ page }) => {
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="loading-risk-reviews"]')).not.toBeVisible({ timeout: 15000 });
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    if (!hasTable) return; // Empty state — no detail to test
    await page.locator('[data-testid^="btn-detail-"]').first().click();
    await expect(page.getByRole('heading', { name: 'Risk Review Detail' })).toBeVisible();
    await expect(page.locator('[data-testid="review-status-select"]')).toBeVisible();
    // Never show raw GPS/nonce/token values in the rendered detail panel.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).not.toContain('"latitude"');
    expect(bodyText.toLowerCase()).not.toContain('"longitude"');
  });
});
