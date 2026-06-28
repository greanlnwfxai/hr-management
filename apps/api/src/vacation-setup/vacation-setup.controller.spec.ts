import { Test, TestingModule } from '@nestjs/testing';
import { VacationSetupController } from './vacation-setup.controller';
import { VacationSetupService } from './vacation-setup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';

describe('VacationSetupController', () => {
  let controller: VacationSetupController;
  let service: { suggest: jest.Mock; setup: jest.Mock };

  const mockUser = { id: 'user-uuid-1', role: 'HR_ADMIN' };
  const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

  const mockSuggest = {
    employeeId: 'emp-uuid-1',
    employeeName: 'Alice One',
    employeeCode: 'EMP001',
    year: 2026,
    hireDate: '2023-06-28',
    completedYears: 3,
    completedMonths: 36,
    isEligible: true,
    suggestedEntitledDays: 10,
    tierLabel: '>= 3 years and < 5 years',
    hasExistingBalance: false,
    existingBalance: null,
  };

  const mockSetupResult = {
    id: 'bal-uuid-1',
    employeeId: 'emp-uuid-1',
    leaveType: 'VACATION',
    year: 2026,
    totalDays: 10,
    usedDays: 2,
    remainingDays: 8,
    completedYears: 3,
    suggestedEntitledDays: 10,
    entitlementOverridden: false,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    service = {
      suggest: jest.fn().mockResolvedValue(mockSuggest),
      setup: jest.fn().mockResolvedValue(mockSetupResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VacationSetupController],
      providers: [{ provide: VacationSetupService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VacationSetupController>(VacationSetupController);
  });

  afterEach(() => jest.clearAllMocks());

  it('suggest delegates to service with query dto', async () => {
    const query = { employeeId: 'emp-uuid-1', year: 2026 } as any;

    const result = await controller.suggest(query);

    expect(service.suggest).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockSuggest);
  });

  it('setup delegates to service with dto and audit context', async () => {
    const dto = {
      employeeId: 'emp-uuid-1',
      year: 2026,
      entitledDays: 10,
      remainingDays: 8,
    } as any;

    const result = await controller.setup(dto, mockUser as any, mockReq);

    expect(service.setup).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({
        actorUserId: mockUser.id,
        actorRole: mockUser.role,
        ipAddress: '127.0.0.1',
      }),
    );
    expect(result).toEqual(mockSetupResult);
  });

  // ── RBAC metadata assertions ───────────────────────────────────────────────

  it('suggest handler is restricted to SUPER_ADMIN and HR_ADMIN (MANAGER and EMPLOYEE rejected)', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, VacationSetupController.prototype.suggest);
    expect(roles).toEqual(expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]));
    expect(roles).not.toContain(UserRole.MANAGER);
    expect(roles).not.toContain(UserRole.EMPLOYEE);
  });

  it('setup handler is restricted to SUPER_ADMIN and HR_ADMIN (MANAGER and EMPLOYEE rejected)', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, VacationSetupController.prototype.setup);
    expect(roles).toEqual(expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]));
    expect(roles).not.toContain(UserRole.MANAGER);
    expect(roles).not.toContain(UserRole.EMPLOYEE);
  });
});
