import { Test, TestingModule } from '@nestjs/testing';
import { LeaveAdjustmentController } from './leave-adjustment.controller';
import { LeaveAdjustmentService } from './leave-adjustment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';

describe('LeaveAdjustmentController', () => {
  let controller: LeaveAdjustmentController;
  let service: { create: jest.Mock; findAll: jest.Mock };

  const mockUser = { id: 'user-uuid-1', role: 'HR_ADMIN' };
  const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;
  const balanceId = 'bal-uuid-1';

  const mockAdjustment = {
    id: 'adj-uuid-1',
    leaveBalanceId: balanceId,
    deltaDays: 2,
    reason: 'Performance bonus days',
    actorUserId: 'user-uuid-1',
    adjustedBy: null,
    createdAt: new Date(),
    effectiveTotalDays: 12,
    effectiveRemainingDays: 9,
  };

  const mockPaginated = {
    data: [mockAdjustment],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue(mockAdjustment),
      findAll: jest.fn().mockResolvedValue(mockPaginated),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveAdjustmentController],
      providers: [{ provide: LeaveAdjustmentService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LeaveAdjustmentController>(LeaveAdjustmentController);
  });

  afterEach(() => jest.clearAllMocks());

  it('create delegates to service with balanceId, dto, and audit context', async () => {
    const dto = { deltaDays: 2, reason: 'Performance bonus days' } as any;

    const result = await controller.create(balanceId, dto, mockUser as any, mockReq);

    expect(service.create).toHaveBeenCalledWith(
      balanceId,
      dto,
      expect.objectContaining({
        actorUserId: mockUser.id,
        actorRole: mockUser.role,
        ipAddress: '127.0.0.1',
      }),
    );
    expect(result).toEqual(mockAdjustment);
  });

  it('findAll delegates to service with balanceId and query', async () => {
    const query = { page: 1, limit: 20 } as any;

    const result = await controller.findAll(balanceId, query);

    expect(service.findAll).toHaveBeenCalledWith(balanceId, query);
    expect(result).toEqual(mockPaginated);
  });

  // ── RBAC metadata assertions ───────────────────────────────────────────────

  it('create handler is restricted to SUPER_ADMIN and HR_ADMIN (MANAGER and EMPLOYEE rejected)', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, LeaveAdjustmentController.prototype.create);
    expect(roles).toEqual(expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]));
    expect(roles).not.toContain(UserRole.MANAGER);
    expect(roles).not.toContain(UserRole.EMPLOYEE);
  });

  it('findAll handler is restricted to SUPER_ADMIN and HR_ADMIN (MANAGER and EMPLOYEE rejected)', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, LeaveAdjustmentController.prototype.findAll);
    expect(roles).toEqual(expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]));
    expect(roles).not.toContain(UserRole.MANAGER);
    expect(roles).not.toContain(UserRole.EMPLOYEE);
  });
});
