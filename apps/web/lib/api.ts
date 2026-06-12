import { getToken, clearAuth } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002';

type FetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, headers: extraHeaders, ...rest } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };

  if (!skipAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type LoginResponse = {
  accessToken: string;
  user: { id: string; email: string; role: string };
};

export function login(email: string, password: string) {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
}

export function getMe() {
  return apiFetch<{ id: string; email: string; role: string }>('/auth/me');
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export type DashboardData = {
  generatedAt: string;
  timezone: string;
  employees: {
    totalEmployees: number;
    activeEmployees: number;
    inactiveEmployees: number;
    resignedEmployees: number;
    totalDepartments: number;
    totalPositions: number;
  };
  attendance: {
    todayDate: string;
    todayPresentCount: number;
    todayLateCount: number;
    todayAbsentCount: number;
    todayClockedInCount: number;
    todayClockedOutCount: number;
  };
  leave: {
    totalLeaveRequests: number;
    pendingLeaveRequests: number;
    approvedLeaveRequests: number;
    rejectedLeaveRequests: number;
    lowLeaveBalanceCount: number;
  };
  recent: {
    employees: RecentEmployee[];
    attendance: RecentAttendance[];
    leaveRequests: RecentLeave[];
  };
};

export type RecentEmployee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  status: string;
  createdAt: string;
};

export type RecentAttendance = {
  id: string;
  date: string;
  status: string;
  employee?: { firstName: string; lastName: string };
};

export type RecentLeave = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  employee?: { firstName: string; lastName: string };
};

export function getDashboard() {
  return apiFetch<DashboardData>('/dashboard');
}

// ── Employees ─────────────────────────────────────────────────────────────────

export type Employee = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  status: string;
  department?: { id: string; name: string };
  position?: { id: string; title: string };
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

export function getEmployees(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<Employee>>(`/employees${query}`);
}

// ── Leave ─────────────────────────────────────────────────────────────────────

export type LeaveRequest = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason?: string;
  employee?: { id: string; firstName: string; lastName: string; employeeCode?: string };
  createdAt: string;
};

export type LeaveBalance = {
  id: string;
  leaveType: string;
  year: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
};

export function getLeave(params?: { page?: number; limit?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<LeaveRequest>>(`/leave${query}`);
}

export function getMyLeave(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<LeaveRequest>>(`/leave/me${query}`);
}

export function createLeaveRequest(body: {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string;
}) {
  return apiFetch<LeaveRequest>('/leave/request', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function approveLeave(id: string) {
  return apiFetch<LeaveRequest>(`/leave/${id}/approve`, { method: 'PATCH' });
}

export function rejectLeave(id: string) {
  return apiFetch<LeaveRequest>(`/leave/${id}/reject`, { method: 'PATCH' });
}

export function getMyLeaveBalances() {
  return apiFetch<PaginatedResponse<LeaveBalance>>('/leave-balances/my');
}

export function getLeaveBalances() {
  return apiFetch<PaginatedResponse<LeaveBalance>>('/leave-balances');
}
