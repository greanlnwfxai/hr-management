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
