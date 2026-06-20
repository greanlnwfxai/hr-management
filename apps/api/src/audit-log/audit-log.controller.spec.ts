import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
  };

  const mockRow = { id: 'log-uuid-1', action: 'AUTH_LOGIN_SUCCESS', result: 'SUCCESS' };
  const mockPaginated = {
    data: [mockRow],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue(mockPaginated),
      findOne: jest.fn().mockResolvedValue(mockRow),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [{ provide: AuditLogService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuditLogController>(AuditLogController);
  });

  afterEach(() => jest.clearAllMocks());

  it('findAll delegates to service with the query object', async () => {
    const query = { page: 1, limit: 10, action: 'AUTH_LOGIN_SUCCESS' } as any;
    const result = await controller.findAll(query);

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockPaginated);
  });

  it('findOne delegates to service with the UUID param', async () => {
    const result = await controller.findOne('log-uuid-1');

    expect(service.findOne).toHaveBeenCalledWith('log-uuid-1');
    expect(result).toEqual(mockRow);
  });

  it('@Roles restricts the entire controller to SUPER_ADMIN and HR_ADMIN', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, AuditLogController);
    expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
  });

  it('does not expose POST, PATCH, or DELETE routes', () => {
    const prototype = AuditLogController.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methodNames).toEqual(expect.arrayContaining(['findAll', 'findOne']));
    expect(methodNames).not.toContain('create');
    expect(methodNames).not.toContain('update');
    expect(methodNames).not.toContain('remove');
    expect(methodNames).not.toContain('delete');
  });
});
