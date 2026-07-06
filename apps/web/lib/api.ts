import { getToken, clearAuth } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002';

type FetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
  skipAuth?: boolean;
  /** Send the JWT token but do NOT redirect to /login on 401 — needed for change-password where wrong current password returns 401. */
  no401Redirect?: boolean;
};

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, no401Redirect, headers: extraHeaders, ...rest } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };

  if (!skipAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });

  if (res.status === 401) {
    // skipAuth: login endpoint — don't redirect, show inline error.
    // no401Redirect: authenticated call where 401 means bad input (e.g. wrong current password), not expired session.
    if (!skipAuth && !no401Redirect) {
      clearAuth();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    const errBody = await res.json().catch(() => ({})) as { message?: string };
    throw new ApiError(401, errBody.message ?? 'Unauthorized');
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
  user: { id: string; email: string; username: string | null; role: string; mustChangePassword: boolean; employeeId: string | null };
};

export function login(loginId: string, password: string) {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: loginId, password }),
    skipAuth: true,
  });
}

export type MeResponse = {
  id: string;
  email: string;
  username: string | null;
  role: string;
  mustChangePassword: boolean;
  employeeId: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department: string | null;
    position: string | null;
  } | null;
};

export function getMe() {
  return apiFetch<MeResponse>('/auth/me');
}

export function changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  return apiFetch<{ success: boolean; mustChangePassword: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
    no401Redirect: true,
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export type RangePreset = '7d' | 'thisMonth' | 'lastMonth';

export type DashboardAnalytics = {
  range: { from: string; to: string; preset: RangePreset };
  attendanceTrend: Array<{ date: string; present: number; late: number; absent: number }>;
  leaveStatus: { pending: number; approved: number; rejected: number };
  leaveByDepartment: Array<{
    departmentId: string;
    departmentName: string;
    pending: number;
    approved: number;
    rejected: number;
  }>;
  offSiteStatus: { pending: number; approved: number; rejected: number };
  overtimeTrend: Array<{ date: string; hours: number }>;
  topLeaveRequesters: Array<{ employeeId: string; employeeName: string; count: number }>;
  recentOffSite: Array<{
    id: string;
    date: string;
    status: string;
    employee?: { firstName: string; lastName: string };
  }>;
};

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
  analytics: DashboardAnalytics;
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

export function getDashboard(range: RangePreset = '7d') {
  return apiFetch<DashboardData>(`/dashboard?range=${range}`);
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

export type EmployeeFull = Employee & {
  phone?: string;
  dateOfBirth?: string;
  hireDate: string;
  manager?: { id: string; firstName: string; lastName: string };
  createdAt: string;
};

export function getEmployees(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  departmentId?: string;
  positionId?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.status) qs.set('status', params.status);
  if (params?.departmentId) qs.set('departmentId', params.departmentId);
  if (params?.positionId) qs.set('positionId', params.positionId);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<Employee>>(`/employees${query}`);
}

export function getEmployee(id: string) {
  return apiFetch<EmployeeFull>(`/employees/${id}`);
}

export function createEmployee(body: {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
  departmentId: string;
  positionId: string;
  phone?: string;
  dateOfBirth?: string;
  status?: string;
}) {
  return apiFetch<EmployeeFull>('/employees', { method: 'POST', body: JSON.stringify(body) });
}

export function updateEmployee(id: string, body: Partial<{
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
  departmentId: string;
  positionId: string;
  phone: string;
  dateOfBirth: string;
  status: string;
}>) {
  return apiFetch<EmployeeFull>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteEmployee(id: string) {
  return apiFetch<EmployeeFull>(`/employees/${id}`, { method: 'DELETE' });
}

// ── Departments ───────────────────────────────────────────────────────────────

export type Department = {
  id: string;
  name: string;
  description?: string;
  managerId?: string;
  manager?: { id: string; firstName: string; lastName: string };
  _count: { employees: number; positions: number };
  createdAt: string;
  updatedAt: string;
};

export function getDepartments(params?: { page?: number; limit?: number; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<Department>>(`/departments${query}`);
}

export function getAllDepartments() {
  return apiFetch<PaginatedResponse<Department>>('/departments?limit=100');
}

export function createDepartment(body: { name: string; description?: string; managerId?: string | null }) {
  return apiFetch<Department>('/departments', { method: 'POST', body: JSON.stringify(body) });
}

export function updateDepartment(id: string, body: { name?: string; description?: string; managerId?: string | null }) {
  return apiFetch<Department>(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteDepartment(id: string) {
  return apiFetch<void>(`/departments/${id}`, { method: 'DELETE' });
}

// ── Positions ─────────────────────────────────────────────────────────────────

export type Position = {
  id: string;
  title: string;
  description?: string;
  departmentId: string;
  department?: { id: string; name: string };
  _count: { employees: number };
  createdAt: string;
  updatedAt: string;
};

export function getPositions(params?: { page?: number; limit?: number; search?: string; departmentId?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.departmentId) qs.set('departmentId', params.departmentId);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<Position>>(`/positions${query}`);
}

export function getAllPositions(departmentId?: string) {
  const qs = departmentId ? `?limit=100&departmentId=${departmentId}` : '?limit=100';
  return apiFetch<PaginatedResponse<Position>>(`/positions${qs}`);
}

export function createPosition(body: { title: string; departmentId: string; description?: string }) {
  return apiFetch<Position>('/positions', { method: 'POST', body: JSON.stringify(body) });
}

export function updatePosition(id: string, body: { title?: string; departmentId?: string; description?: string }) {
  return apiFetch<Position>(`/positions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deletePosition(id: string) {
  return apiFetch<void>(`/positions/${id}`, { method: 'DELETE' });
}

// ── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceRecord = {
  id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  note?: string;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { id: string; name: string };
    position?: { id: string; title: string };
  };
  createdAt: string;
  updatedAt: string;
};

export function clockIn(note?: string) {
  return apiFetch<AttendanceRecord>('/attendance/clock-in', {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  });
}

export function clockOut(note?: string) {
  return apiFetch<AttendanceRecord>('/attendance/clock-out', {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  });
}

export function getMyAttendance(params?: { page?: number; limit?: number; startDate?: string; endDate?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<AttendanceRecord>>(`/attendance/me${query}`);
}

export function getAttendance(params?: { page?: number; limit?: number; status?: string; startDate?: string; endDate?: string; employeeId?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  if (params?.employeeId) qs.set('employeeId', params.employeeId);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<AttendanceRecord>>(`/attendance${query}`);
}

export type GeofenceConfig = {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  maxAccuracyMeters: number;
  source: 'db' | 'env';
  updatedByUserId?: string | null;
  updatedAt?: string;
};

export function getGeofenceConfig() {
  return apiFetch<GeofenceConfig>('/attendance/geofence-config');
}

export function updateGeofenceConfig(body: {
  enabled?: boolean;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  maxAccuracyMeters?: number;
}) {
  return apiFetch<GeofenceConfig>('/attendance/geofence-config', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// ── Off-site Attendance Review ────────────────────────────────────────────────

export type OffsiteReviewRecord = {
  id: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: string;
  workMode: string;
  note?: string | null;
  attendanceSource: string | null;
  reviewStatus: string | null;
  workLocationName?: string | null;
  offsiteReason?: string | null;
  offSiteRequestId?: string | null;
  checkInAccuracyMeters?: number | null;
  checkInDistanceFromCompanyMeters?: number | null;
  checkOutAccuracyMeters?: number | null;
  checkOutDistanceFromCompanyMeters?: number | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { id: string; name: string } | null;
    position?: { id: string; title: string } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export function getOffsiteReview(params?: {
  page?: number;
  limit?: number;
  reviewStatus?: string;
  startDate?: string;
  endDate?: string;
  employeeId?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.reviewStatus) qs.set('reviewStatus', params.reviewStatus);
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  if (params?.employeeId) qs.set('employeeId', params.employeeId);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<OffsiteReviewRecord>>(`/attendance/offsite-review${query}`);
}

export function approveOffsiteReview(id: string, reviewNote?: string) {
  return apiFetch<OffsiteReviewRecord>(`/attendance/offsite-review/${id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify(reviewNote !== undefined ? { reviewNote } : {}),
  });
}

export function rejectOffsiteReview(id: string, reviewNote?: string) {
  return apiFetch<OffsiteReviewRecord>(`/attendance/offsite-review/${id}/reject`, {
    method: 'PATCH',
    body: JSON.stringify(reviewNote !== undefined ? { reviewNote } : {}),
  });
}

// ── Attendance Risk Reviews (SEC-ATT-007A backend, SEC-ATT-007B UI) ───────────

export type AttendanceRiskReview = {
  id: string;
  employeeId: string | null;
  attendanceId: string | null;
  userId: string | null;
  action: string;
  result: string;
  riskLevel: string;
  reasonCodes: string[];
  status: string;
  source: string | null;
  platform: string | null;
  metadataJson: Record<string, unknown> | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { id: string; name: string } | null;
  } | null;
  reviewedBy?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
};

export function getRiskReviews(params?: {
  page?: number;
  limit?: number;
  employeeId?: string;
  riskLevel?: string;
  status?: string;
  action?: string;
  result?: string;
  startDate?: string;
  endDate?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.employeeId) qs.set('employeeId', params.employeeId);
  if (params?.riskLevel) qs.set('riskLevel', params.riskLevel);
  if (params?.status) qs.set('status', params.status);
  if (params?.action) qs.set('action', params.action);
  if (params?.result) qs.set('result', params.result);
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<AttendanceRiskReview>>(`/attendance/risk-reviews${query}`);
}

export function reviewRiskReview(id: string, status: string, reviewNote?: string) {
  return apiFetch<AttendanceRiskReview>(`/attendance/risk-reviews/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(reviewNote !== undefined ? { status, reviewNote } : { status }),
  });
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
  adjustmentDays?: number;
  effectiveTotalDays?: number;
  usedDays: number;
  remainingDays: number;
  employee?: {
    id: string;
    employeeCode?: string;
    firstName: string;
    lastName: string;
    department?: { id: string; name: string };
    position?: { id: string; title: string };
  };
  createdAt?: string;
  updatedAt?: string;
};

export type LeaveAdjustment = {
  id: string;
  leaveBalanceId: string;
  deltaDays: number;
  reason: string;
  actorUserId: string;
  adjustedBy?: { id: string; firstName: string; lastName: string; employeeCode?: string } | null;
  createdAt: string;
  effectiveTotalDays?: number;
  effectiveRemainingDays?: number;
};

export function getLeave(params?: { page?: number; limit?: number; status?: string; employeeId?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  if (params?.employeeId) qs.set('employeeId', params.employeeId);
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

export function getLeaveBalances(params?: { employeeId?: string; leaveType?: string; year?: number; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.employeeId) qs.set('employeeId', params.employeeId);
  if (params?.leaveType) qs.set('leaveType', params.leaveType);
  if (params?.year) qs.set('year', String(params.year));
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<LeaveBalance>>(`/leave-balances${query}`);
}

export function createLeaveBalance(body: {
  employeeId: string;
  leaveType: string;
  year: number;
  entitledDays: number;
}) {
  return apiFetch<LeaveBalance>('/leave-balances', { method: 'POST', body: JSON.stringify(body) });
}

export function updateLeaveBalance(id: string, body: { entitledDays?: number; usedDays?: number }) {
  return apiFetch<LeaveBalance>(`/leave-balances/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function createLeaveAdjustment(balanceId: string, body: { deltaDays: number; reason: string }) {
  return apiFetch<LeaveAdjustment>(`/leave-balances/${balanceId}/adjustments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getLeaveAdjustments(balanceId: string, params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<LeaveAdjustment>>(`/leave-balances/${balanceId}/adjustments${query}`);
}

export type VacationSetupSuggest = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  year: number;
  hireDate: string;
  completedYears: number;
  completedMonths: number;
  isEligible: boolean;
  suggestedEntitledDays: number;
  tierLabel: string;
  hasExistingBalance: boolean;
  existingBalance: { id: string; totalDays: number; usedDays: number } | null;
};

export type VacationSetupResult = {
  id: string;
  employeeId: string;
  leaveType: string;
  year: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  completedYears: number;
  suggestedEntitledDays: number;
  entitlementOverridden: boolean;
  createdAt: string;
};

export function getVacationSetupSuggest(employeeId: string, year: number) {
  return apiFetch<VacationSetupSuggest>(
    `/leave-balances/vacation-setup/suggest?employeeId=${employeeId}&year=${year}`,
  );
}

export function createVacationSetup(body: {
  employeeId: string;
  year: number;
  entitledDays: number;
  remainingDays: number;
  setupNote?: string;
}) {
  return apiFetch<VacationSetupResult>('/leave-balances/vacation-setup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ── Account Provisioning ──────────────────────────────────────────────────────

export type EmployeeAccountInfo = {
  id: string;
  username: string | null;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordGeneratedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
} | null;

export function getEmployeeAccount(employeeId: string) {
  return apiFetch<{ account: EmployeeAccountInfo }>(`/employees/${employeeId}/account`);
}

export type ProvisionedAccount = {
  userId: string;
  employeeId: string;
  username: string | null;
  email: string;
  role: string;
  mustChangePassword: boolean;
  temporaryPassword: string;
};

export function provisionEmployeeAccount(
  employeeId: string,
  body: { username: string; role: string; email?: string },
) {
  return apiFetch<ProvisionedAccount>(`/employees/${employeeId}/account`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function resetEmployeeAccountPassword(employeeId: string) {
  return apiFetch<ProvisionedAccount>(`/employees/${employeeId}/account/reset-password`, {
    method: 'POST',
  });
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

export type AuditLog = {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  result: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export function getAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
  targetType?: string;
  targetId?: string;
  actorUserId?: string;
  actorRole?: string;
  result?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.action) qs.set('action', params.action);
  if (params?.targetType) qs.set('targetType', params.targetType);
  if (params?.targetId) qs.set('targetId', params.targetId);
  if (params?.actorUserId) qs.set('actorUserId', params.actorUserId);
  if (params?.actorRole) qs.set('actorRole', params.actorRole);
  if (params?.result) qs.set('result', params.result);
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params?.dateTo) qs.set('dateTo', params.dateTo);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<AuditLog>>(`/audit-logs${query}`);
}

// ── Off-Site Requests ─────────────────────────────────────────────────────────

export type OffSiteRequest = {
  id: string;
  date: string;
  reason?: string;
  status: string;
  rejectReason?: string;
  approvedAt?: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode?: string;
    department?: { id: string; name: string };
  };
  approvedBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
};

export function getOffSiteRequests(params?: { page?: number; limit?: number; status?: string; date?: string; employeeId?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  if (params?.date) qs.set('date', params.date);
  if (params?.employeeId) qs.set('employeeId', params.employeeId);
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<PaginatedResponse<OffSiteRequest>>(`/off-site${query}`);
}

export function approveOffSiteRequest(id: string) {
  return apiFetch<OffSiteRequest>(`/off-site/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
}

export function rejectOffSiteRequest(id: string, rejectReason?: string) {
  return apiFetch<OffSiteRequest>(`/off-site/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ rejectReason }) });
}
