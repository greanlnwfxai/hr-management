import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeofenceService } from './geofence.service';
import { GeofenceConfigService } from './geofence-config.service';
import { mockPrisma } from '../test-utils/prisma.mock';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findFirst: jest.Mock };
  attendance: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

// Bangkok UTC offset: UTC+7 = 25200000 ms
// Bangkok 08:30 = UTC 01:30 → PRESENT (not strictly after 08:30)
// Bangkok 08:31 = UTC 01:31 → LATE
// Bangkok 08:29 = UTC 01:29 → PRESENT
const BANGKOK_PRESENT_UTC = '2026-06-13T01:30:00.000Z'; // Bangkok 08:30 — boundary: PRESENT
const BANGKOK_LATE_UTC = '2026-06-13T01:31:00.000Z';    // Bangkok 08:31 — one minute past: LATE
const BANGKOK_EARLY_UTC = '2026-06-13T01:29:00.000Z';   // Bangkok 08:29 — PRESENT

const COMPANY_LAT = 13.7563;
const COMPANY_LON = 100.5018;

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: PrismaMock;
  let geofenceConfig: jest.Mocked<GeofenceConfigService>;
  let geofenceService: jest.Mocked<GeofenceService>;
  let mockAuditLog: { record: jest.Mock };

  const userId = 'user-uuid-1';
  const employeeId = 'emp-uuid-1';
  const attendanceId = 'att-uuid-1';

  const mockOpenRecord = {
    id: attendanceId,
    employeeId,
    date: new Date('2026-06-13T00:00:00.000Z'),
    checkIn: new Date(BANGKOK_PRESENT_UTC),
    checkOut: null,
    status: 'PRESENT',
    note: null,
  };

  const mockAttendanceFull = {
    ...mockOpenRecord,
    employee: { id: employeeId, employeeCode: 'EMP001', firstName: 'John', lastName: 'Doe', department: null, position: null },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = mockPrisma() as PrismaMock;
    mockAuditLog = { record: jest.fn().mockResolvedValue(undefined) };

    geofenceConfig = {
      getEffectiveConfig: jest.fn().mockResolvedValue({
        enabled: false,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
        radiusMeters: 100,
        maxAccuracyMeters: 100,
        source: 'env',
      }),
    } as unknown as jest.Mocked<GeofenceConfigService>;

    geofenceService = {
      calculateDistanceMeters: jest.fn().mockReturnValue(0),
      isWithinRadius: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<GeofenceService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: GeofenceService, useValue: geofenceService },
        { provide: GeofenceConfigService, useValue: geofenceConfig },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // ── clockIn ────────────────────────────────────────────────────────────────

  describe('clockIn', () => {
    it('creates a PRESENT record when clocking in at exactly Bangkok 08:30', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(BANGKOK_PRESENT_UTC));

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);

      const result = await service.clockIn(userId, {});

      expect(result.status).toBe('PRESENT');
      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PRESENT' }),
        }),
      );
    });

    it('creates a LATE record when clocking in at Bangkok 08:31', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(BANGKOK_LATE_UTC));

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'LATE' } as any);

      const result = await service.clockIn(userId, {});

      expect(result.status).toBe('LATE');
      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'LATE' }),
        }),
      );
    });

    it('creates a PRESENT record when clocking in at Bangkok 08:29', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(BANGKOK_EARLY_UTC));

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);

      const result = await service.clockIn(userId, {});

      expect(result.status).toBe('PRESENT');
    });

    it('throws BadRequestException when user has no linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(userId, {})).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when employee has already clocked in today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(BANGKOK_PRESENT_UTC));

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(mockOpenRecord as any);

      await expect(service.clockIn(userId, {})).rejects.toThrow(ConflictException);
    });
  });

  // ── clockOut ───────────────────────────────────────────────────────────────

  describe('clockOut', () => {
    it('updates the open attendance record with checkOut time', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T05:00:00.000Z')); // Bangkok 12:00

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(mockOpenRecord as any);
      prisma.attendance.update.mockResolvedValue({
        ...mockAttendanceFull,
        checkOut: new Date('2026-06-13T05:00:00.000Z'),
      } as any);

      const result = await service.clockOut(userId, {});

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: attendanceId } }),
      );
      expect(result.checkOut).toBeTruthy();
    });

    it('throws BadRequestException when user has no linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.clockOut(userId, {})).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when no clock-in record exists for today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(BANGKOK_PRESENT_UTC));

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.clockOut(userId, {})).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when employee has already clocked out today', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T05:00:00.000Z'));

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockOpenRecord,
        checkOut: new Date('2026-06-13T04:00:00.000Z'),
      } as any);

      await expect(service.clockOut(userId, {})).rejects.toThrow(ConflictException);
    });
  });

  // ── findMyAttendance ───────────────────────────────────────────────────────

  describe('findMyAttendance', () => {
    it('returns paginated attendance records for the current employee', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.$transaction.mockResolvedValue([[mockAttendanceFull], 1] as any);

      const result = await service.findMyAttendance(userId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('throws BadRequestException when user has no linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.findMyAttendance(userId, {})).rejects.toThrow(BadRequestException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated attendance records with correct meta', async () => {
      prisma.$transaction.mockResolvedValue([[mockAttendanceFull], 5] as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(5);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the record to a SUPER_ADMIN without ownership check', async () => {
      prisma.attendance.findUnique.mockResolvedValue(mockAttendanceFull as any);

      const result = await service.findOne(attendanceId, userId, 'SUPER_ADMIN');

      expect(result).toMatchObject({ id: attendanceId });
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('allows an employee to view their own attendance record', async () => {
      prisma.attendance.findUnique.mockResolvedValue(mockAttendanceFull as any);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });

      const result = await service.findOne(attendanceId, userId, 'EMPLOYEE');

      expect(result).toMatchObject({ id: attendanceId });
    });

    it("throws ForbiddenException when employee views another employee's record", async () => {
      prisma.attendance.findUnique.mockResolvedValue(mockAttendanceFull as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'other-emp-uuid' });

      await expect(service.findOne(attendanceId, userId, 'EMPLOYEE')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when attendance record does not exist', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', userId, 'SUPER_ADMIN')).rejects.toThrow(NotFoundException);
    });
  });

  // ── geofence validation ────────────────────────────────────────────────────

  const enabledConfig = {
    enabled: true,
    latitude: COMPANY_LAT,
    longitude: COMPANY_LON,
    radiusMeters: 100,
    maxAccuracyMeters: 100,
    source: 'env' as const,
  };

  describe('geofence validation (clockIn)', () => {
    const mobileDto = {
      source: 'mobile' as const,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      accuracy: 25,
    };

    it('skips geofence entirely when source is not "mobile" (web path)', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);

      // No source field — legacy web behavior
      await expect(service.clockIn(userId, { note: 'web' })).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
    });

    it('skips geofence when source is "web"', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);

      await expect(service.clockIn(userId, { source: 'web' })).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
    });

    it('skips geofence when source is "mobile" but geofence is disabled', async () => {
      // default mock already has enabled: false
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);

      await expect(service.clockIn(userId, { source: 'mobile' })).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
    });

    it('throws 422 when source is "mobile", geofence enabled, but location fields are missing', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);

      await expect(service.clockIn(userId, { source: 'mobile' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when accuracy is missing even if lat/lon are present', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);

      await expect(
        service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 when GPS accuracy exceeds the configured maximum', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({ ...enabledConfig, maxAccuracyMeters: 100 });

      await expect(
        service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 150 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 when company location is not configured', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        ...enabledConfig,
        latitude: null,
        longitude: null,
      });

      await expect(service.clockIn(userId, mobileDto)).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 when user is outside the allowed radius', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);

      await expect(service.clockIn(userId, mobileDto)).rejects.toThrow(UnprocessableEntityException);
    });

    it('allows clock-in when source is "mobile", geofence enabled, and user is within radius', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(true);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);

      await expect(service.clockIn(userId, mobileDto)).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).toHaveBeenCalledWith(
        COMPANY_LAT, COMPANY_LON, COMPANY_LAT, COMPANY_LON, 100,
      );
    });

    it('throws 422 error message includes expected text for out-of-range', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);

      try {
        await service.clockIn(userId, mobileDto);
        fail('Expected UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        expect(err.message).toContain('outside the allowed company area');
      }
    });

    it('throws 422 error message includes expected text for poor accuracy', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({ ...enabledConfig, maxAccuracyMeters: 50 });

      try {
        await service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 75 });
        fail('Expected UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        expect(err.message).toContain('GPS accuracy is too low');
      }
    });
  });

  describe('geofence validation (clockOut)', () => {
    const mobileDto = {
      source: 'mobile' as const,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      accuracy: 25,
    };

    it('enforces geofence on clock-out for mobile source (missing location)', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);

      await expect(
        service.clockOut(userId, { source: 'mobile' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('allows clock-out when source is "mobile", geofence enabled, and user is within radius', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(true);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(mockOpenRecord as any);
      prisma.attendance.update.mockResolvedValue({
        ...mockAttendanceFull,
        checkOut: new Date(),
      } as any);

      await expect(service.clockOut(userId, mobileDto)).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).toHaveBeenCalledWith(
        COMPANY_LAT, COMPANY_LON, COMPANY_LAT, COMPANY_LON, 100,
      );
    });

    it('throws 422 on clock-out when source is "mobile", geofence enabled, and user is outside radius', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);

      await expect(service.clockOut(userId, mobileDto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('skips geofence on clock-out for web source', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(mockOpenRecord as any);
      prisma.attendance.update.mockResolvedValue({
        ...mockAttendanceFull,
        checkOut: new Date(),
      } as any);

      await expect(service.clockOut(userId, { source: 'web' })).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
    });
  });

  // ── getGeofenceConfig ──────────────────────────────────────────────────────

  describe('getGeofenceConfig', () => {
    it('returns the effective config from GeofenceConfigService', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);

      const result = await service.getGeofenceConfig();

      expect(result).toMatchObject({ enabled: true, radiusMeters: 100, source: 'env' });
    });
  });

  // ── updateGeofenceConfig ───────────────────────────────────────────────────

  describe('updateGeofenceConfig', () => {
    const ctx = {
      actorUserId: 'admin-uuid',
      actorRole: 'SUPER_ADMIN',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    };

    const upsertRow = {
      id: 'default',
      enabled: true,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      radiusMeters: 200,
      maxAccuracyMeters: 50,
      updatedByUserId: 'admin-uuid',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      (prisma as any).geofenceConfig.upsert.mockResolvedValue(upsertRow);
    });

    it('upserts config to DB and returns the saved row', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        enabled: false,
        latitude: null,
        longitude: null,
        radiusMeters: 100,
        maxAccuracyMeters: 100,
        source: 'env',
      });

      const result = await service.updateGeofenceConfig(
        { enabled: true, latitude: COMPANY_LAT, longitude: COMPANY_LON, radiusMeters: 200, maxAccuracyMeters: 50 },
        ctx,
      );

      expect((prisma as any).geofenceConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'default' },
          create: expect.objectContaining({ enabled: true, latitude: COMPANY_LAT }),
          update: expect.objectContaining({ enabled: true, latitude: COMPANY_LAT }),
        }),
      );
      expect(result.source).toBe('db');
    });

    it('throws 422 when enabling geofence without coordinates', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        enabled: false,
        latitude: null,
        longitude: null,
        radiusMeters: 100,
        maxAccuracyMeters: 100,
        source: 'env',
      });

      await expect(
        service.updateGeofenceConfig({ enabled: true }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('allows enabling geofence when DB row already has coordinates (body omits them)', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        enabled: false,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
        radiusMeters: 100,
        maxAccuracyMeters: 100,
        source: 'db',
      });

      const result = await service.updateGeofenceConfig({ enabled: true }, ctx);

      expect(result.source).toBe('db');
    });

    it('records ATTENDANCE_GEOFENCE_CONFIG_UPDATED audit event without coordinates', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        enabled: false,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
        radiusMeters: 100,
        maxAccuracyMeters: 100,
        source: 'env',
      });

      await service.updateGeofenceConfig({ enabled: true }, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_GEOFENCE_CONFIG_UPDATED' }),
      );

      const event = mockAuditLog.record.mock.calls[0][0];
      const serialized = JSON.stringify(event.metadata);
      expect(serialized).not.toContain(String(COMPANY_LAT));
      expect(serialized).not.toContain(String(COMPANY_LON));
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
    });

    it('audit metadata contains boolean/numeric summary fields', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        enabled: false,
        latitude: null,
        longitude: null,
        radiusMeters: 100,
        maxAccuracyMeters: 100,
        source: 'env',
      });
      (prisma as any).geofenceConfig.upsert.mockResolvedValue({
        ...upsertRow,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
      });

      await service.updateGeofenceConfig(
        { enabled: true, latitude: COMPANY_LAT, longitude: COMPANY_LON },
        ctx,
      );

      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata).toMatchObject({
        previousEnabled: false,
        previousHasCoordinates: false,
        newEnabled: true,
        newHasCoordinates: true,
      });
    });
  });

  // ── audit: clockIn ─────────────────────────────────────────────────────────

  describe('audit: clockIn', () => {
    const ctx = {
      actorUserId: 'user-uuid-1',
      actorRole: 'EMPLOYEE',
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test',
    };

    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);
    });

    it('records ATTENDANCE_CLOCK_IN after successful clock-in', async () => {
      await service.clockIn(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_CLOCK_IN' }),
      );
    });

    it('sets actorUserId and actorRole from context on ATTENDANCE_CLOCK_IN', async () => {
      await service.clockIn(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: ctx.actorUserId, actorRole: ctx.actorRole }),
      );
    });

    it('sets targetType to ATTENDANCE on ATTENDANCE_CLOCK_IN', async () => {
      await service.clockIn(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'ATTENDANCE' }),
      );
    });

    it('sets targetId to the attendance record id on ATTENDANCE_CLOCK_IN', async () => {
      await service.clockIn(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: attendanceId }),
      );
    });

    it('sets result to SUCCESS on ATTENDANCE_CLOCK_IN', async () => {
      await service.clockIn(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'SUCCESS' }),
      );
    });

    it('metadata.employeeId is the resolved employee id (not undefined)', async () => {
      await service.clockIn(userId, {}, ctx);

      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata?.employeeId).toBe(employeeId);
    });

    it('metadata excludes raw GPS coordinates and note text even when dto carries them', async () => {
      const sensitiveDto = {
        latitude: 13.7563,
        longitude: 100.5018,
        accuracy: 25,
        note: 'private personal note',
        source: 'mobile' as const,
      };
      // Geofence passes (disabled by default in beforeEach)
      await service.clockIn(userId, sensitiveDto, ctx);

      const event = mockAuditLog.record.mock.calls[0][0];
      const serialized = JSON.stringify(event.metadata);
      expect(serialized).not.toContain('13.7563');
      expect(serialized).not.toContain('100.5018');
      expect(serialized).not.toContain('private personal note');
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).not.toHaveProperty('note');
    });

    it('still clocks in and returns result when audit write fails (best-effort)', async () => {
      mockAuditLog.record.mockRejectedValueOnce(new Error('audit DB down'));

      const result = await service.clockIn(userId, {}, ctx);

      expect(result).toBeDefined();
      expect(result.status).toBe('PRESENT');
    });
  });

  // ── audit: clockOut ────────────────────────────────────────────────────────

  describe('audit: clockOut', () => {
    const ctx = {
      actorUserId: 'user-uuid-1',
      actorRole: 'EMPLOYEE',
      ipAddress: '10.0.0.1',
      userAgent: 'jest-test',
    };

    const mockClosedRecord = {
      ...mockAttendanceFull,
      checkOut: new Date('2026-06-13T05:00:00.000Z'),
    };

    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(mockOpenRecord as any);
      prisma.attendance.update.mockResolvedValue(mockClosedRecord as any);
    });

    it('records ATTENDANCE_CLOCK_OUT after successful clock-out', async () => {
      await service.clockOut(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_CLOCK_OUT' }),
      );
    });

    it('sets actorUserId and actorRole from context on ATTENDANCE_CLOCK_OUT', async () => {
      await service.clockOut(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: ctx.actorUserId, actorRole: ctx.actorRole }),
      );
    });

    it('sets targetType to ATTENDANCE on ATTENDANCE_CLOCK_OUT', async () => {
      await service.clockOut(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'ATTENDANCE' }),
      );
    });

    it('sets targetId to the attendance record id on ATTENDANCE_CLOCK_OUT', async () => {
      await service.clockOut(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: attendanceId }),
      );
    });

    it('sets result to SUCCESS on ATTENDANCE_CLOCK_OUT', async () => {
      await service.clockOut(userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'SUCCESS' }),
      );
    });

    it('metadata.employeeId is the resolved employee id (not undefined)', async () => {
      await service.clockOut(userId, {}, ctx);

      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata?.employeeId).toBe(employeeId);
    });

    it('metadata excludes raw GPS coordinates and note text even when dto carries them', async () => {
      const sensitiveDto = {
        latitude: 13.7563,
        longitude: 100.5018,
        accuracy: 25,
        note: 'private personal note',
        source: 'mobile' as const,
      };
      // Geofence passes (disabled by default in beforeEach)
      await service.clockOut(userId, sensitiveDto, ctx);

      const event = mockAuditLog.record.mock.calls[0][0];
      const serialized = JSON.stringify(event.metadata);
      expect(serialized).not.toContain('13.7563');
      expect(serialized).not.toContain('100.5018');
      expect(serialized).not.toContain('private personal note');
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).not.toHaveProperty('note');
    });

    it('still clocks out and returns result when audit write fails (best-effort)', async () => {
      mockAuditLog.record.mockRejectedValueOnce(new Error('audit DB down'));

      const result = await service.clockOut(userId, {}, ctx);

      expect(result).toBeDefined();
      expect(result.checkOut).toBeTruthy();
    });
  });

  // ── audit: geofence rejected ───────────────────────────────────────────────

  describe('audit: geofence rejected', () => {
    const ctx = {
      actorUserId: 'user-uuid-1',
      actorRole: 'EMPLOYEE',
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test',
    };

    const enabledEnvConfig = {
      enabled: true,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      radiusMeters: 100,
      maxAccuracyMeters: 100,
      source: 'env' as const,
    };

    it('emits ATTENDANCE_GEOFENCE_REJECTED with MISSING_LOCATION on mobile clock-in with no GPS fields', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledEnvConfig);

      await expect(service.clockIn(userId, { source: 'mobile' }, ctx)).rejects.toThrow(
        UnprocessableEntityException,
      );

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          result: 'REJECTED',
          targetType: 'ATTENDANCE',
          targetId: null,
          targetLabel: 'clock-in-geofence-rejected',
          actorUserId: ctx.actorUserId,
          actorRole: ctx.actorRole,
          metadata: expect.objectContaining({
            attemptType: 'CLOCK_IN',
            reason: 'MISSING_LOCATION',
            hasCoordinates: false,
            hasAccuracy: false,
            accuracyBucket: 'UNKNOWN',
          }),
        }),
      );
    });

    it('emits ATTENDANCE_GEOFENCE_REJECTED with POOR_ACCURACY on mobile clock-in with poor GPS', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({ ...enabledEnvConfig, maxAccuracyMeters: 50 });

      await expect(
        service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 150 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          targetLabel: 'clock-in-geofence-rejected',
          metadata: expect.objectContaining({
            attemptType: 'CLOCK_IN',
            reason: 'POOR_ACCURACY',
            hasCoordinates: true,
            hasAccuracy: true,
            accuracyBucket: 'POOR',
          }),
        }),
      );
    });

    it('emits ATTENDANCE_GEOFENCE_REJECTED with GEOFENCE_NOT_CONFIGURED when company location missing', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        ...enabledEnvConfig,
        latitude: null,
        longitude: null,
      });

      await expect(
        service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 25 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          targetLabel: 'clock-in-geofence-rejected',
          metadata: expect.objectContaining({
            attemptType: 'CLOCK_IN',
            reason: 'GEOFENCE_NOT_CONFIGURED',
            hasCoordinates: true,
            hasAccuracy: true,
            accuracyBucket: 'ACCEPTABLE',
          }),
        }),
      );
    });

    it('emits ATTENDANCE_GEOFENCE_REJECTED with OUTSIDE_RADIUS on mobile clock-in outside radius', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledEnvConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);

      await expect(
        service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 25 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          targetLabel: 'clock-in-geofence-rejected',
          metadata: expect.objectContaining({
            attemptType: 'CLOCK_IN',
            reason: 'OUTSIDE_RADIUS',
            hasCoordinates: true,
            hasAccuracy: true,
            accuracyBucket: 'ACCEPTABLE',
          }),
        }),
      );
    });

    it('emits ATTENDANCE_GEOFENCE_REJECTED with CLOCK_OUT and clock-out-geofence-rejected on rejected clock-out', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledEnvConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);

      await expect(
        service.clockOut(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 25 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          targetLabel: 'clock-out-geofence-rejected',
          metadata: expect.objectContaining({
            attemptType: 'CLOCK_OUT',
            reason: 'OUTSIDE_RADIUS',
          }),
        }),
      );
    });

    it('still returns 422 when audit write fails (best-effort on rejection path)', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledEnvConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);
      mockAuditLog.record.mockRejectedValueOnce(new Error('audit DB down'));

      await expect(
        service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 25 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('metadata contains no forbidden GPS fields', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledEnvConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);

      await expect(
        service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 25 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).not.toHaveProperty('accuracy');
      expect(event.metadata).not.toHaveProperty('distance');
      expect(event.metadata).not.toHaveProperty('companyLatitude');
      expect(event.metadata).not.toHaveProperty('companyLongitude');
      expect(event.metadata).not.toHaveProperty('note');
    });

    it('does not emit ATTENDANCE_GEOFENCE_REJECTED for web source', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledEnvConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);

      await service.clockIn(userId, { source: 'web' }, ctx);

      expect(mockAuditLog.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_GEOFENCE_REJECTED' }),
      );
    });

    it('does not emit ATTENDANCE_GEOFENCE_REJECTED when mobile clock-in is inside radius', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledEnvConfig);
      geofenceService.isWithinRadius.mockReturnValue(true);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);

      await service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 25 }, ctx);

      expect(mockAuditLog.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_GEOFENCE_REJECTED' }),
      );
    });

    it('configSource in metadata reflects effective config source', async () => {
      const dbConfig = { ...enabledEnvConfig, source: 'db' as const };
      geofenceConfig.getEffectiveConfig.mockResolvedValue(dbConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);

      await expect(
        service.clockIn(userId, { source: 'mobile', latitude: COMPANY_LAT, longitude: COMPANY_LON, accuracy: 25 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata).toMatchObject({ configSource: 'db', geofenceEnabled: true });
    });
  });
});
