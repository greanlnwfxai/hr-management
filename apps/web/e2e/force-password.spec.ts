import { test, expect } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

let creds: AuthCreds;

test.beforeAll(() => {
  creds = getCachedAdminToken();
});

test.describe('Forced mustChangePassword flow', () => {
  test('redirects to /profile when navigating to /dashboard with mustChangePassword=true', async ({ page }) => {
    await injectAuth(page, {
      token: creds.token,
      user: { ...(creds.user as object), mustChangePassword: true },
    });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/profile/);
  });

  test('redirects to /profile when navigating to /leave with mustChangePassword=true', async ({ page }) => {
    await injectAuth(page, {
      token: creds.token,
      user: { ...(creds.user as object), mustChangePassword: true },
    });
    await page.goto('/leave');
    await expect(page).toHaveURL(/\/profile/);
  });

  test('shows forced banner when mustChangePassword=true', async ({ page }) => {
    await injectAuth(page, {
      token: creds.token,
      user: { ...(creds.user as object), mustChangePassword: true },
    });
    await page.goto('/profile');
    await expect(page.locator('[data-testid="banner-must-change-pw"]')).toBeVisible();
  });

  test('shows forced nav hint in sidebar when mustChangePassword=true', async ({ page }) => {
    await injectAuth(page, {
      token: creds.token,
      user: { ...(creds.user as object), mustChangePassword: true },
    });
    await page.goto('/profile');
    await expect(page.locator('aside [data-testid="nav-forced-hint"]')).toBeVisible();
  });

  test('profile page and password form remain accessible when forced', async ({ page }) => {
    await injectAuth(page, {
      token: creds.token,
      user: { ...(creds.user as object), mustChangePassword: true },
    });
    await page.goto('/profile');
    await expect(page.locator('[data-testid="page-title-profile"]')).toBeVisible();
    await expect(page.locator('[data-testid="form-change-password"]')).toBeVisible();
  });

  test('logout button remains accessible when forced', async ({ page }) => {
    await injectAuth(page, {
      token: creds.token,
      user: { ...(creds.user as object), mustChangePassword: true },
    });
    await page.goto('/profile');
    await expect(page.locator('[data-testid="btn-logout"]').first()).toBeVisible();
  });

  test('normal user without mustChangePassword is not redirected', async ({ page }) => {
    await injectAuth(page, creds);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('[data-testid="banner-must-change-pw"]')).not.toBeVisible();
  });
});
