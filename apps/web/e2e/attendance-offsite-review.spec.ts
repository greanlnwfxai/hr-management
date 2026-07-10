import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Off-site Attendance Review', () => {
  test('renders Off-site Review heading', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="page-title-offsite-review"]')).toBeVisible();
  });

  test('page loads without error', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="error-offsite-review"]')).not.toBeVisible();
  });

  test('review list renders (cards or empty state)', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    const hasCards = await page.locator('[data-testid="offsite-review-card"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-offsite-review"]').isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  });

  test('nav-offsite-review item is visible for admin', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="nav-offsite-review"]')).toBeVisible();
  });

  test('review status filter is visible and defaults to Pending Review', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    const filter = page.locator('[data-testid="filter-review-status"]');
    await expect(filter).toBeVisible();
    await expect(filter).toHaveValue('PENDING_REVIEW');
  });

  test('filtering to Rejected status does not error', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    await page.selectOption('[data-testid="filter-review-status"]', 'REJECTED');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    const hasCards = await page.locator('[data-testid="offsite-review-card"]').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('[data-testid="empty-offsite-review"]').isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  });

  test('filtering by an unused employee ID shows empty state', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    await page.fill('[data-testid="filter-employee-id"]', '00000000-0000-0000-0000-000000000000');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="empty-offsite-review"]')).toBeVisible();
  });

  test('Approve button opens confirmation modal when a pending record exists', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    const hasCards = await page.locator('[data-testid="offsite-review-card"]').first().isVisible().catch(() => false);
    if (!hasCards) return; // No pending records seeded — nothing to review
    const approveBtn = page.locator('[data-testid="btn-approve"]').first();
    if (!(await approveBtn.isVisible().catch(() => false))) return;
    await approveBtn.click();
    await expect(page.locator('[data-testid="btn-confirm-approve"]')).toBeVisible();
  });

  test('Reject requires a reason of at least 3 characters', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    const hasCards = await page.locator('[data-testid="offsite-review-card"]').first().isVisible().catch(() => false);
    if (!hasCards) return;
    const rejectBtn = page.locator('[data-testid="btn-reject"]').first();
    if (!(await rejectBtn.isVisible().catch(() => false))) return;
    await rejectBtn.click();
    const confirmBtn = page.locator('[data-testid="btn-confirm-reject"]');
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeDisabled();
  });

  test('never renders raw GPS coordinates', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).not.toContain('"latitude"');
    expect(bodyText.toLowerCase()).not.toContain('"longitude"');
  });

  test('shows reviewer identity or a not-reviewed fallback on every card', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    // Default filter is PENDING_REVIEW — those cards should show the "not reviewed yet" fallback.
    const cards = page.locator('[data-testid="offsite-review-card"]');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator('[data-testid="reviewer-name"]')).toHaveText(/Not reviewed yet|ยังไม่มีผู้ตรวจสอบ/);
    }
  });

  test('resolved records show a reviewer name or a reviewer-unavailable fallback, never a raw "not reviewed" contradiction', async ({ page }) => {
    await page.goto('/attendance/offsite-review');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    await page.selectOption('[data-testid="filter-review-status"]', 'APPROVED');
    await expect(page.locator('[data-testid="loading-offsite-review"]')).not.toBeVisible({ timeout: 15000 });
    const cards = page.locator('[data-testid="offsite-review-card"]');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).locator('[data-testid="reviewer-name"]').innerText();
      expect(text).not.toMatch(/Not reviewed yet|ยังไม่มีผู้ตรวจสอบ/);
    }
  });
});
