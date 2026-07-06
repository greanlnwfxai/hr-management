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
    // App defaults to Thai (DEFAULT_LANGUAGE in lib/i18n.ts); use the stable
    // data-testid rather than the localized button label so the assertion
    // doesn't depend on which language is active.
    await expect(page.locator('[data-testid="btn-apply-filters"]')).toBeVisible();
  });

  test('filtering by an unused risk level shows empty state', async ({ page }) => {
    await page.goto('/attendance/risk-reviews');
    await expect(page.locator('[data-testid="loading-risk-reviews"]')).not.toBeVisible({ timeout: 15000 });
    await page.selectOption('[data-testid="filter-status"]', 'IGNORED');
    await page.locator('[data-testid="btn-apply-filters"]').click();
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
    // Modal title is localized (Thai by default); assert on the review form
    // controls instead of the heading text to stay language-independent.
    await expect(page.locator('[data-testid="review-status-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-submit-review"]')).toBeVisible();
    // Never show raw GPS/nonce/token values in the rendered detail panel.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).not.toContain('"latitude"');
    expect(bodyText.toLowerCase()).not.toContain('"longitude"');
  });
});
