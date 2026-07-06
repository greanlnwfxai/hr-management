import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';

describe('DepartmentsController', () => {
  let controller: DepartmentsController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const mockDepartment = {
    id: 'dept-uuid-1',
    name: 'Engineering',
    description: 'Product engineering team',
    managerId: null,
    manager: null,
    _count: { employees: 0, positions: 0 },
  };

  const mockPaginatedResult = {
    data: [mockDepartment],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue(mockPaginatedResult),
      findOne: jest.fn().mockResolvedValue(mockDepartment),
      create: jest.fn().mockResolvedValue(mockDepartment),
      update: jest.fn().mockResolvedValue(mockDepartment),
      remove: jest.fn().mockResolvedValue({ id: 'dept-uuid-1', deleted: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepartmentsController],
      providers: [{ provide: DepartmentsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DepartmentsController>(DepartmentsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('findAll delegates to service and returns paginated result', async () => {
    const result = await controller.findAll({} as any);

    expect(service.findAll).toHaveBeenCalledWith({});
    expect(result).toEqual(mockPaginatedResult);
  });

  it('findOne delegates to service with the given id', async () => {
    const result = await controller.findOne('dept-uuid-1');

    expect(service.findOne).toHaveBeenCalledWith('dept-uuid-1');
    expect(result).toEqual(mockDepartment);
  });

  it('create delegates to service with the given dto', async () => {
    const dto = { name: 'Sales', description: 'Sales team' } as any;

    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockDepartment);
  });

  it('update delegates to service with id and dto', async () => {
    const dto = { description: 'Updated description' } as any;

    const result = await controller.update('dept-uuid-1', dto);

    expect(service.update).toHaveBeenCalledWith('dept-uuid-1', dto);
    expect(result).toEqual(mockDepartment);
  });

  it('remove delegates to service with id and returns deleted confirmation', async () => {
    const result = await controller.remove('dept-uuid-1');

    expect(service.remove).toHaveBeenCalledWith('dept-uuid-1');
    expect(result).toEqual({ id: 'dept-uuid-1', deleted: true });
  });

  // ── RBAC metadata assertions ───────────────────────────────────────────────

  it('findAll handler has no role restriction (any authenticated role may list)', () => {
    const roles: UserRole[] | undefined = Reflect.getMetadata(ROLES_KEY, DepartmentsController.prototype.findAll);
    expect(roles).toBeUndefined();
  });

  it('findOne handler has no role restriction (any authenticated role may read)', () => {
    const roles: UserRole[] | undefined = Reflect.getMetadata(ROLES_KEY, DepartmentsController.prototype.findOne);
    expect(roles).toBeUndefined();
  });

  it('create handler is restricted to SUPER_ADMIN and HR_ADMIN (MANAGER and EMPLOYEE rejected)', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, DepartmentsController.prototype.create);
    expect(roles).toEqual(expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]));
    expect(roles).not.toContain(UserRole.MANAGER);
    expect(roles).not.toContain(UserRole.EMPLOYEE);
  });

  it('update handler is restricted to SUPER_ADMIN and HR_ADMIN (MANAGER and EMPLOYEE rejected)', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, DepartmentsController.prototype.update);
    expect(roles).toEqual(expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]));
    expect(roles).not.toContain(UserRole.MANAGER);
    expect(roles).not.toContain(UserRole.EMPLOYEE);
  });

  it('remove handler is restricted to SUPER_ADMIN and HR_ADMIN (MANAGER and EMPLOYEE rejected)', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, DepartmentsController.prototype.remove);
    expect(roles).toEqual(expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]));
    expect(roles).not.toContain(UserRole.MANAGER);
    expect(roles).not.toContain(UserRole.EMPLOYEE);
  });
});
