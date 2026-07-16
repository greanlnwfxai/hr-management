import { Test, TestingModule } from '@nestjs/testing';
import { OffSiteController } from './off-site.controller';
import { OffSiteService } from './off-site.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('OffSiteController', () => {
  let controller: OffSiteController;
  let service: {
    create: jest.Mock;
    findMy: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
  };

  const mockUser = { id: 'user-uuid-1', role: 'SUPER_ADMIN' };
  const mockOffSite = { id: 'offsite-uuid-1', status: 'PENDING' };
  const mockPaginated = { data: [mockOffSite], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue(mockOffSite),
      findMy: jest.fn().mockResolvedValue(mockPaginated),
      findAll: jest.fn().mockResolvedValue(mockPaginated),
      findOne: jest.fn().mockResolvedValue(mockOffSite),
      approve: jest.fn().mockResolvedValue({ ...mockOffSite, status: 'APPROVED' }),
      reject: jest.fn().mockResolvedValue({ ...mockOffSite, status: 'REJECTED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OffSiteController],
      providers: [{ provide: OffSiteService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OffSiteController>(OffSiteController);
  });

  afterEach(() => jest.clearAllMocks());

  it('create delegates to service with user.id and dto', async () => {
    const dto = { date: '2026-07-01', reason: 'Client visit' } as any;
    const result = await controller.create(mockUser as any, dto);

    expect(service.create).toHaveBeenCalledWith(mockUser.id, dto);
    expect(result).toEqual(mockOffSite);
  });

  it('findMy delegates to service with user.id and query', async () => {
    const query = { page: 1, limit: 20 } as any;
    const result = await controller.findMy(mockUser as any, query);

    expect(service.findMy).toHaveBeenCalledWith(mockUser.id, query);
    expect(result).toEqual(mockPaginated);
  });

  it('findAll delegates to service with query and current user (SEC-OFFSITE-001)', async () => {
    const query = {} as any;
    const result = await controller.findAll(query, mockUser as any);

    expect(service.findAll).toHaveBeenCalledWith(query, mockUser);
    expect(result).toEqual(mockPaginated);
  });

  it('findOne delegates to service with id, user.id, and user.role', async () => {
    const result = await controller.findOne('offsite-uuid-1', mockUser as any);

    expect(service.findOne).toHaveBeenCalledWith('offsite-uuid-1', mockUser.id, mockUser.role);
    expect(result).toEqual(mockOffSite);
  });

  it('approve delegates to service with id, user.id, dto, and audit context', async () => {
    const dto = {} as any;
    const result = await controller.approve('offsite-uuid-1', mockUser as any, dto, undefined as any);

    expect(service.approve).toHaveBeenCalledWith('offsite-uuid-1', mockUser.id, mockUser.role, dto, {
      actorUserId: mockUser.id,
      actorRole: mockUser.role,
      ipAddress: null,
      userAgent: null,
    });
    expect(result).toMatchObject({ status: 'APPROVED' });
  });

  it('reject delegates to service with id, user.id, dto, and audit context', async () => {
    const dto = {} as any;
    const result = await controller.reject('offsite-uuid-1', mockUser as any, dto, undefined as any);

    expect(service.reject).toHaveBeenCalledWith('offsite-uuid-1', mockUser.id, mockUser.role, dto, {
      actorUserId: mockUser.id,
      actorRole: mockUser.role,
      ipAddress: null,
      userAgent: null,
    });
    expect(result).toMatchObject({ status: 'REJECTED' });
  });
});
