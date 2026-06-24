import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: { getSummary: jest.Mock };

  const mockAnalytics = {
    range: { from: '2026-06-17', to: '2026-06-23', preset: '7d' as const },
    attendanceTrend: [],
    leaveStatus: { pending: 0, approved: 0, rejected: 0 },
    leaveByDepartment: [],
    offSiteStatus: { pending: 0, approved: 0, rejected: 0 },
    overtimeTrend: [],
    topLeaveRequesters: [],
    recentOffSite: [],
  };

  const mockSummary = {
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Bangkok',
    employees: { totalEmployees: 10, activeEmployees: 7, inactiveEmployees: 2, resignedEmployees: 1, totalDepartments: 3, totalPositions: 5 },
    attendance: { todayDate: '2026-06-13', todayPresentCount: 4, todayLateCount: 1, todayAbsentCount: 2, todayClockedInCount: 5, todayClockedOutCount: 3 },
    leave: { totalLeaveRequests: 20, pendingLeaveRequests: 5, approvedLeaveRequests: 12, rejectedLeaveRequests: 3, lowLeaveBalanceCount: 2 },
    recent: { employees: [], attendance: [], leaveRequests: [] },
    analytics: mockAnalytics,
  };

  beforeEach(async () => {
    service = { getSummary: jest.fn().mockResolvedValue(mockSummary) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => jest.clearAllMocks());

  it('getSummary delegates to service with default 7d range when no range param', async () => {
    const result = await controller.getSummary(undefined);

    expect(service.getSummary).toHaveBeenCalledWith('7d');
    expect(result).toEqual(mockSummary);
  });

  it('getSummary passes valid range preset to service', async () => {
    await controller.getSummary('thisMonth');
    expect(service.getSummary).toHaveBeenCalledWith('thisMonth');

    await controller.getSummary('lastMonth');
    expect(service.getSummary).toHaveBeenCalledWith('lastMonth');
  });

  it('getSummary falls back to 7d for invalid range values', async () => {
    await controller.getSummary('invalid');
    expect(service.getSummary).toHaveBeenCalledWith('7d');
  });

  it('response includes timezone Asia/Bangkok', async () => {
    const result = await controller.getSummary(undefined);
    expect(result.timezone).toBe('Asia/Bangkok');
  });

  it('response includes analytics object', async () => {
    const result = await controller.getSummary(undefined);
    expect(result).toHaveProperty('analytics');
    expect(result.analytics).toHaveProperty('attendanceTrend');
    expect(result.analytics).toHaveProperty('leaveStatus');
  });
});
