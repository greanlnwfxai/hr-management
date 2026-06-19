export class SessionExpiredError extends Error {
  constructor() {
    super('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    this.name = 'SessionExpiredError';
  }
}

export interface ApiError {
  statusCode: number;
  message: string;
}

export interface MobileUserProfile {
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
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  mustChangePassword: boolean;
}

export interface DashboardSummary {
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
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface EmployeeItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
}

export interface DepartmentItem {
  id: string;
  name: string;
  code: string;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT';

export interface AttendanceEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  note: string | null;
  employee: AttendanceEmployee;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceHistoryResponse {
  data: AttendanceRecord[];
  meta: PaginatedMeta;
}

// ─── Mobile Clock Actions ─────────────────────────────────────────────────────

export interface MobileLocationPayload {
  source: 'mobile';
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface ClockActionResult {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export type LeaveType = 'SICK' | 'VACATION' | 'PERSONAL' | 'OTHER';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LeaveEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

export interface LeaveRequestRecord {
  id: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  status: LeaveRequestStatus;
  approvedAt: string | null;
  employee: LeaveEmployee;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalanceRecord {
  id: string;
  leaveType: LeaveType;
  year: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
}

export interface CreateLeaveRequestPayload {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}
