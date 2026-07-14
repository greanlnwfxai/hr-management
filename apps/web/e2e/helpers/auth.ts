import { request as playwrightRequest, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@hr.local';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin1234';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4002';

export type AuthCreds = { token: string; user: object };

/**
 * Fetch a fresh JWT from the API without a browser.
 * Call once per spec file (beforeAll) to minimise login requests against the rate limiter.
 */
export async function getAdminToken(): Promise<AuthCreds> {
  const ctx = await playwrightRequest.newContext({ baseURL: API_URL });
  try {
    const res = await ctx.post('/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (!res.ok()) {
      throw new Error(`Admin login failed: HTTP ${res.status()} — check API is running at ${API_URL}`);
    }
    const body = await res.json() as { accessToken: string; user: object };
    return { token: body.accessToken, user: body.user };
  } finally {
    await ctx.dispose();
  }
}

/**
 * Inject auth into localStorage without going through the UI login form.
 * Navigate to /login first (which sets the correct origin), write to localStorage,
 * then callers navigate to the actual target page.
 *
 * Avoids using rate-limited /auth/login for every test.
 */
export async function injectAuth(page: Page, creds: AuthCreds): Promise<void> {
  await page.goto('/login');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('hr_access_token', token);
    localStorage.setItem('hr_user', JSON.stringify(user));
  }, { token: creds.token, user: creds.user });
}

/**
 * Read the admin token written by globalSetup without making any HTTP requests.
 * Use this in spec file beforeAll hooks to avoid the login rate limiter.
 */
export function getCachedAdminToken(): AuthCreds {
  const cachePath = path.join(__dirname, '..', '.auth-cache.json');
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as AuthCreds;
  } catch {
    throw new Error(
      `Auth cache not found at ${cachePath}. ` +
      'Ensure Playwright global setup ran: playwright.config.ts must have globalSetup configured.',
    );
  }
}

/**
 * Full UI login — use only in login.spec.ts where the login flow itself is under test.
 */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

/**
 * Inject a synthetic (non-admin) role into localStorage without a real login/token.
 *
 * The token is not signed by the real backend, so any real API call made with it
 * would 401. `AppLayout` unconditionally calls `GET /auth/me` on every authenticated
 * page (for the header display name), and the app's global 401 handler
 * (`apps/web/lib/api.ts`) reacts to *any* 401 by clearing auth and hard-redirecting
 * to `/login` — which would stomp the page under test before its own access-denied
 * gate ever renders. To avoid that race without touching real backend data, this
 * stubs `GET /auth/me` to return a 200 matching the synthetic user, purely so
 * `AppLayout` mounts normally. It does not fake authorization for any other
 * endpoint — pages gated to admin/allowed roles must still fail closed if they
 * make their own API calls with this token.
 */
export async function injectRoleAuth(page: Page, role: 'MANAGER' | 'EMPLOYEE'): Promise<void> {
  const user = {
    id: `e2e-${role.toLowerCase()}-id`,
    email: `${role.toLowerCase()}@e2e.local`,
    username: role.toLowerCase(),
    role,
  };

  await page.route('**/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...user, mustChangePassword: false, employeeId: null, employee: null }),
    }),
  );

  await page.goto('/login');
  await page.evaluate((u) => {
    localStorage.setItem('hr_access_token', 'e2e-synthetic-token-access-denied-test');
    localStorage.setItem('hr_user', JSON.stringify(u));
  }, user);
}
