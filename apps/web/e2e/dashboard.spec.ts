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
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('employee stat cards are visible', async ({ page }) => {
    await page.goto('/dashboard');
    // The "Employees" section label
    await expect(page.getByText('Employees', { exact: true }).first()).toBeVisible();
    // Key stat card labels rendered by StatCard
    for (const label of ['Total', 'Active', 'Departments', 'Positions']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('attendance stat section renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Present', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Late', { exact: true }).first()).toBeVisible();
  });

  test('leave stat section renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
  });

  test('recent sections render without error state', async ({ page }) => {
    await page.goto('/dashboard');
    // Use heading role to avoid strict-mode violation: the parent card div also
    // contains the heading text as a substring of its combined text content.
    await expect(page.getByRole('heading', { name: 'Recent Employees', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Attendance', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Leave Requests', exact: true })).toBeVisible();
  });

  test('dashboard data loads — no loading/error state remaining', async ({ page }) => {
    await page.goto('/dashboard');
    // Loading state uses the text "Loading dashboard…" — wait for it to disappear
    await expect(page.getByText('Loading dashboard…')).not.toBeVisible({ timeout: 15000 });
    // No error state
    await expect(page.getByText('Failed to load dashboard')).not.toBeVisible();
    // Heading and recent sections are present
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Employees', exact: true })).toBeVisible();
  });

  test('timezone indicator is visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Asia/Bangkok')).toBeVisible();
  });
});
