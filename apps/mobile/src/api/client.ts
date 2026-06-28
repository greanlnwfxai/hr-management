import { ENV } from '../config/env';
import type { AuthUser } from '../auth/types';
import { isTokenExpired } from '../auth/session';
import {
  SessionExpiredError,
  type DashboardSummary,
  type MobileUserProfile,
  type ChangePasswordPayload,
  type ChangePasswordResponse,
  type PaginatedResponse,
  type EmployeeItem,
  type DepartmentItem,
  type AttendanceRecord,
  type AttendanceHistoryResponse,
  type MobileLocationPayload,
  type ClockActionResult,
  type LeaveRequestRecord,
  type LeaveBalanceRecord,
  type CreateLeaveRequestPayload,
  type AttendanceStatus,
  type LeaveType,
  type LeaveRequestStatus,
  type GeofenceLocation,
  type OffSiteRequestRecord,
  type CreateOffSiteRequestPayload,
  type OffsiteClockInPayload,
  type OffsiteClockOutPayload,
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
  loginId: string,
  password: string,
): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${ENV.API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ login: loginId, password }),
    });
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }

  if (response.status === 401) {
    throw new Error('ชื่อผู้ใช้/อีเมลหรือรหัสผ่านไม่ถูกต้อง');
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

// ─── Authenticated request helpers ────────────────────────────────────────────

function normalizeApiMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง';
}

async function authGet<T>(path: string, token: string): Promise<T> {
  if (isTokenExpired(token)) throw new SessionExpiredError();
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

async function authPost<T>(path: string, token: string, body: unknown): Promise<T> {
  if (isTokenExpired(token)) throw new SessionExpiredError();
  let response: Response;
  try {
    response = await fetch(`${ENV.API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }

  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    let parsed: unknown;
    try { parsed = await response.json(); } catch { parsed = null; }
    throw new Error(normalizeApiMessage(parsed));
  }

  return response.json() as Promise<T>;
}

function buildQueryString(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }

  const search = query.toString();
  return search ? `?${search}` : '';
}

// ─── Geofence ─────────────────────────────────────────────────────────────────

export async function getGeofenceLocation(token: string): Promise<GeofenceLocation> {
  return authGet<GeofenceLocation>('/attendance/geofence-location', token);
}

// ─── Password Change ──────────────────────────────────────────────────────────

export async function changePassword(
  token: string,
  payload: ChangePasswordPayload,
): Promise<ChangePasswordResponse> {
  return authPost<ChangePasswordResponse>('/auth/change-password', token, payload);
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

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function getMyAttendance(
  token: string,
  page = 1,
  limit = 10,
  params?: {
    startDate?: string;
    endDate?: string;
    status?: AttendanceStatus;
  },
): Promise<AttendanceHistoryResponse> {
  return authGet<AttendanceHistoryResponse>(
    `/attendance/me${buildQueryString({
      page,
      limit,
      startDate: params?.startDate,
      endDate: params?.endDate,
      status: params?.status,
    })}`,
    token,
  );
}

export async function getTodayAttendance(
  token: string,
): Promise<AttendanceRecord | null> {
  const today = new Date().toISOString().split('T')[0];
  const res = await authGet<AttendanceHistoryResponse>(
    `/attendance/me?startDate=${today}&endDate=${today}&limit=1`,
    token,
  );
  return res.data[0] ?? null;
}

export async function clockIn(
  token: string,
  payload: MobileLocationPayload,
): Promise<ClockActionResult> {
  return authPost<ClockActionResult>('/attendance/clock-in', token, payload);
}

export async function clockOut(
  token: string,
  payload: MobileLocationPayload,
): Promise<ClockActionResult> {
  return authPost<ClockActionResult>('/attendance/clock-out', token, payload);
}

export async function clockInOffsite(
  token: string,
  payload: OffsiteClockInPayload,
): Promise<AttendanceRecord> {
  return authPost<AttendanceRecord>('/attendance/offsite/clock-in', token, payload);
}

export async function clockOutOffsite(
  token: string,
  payload: OffsiteClockOutPayload,
): Promise<AttendanceRecord> {
  return authPost<AttendanceRecord>('/attendance/offsite/clock-out', token, payload);
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export async function getMyLeaveRequests(
  token: string,
  page = 1,
  limit = 20,
  params?: {
    status?: LeaveRequestStatus;
    leaveType?: LeaveType;
    startDate?: string;
    endDate?: string;
  },
): Promise<PaginatedResponse<LeaveRequestRecord>> {
  return authGet<PaginatedResponse<LeaveRequestRecord>>(
    `/leave/me${buildQueryString({
      page,
      limit,
      status: params?.status,
      leaveType: params?.leaveType,
      startDate: params?.startDate,
      endDate: params?.endDate,
    })}`,
    token,
  );
}

export async function getMyLeaveBalance(
  token: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<LeaveBalanceRecord>> {
  return authGet<PaginatedResponse<LeaveBalanceRecord>>(
    `/leave-balances/my?page=${page}&limit=${limit}`,
    token,
  );
}

export async function createLeaveRequest(
  token: string,
  payload: CreateLeaveRequestPayload,
): Promise<LeaveRequestRecord> {
  return authPost<LeaveRequestRecord>('/leave/request', token, payload);
}

// ─── Manager Approval ─────────────────────────────────────────────────────────

async function authPatch<T>(path: string, token: string, body: unknown): Promise<T> {
  if (isTokenExpired(token)) throw new SessionExpiredError();
  let response: Response;
  try {
    response = await fetch(`${ENV.API_BASE_URL}${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }

  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    let parsed: unknown;
    try { parsed = await response.json(); } catch { parsed = null; }
    throw new Error(normalizeApiMessage(parsed));
  }

  return response.json() as Promise<T>;
}

export async function getApprovalRequests(
  token: string,
  status: LeaveRequestStatus = 'PENDING',
  page = 1,
  limit = 50,
): Promise<PaginatedResponse<LeaveRequestRecord>> {
  return authGet<PaginatedResponse<LeaveRequestRecord>>(
    `/leave?status=${status}&page=${page}&limit=${limit}`,
    token,
  );
}

export async function approveLeaveRequest(
  token: string,
  id: string,
): Promise<LeaveRequestRecord> {
  return authPatch<LeaveRequestRecord>(`/leave/${id}/approve`, token, {});
}

export async function rejectLeaveRequest(
  token: string,
  id: string,
  rejectReason?: string,
): Promise<LeaveRequestRecord> {
  return authPatch<LeaveRequestRecord>(`/leave/${id}/reject`, token, { rejectReason });
}

// ─── Off-Site Requests ────────────────────────────────────────────────────────

export async function createOffSiteRequest(
  token: string,
  payload: CreateOffSiteRequestPayload,
): Promise<OffSiteRequestRecord> {
  return authPost<OffSiteRequestRecord>('/off-site/request', token, payload);
}

export async function getMyOffSiteRequests(
  token: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<OffSiteRequestRecord>> {
  return authGet<PaginatedResponse<OffSiteRequestRecord>>(
    `/off-site/me?page=${page}&limit=${limit}`,
    token,
  );
}

export async function getTodayOffSiteStatus(
  token: string,
): Promise<OffSiteRequestRecord | null> {
  const today = new Date().toISOString().split('T')[0];
  const res = await authGet<PaginatedResponse<OffSiteRequestRecord>>(
    `/off-site/me?date=${today}&limit=1`,
    token,
  );
  return res.data[0] ?? null;
}
