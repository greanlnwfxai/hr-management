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
    // exact: true avoids matching "Leave Balance Admin" (h2 on the same page)
    await expect(page.getByRole('heading', { name: 'Leave', exact: true })).toBeVisible();
  });

  test('leave page loads without error', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.getByText('Loading leave requests…')).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Failed to load leave')).not.toBeVisible();
  });

  test('Request Leave button is visible', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.getByRole('button', { name: 'Request Leave' })).toBeVisible();
  });

  test('Request Leave button toggles the leave request form', async ({ page }) => {
    await page.goto('/leave');
    await page.getByRole('button', { name: 'Request Leave' }).click();
    await expect(page.getByText('New Leave Request')).toBeVisible();
    // Cancel closes it
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('New Leave Request')).not.toBeVisible();
  });

  test('Leave Balance Admin section is visible for admin', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.getByText('Leave Balance Admin')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '+ Add Balance' })).toBeVisible();
  });

  test('leave table headers or empty state are visible', async ({ page }) => {
    await page.goto('/leave');
    await expect(page.getByText('Loading leave requests…')).not.toBeVisible({ timeout: 15000 });
    // Either a table or the empty state message
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No leave requests found').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });
});

test.describe('Attendance', () => {
  test('renders Attendance heading', async ({ page }) => {
    await page.goto('/attendance');
    // exact: true avoids matching "Today's Attendance", "My Attendance History", "All Attendance Records"
    await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible();
  });

  test('attendance page loads without error', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByText('Loading…')).not.toBeVisible({ timeout: 15000 });
  });

  test('Today\'s Attendance panel is visible', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByText("Today's Attendance")).toBeVisible();
  });

  test('Clock In and Clock Out buttons are rendered', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByRole('button', { name: 'Clock In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clock Out' })).toBeVisible();
  });

  test('Bangkok time clock is displayed', async ({ page }) => {
    await page.goto('/attendance');
    // The label below the clock
    await expect(page.getByText('Asia/Bangkok (UTC+7)')).toBeVisible();
  });

  test('My Attendance History section is visible', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByText('My Attendance History')).toBeVisible();
  });

  test('All Attendance Records section visible for admin', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByText('All Attendance Records')).toBeVisible({ timeout: 15000 });
  });

  test('attendance history table headers or empty state are visible', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByText('Loading…')).not.toBeVisible({ timeout: 15000 });
    // My history section: table or empty state
    const hasTable = await page.locator('table').first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText('No attendance records').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });
});
