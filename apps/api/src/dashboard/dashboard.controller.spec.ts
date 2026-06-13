import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: { getSummary: jest.Mock };

  const mockSummary = {
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Bangkok',
    employees: { totalEmployees: 10, activeEmployees: 7, inactiveEmployees: 2, resignedEmployees: 1, totalDepartments: 3, totalPositions: 5 },
    attendance: { todayDate: '2026-06-13', todayPresentCount: 4, todayLateCount: 1, todayAbsentCount: 2, todayClockedInCount: 5, todayClockedOutCount: 3 },
    leave: { totalLeaveRequests: 20, pendingLeaveRequests: 5, approvedLeaveRequests: 12, rejectedLeaveRequests: 3, lowLeaveBalanceCount: 2 },
    recent: { employees: [], attendance: [], leaveRequests: [] },
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

  it('getSummary delegates to service and returns the full summary', async () => {
    const result = await controller.getSummary();

    expect(service.getSummary).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockSummary);
  });

  it('response includes timezone Asia/Bangkok', async () => {
    const result = await controller.getSummary();

    expect(result.timezone).toBe('Asia/Bangkok');
  });
});
