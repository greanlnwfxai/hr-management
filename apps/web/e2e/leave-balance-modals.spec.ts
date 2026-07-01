import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Leave — Vacation Setup and Add Balance modals', () => {
  test('Vacation Balance Setup modal employee dropdown has options', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('[data-testid="btn-vacation-setup"]')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-testid="btn-vacation-setup"]').click();

    const select = page.locator('form select').first();
    await expect(select).toBeVisible();
    // More than just the placeholder option — real employee options must be present.
    await expect
      .poll(async () => (await select.locator('option').count()), { timeout: 10000 })
      .toBeGreaterThan(1);
  });

  test('Add Balance modal employee dropdown has options', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.locator('[data-testid="btn-add-balance"]')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-testid="btn-add-balance"]').click();

    const select = page.locator('form select').first();
    await expect(select).toBeVisible();
    await expect
      .poll(async () => (await select.locator('option').count()), { timeout: 10000 })
      .toBeGreaterThan(1);
  });

  test('Vacation Balance Setup modal uses Thai labels in TH mode', async ({ page }) => {
    await page.goto('/leave');
    await page.locator('[data-testid="language-toggle-th"]').first().click();
    await page.locator('[data-testid="btn-vacation-setup"]').click();

    await expect(page.getByText('ตั้งค่าวันลาพักร้อน').first()).toBeVisible();
    // <option> text isn't considered "visible" by Playwright inside a closed <select>;
    // assert on the option element existing instead.
    await expect(page.locator('form select').first().locator('option', { hasText: 'เลือกพนักงาน' })).toHaveCount(1);
    await expect(page.getByText('บันทึกการตั้งค่า')).toBeVisible();
    await expect(page.getByText('ยกเลิก').first()).toBeVisible();
  });

  test('Add Balance modal uses Thai labels in TH mode', async ({ page }) => {
    await page.goto('/leave');
    await page.locator('[data-testid="language-toggle-th"]').first().click();
    await page.locator('[data-testid="btn-add-balance"]').click();

    await expect(page.getByText('เพิ่มวันลา').first()).toBeVisible();
    await expect(page.locator('form select').first().locator('option', { hasText: 'เลือกพนักงาน' })).toHaveCount(1);
    await expect(page.getByText('ยกเลิก').first()).toBeVisible();
  });

  test('Vacation Balance Setup modal uses English labels in EN mode', async ({ page }) => {
    await page.goto('/leave');
    await page.locator('[data-testid="language-toggle-en"]').first().click();
    await page.locator('[data-testid="btn-vacation-setup"]').click();

    await expect(page.getByText('Vacation Balance Setup').first()).toBeVisible();
    await expect(page.getByText('Set Up Balance')).toBeVisible();
  });
});
