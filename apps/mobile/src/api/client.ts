import { ENV } from '../config/env';
import type { AuthUser } from '../auth/types';

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${ENV.API_BASE_URL}/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${ENV.API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }

  if (response.status === 401) {
    throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  if (!response.ok) {
    throw new Error(`เกิดข้อผิดพลาด: HTTP ${response.status}`);
  }

  return response.json() as Promise<LoginResponse>;
}

export async function getMe(token: string): Promise<AuthUser> {
  const response = await fetch(`${ENV.API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Session expired: HTTP ${response.status}`);
  }
  return response.json() as Promise<AuthUser>;
}
