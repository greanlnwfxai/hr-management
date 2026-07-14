import { Test, TestingModule } from '@nestjs/testing';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('LeaveController', () => {
  let controller: LeaveController;
  let service: {
    create: jest.Mock;
    findMy: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
  };

  const mockUser = { id: 'user-uuid-1', role: 'SUPER_ADMIN' };
  const mockLeave = { id: 'leave-uuid-1', status: 'PENDING' };
  const mockPaginated = { data: [mockLeave], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue(mockLeave),
      findMy: jest.fn().mockResolvedValue(mockPaginated),
      findAll: jest.fn().mockResolvedValue(mockPaginated),
      findOne: jest.fn().mockResolvedValue(mockLeave),
      approve: jest.fn().mockResolvedValue({ ...mockLeave, status: 'APPROVED' }),
      reject: jest.fn().mockResolvedValue({ ...mockLeave, status: 'REJECTED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveController],
      providers: [{ provide: LeaveService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LeaveController>(LeaveController);
  });

  afterEach(() => jest.clearAllMocks());

  it('create delegates to service with user.id and dto', async () => {
    const dto = { leaveType: 'SICK', startDate: '2026-07-01', endDate: '2026-07-03' } as any;
    const result = await controller.create(mockUser as any, dto);

    expect(service.create).toHaveBeenCalledWith(mockUser.id, dto);
    expect(result).toEqual(mockLeave);
  });

  it('findMy delegates to service with user.id and query', async () => {
    const query = { page: 1, limit: 20 } as any;
    const result = await controller.findMy(mockUser as any, query);

    expect(service.findMy).toHaveBeenCalledWith(mockUser.id, query);
    expect(result).toEqual(mockPaginated);
  });

  it('findAll delegates to service with query and current user', async () => {
    const query = {} as any;
    const result = await controller.findAll(query, mockUser as any);

    expect(service.findAll).toHaveBeenCalledWith(query, mockUser);
    expect(result).toEqual(mockPaginated);
  });

  it('findOne delegates to service with id, user.id, and user.role', async () => {
    const result = await controller.findOne('leave-uuid-1', mockUser as any);

    expect(service.findOne).toHaveBeenCalledWith('leave-uuid-1', mockUser.id, mockUser.role);
    expect(result).toEqual(mockLeave);
  });

  it('approve delegates to service with id, user.id, dto, and audit context', async () => {
    const dto = {} as any;
    const result = await controller.approve('leave-uuid-1', mockUser as any, dto, undefined as any);

    expect(service.approve).toHaveBeenCalledWith('leave-uuid-1', mockUser.id, mockUser.role, dto, {
      actorUserId: mockUser.id,
      actorRole: mockUser.role,
      ipAddress: null,
      userAgent: null,
    });
    expect(result).toMatchObject({ status: 'APPROVED' });
  });

  it('reject delegates to service with id, user.id, dto, and audit context', async () => {
    const dto = {} as any;
    const result = await controller.reject('leave-uuid-1', mockUser as any, dto, undefined as any);

    expect(service.reject).toHaveBeenCalledWith('leave-uuid-1', mockUser.id, mockUser.role, dto, {
      actorUserId: mockUser.id,
      actorRole: mockUser.role,
      ipAddress: null,
      userAgent: null,
    });
    expect(result).toMatchObject({ status: 'REJECTED' });
  });
});
