import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Leave', () => {
  test('renders Leave heading', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('[data-testid="page-title-leave"]')).toBeVisible();
  });

  test('leave page loads without error', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('[data-testid="loading-leave"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="error-leave"]')).not.toBeVisible();
  });

  test('Request Leave button is visible', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('[data-testid="btn-request-leave"]')).toBeVisible();
  });

  test('Request Leave button toggles the leave request form', async ({ page }) => {
    await page.goto('/leave');
    await page.locator('[data-testid="btn-request-leave"]').click();
    await expect(page.locator('[data-testid="section-new-request"]')).toBeVisible();
    // Cancel closes it
    await page.locator('[data-testid="btn-request-leave"]').click();
    await expect(page.locator('[data-testid="section-new-request"]')).not.toBeVisible();
  });

  test('Leave Balance Admin section is visible for admin', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('[data-testid="section-balance-admin"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="btn-add-balance"]')).toBeVisible();
  });

  test('leave table headers or empty state are visible', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('[data-testid="loading-leave"]')).not.toBeVisible({ timeout: 15000 });
    // Either a table or the empty state message
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-leave"]').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });
});

test.describe('Attendance', () => {
  test('renders Attendance heading', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="page-title-attendance"]')).toBeVisible();
  });

  test('attendance page loads without error', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="loading-my-att"]')).not.toBeVisible({ timeout: 15000 });
  });

  test("Today's Attendance panel is visible", async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="section-todays-attendance"]')).toBeVisible();
  });

  test('admin without employee profile shows neutral self-attendance state', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="loading-my-att"]')).not.toBeVisible({ timeout: 15000 });
    // Neutral info state must be visible — no red error box
    await expect(page.locator('[data-testid="no-profile-info"]').first()).toBeVisible();
    // Clock In / Clock Out buttons must NOT be rendered for admin with no employee profile
    await expect(page.locator('[data-testid="btn-clock-in"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="btn-clock-out"]')).toHaveCount(0);
    // All Attendance Records section must still load for admin
    await expect(page.locator('[data-testid="section-all-records"]')).toBeVisible({ timeout: 15000 });
  });

  test('web attendance page never shows clock-in/out action buttons', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="loading-my-att"]')).not.toBeVisible({ timeout: 15000 });
    // Clock-in/out must never be actionable from Web/Admin — mobile-only policy
    await expect(page.locator('[data-testid="btn-clock-in"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="btn-clock-out"]')).toHaveCount(0);
  });

  test('web attendance page shows STEP Connect Mobile-only notice', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="loading-my-att"]')).not.toBeVisible({ timeout: 15000 });
    // Notice only renders when an employee profile exists (not for the no-profile admin case)
    const hasNoProfile = await page.locator('[data-testid="no-profile-info"]').first().isVisible().catch(() => false);
    if (!hasNoProfile) {
      await expect(page.locator('[data-testid="mobile-only-notice"]')).toBeVisible();
    }
  });

  test('Bangkok time clock is displayed', async ({ page }) => {
    await page.goto('/attendance');
    // Static timezone label — won't change with language
    await expect(page.getByText('Asia/Bangkok (UTC+7)')).toBeVisible();
  });

  test('My Attendance History section is visible', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="section-my-history"]')).toBeVisible();
  });

  test('All Attendance Records section visible for admin', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="section-all-records"]')).toBeVisible({ timeout: 15000 });
  });

  test('attendance history table headers or empty state are visible', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.locator('[data-testid="loading-my-att"]')).not.toBeVisible({ timeout: 15000 });
    // My history section: table, empty state, or neutral no-profile info (admin with no employee profile)
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-state"]').first().isVisible().catch(() => false);
    const hasNoProfile = await page.locator('[data-testid="no-profile-info"]').first().isVisible().catch(() => false);
    expect(hasTable || hasEmpty || hasNoProfile).toBe(true);
  });
});
