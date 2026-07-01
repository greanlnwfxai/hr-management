import { test, expect, request as playwrightRequest } from '@playwright/test';
import { getCachedAdminToken, injectAuth, type AuthCreds } from './helpers/auth';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4002';

let creds: AuthCreds;

/**
 * These modals' employee dropdowns depend on at least one ACTIVE employee
 * existing. Production/local dev DBs normally have real employees, but the
 * CI seed (prisma/seed.ts) only creates the admin user — zero employees,
 * zero departments, zero positions. Without this fixture the "dropdown has
 * options" tests fail in CI for a reason unrelated to app correctness: there
 * is nothing to list yet. Create the minimum fixture only if none exists,
 * so this is a no-op against a real, already-populated database.
 */
async function ensureAtLeastOneActiveEmployee(token: string): Promise<void> {
  const ctx = await playwrightRequest.newContext({ baseURL: API_URL });
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const existing = await ctx.get('/employees?status=ACTIVE&limit=1', { headers });
    const existingBody = await existing.json();
    if (existingBody?.meta?.total > 0) return; // already have real data — nothing to do

    const deptName = 'E2E Fixture Department';
    let deptRes = await ctx.post('/departments', { headers, data: { name: deptName } });
    let dept = await deptRes.json();
    if (!deptRes.ok() && deptRes.status() === 409) {
      const list = await (await ctx.get('/departments?limit=100', { headers })).json();
      dept = list.data.find((d: { name: string }) => d.name === deptName);
    }

    const posTitle = 'E2E Fixture Position';
    let posRes = await ctx.post('/positions', { headers, data: { title: posTitle, departmentId: dept.id } });
    let pos = await posRes.json();
    if (!posRes.ok() && posRes.status() === 409) {
      const list = await (await ctx.get('/positions?limit=100', { headers })).json();
      pos = list.data.find((p: { title: string }) => p.title === posTitle);
    }

    const empRes = await ctx.post('/employees', {
      headers,
      data: {
        employeeCode: 'E2E-FIXTURE-001',
        firstName: 'E2E',
        lastName: 'Fixture',
        email: 'e2e.fixture@hr.local',
        hireDate: '2024-01-01',
        status: 'ACTIVE',
        departmentId: dept.id,
        positionId: pos.id,
      },
    });
    if (!empRes.ok() && empRes.status() !== 409) {
      throw new Error(`Failed to create fixture employee: ${empRes.status()} ${await empRes.text()}`);
    }
  } finally {
    await ctx.dispose();
  }
}

test.beforeAll(async () => {
  creds = getCachedAdminToken();
  await ensureAtLeastOneActiveEmployee(creds.token);
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
    // Distinguish "fetch failed" from "genuinely no options" for easier CI diagnosis.
    await expect(page.locator('[data-testid="employees-load-error"]')).not.toBeVisible();
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
    await expect(page.locator('[data-testid="employees-load-error"]')).not.toBeVisible();
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
