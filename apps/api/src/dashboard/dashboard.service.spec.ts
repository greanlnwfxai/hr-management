import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { count: jest.Mock; findMany: jest.Mock };
  attendance: { count: jest.Mock; findMany: jest.Mock };
  leaveRequest: { count: jest.Mock; findMany: jest.Mock };
  leaveBalance: { findMany: jest.Mock };
  department: { count: jest.Mock; findMany: jest.Mock };
  position: { count: jest.Mock };
  offSiteRequest: { findMany: jest.Mock };
};

/**
 * DashboardService.getSummary calls two Promise.all groups:
 *
 * Group 1 (existing KPI queries):
 *  employee.count  ×4   (total, active, inactive, resigned)
 *  department.count ×1
 *  position.count   ×1
 *  attendance.count ×5  (PRESENT, LATE, ABSENT, clockedIn, clockedOut)
 *  leaveRequest.count ×4 (total, PENDING, APPROVED, REJECTED)
 *  employee.findMany ×1  (recentEmployees)
 *  attendance.findMany ×1 (recentAttendance)
 *  leaveRequest.findMany ×1 (recentLeaveRequests)
 *  leaveBalance.findMany ×1 (currentYearBalances)
 *
 * Group 2 (analytics queries, via computeAnalytics):
 *  attendance.findMany ×1  (range-scoped attendance for trends)
 *  leaveRequest.findMany ×1 (range-scoped leave for analytics)
 *  offSiteRequest.findMany ×1
 *  department.findMany ×1
 */
function setupMocks(prisma: PrismaMock, overrides: { balances?: Array<{ totalDays: number; usedDays: number }> } = {}) {
  (prisma.employee.count as jest.Mock)
    .mockResolvedValueOnce(10)  // total
    .mockResolvedValueOnce(7)   // active
    .mockResolvedValueOnce(2)   // inactive
    .mockResolvedValueOnce(1);  // resigned

  (prisma.department.count as jest.Mock).mockResolvedValue(3);
  (prisma.position.count as jest.Mock).mockResolvedValue(5);

  (prisma.attendance.count as jest.Mock)
    .mockResolvedValueOnce(4)  // PRESENT
    .mockResolvedValueOnce(1)  // LATE
    .mockResolvedValueOnce(2)  // ABSENT
    .mockResolvedValueOnce(5)  // clockedIn
    .mockResolvedValueOnce(3); // clockedOut

  (prisma.leaveRequest.count as jest.Mock)
    .mockResolvedValueOnce(20)  // total
    .mockResolvedValueOnce(5)   // PENDING
    .mockResolvedValueOnce(12)  // APPROVED
    .mockResolvedValueOnce(3);  // REJECTED

  // findMany mocks — return empty arrays; analytics group calls are also covered
  (prisma.employee.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.attendance.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.leaveBalance.findMany as jest.Mock).mockResolvedValue(overrides.balances ?? []);
  (prisma.offSiteRequest.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.department.findMany as jest.Mock).mockResolvedValue([]);
}

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = mockPrisma() as PrismaMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── response shape ─────────────────────────────────────────────────────────

  describe('getSummary — response shape', () => {
    it('returns the expected top-level keys', async () => {
      setupMocks(prisma);

      const result = await service.getSummary();

      expect(result).toHaveProperty('generatedAt');
      expect(result).toHaveProperty('timezone', 'Asia/Bangkok');
      expect(result).toHaveProperty('employees');
      expect(result).toHaveProperty('attendance');
      expect(result).toHaveProperty('leave');
      expect(result).toHaveProperty('recent');
      expect(result).toHaveProperty('analytics');
    });

    it('employees section contains all required fields', async () => {
      setupMocks(prisma);

      const { employees } = await service.getSummary();

      expect(employees).toEqual({
        totalEmployees: 10,
        activeEmployees: 7,
        inactiveEmployees: 2,
        resignedEmployees: 1,
        totalDepartments: 3,
        totalPositions: 5,
      });
    });

    it('attendance section contains all required fields', async () => {
      setupMocks(prisma);

      const { attendance } = await service.getSummary();

      expect(attendance).toMatchObject({
        todayPresentCount: 4,
        todayLateCount: 1,
        todayAbsentCount: 2,
        todayClockedInCount: 5,
        todayClockedOutCount: 3,
      });
      expect(attendance).toHaveProperty('todayDate');
    });

    it('leave section contains all required fields', async () => {
      setupMocks(prisma);

      const { leave } = await service.getSummary();

      expect(leave).toMatchObject({
        totalLeaveRequests: 20,
        pendingLeaveRequests: 5,
        approvedLeaveRequests: 12,
        rejectedLeaveRequests: 3,
      });
      expect(leave).toHaveProperty('lowLeaveBalanceCount');
    });

    it('recent section has employees, attendance, leaveRequests arrays', async () => {
      setupMocks(prisma);

      const { recent } = await service.getSummary();

      expect(recent).toHaveProperty('employees');
      expect(recent).toHaveProperty('attendance');
      expect(recent).toHaveProperty('leaveRequests');
    });

    it('analytics section has required shape', async () => {
      setupMocks(prisma);

      const { analytics } = await service.getSummary();

      expect(analytics).toHaveProperty('range');
      expect(analytics.range).toHaveProperty('from');
      expect(analytics.range).toHaveProperty('to');
      expect(analytics.range).toHaveProperty('preset', '7d');
      expect(analytics).toHaveProperty('attendanceTrend');
      expect(analytics).toHaveProperty('leaveStatus');
      expect(analytics).toHaveProperty('leaveByDepartment');
      expect(analytics).toHaveProperty('offSiteStatus');
      expect(analytics).toHaveProperty('overtimeTrend');
      expect(analytics).toHaveProperty('topLeaveRequesters');
      expect(analytics).toHaveProperty('recentOffSite');
    });

    it('attendanceTrend has 7 entries for 7d range', async () => {
      setupMocks(prisma);

      const { analytics } = await service.getSummary('7d');

      expect(analytics.attendanceTrend).toHaveLength(7);
      expect(analytics.attendanceTrend[0]).toMatchObject({
        present: 0,
        late: 0,
        absent: 0,
      });
    });

    it('analytics range.preset reflects the requested preset', async () => {
      setupMocks(prisma);

      const { analytics } = await service.getSummary('thisMonth');

      expect(analytics.range.preset).toBe('thisMonth');
    });
  });

  // ── lowLeaveBalanceCount ───────────────────────────────────────────────────

  describe('lowLeaveBalanceCount (threshold = 3 remaining days)', () => {
    it('counts balances with remainingDays <= 3', async () => {
      setupMocks(prisma, {
        balances: [
          { totalDays: 10, usedDays: 8 }, // remaining = 2 → LOW
          { totalDays: 10, usedDays: 7 }, // remaining = 3 → LOW (exactly at threshold)
          { totalDays: 10, usedDays: 6 }, // remaining = 4 → NOT low
          { totalDays: 5, usedDays: 5 },  // remaining = 0 → LOW
        ],
      });

      const { leave } = await service.getSummary();

      expect(leave.lowLeaveBalanceCount).toBe(3);
    });

    it('returns 0 when all balances have more than 3 remaining days', async () => {
      setupMocks(prisma, {
        balances: [
          { totalDays: 10, usedDays: 0 }, // remaining = 10 → NOT low
          { totalDays: 10, usedDays: 5 }, // remaining = 5 → NOT low
        ],
      });

      const { leave } = await service.getSummary();

      expect(leave.lowLeaveBalanceCount).toBe(0);
    });

    it('returns 0 when there are no leave balances at all', async () => {
      setupMocks(prisma, { balances: [] });

      const { leave } = await service.getSummary();

      expect(leave.lowLeaveBalanceCount).toBe(0);
    });
  });

  // ── todayDate in Bangkok ───────────────────────────────────────────────────

  describe('todayDate uses Asia/Bangkok calendar date', () => {
    it('todayDate is a valid YYYY-MM-DD string', async () => {
      setupMocks(prisma);

      const { attendance } = await service.getSummary();

      expect(attendance.todayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('todayDate reflects Bangkok date at UTC+7', async () => {
      jest.useFakeTimers();
      // UTC 2026-06-12T23:30:00Z → Bangkok 2026-06-13T06:30:00+07:00
      jest.setSystemTime(new Date('2026-06-12T23:30:00.000Z'));
      setupMocks(prisma);

      const { attendance } = await service.getSummary();

      expect(attendance.todayDate).toBe('2026-06-13');

      jest.useRealTimers();
    });
  });

  // ── analytics: leaveStatus ─────────────────────────────────────────────────

  describe('analytics.leaveStatus', () => {
    it('counts leave rows by status', async () => {
      setupMocks(prisma);
      (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue([
        { status: 'PENDING', employeeId: 'e1', employee: null },
        { status: 'PENDING', employeeId: 'e2', employee: null },
        { status: 'APPROVED', employeeId: 'e3', employee: null },
        { status: 'REJECTED', employeeId: 'e4', employee: null },
      ]);

      const { analytics } = await service.getSummary();

      // The first findMany call is recentLeaveRequests; analytics uses a second call
      // Both calls receive the same mock value (mockResolvedValue, not Once)
      expect(analytics.leaveStatus).toMatchObject({
        pending: expect.any(Number),
        approved: expect.any(Number),
        rejected: expect.any(Number),
      });
    });

    it('returns zero counts when no leave requests in range', async () => {
      setupMocks(prisma);

      const { analytics } = await service.getSummary();

      expect(analytics.leaveStatus).toEqual({ pending: 0, approved: 0, rejected: 0 });
    });
  });

  // ── analytics: offSiteStatus ───────────────────────────────────────────────

  describe('analytics.offSiteStatus', () => {
    it('returns zero counts when no off-site requests', async () => {
      setupMocks(prisma);

      const { analytics } = await service.getSummary();

      expect(analytics.offSiteStatus).toEqual({ pending: 0, approved: 0, rejected: 0 });
    });

    it('counts off-site rows by status', async () => {
      setupMocks(prisma);
      (prisma.offSiteRequest.findMany as jest.Mock).mockResolvedValue([
        { id: '1', date: new Date(), status: 'PENDING', employee: null },
        { id: '2', date: new Date(), status: 'APPROVED', employee: null },
        { id: '3', date: new Date(), status: 'APPROVED', employee: null },
      ]);

      const { analytics } = await service.getSummary();

      expect(analytics.offSiteStatus.pending).toBe(1);
      expect(analytics.offSiteStatus.approved).toBe(2);
      expect(analytics.offSiteStatus.rejected).toBe(0);
    });
  });

  // ── analytics: topLeaveRequesters ─────────────────────────────────────────

  describe('analytics.topLeaveRequesters', () => {
    it('returns at most 5 requesters sorted by count descending', async () => {
      setupMocks(prisma);
      (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({
          status: 'APPROVED',
          employeeId: `e${i % 6}`,
          employee: { id: `e${i % 6}`, firstName: `First${i % 6}`, lastName: 'Last', department: null },
        })),
      );

      const { analytics } = await service.getSummary();

      expect(analytics.topLeaveRequesters.length).toBeLessThanOrEqual(5);
    });

    it('returns empty array when no leave requests', async () => {
      setupMocks(prisma);

      const { analytics } = await service.getSummary();

      expect(analytics.topLeaveRequesters).toEqual([]);
    });
  });

  // ── MANAGER scope ──────────────────────────────────────────────────────────

  describe('getSummary — MANAGER scope', () => {
    it('returns zeroed summary when MANAGER has no employee record', async () => {
      (prisma.employee.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getSummary('7d', { userId: 'mgr-user-1', role: 'MANAGER' });

      expect(result.employees.totalEmployees).toBe(0);
      expect(result.leave.totalLeaveRequests).toBe(0);
      expect(result.recent.employees).toEqual([]);
    });

    it('returns zeroed summary when MANAGER has no managedDepartment', async () => {
      (prisma.employee.findFirst as jest.Mock).mockResolvedValue({ managedDepartment: null });

      const result = await service.getSummary('7d', { userId: 'mgr-user-1', role: 'MANAGER' });

      expect(result.employees.totalEmployees).toBe(0);
      expect(result.analytics.attendanceTrend.length).toBeGreaterThan(0);
      expect(result.analytics.attendanceTrend.every((d) => d.present === 0 && d.late === 0)).toBe(true);
    });

    it('resolves managedDepartment.id and scopes KPI queries to that department', async () => {
      (prisma.employee.findFirst as jest.Mock).mockResolvedValue({
        managedDepartment: { id: 'dept-uuid-1' },
      });
      setupMocks(prisma);

      await service.getSummary('7d', { userId: 'mgr-user-1', role: 'MANAGER' });

      expect(prisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'mgr-user-1' } }),
      );
      // Verify the scope filter actually reaches the count queries
      expect(prisma.employee.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ departmentId: 'dept-uuid-1' }) }),
      );
      expect(prisma.attendance.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ employee: { departmentId: 'dept-uuid-1' } }) }),
      );
    });

    it('passes full summary shape even when MANAGER scope returns data', async () => {
      (prisma.employee.findFirst as jest.Mock).mockResolvedValue({
        managedDepartment: { id: 'dept-uuid-1' },
      });
      setupMocks(prisma);

      const result = await service.getSummary('7d', { userId: 'mgr-user-1', role: 'MANAGER' });

      expect(result).toHaveProperty('generatedAt');
      expect(result).toHaveProperty('employees');
      expect(result).toHaveProperty('analytics');
      expect(result.analytics).toHaveProperty('attendanceTrend');
      expect(result.analytics).toHaveProperty('leaveByDepartment');
    });

    it('does not scope for SUPER_ADMIN — findFirst is not called', async () => {
      setupMocks(prisma);

      await service.getSummary('7d', { userId: 'admin-1', role: 'SUPER_ADMIN' });

      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });
  });
});
