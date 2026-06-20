import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('EmployeesController', () => {
  let controller: EmployeesController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    getAccount: jest.Mock;
    provisionAccount: jest.Mock;
    resetAccountPassword: jest.Mock;
  };

  const mockEmployee = {
    id: 'emp-uuid-1',
    email: 'john.doe@hr.local',
    status: 'ACTIVE',
  };

  const mockPaginatedResult = {
    data: [mockEmployee],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue(mockPaginatedResult),
      findOne: jest.fn().mockResolvedValue(mockEmployee),
      create: jest.fn().mockResolvedValue(mockEmployee),
      update: jest.fn().mockResolvedValue(mockEmployee),
      remove: jest.fn().mockResolvedValue({ id: 'emp-uuid-1', status: 'INACTIVE' }),
      getAccount: jest.fn().mockResolvedValue({ account: null }),
      provisionAccount: jest.fn().mockResolvedValue({
        userId: 'user-uuid-1',
        employeeId: 'emp-uuid-1',
        username: 'j.doe',
        email: 'j.doe@hr.local',
        role: 'EMPLOYEE',
        mustChangePassword: true,
        temporaryPassword: 'TempPass123!',
      }),
      resetAccountPassword: jest.fn().mockResolvedValue({
        userId: 'user-uuid-1',
        employeeId: 'emp-uuid-1',
        username: 'j.doe',
        email: 'j.doe@hr.local',
        role: 'EMPLOYEE',
        mustChangePassword: true,
        temporaryPassword: 'NewTemp456!',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeesController],
      providers: [{ provide: EmployeesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EmployeesController>(EmployeesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('findAll delegates to service and returns paginated result', async () => {
    const result = await controller.findAll({} as any);

    expect(service.findAll).toHaveBeenCalled();
    expect(result).toEqual(mockPaginatedResult);
  });

  it('findOne delegates to service with the given id', async () => {
    const result = await controller.findOne('emp-uuid-1');

    expect(service.findOne).toHaveBeenCalledWith('emp-uuid-1');
    expect(result).toEqual(mockEmployee);
  });

  it('create delegates to service with the given dto', async () => {
    const dto = { employeeCode: 'EMP002', email: 'new@hr.local' } as any;

    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockEmployee);
  });

  it('update delegates to service with id and dto', async () => {
    const dto = { firstName: 'Updated' } as any;

    const result = await controller.update('emp-uuid-1', dto);

    expect(service.update).toHaveBeenCalledWith('emp-uuid-1', dto);
    expect(result).toEqual(mockEmployee);
  });

  it('remove delegates to service with id and returns INACTIVE status', async () => {
    const result = await controller.remove('emp-uuid-1');

    expect(service.remove).toHaveBeenCalledWith('emp-uuid-1');
    expect(result).toEqual({ id: 'emp-uuid-1', status: 'INACTIVE' });
  });

  it('getAccount delegates to service with id', async () => {
    const result = await controller.getAccount('emp-uuid-1');

    expect(service.getAccount).toHaveBeenCalledWith('emp-uuid-1');
    expect(result).toEqual({ account: null });
  });

  it('provisionAccount delegates to service with id, dto, and audit context', async () => {
    const dto = { username: 'j.doe', role: 'EMPLOYEE' } as any;
    const user = { id: 'admin-uuid-1', role: 'HR_ADMIN' } as Express.User;

    const result = await controller.provisionAccount('emp-uuid-1', dto, user, undefined as any);

    expect(service.provisionAccount).toHaveBeenCalledWith(
      'emp-uuid-1',
      dto,
      { actorUserId: 'admin-uuid-1', actorRole: 'HR_ADMIN', ipAddress: null, userAgent: null },
    );
    expect(result).toMatchObject({ userId: 'user-uuid-1', temporaryPassword: 'TempPass123!' });
  });

  it('resetAccountPassword delegates to service with id and audit context', async () => {
    const user = { id: 'admin-uuid-1', role: 'SUPER_ADMIN' } as Express.User;

    const result = await controller.resetAccountPassword('emp-uuid-1', user, undefined as any);

    expect(service.resetAccountPassword).toHaveBeenCalledWith(
      'emp-uuid-1',
      { actorUserId: 'admin-uuid-1', actorRole: 'SUPER_ADMIN', ipAddress: null, userAgent: null },
    );
    expect(result).toMatchObject({ userId: 'user-uuid-1', mustChangePassword: true });
  });
});
