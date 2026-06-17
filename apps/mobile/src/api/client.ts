import { ENV } from '../config/env';
import type { AuthUser } from '../auth/types';
import {
  SessionExpiredError,
  type DashboardSummary,
  type MobileUserProfile,
  type PaginatedResponse,
  type EmployeeItem,
  type DepartmentItem,
} from './types';

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

// ─── Authenticated request helper ─────────────────────────────────────────────

async function authGet<T>(path: string, token: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ENV.API_BASE_URL}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }

  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    throw new Error(`ไม่สามารถโหลดข้อมูลได้: HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboard(token: string): Promise<DashboardSummary> {
  return authGet<DashboardSummary>('/dashboard', token);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(token: string): Promise<MobileUserProfile> {
  return authGet<MobileUserProfile>('/auth/me', token);
}

// ─── Employees ────────────────────────────────────────────────────────────────

export async function getEmployees(
  token: string,
  page = 1,
  limit = 1,
): Promise<PaginatedResponse<EmployeeItem>> {
  return authGet<PaginatedResponse<EmployeeItem>>(
    `/employees?page=${page}&limit=${limit}`,
    token,
  );
}

// ─── Departments ──────────────────────────────────────────────────────────────

export async function getDepartments(
  token: string,
  page = 1,
  limit = 1,
): Promise<PaginatedResponse<DepartmentItem>> {
  return authGet<PaginatedResponse<DepartmentItem>>(
    `/departments?page=${page}&limit=${limit}`,
    token,
  );
}
