import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { count: jest.Mock; findMany: jest.Mock };
  attendance: { count: jest.Mock; findMany: jest.Mock };
  leaveRequest: { count: jest.Mock; findMany: jest.Mock };
  leaveBalance: { findMany: jest.Mock };
  department: { count: jest.Mock };
  position: { count: jest.Mock };
};

/**
 * DashboardService.getSummary calls Promise.all with 19 Prisma operations.
 * The mock functions are called in the same order as the array.
 *
 * Order:
 *  employee.count  ×4   (total, active, inactive, resigned)
 *  department.count ×1
 *  position.count   ×1
 *  attendance.count ×5  (PRESENT, LATE, ABSENT, clockedIn, clockedOut)
 *  leaveRequest.count ×4 (total, PENDING, APPROVED, REJECTED)
 *  employee.findMany ×1  (recentEmployees)
 *  attendance.findMany ×1 (recentAttendance)
 *  leaveRequest.findMany ×1 (recentLeaveRequests)
 *  leaveBalance.findMany ×1 (currentYearBalances)
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

  (prisma.employee.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.attendance.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.leaveBalance.findMany as jest.Mock).mockResolvedValue(overrides.balances ?? []);
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
});
