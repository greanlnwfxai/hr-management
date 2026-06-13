import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let service: {
    clockIn: jest.Mock;
    clockOut: jest.Mock;
    findMyAttendance: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
  };

  const mockUser = { id: 'user-uuid-1', role: 'EMPLOYEE' };
  const mockRecord = { id: 'att-uuid-1', status: 'PRESENT', date: '2026-06-13' };
  const mockPaginated = { data: [mockRecord], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };

  beforeEach(async () => {
    service = {
      clockIn: jest.fn().mockResolvedValue(mockRecord),
      clockOut: jest.fn().mockResolvedValue({ ...mockRecord, checkOut: new Date() }),
      findMyAttendance: jest.fn().mockResolvedValue(mockPaginated),
      findAll: jest.fn().mockResolvedValue(mockPaginated),
      findOne: jest.fn().mockResolvedValue(mockRecord),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [{ provide: AttendanceService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  afterEach(() => jest.clearAllMocks());

  it('clockIn delegates to service with user.id and dto', async () => {
    const dto = { note: 'WFH' } as any;
    const result = await controller.clockIn(mockUser as any, dto);

    expect(service.clockIn).toHaveBeenCalledWith(mockUser.id, dto);
    expect(result).toEqual(mockRecord);
  });

  it('clockOut delegates to service with user.id and dto', async () => {
    const dto = {} as any;
    const result = await controller.clockOut(mockUser as any, dto);

    expect(service.clockOut).toHaveBeenCalledWith(mockUser.id, dto);
    expect(result).toMatchObject({ id: 'att-uuid-1' });
  });

  it('findMy delegates to service with user.id and query', async () => {
    const query = { page: 1, limit: 20 } as any;
    const result = await controller.findMy(mockUser as any, query);

    expect(service.findMyAttendance).toHaveBeenCalledWith(mockUser.id, query);
    expect(result).toEqual(mockPaginated);
  });

  it('findAll delegates to service with query', async () => {
    const query = {} as any;
    const result = await controller.findAll(query);

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockPaginated);
  });

  it('findOne delegates to service with id, user.id, and user.role', async () => {
    const result = await controller.findOne('att-uuid-1', mockUser as any);

    expect(service.findOne).toHaveBeenCalledWith('att-uuid-1', mockUser.id, mockUser.role);
    expect(result).toEqual(mockRecord);
  });
});
