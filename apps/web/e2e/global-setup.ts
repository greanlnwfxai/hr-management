import { getAdminToken } from './helpers/auth';
import fs from 'fs';
import path from 'path';

export const AUTH_CACHE_PATH = path.join(__dirname, '.auth-cache.json');

/**
 * Global Playwright setup — runs once before any test file.
 * Fetches ONE admin token and writes it to a cache file so every spec
 * file can call getCachedAdminToken() without hitting the login endpoint again.
 * This keeps the total login requests well within the rate-limiter budget.
 */
export default async function globalSetup(): Promise<void> {
  const creds = await getAdminToken();
  fs.writeFileSync(AUTH_CACHE_PATH, JSON.stringify(creds), 'utf8');
}
