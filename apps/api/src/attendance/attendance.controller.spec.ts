import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceRiskReviewService } from './attendance-risk-review.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AttendanceRiskReviewStatus, UserRole } from '../common/enums';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let service: {
    clockIn: jest.Mock;
    clockOut: jest.Mock;
    findMyAttendance: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    getGeofenceConfig: jest.Mock;
    updateGeofenceConfig: jest.Mock;
    findOffsiteReview: jest.Mock;
    approveOffsiteAttendance: jest.Mock;
    rejectOffsiteAttendance: jest.Mock;
  };
  let riskReviewService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    review: jest.Mock;
    setStatus: jest.Mock;
  };

  const mockUser = { id: 'user-uuid-1', role: 'EMPLOYEE' };
  const mockAdminUser = { id: 'admin-uuid-1', role: 'SUPER_ADMIN' };
  const mockRecord = { id: 'att-uuid-1', status: 'PRESENT', date: '2026-06-13' };
  const mockPaginated = { data: [mockRecord], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };
  const mockGeofenceConfig = {
    enabled: true,
    latitude: 13.7563,
    longitude: 100.5018,
    radiusMeters: 100,
    maxAccuracyMeters: 50,
    source: 'db',
  };

  beforeEach(async () => {
    service = {
      clockIn: jest.fn().mockResolvedValue(mockRecord),
      clockOut: jest.fn().mockResolvedValue({ ...mockRecord, checkOut: new Date() }),
      findMyAttendance: jest.fn().mockResolvedValue(mockPaginated),
      findAll: jest.fn().mockResolvedValue(mockPaginated),
      findOne: jest.fn().mockResolvedValue(mockRecord),
      getGeofenceConfig: jest.fn().mockResolvedValue(mockGeofenceConfig),
      updateGeofenceConfig: jest.fn().mockResolvedValue({ ...mockGeofenceConfig, radiusMeters: 200 }),
      findOffsiteReview: jest.fn().mockResolvedValue(mockPaginated),
      approveOffsiteAttendance: jest.fn().mockResolvedValue({ ...mockRecord, reviewStatus: 'APPROVED' }),
      rejectOffsiteAttendance: jest.fn().mockResolvedValue({ ...mockRecord, reviewStatus: 'REJECTED' }),
    };

    riskReviewService = {
      findAll: jest.fn().mockResolvedValue(mockPaginated),
      findOne: jest.fn().mockResolvedValue({ id: 'risk-uuid-1', status: 'PENDING' }),
      review: jest.fn().mockResolvedValue({ id: 'risk-uuid-1', status: 'REVIEWED' }),
      setStatus: jest.fn().mockResolvedValue({ id: 'risk-uuid-1', status: 'APPROVED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        { provide: AttendanceService, useValue: service },
        { provide: AttendanceRiskReviewService, useValue: riskReviewService },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  afterEach(() => jest.clearAllMocks());

  it('clockIn delegates to service with user.id, dto, and audit context', async () => {
    const dto = { note: 'WFH' } as any;
    const result = await controller.clockIn(mockUser as any, dto, undefined as any);

    expect(service.clockIn).toHaveBeenCalledWith(mockUser.id, dto, {
      actorUserId: mockUser.id,
      actorRole: mockUser.role,
      ipAddress: null,
      userAgent: null,
    });
    expect(result).toEqual(mockRecord);
  });

  it('clockOut delegates to service with user.id, dto, and audit context', async () => {
    const dto = {} as any;
    const result = await controller.clockOut(mockUser as any, dto, undefined as any);

    expect(service.clockOut).toHaveBeenCalledWith(mockUser.id, dto, {
      actorUserId: mockUser.id,
      actorRole: mockUser.role,
      ipAddress: null,
      userAgent: null,
    });
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

  it('getGeofenceConfig delegates to service', async () => {
    const result = await controller.getGeofenceConfig();

    expect(service.getGeofenceConfig).toHaveBeenCalled();
    expect(result).toEqual(mockGeofenceConfig);
  });

  it('updateGeofenceConfig delegates to service with dto and audit context', async () => {
    const dto = { radiusMeters: 200 } as any;
    const result = await controller.updateGeofenceConfig(dto, mockAdminUser as any, undefined as any);

    expect(service.updateGeofenceConfig).toHaveBeenCalledWith(dto, {
      actorUserId: mockAdminUser.id,
      actorRole: mockAdminUser.role,
      ipAddress: null,
      userAgent: null,
    });
    expect(result).toMatchObject({ radiusMeters: 200 });
  });

  it('findOffsiteReview delegates to service with query, user.id, and user.role', async () => {
    const query = { page: 1, limit: 20 } as any;
    const result = await controller.findOffsiteReview(query, mockAdminUser as any);

    expect(service.findOffsiteReview).toHaveBeenCalledWith(query, mockAdminUser.id, mockAdminUser.role);
    expect(result).toEqual(mockPaginated);
  });

  it('approveOffsiteRecord delegates to service with id, user.id, dto, and audit context', async () => {
    const dto = { reviewNote: 'Confirmed' } as any;
    const result = await controller.approveOffsiteRecord('att-uuid-1', dto, mockAdminUser as any, undefined as any);

    expect(service.approveOffsiteAttendance).toHaveBeenCalledWith('att-uuid-1', mockAdminUser.id, dto, {
      actorUserId: mockAdminUser.id,
      actorRole: mockAdminUser.role,
      ipAddress: null,
      userAgent: null,
    });
    expect(result).toMatchObject({ reviewStatus: 'APPROVED' });
  });

  it('rejectOffsiteRecord delegates to service with id, user.id, dto, and audit context', async () => {
    const dto = { reviewNote: 'No documentation' } as any;
    const result = await controller.rejectOffsiteRecord('att-uuid-1', dto, mockAdminUser as any, undefined as any);

    expect(service.rejectOffsiteAttendance).toHaveBeenCalledWith('att-uuid-1', mockAdminUser.id, dto, {
      actorUserId: mockAdminUser.id,
      actorRole: mockAdminUser.role,
      ipAddress: null,
      userAgent: null,
    });
    expect(result).toMatchObject({ reviewStatus: 'REJECTED' });
  });

  // ── SEC-ATT-007A: risk-review queue ─────────────────────────────────────────

  it('findRiskReviews delegates to riskReview.findAll with query', async () => {
    const query = { page: 1, limit: 20 } as any;
    const result = await controller.findRiskReviews(query);

    expect(riskReviewService.findAll).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockPaginated);
  });

  it('findRiskReview delegates to riskReview.findOne with id', async () => {
    const result = await controller.findRiskReview('risk-uuid-1');

    expect(riskReviewService.findOne).toHaveBeenCalledWith('risk-uuid-1');
    expect(result).toMatchObject({ id: 'risk-uuid-1' });
  });

  it('reviewRiskReview delegates to riskReview.review with id, dto, and user.id', async () => {
    const dto = { status: AttendanceRiskReviewStatus.REVIEWED, reviewNote: 'Checked' } as any;
    const result = await controller.reviewRiskReview('risk-uuid-1', dto, mockAdminUser as any);

    expect(riskReviewService.review).toHaveBeenCalledWith('risk-uuid-1', dto, mockAdminUser.id);
    expect(result).toMatchObject({ status: 'REVIEWED' });
  });

  it('approveRiskReview delegates to riskReview.setStatus with APPROVED', async () => {
    const dto = { reviewNote: 'Looks fine' } as any;
    const result = await controller.approveRiskReview('risk-uuid-1', dto, mockAdminUser as any);

    expect(riskReviewService.setStatus).toHaveBeenCalledWith(
      'risk-uuid-1',
      AttendanceRiskReviewStatus.APPROVED,
      dto.reviewNote,
      mockAdminUser.id,
    );
    expect(result).toMatchObject({ status: 'APPROVED' });
  });

  it('rejectRiskReview delegates to riskReview.setStatus with REJECTED', async () => {
    const dto = { reviewNote: undefined } as any;
    await controller.rejectRiskReview('risk-uuid-1', dto, mockAdminUser as any);

    expect(riskReviewService.setStatus).toHaveBeenCalledWith(
      'risk-uuid-1',
      AttendanceRiskReviewStatus.REJECTED,
      undefined,
      mockAdminUser.id,
    );
  });

  describe('RBAC metadata — @Roles decorator', () => {
    it('getGeofenceConfig is restricted to SUPER_ADMIN and HR_ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.getGeofenceConfig);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
    });

    it('updateGeofenceConfig is restricted to SUPER_ADMIN and HR_ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.updateGeofenceConfig);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
    });

    it('findAll is restricted to SUPER_ADMIN and HR_ADMIN', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.findAll);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
    });

    it('findMy has no role restriction (any authenticated user)', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.findMy);
      expect(roles).toBeUndefined();
    });

    it('findOffsiteReview is restricted to SUPER_ADMIN, HR_ADMIN, and MANAGER', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.findOffsiteReview);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER]);
    });

    it('approveOffsiteRecord is restricted to SUPER_ADMIN, HR_ADMIN, and MANAGER', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.approveOffsiteRecord);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER]);
    });

    it('rejectOffsiteRecord is restricted to SUPER_ADMIN, HR_ADMIN, and MANAGER', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.rejectOffsiteRecord);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER]);
    });

    // SEC-ATT-007A: risk-review queue is SUPER_ADMIN/HR_ADMIN only — MANAGER
    // access is explicitly deferred (task guardrail), unlike offsite-review.
    it('findRiskReviews is restricted to SUPER_ADMIN and HR_ADMIN (no MANAGER)', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.findRiskReviews);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
    });

    it('findRiskReview is restricted to SUPER_ADMIN and HR_ADMIN (no MANAGER)', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.findRiskReview);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
    });

    it('reviewRiskReview is restricted to SUPER_ADMIN and HR_ADMIN (no MANAGER)', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.reviewRiskReview);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
    });

    it('approveRiskReview is restricted to SUPER_ADMIN and HR_ADMIN (no MANAGER)', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.approveRiskReview);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
    });

    it('rejectRiskReview is restricted to SUPER_ADMIN and HR_ADMIN (no MANAGER)', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.rejectRiskReview);
      expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.HR_ADMIN]);
    });
  });
});
