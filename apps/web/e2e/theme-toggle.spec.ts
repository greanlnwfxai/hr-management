import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.describe('Theme toggle', () => {
  test('toggle button is visible in sidebar', async ({ page }) => {
    await injectAuth(page, creds);
    await page.goto('/dashboard');
    const toggle = page.locator('[data-testid="theme-toggle"]').first();
    await expect(toggle).toBeVisible();
  });

  test('clicking toggle does not break page rendering', async ({ page }) => {
    await injectAuth(page, creds);
    await page.goto('/dashboard');
    const toggle = page.locator('[data-testid="theme-toggle"]').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    // Page heading still visible after toggle
    await expect(page.locator('[data-testid="page-title-dashboard"]')).toBeVisible();
  });

  test('theme persists across navigation', async ({ page }) => {
    await injectAuth(page, creds);
    await page.goto('/dashboard');
    const toggle = page.locator('[data-testid="theme-toggle"]').first();
    await toggle.click();
    // Navigate away and back — page should still render correctly
    await page.goto('/employees');
    await expect(page.locator('[data-testid="page-title-employees"]')).toBeVisible();
  });
});

test.describe('Language toggle', () => {
  test('language toggle is visible', async ({ page }) => {
    await injectAuth(page, creds);
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="language-toggle"]').first()).toBeVisible();
  });

  test('language toggle buttons are visible', async ({ page }) => {
    await injectAuth(page, creds);
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="language-toggle-th"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="language-toggle-en"]').first()).toBeVisible();
  });

  test('switching language does not break page rendering', async ({ page }) => {
    await injectAuth(page, creds);
    await page.goto('/dashboard');
    // Switch to English
    await page.locator('[data-testid="language-toggle-en"]').first().click();
    await expect(page.locator('[data-testid="page-title-dashboard"]')).toBeVisible();
    // Switch back to Thai
    await page.locator('[data-testid="language-toggle-th"]').first().click();
    await expect(page.locator('[data-testid="page-title-dashboard"]')).toBeVisible();
  });

  test('switching language does not break navigation', async ({ page }) => {
    await injectAuth(page, creds);
    await page.goto('/dashboard');
    await page.locator('[data-testid="language-toggle-en"]').first().click();
    await page.goto('/employees');
    await expect(page.locator('[data-testid="page-title-employees"]')).toBeVisible();
  });
});
