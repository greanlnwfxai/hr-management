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
  role: string;
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
