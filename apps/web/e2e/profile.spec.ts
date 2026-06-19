import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, creds);
});

test.describe('Profile page — admin role', () => {
  test('renders profile page title and nav link', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('[data-testid="page-title-profile"]')).toBeVisible();
    await expect(page.locator('aside [data-testid="nav-profile"]')).toBeVisible();
  });

  test('shows account info section with email', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('[data-testid="page-title-profile"]')).toBeVisible();
    // FieldRow renders email as an exact-text span in the account info card
    await expect(page.getByText('admin@hr.local', { exact: true })).toBeVisible();
  });

  test('shows password change form with all fields', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('[data-testid="form-change-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-new-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-confirm-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-change-password"]')).toBeVisible();
  });

  test('submit button is disabled when form is empty', async ({ page }) => {
    await page.goto('/profile');
    const btn = page.locator('[data-testid="btn-change-password"]');
    await expect(btn).toBeDisabled();
  });

  test('shows password rules when typing new password', async ({ page }) => {
    await page.goto('/profile');
    await page.locator('[data-testid="input-new-password"]').fill('abc');
    await expect(page.locator('[data-testid="pw-rules"]')).toBeVisible();
  });

  test('shows mismatch error when passwords differ', async ({ page }) => {
    await page.goto('/profile');
    await page.locator('[data-testid="input-new-password"]').fill('Abcdef1!');
    await page.locator('[data-testid="input-confirm-password"]').fill('Different1!');
    await expect(page.locator('[data-testid="pw-mismatch"]')).toBeVisible();
  });

  test('nav-profile link navigates to profile page', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('aside [data-testid="nav-profile"]').click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.locator('[data-testid="page-title-profile"]')).toBeVisible();
  });
});
