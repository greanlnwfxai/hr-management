import { Test, TestingModule } from '@nestjs/testing';
import { LeaveBalanceController } from './leave-balance.controller';
import { LeaveBalanceService } from './leave-balance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('LeaveBalanceController', () => {
  let controller: LeaveBalanceController;
  let service: {
    create: jest.Mock;
    findMy: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  const mockUser = { id: 'user-uuid-1', role: 'SUPER_ADMIN' };
  const mockBalance = { id: 'bal-uuid-1', leaveType: 'SICK', year: 2026, totalDays: 10, usedDays: 3, remainingDays: 7 };
  const mockPaginated = { data: [mockBalance], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue(mockBalance),
      findMy: jest.fn().mockResolvedValue(mockPaginated),
      findAll: jest.fn().mockResolvedValue(mockPaginated),
      findOne: jest.fn().mockResolvedValue(mockBalance),
      update: jest.fn().mockResolvedValue({ ...mockBalance, totalDays: 15, remainingDays: 12 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveBalanceController],
      providers: [{ provide: LeaveBalanceService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LeaveBalanceController>(LeaveBalanceController);
  });

  afterEach(() => jest.clearAllMocks());

  it('create delegates to service with dto', async () => {
    const dto = { employeeId: 'emp-uuid-1', leaveType: 'SICK', year: 2026, entitledDays: 10 } as any;
    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockBalance);
  });

  it('findMy delegates to service with user.id and query', async () => {
    const query = {} as any;
    const result = await controller.findMy(mockUser as any, query);

    expect(service.findMy).toHaveBeenCalledWith(mockUser.id, query);
    expect(result).toEqual(mockPaginated);
  });

  it('findAll delegates to service with query', async () => {
    const query = {} as any;
    const result = await controller.findAll(query);

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockPaginated);
  });

  it('findOne delegates to service with id, user.id, and user.role', async () => {
    const result = await controller.findOne('bal-uuid-1', mockUser as any);

    expect(service.findOne).toHaveBeenCalledWith('bal-uuid-1', mockUser.id, mockUser.role);
    expect(result).toEqual(mockBalance);
  });

  it('update delegates to service with id and dto', async () => {
    const dto = { entitledDays: 15 } as any;
    const result = await controller.update('bal-uuid-1', dto);

    expect(service.update).toHaveBeenCalledWith('bal-uuid-1', dto);
    expect(result).toMatchObject({ totalDays: 15, remainingDays: 12 });
  });
});
