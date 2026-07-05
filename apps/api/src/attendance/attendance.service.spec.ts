import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AttendanceService } from './attendance.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeofenceService } from './geofence.service';
import { GeofenceConfigService } from './geofence-config.service';
import { mockPrisma } from '../test-utils/prisma.mock';
import { AttendanceSource, AttendanceReviewStatus, WorkMode } from '../common/enums';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { OffsiteClockInDto } from './dto/offsite-clock-in.dto';
import { OffsiteClockOutDto } from './dto/offsite-clock-out.dto';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findFirst: jest.Mock };
  attendance: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  offSiteRequest: { findMany: jest.Mock; findFirst: jest.Mock };
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

    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
    });

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
      // Bug-fix: record is fetched before validateGeofence, so these mocks are now required.
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({ ...mockOpenRecord, attendanceSource: 'COMPANY_GEOFENCE' } as any);

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
      // Bug-fix: record is fetched before validateGeofence, so these mocks are now required.
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({ ...mockOpenRecord, attendanceSource: 'COMPANY_GEOFENCE' } as any);

      await expect(service.clockOut(userId, mobileDto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('OUTSIDE_GEOFENCE error includes structured code field when outside radius on clock-out', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({ ...mockOpenRecord, attendanceSource: 'COMPANY_GEOFENCE' } as any);

      try {
        await service.clockOut(userId, mobileDto);
        fail('Expected UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        expect(err.getResponse()).toMatchObject({ code: 'OUTSIDE_GEOFENCE' });
      }
    });

    it('OUTSIDE_GEOFENCE error includes structured code field when outside radius on clock-in', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);

      try {
        await service.clockIn(userId, mobileDto);
        fail('Expected UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        expect(err.getResponse()).toMatchObject({ code: 'OUTSIDE_GEOFENCE' });
      }
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

      // SEC-ATT-003 (patched): an empty dto has no source and no capturedAt, so a
      // MISSING_SOURCE_CAPTURED_AT soft-signal audit call now precedes ATTENDANCE_CLOCK_IN
      // — find the success event by action rather than assuming call order.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_CLOCK_IN');
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

      // SEC-ATT-003: no capturedAt is sent, so a MISSING_CAPTURED_AT soft-signal audit
      // call now precedes ATTENDANCE_CLOCK_IN — find the success event by action rather
      // than assuming call order, so this test keeps guarding the right event's privacy.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_CLOCK_IN');
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

      // SEC-ATT-003 (patched): a MISSING_SOURCE_CAPTURED_AT soft-signal audit call now
      // precedes ATTENDANCE_CLOCK_OUT for an empty dto — find the success event by
      // action rather than assuming call order.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_CLOCK_OUT');
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

      // SEC-ATT-003: no capturedAt is sent, so a MISSING_CAPTURED_AT soft-signal audit
      // call now precedes ATTENDANCE_CLOCK_OUT — find the success event by action rather
      // than assuming call order, so this test keeps guarding the right event's privacy.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_CLOCK_OUT');
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

    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
    });

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
      // Bug-fix: record is fetched before validateGeofence.
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({ ...mockOpenRecord, attendanceSource: 'COMPANY_GEOFENCE' } as any);

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

      // SEC-ATT-003: this fixture omits capturedAt, so a MISSING_CAPTURED_AT soft-signal
      // call now precedes the OUTSIDE_RADIUS rejection — find the rejection event by
      // action rather than assuming call order (same fix as the configSource test above).
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_GEOFENCE_REJECTED');
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

      // SEC-ATT-003: a MISSING_CAPTURED_AT soft-signal audit call now precedes the
      // OUTSIDE_RADIUS rejection when capturedAt is absent (as in this fixture), so find
      // the geofence-rejected event by action rather than assuming call order.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_GEOFENCE_REJECTED');
      expect(event.metadata).toMatchObject({ configSource: 'db', geofenceEnabled: true });
    });
  });

  describe('SEC-ATT-003: mock/stale/future location rejection (mobile source)', () => {
    const ctx = {
      actorUserId: userId,
      actorRole: 'EMPLOYEE',
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test',
    };
    const baseMobileDto = {
      source: 'mobile' as const,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      accuracy: 25,
    };

    beforeEach(() => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(true);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);
    });

    it('accepts a fresh capturedAt within the geofence (abuse-case #1)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:30:30.000Z'));
      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: '2026-06-13T01:30:10.000Z' }, ctx),
      ).resolves.toBeDefined();
    });

    it('accepts a capturedAt in the ACCEPTABLE band without rejecting (abuse-case #12: legitimate poor connectivity)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:31:30.000Z')); // 90s old — inside the 120s ceiling
      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).resolves.toBeDefined();
    });

    it('allows a missing capturedAt (soft-enforced) but logs a MISSING_CAPTURED_AT audit signal, not a rejection', async () => {
      await expect(service.clockIn(userId, baseMobileDto, ctx)).resolves.toBeDefined();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CAPTURED_AT_MISSING',
          result: 'ALLOWED',
          metadata: expect.objectContaining({ attemptType: 'CLOCK_IN', reason: 'MISSING_CAPTURED_AT' }),
        }),
      );
      expect(mockAuditLog.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_GEOFENCE_REJECTED' }),
      );
    });

    it('rejects an unparseable capturedAt with INVALID_CAPTURED_AT (defense-in-depth beyond the DTO\'s @IsISO8601)', async () => {
      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: 'not-a-real-timestamp' } as any, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          result: 'REJECTED',
          metadata: expect.objectContaining({ reason: 'INVALID_CAPTURED_AT' }),
        }),
      );
    });

    it('rejects a stale capturedAt beyond the acceptable window with STALE_LOCATION', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z')); // 10 minutes after capturedAt
      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION' }),
        }),
      );
    });

    it('rejects a future capturedAt beyond the clock-skew tolerance with FUTURE_LOCATION', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:30:00.000Z'));
      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: '2026-06-13T01:35:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'FUTURE_LOCATION' }),
        }),
      );
    });

    it('rejects when isMockLocation is explicitly true, with MOCK_LOCATION_DETECTED', async () => {
      await expect(
        service.clockIn(
          userId,
          { ...baseMobileDto, capturedAt: new Date().toISOString(), isMockLocation: true },
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'MOCK_LOCATION_DETECTED' }),
        }),
      );
    });

    it('does not reject when isMockLocation is explicitly false', async () => {
      await expect(
        service.clockIn(
          userId,
          { ...baseMobileDto, capturedAt: new Date().toISOString(), isMockLocation: false },
          ctx,
        ),
      ).resolves.toBeDefined();
    });

    it('applies the same STALE_LOCATION rejection on clock-out for a COMPANY_GEOFENCE record', async () => {
      prisma.attendance.findUnique.mockResolvedValue({ ...mockOpenRecord, attendanceSource: 'COMPANY_GEOFENCE' } as any);
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));

      await expect(
        service.clockOut(userId, { ...baseMobileDto, capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          targetLabel: 'clock-out-geofence-rejected',
          metadata: expect.objectContaining({ attemptType: 'CLOCK_OUT', reason: 'STALE_LOCATION' }),
        }),
      );
    });

    it('does not leak raw GPS fields or the raw nonce into audit metadata for a rejected attempt', async () => {
      await expect(
        service.clockIn(
          userId,
          { ...baseMobileDto, capturedAt: 'not-a-real-timestamp', nonce: 'top-secret-nonce-value' } as any,
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_GEOFENCE_REJECTED');
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).not.toHaveProperty('accuracy');
      expect(event.metadata).not.toHaveProperty('distance');
      expect(event.metadata).not.toHaveProperty('nonce');
      expect(JSON.stringify(event.metadata)).not.toContain('top-secret-nonce-value');
    });

    it('rejects a stale capturedAt for OFFSITE workMode too — payload-integrity now runs before the workMode branch (SEC-ATT-003 bypass fix: workMode is as forgeable as source)', async () => {
      prisma.offSiteRequest.findFirst.mockResolvedValue({ id: 'req-1' });
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));

      await expect(
        service.clockIn(
          userId,
          { ...baseMobileDto, workMode: WorkMode.OFFSITE, capturedAt: '2026-06-13T01:30:00.000Z' },
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      // Never reaches the off-site-request lookup — payload integrity is checked first.
      expect(prisma.offSiteRequest.findFirst).not.toHaveBeenCalled();
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION' }),
        }),
      );
    });
  });

  describe('SEC-ATT-003: payload-freshness/mock checks run independently of geofence enabled', () => {
    // Explicit product decision: an admin disabling company-radius enforcement
    // (config.enabled = false) turns off geofence/radius validation only. It does not
    // also disable anti-spoofing validation of the client's own capturedAt/mock-location
    // signal — those checks run for every `source: 'mobile'` request regardless.
    const ctx = {
      actorUserId: userId,
      actorRole: 'EMPLOYEE',
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test',
    };
    const disabledConfig = {
      enabled: false,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      radiusMeters: 100,
      maxAccuracyMeters: 100,
      source: 'db' as const,
    };
    const baseMobileDto = {
      source: 'mobile' as const,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      accuracy: 25,
    };

    beforeEach(() => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(disabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);
    });

    it('rejects a stale capturedAt with STALE_LOCATION even when geofence is disabled', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));

      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION', geofenceEnabled: false }),
        }),
      );
    });

    it('rejects a future capturedAt with FUTURE_LOCATION even when geofence is disabled', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:30:00.000Z'));

      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: '2026-06-13T01:35:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'FUTURE_LOCATION', geofenceEnabled: false }),
        }),
      );
    });

    it('rejects isMockLocation: true with MOCK_LOCATION_DETECTED even when geofence is disabled', async () => {
      await expect(
        service.clockIn(
          userId,
          { ...baseMobileDto, capturedAt: new Date().toISOString(), isMockLocation: true },
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'MOCK_LOCATION_DETECTED', geofenceEnabled: false }),
        }),
      );
    });

    it('rejects an unparseable capturedAt with INVALID_CAPTURED_AT even when geofence is disabled', async () => {
      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: 'not-a-real-timestamp' } as any, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'INVALID_CAPTURED_AT', geofenceEnabled: false }),
        }),
      );
    });

    it('proceeds normally (radius check skipped) for a valid, fresh, non-mock payload when geofence is disabled', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:30:10.000Z'));

      await expect(
        service.clockIn(userId, { ...baseMobileDto, capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).resolves.toBeDefined();

      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_GEOFENCE_REJECTED' }),
      );
    });

    it('still soft-allows a missing capturedAt (logged, not rejected) when geofence is disabled', async () => {
      await expect(service.clockIn(userId, baseMobileDto, ctx)).resolves.toBeDefined();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CAPTURED_AT_MISSING',
          result: 'ALLOWED',
        }),
      );
    });

    it('still enforces MISSING_LOCATION-style gating as before: with geofence disabled, missing lat/lon does not block clock-in', async () => {
      // Pre-existing behavior, unchanged by SEC-ATT-003: MISSING_LOCATION/POOR_ACCURACY
      // remain gated behind config.enabled, same as before this task.
      await expect(
        service.clockIn(userId, { source: 'mobile', capturedAt: new Date().toISOString() }, ctx),
      ).resolves.toBeDefined();
    });
  });

  describe('SEC-ATT-003 (patched): source omission no longer bypasses payload-integrity checks', () => {
    // HOLD-fix verification: previously, validateGeofence() returned immediately when
    // `dto.source !== 'mobile'`, so a request that simply omitted `source` (or crafted
    // it as "web") skipped every capturedAt/isMockLocation check below — a manual
    // payload-edit bypass of the entire anti-spoofing threat model. These checks now
    // run for every request, regardless of `source`.
    const ctx = {
      actorUserId: userId,
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

    beforeEach(() => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledEnvConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);
    });

    it('rejects a stale capturedAt with source omitted', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));

      await expect(
        service.clockIn(userId, { capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION', source: null }),
        }),
      );
    });

    it('rejects a future capturedAt with source omitted', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:30:00.000Z'));

      await expect(
        service.clockIn(userId, { capturedAt: '2026-06-13T01:35:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'FUTURE_LOCATION', source: null }),
        }),
      );
    });

    it('rejects an invalid (unparseable) capturedAt with source omitted', async () => {
      await expect(
        service.clockIn(userId, { capturedAt: 'not-a-real-timestamp' } as any, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'INVALID_CAPTURED_AT', source: null }),
        }),
      );
    });

    it('rejects isMockLocation: true with source omitted', async () => {
      await expect(
        service.clockIn(
          userId,
          { capturedAt: new Date().toISOString(), isMockLocation: true },
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'MOCK_LOCATION_DETECTED', source: null }),
        }),
      );
    });

    it('allows a missing capturedAt with source omitted (soft-enforced) but flags it distinctly as MISSING_SOURCE_CAPTURED_AT', async () => {
      await expect(service.clockIn(userId, {}, ctx)).resolves.toBeDefined();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CAPTURED_AT_MISSING',
          result: 'ALLOWED',
          metadata: expect.objectContaining({
            reason: 'MISSING_SOURCE_CAPTURED_AT',
            source: null,
          }),
        }),
      );
      expect(mockAuditLog.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ATTENDANCE_GEOFENCE_REJECTED' }),
      );
    });

    it('rejects a stale capturedAt with source omitted even when geofence is disabled', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({ ...enabledEnvConfig, enabled: false });
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));

      await expect(
        service.clockIn(userId, { capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION', source: null, geofenceEnabled: false }),
        }),
      );
    });

    it('does not leak raw GPS or the raw nonce into audit metadata for a source-omitted rejected attempt', async () => {
      await expect(
        service.clockIn(
          userId,
          {
            latitude: COMPANY_LAT,
            longitude: COMPANY_LON,
            accuracy: 25,
            capturedAt: 'not-a-real-timestamp',
            nonce: 'top-secret-nonce-value',
          } as any,
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_GEOFENCE_REJECTED');
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).not.toHaveProperty('accuracy');
      expect(event.metadata).not.toHaveProperty('nonce');
      expect(JSON.stringify(event.metadata)).not.toContain('top-secret-nonce-value');
      expect(JSON.stringify(event.metadata)).not.toContain(String(COMPANY_LAT));
      expect(JSON.stringify(event.metadata)).not.toContain(String(COMPANY_LON));
    });

    it('rejects a stale capturedAt with source omitted on clock-out too', async () => {
      prisma.attendance.findUnique.mockResolvedValue({ ...mockOpenRecord, attendanceSource: 'COMPANY_GEOFENCE' } as any);
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));

      await expect(
        service.clockOut(userId, { capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          targetLabel: 'clock-out-geofence-rejected',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION', source: null }),
        }),
      );
    });
  });

  describe('SEC-ATT-003 (patched): offsite clock-in/out payloads are no longer exempt from payload-integrity checks', () => {
    // Previously, clockInOffsite()/clockOutOffsite() never called any capturedAt/mock
    // validation at all, regardless of source (OffsiteClockInDto/OffsiteClockOutDto have
    // no `source` field). This closes that gap too.
    const ctx = {
      actorUserId: userId,
      actorRole: 'EMPLOYEE',
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test',
    };
    const offsiteDto = {
      latitude: 13.9,
      longitude: 100.9,
      accuracy: 25,
      workLocationName: 'Client Office — Siam',
      reason: 'Client presentation Q2',
    };
    const disabledConfig = {
      enabled: false,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      radiusMeters: 100,
      maxAccuracyMeters: 100,
      source: 'env' as const,
    };

    beforeEach(() => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(disabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      (prisma as any).offSiteRequest.findFirst.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, workMode: 'OFFSITE' } as any);
    });

    it('clockInOffsite rejects a stale capturedAt', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));

      await expect(
        service.clockInOffsite(userId, { ...offsiteDto, capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION', source: null }),
        }),
      );
    });

    it('clockInOffsite rejects isMockLocation: true', async () => {
      await expect(
        service.clockInOffsite(
          userId,
          { ...offsiteDto, capturedAt: new Date().toISOString(), isMockLocation: true },
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'MOCK_LOCATION_DETECTED', source: null }),
        }),
      );
    });

    it('clockInOffsite soft-allows a missing capturedAt, flagged as MISSING_SOURCE_CAPTURED_AT', async () => {
      await expect(service.clockInOffsite(userId, offsiteDto, ctx)).resolves.toBeDefined();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CAPTURED_AT_MISSING',
          result: 'ALLOWED',
          metadata: expect.objectContaining({ reason: 'MISSING_SOURCE_CAPTURED_AT', source: null }),
        }),
      );
    });

    it('clockOutOffsite rejects a stale capturedAt', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockOpenRecord,
        attendanceSource: 'OFFSITE_UNPLANNED',
        workMode: 'OFFSITE',
      } as any);
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));

      await expect(
        service.clockOutOffsite(
          userId,
          { latitude: 13.9, longitude: 100.9, accuracy: 30, capturedAt: '2026-06-13T01:30:00.000Z' },
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          targetLabel: 'clock-out-geofence-rejected',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION', source: null }),
        }),
      );
    });
  });

  // ── clockOut bug-fix: off-site records bypass company geofence ────────────

  describe('clockOut off-site geofence bypass', () => {
    const offsiteRecord = {
      ...mockOpenRecord,
      attendanceSource: 'OFFSITE_PLANNED',
      workMode: 'OFFSITE',
    };

    it('skips company geofence on clock-out for an OFFSITE_PLANNED record', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        enabled: true,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
        radiusMeters: 100,
        maxAccuracyMeters: 100,
        source: 'env' as const,
      });
      geofenceService.isWithinRadius.mockReturnValue(false); // would fail if geofence were called

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(offsiteRecord as any);
      prisma.attendance.update.mockResolvedValue({ ...mockAttendanceFull, checkOut: new Date() } as any);

      await expect(
        service.clockOut(userId, { source: 'mobile', latitude: 13.0, longitude: 100.0, accuracy: 25 }),
      ).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
    });

    it('skips company geofence on clock-out for an OFFSITE_UNPLANNED record', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        enabled: true,
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
        radiusMeters: 100,
        maxAccuracyMeters: 100,
        source: 'env' as const,
      });
      geofenceService.isWithinRadius.mockReturnValue(false);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockOpenRecord,
        attendanceSource: 'OFFSITE_UNPLANNED',
      } as any);
      prisma.attendance.update.mockResolvedValue({ ...mockAttendanceFull, checkOut: new Date() } as any);

      await expect(
        service.clockOut(userId, { source: 'mobile', latitude: 13.0, longitude: 100.0, accuracy: 25 }),
      ).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
    });
  });

  // ── clockInOffsite ─────────────────────────────────────────────────────────

  describe('clockInOffsite', () => {
    const offsiteDto = {
      latitude: 13.9,
      longitude: 100.9,
      accuracy: 25,
      workLocationName: 'Client Office — Siam',
      reason: 'Client presentation Q2',
    };

    const disabledConfig = {
      enabled: false,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      radiusMeters: 100,
      maxAccuracyMeters: 100,
      source: 'env' as const,
    };

    it('creates OFFSITE_UNPLANNED / PENDING_REVIEW when no approved request exists', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(disabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      (prisma as any).offSiteRequest.findFirst.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({
        ...mockAttendanceFull,
        attendanceSource: 'OFFSITE_UNPLANNED',
        reviewStatus: 'PENDING_REVIEW',
        workMode: 'OFFSITE',
      } as any);

      const result = await service.clockInOffsite(userId, offsiteDto);

      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attendanceSource: AttendanceSource.OFFSITE_UNPLANNED,
            reviewStatus: AttendanceReviewStatus.PENDING_REVIEW,
            workMode: 'OFFSITE',
            workLocationName: offsiteDto.workLocationName,
            offsiteReason: offsiteDto.reason,
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('creates OFFSITE_PLANNED / AUTO_ACCEPTED when an approved request exists', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(disabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      (prisma as any).offSiteRequest.findFirst.mockResolvedValue({ id: 'osr-1' });
      prisma.attendance.create.mockResolvedValue({
        ...mockAttendanceFull,
        attendanceSource: 'OFFSITE_PLANNED',
        reviewStatus: 'AUTO_ACCEPTED',
        workMode: 'OFFSITE',
        offSiteRequestId: 'osr-1',
      } as any);

      await service.clockInOffsite(userId, offsiteDto);

      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attendanceSource: AttendanceSource.OFFSITE_PLANNED,
            reviewStatus: AttendanceReviewStatus.AUTO_ACCEPTED,
            offSiteRequestId: 'osr-1',
          }),
        }),
      );
    });

    it('stores GPS fields in the DB record', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(disabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      (prisma as any).offSiteRequest.findFirst.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull } as any);

      await service.clockInOffsite(userId, offsiteDto);

      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checkInLatitude: offsiteDto.latitude,
            checkInLongitude: offsiteDto.longitude,
            checkInAccuracyMeters: offsiteDto.accuracy,
          }),
        }),
      );
    });

    it('audit metadata does NOT contain raw latitude or longitude', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(disabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      (prisma as any).offSiteRequest.findFirst.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, id: attendanceId } as any);

      await service.clockInOffsite(userId, offsiteDto);

      expect(mockAuditLog.record).toHaveBeenCalled();
      // SEC-ATT-003 (patched): offsiteDto has no source and no capturedAt, so a
      // MISSING_SOURCE_CAPTURED_AT soft-signal audit call now precedes
      // ATTENDANCE_OFFSITE_CLOCK_IN — find the success event by action.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_OFFSITE_CLOCK_IN');
      expect(event.action).toBe('ATTENDANCE_OFFSITE_CLOCK_IN');
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).toHaveProperty('hasCoordinates', true);
      expect(event.metadata).toHaveProperty('accuracyBucket');
    });

    it('throws ConflictException when already clocked in today', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(mockOpenRecord as any);

      await expect(service.clockInOffsite(userId, offsiteDto)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when no employee profile is linked', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.clockInOffsite(userId, offsiteDto)).rejects.toThrow(BadRequestException);
    });

    it('computes distance from company when geofence has coordinates', async () => {
      const configWithCoords = { ...disabledConfig, latitude: COMPANY_LAT, longitude: COMPANY_LON };
      geofenceConfig.getEffectiveConfig.mockResolvedValue(configWithCoords);
      geofenceService.calculateDistanceMeters.mockReturnValue(5000);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      (prisma as any).offSiteRequest.findFirst.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull } as any);

      await service.clockInOffsite(userId, offsiteDto);

      expect(geofenceService.calculateDistanceMeters).toHaveBeenCalledWith(
        offsiteDto.latitude, offsiteDto.longitude, COMPANY_LAT, COMPANY_LON,
      );
      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checkInDistanceFromCompanyMeters: 5000 }),
        }),
      );
    });

    it('sets distance to null when geofence has no coordinates', async () => {
      const noCoordConfig = { ...disabledConfig, latitude: null, longitude: null };
      geofenceConfig.getEffectiveConfig.mockResolvedValue(noCoordConfig);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      (prisma as any).offSiteRequest.findFirst.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull } as any);

      await service.clockInOffsite(userId, offsiteDto);

      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checkInDistanceFromCompanyMeters: null }),
        }),
      );
    });
  });

  // ── clockOutOffsite ────────────────────────────────────────────────────────

  describe('clockOutOffsite', () => {
    const offsiteClockOutDto = {
      latitude: 13.9,
      longitude: 100.9,
      accuracy: 30,
    };

    const openOffsiteRecord = {
      ...mockOpenRecord,
      attendanceSource: 'OFFSITE_UNPLANNED',
      workMode: 'OFFSITE',
    };

    const disabledConfig = {
      enabled: false,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      radiusMeters: 100,
      maxAccuracyMeters: 100,
      source: 'env' as const,
    };

    it('clocks out and stores GPS fields', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(disabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(openOffsiteRecord as any);
      prisma.attendance.update.mockResolvedValue({
        ...mockAttendanceFull,
        checkOut: new Date(),
        attendanceSource: 'OFFSITE_UNPLANNED',
        reviewStatus: 'PENDING_REVIEW',
      } as any);

      const result = await service.clockOutOffsite(userId, offsiteClockOutDto);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checkOutLatitude: offsiteClockOutDto.latitude,
            checkOutLongitude: offsiteClockOutDto.longitude,
            checkOutAccuracyMeters: offsiteClockOutDto.accuracy,
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when no clock-in record exists', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.clockOutOffsite(userId, offsiteClockOutDto)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already clocked out', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({
        ...openOffsiteRecord,
        checkOut: new Date(),
      } as any);

      await expect(service.clockOutOffsite(userId, offsiteClockOutDto)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when existing record is COMPANY_GEOFENCE', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockOpenRecord,
        attendanceSource: 'COMPANY_GEOFENCE',
      } as any);

      await expect(service.clockOutOffsite(userId, offsiteClockOutDto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when existing record has no attendanceSource (old ONSITE record)', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      // attendanceSource is undefined (old record, before migration)
      prisma.attendance.findUnique.mockResolvedValue({ ...mockOpenRecord } as any);

      await expect(service.clockOutOffsite(userId, offsiteClockOutDto)).rejects.toThrow(BadRequestException);
    });

    it('audit metadata does NOT contain raw latitude or longitude', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(disabledConfig);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(openOffsiteRecord as any);
      prisma.attendance.update.mockResolvedValue({
        ...mockAttendanceFull,
        checkOut: new Date(),
        attendanceSource: 'OFFSITE_UNPLANNED',
      } as any);

      await service.clockOutOffsite(userId, offsiteClockOutDto);

      // SEC-ATT-003 (patched): offsiteClockOutDto has no source and no capturedAt, so a
      // MISSING_SOURCE_CAPTURED_AT soft-signal audit call now precedes
      // ATTENDANCE_OFFSITE_CLOCK_OUT — find the success event by action.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_OFFSITE_CLOCK_OUT');
      expect(event.action).toBe('ATTENDANCE_OFFSITE_CLOCK_OUT');
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).toHaveProperty('hasCoordinates', true);
      expect(event.metadata).toHaveProperty('accuracyBucket');
    });
  });

  // ── findOffsiteReview ──────────────────────────────────────────────────────

  describe('findOffsiteReview', () => {
    const mockOffsiteRecord = {
      ...mockAttendanceFull,
      attendanceSource: 'OFFSITE_UNPLANNED',
      reviewStatus: 'PENDING_REVIEW',
      checkInLatitude: 13.9,
    };

    it('returns paginated off-site records with correct meta', async () => {
      prisma.$transaction.mockResolvedValue([[mockOffsiteRecord], 3] as any);

      const result = await service.findOffsiteReview({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 3, page: 1, limit: 20, totalPages: 1 });
    });

    it('passes reviewStatus filter when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0] as any);

      await service.findOffsiteReview({ reviewStatus: AttendanceReviewStatus.APPROVED });

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reviewStatus: AttendanceReviewStatus.APPROVED,
          }),
        }),
      );
    });

    it('applies employeeId filter when provided', async () => {
      prisma.$transaction.mockResolvedValue([[mockOffsiteRecord], 1] as any);

      const result = await service.findOffsiteReview({ employeeId });

      expect(result.data).toHaveLength(1);
    });

    it('returns empty data with zero total when no records match', async () => {
      prisma.$transaction.mockResolvedValue([[], 0] as any);

      const result = await service.findOffsiteReview({});

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('uses OR to include both OFFSITE records and mixed checkout exceptions (COMPANY_GEOFENCE + non-null reviewStatus)', async () => {
      prisma.$transaction.mockResolvedValue([[], 0] as any);

      await service.findOffsiteReview({});

      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                attendanceSource: expect.objectContaining({
                  in: expect.arrayContaining([
                    AttendanceSource.OFFSITE_UNPLANNED,
                    AttendanceSource.OFFSITE_PLANNED,
                  ]),
                }),
              }),
              expect.objectContaining({
                attendanceSource: AttendanceSource.COMPANY_GEOFENCE,
              }),
            ]),
          }),
        }),
      );
    });

    it('returns mixed checkout exception records (COMPANY_GEOFENCE + PENDING_REVIEW)', async () => {
      const mixedRecord = {
        ...mockAttendanceFull,
        attendanceSource: 'COMPANY_GEOFENCE',
        reviewStatus: 'PENDING_REVIEW',
        checkOut: new Date(),
        checkOutLatitude: 13.9,
        workLocationName: 'Client Office',
        offsiteReason: 'Client meeting',
      };
      prisma.$transaction.mockResolvedValue([[mixedRecord], 1] as any);

      const result = await service.findOffsiteReview({});

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ── mixedCheckoutException ─────────────────────────────────────────────────

  describe('mixedCheckoutException', () => {
    const ctx = {
      actorUserId: userId,
      actorRole: 'EMPLOYEE',
      ipAddress: '10.0.0.1',
      userAgent: 'jest-test',
    };

    const enabledConfig = {
      enabled: true,
      latitude: COMPANY_LAT,
      longitude: COMPANY_LON,
      radiusMeters: 100,
      maxAccuracyMeters: 100,
      source: 'env' as const,
    };

    const validDto = {
      latitude: 13.8,
      longitude: 100.4,
      accuracy: 30,
      workLocationName: 'Client Office',
      reason: 'Client meeting assigned by manager',
    };

    const onsiteRecord = {
      ...mockOpenRecord,
      attendanceSource: 'COMPANY_GEOFENCE',
      reviewStatus: null,
      workMode: 'ONSITE',
    };

    const submittedRecord = {
      ...mockAttendanceFull,
      attendanceSource: 'COMPANY_GEOFENCE',
      reviewStatus: 'PENDING_REVIEW',
      workMode: 'ONSITE',
      checkOut: new Date(),
      checkOutLatitude: 13.8,
      checkOutLongitude: 100.4,
      workLocationName: 'Client Office',
      offsiteReason: 'Client meeting assigned by manager',
    };

    it('successfully submits mixed checkout exception for active ONSITE record outside geofence', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false); // outside geofence
      geofenceService.calculateDistanceMeters.mockReturnValue(500);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);
      prisma.attendance.update.mockResolvedValue(submittedRecord as any);

      const result = await service.mixedCheckoutException(userId, validDto, ctx);

      expect(result).toBeDefined();
      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attendanceId },
          data: expect.objectContaining({
            reviewStatus: AttendanceReviewStatus.PENDING_REVIEW,
            workLocationName: 'Client Office',
            offsiteReason: 'Client meeting assigned by manager',
            checkOutLatitude: 13.8,
            checkOutLongitude: 100.4,
            checkOutAccuracyMeters: 30,
          }),
        }),
      );
    });

    it('preserves attendanceSource=COMPANY_GEOFENCE and does not change workMode', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);
      geofenceService.calculateDistanceMeters.mockReturnValue(500);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);
      prisma.attendance.update.mockResolvedValue(submittedRecord as any);

      await service.mixedCheckoutException(userId, validDto, ctx);

      const updateCall = prisma.attendance.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('attendanceSource');
      expect(updateCall.data).not.toHaveProperty('workMode');
    });

    it('sets reviewStatus to PENDING_REVIEW', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);
      geofenceService.calculateDistanceMeters.mockReturnValue(500);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);
      prisma.attendance.update.mockResolvedValue(submittedRecord as any);

      await service.mixedCheckoutException(userId, validDto, ctx);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewStatus: AttendanceReviewStatus.PENDING_REVIEW,
          }),
        }),
      );
    });

    it('throws NotFoundException when no clock-in record exists for today', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.mixedCheckoutException(userId, validDto)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already checked out', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({
        ...onsiteRecord,
        checkOut: new Date(),
      } as any);

      await expect(service.mixedCheckoutException(userId, validDto)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when exception already submitted (reviewStatus not null)', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({
        ...onsiteRecord,
        reviewStatus: 'PENDING_REVIEW',
      } as any);

      await expect(service.mixedCheckoutException(userId, validDto)).rejects.toThrow(ConflictException);
    });

    it('throws UnprocessableEntityException when attendanceSource is not COMPANY_GEOFENCE', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue({
        ...onsiteRecord,
        attendanceSource: 'OFFSITE_UNPLANNED',
      } as any);

      await expect(service.mixedCheckoutException(userId, validDto)).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when employee is inside company geofence', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(true); // inside geofence

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);

      await expect(service.mixedCheckoutException(userId, validDto)).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws BadRequestException when user has no linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.mixedCheckoutException(userId, validDto)).rejects.toThrow(BadRequestException);
    });

    it('allows exception when geofence is disabled (cannot validate position)', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        ...enabledConfig,
        enabled: false,
      });

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);
      prisma.attendance.update.mockResolvedValue(submittedRecord as any);

      await expect(service.mixedCheckoutException(userId, validDto)).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
    });

    it('allows exception when geofence is unconfigured (no coordinates)', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue({
        ...enabledConfig,
        enabled: true,
        latitude: null,
        longitude: null,
      });

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);
      prisma.attendance.update.mockResolvedValue(submittedRecord as any);

      await expect(service.mixedCheckoutException(userId, validDto)).resolves.toBeDefined();
      expect(geofenceService.isWithinRadius).not.toHaveBeenCalled();
    });

    it('emits ATTENDANCE_MIXED_CHECKOUT_SUBMITTED audit event on success', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);
      geofenceService.calculateDistanceMeters.mockReturnValue(500);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);
      prisma.attendance.update.mockResolvedValue(submittedRecord as any);

      await service.mixedCheckoutException(userId, validDto, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_MIXED_CHECKOUT_SUBMITTED',
          targetType: 'ATTENDANCE',
          result: 'SUCCESS',
        }),
      );
    });

    it('audit metadata contains no raw GPS coordinates', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);
      geofenceService.calculateDistanceMeters.mockReturnValue(500);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);
      prisma.attendance.update.mockResolvedValue(submittedRecord as any);

      await service.mixedCheckoutException(userId, validDto, ctx);

      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).not.toHaveProperty('checkOutLatitude');
      expect(event.metadata).not.toHaveProperty('checkOutLongitude');
      expect(event.metadata).toHaveProperty('hasCoordinates', true);
      expect(event.metadata).toHaveProperty('accuracyBucket');
      expect(event.metadata).toHaveProperty('workLocationName', 'Client Office');
    });

    it('still submits and returns result when audit write fails (best-effort)', async () => {
      geofenceConfig.getEffectiveConfig.mockResolvedValue(enabledConfig);
      geofenceService.isWithinRadius.mockReturnValue(false);
      geofenceService.calculateDistanceMeters.mockReturnValue(500);

      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(onsiteRecord as any);
      prisma.attendance.update.mockResolvedValue(submittedRecord as any);
      mockAuditLog.record.mockRejectedValueOnce(new Error('audit DB down'));

      const result = await service.mixedCheckoutException(userId, validDto, ctx);

      expect(result).toBeDefined();
    });
  });

  // ── approveOffsiteAttendance ───────────────────────────────────────────────

  describe('approveOffsiteAttendance', () => {
    const ctx = {
      actorUserId: 'admin-uuid-1',
      actorRole: 'SUPER_ADMIN',
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test',
    };

    const pendingRecord = {
      ...mockAttendanceFull,
      attendanceSource: 'OFFSITE_UNPLANNED',
      reviewStatus: 'PENDING_REVIEW',
      checkInLatitude: 13.9,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    };

    const approvedRecord = {
      ...pendingRecord,
      reviewStatus: 'APPROVED',
      reviewedAt: new Date(),
    };

    it('throws NotFoundException when record does not exist', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.approveOffsiteAttendance('missing-id', userId, {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when record is COMPANY_GEOFENCE with null reviewStatus (normal on-site, not a mixed checkout)', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockAttendanceFull,
        attendanceSource: 'COMPANY_GEOFENCE',
        reviewStatus: null,
      } as any);

      await expect(service.approveOffsiteAttendance(attendanceId, userId, {})).rejects.toThrow(BadRequestException);
    });

    it('approves COMPANY_GEOFENCE record when reviewStatus is PENDING_REVIEW (mixed checkout exception)', async () => {
      const mixedRecord = {
        ...mockAttendanceFull,
        attendanceSource: 'COMPANY_GEOFENCE',
        reviewStatus: 'PENDING_REVIEW',
        checkIn: new Date(),
        checkOut: new Date(),
        checkOutLatitude: 13.9,
      };
      prisma.attendance.findUnique.mockResolvedValue(mixedRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'reviewer-emp-id' });
      prisma.attendance.update.mockResolvedValue({ ...mixedRecord, reviewStatus: 'APPROVED' } as any);

      const result = await service.approveOffsiteAttendance(attendanceId, userId, {});

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewStatus: AttendanceReviewStatus.APPROVED }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('throws BadRequestException when record has no attendanceSource', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockAttendanceFull,
        attendanceSource: null,
        reviewStatus: 'PENDING_REVIEW',
      } as any);

      await expect(service.approveOffsiteAttendance(attendanceId, userId, {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when record is AUTO_ACCEPTED (not reviewable)', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockAttendanceFull,
        attendanceSource: 'OFFSITE_PLANNED',
        reviewStatus: 'AUTO_ACCEPTED',
      } as any);

      await expect(service.approveOffsiteAttendance(attendanceId, userId, {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when record is already APPROVED', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...pendingRecord,
        reviewStatus: 'APPROVED',
      } as any);

      await expect(service.approveOffsiteAttendance(attendanceId, userId, {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when record is already REJECTED', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...pendingRecord,
        reviewStatus: 'REJECTED',
      } as any);

      await expect(service.approveOffsiteAttendance(attendanceId, userId, {})).rejects.toThrow(BadRequestException);
    });

    it('updates record to APPROVED status', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'reviewer-emp-id' });
      prisma.attendance.update.mockResolvedValue(approvedRecord as any);

      const result = await service.approveOffsiteAttendance(attendanceId, userId, {}, ctx);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attendanceId },
          data: expect.objectContaining({ reviewStatus: AttendanceReviewStatus.APPROVED }),
        }),
      );
      expect(result).toMatchObject({ id: attendanceId });
    });

    it('sets reviewedById when reviewer has an employee profile', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'reviewer-emp-id' });
      prisma.attendance.update.mockResolvedValue(approvedRecord as any);

      await service.approveOffsiteAttendance(attendanceId, userId, {}, ctx);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewedById: 'reviewer-emp-id' }),
        }),
      );
    });

    it('omits reviewedById when reviewer has no employee profile', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendance.update.mockResolvedValue(approvedRecord as any);

      await service.approveOffsiteAttendance(attendanceId, userId, {}, ctx);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ reviewedById: expect.anything() }),
        }),
      );
    });

    it('sets reviewNote when provided', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendance.update.mockResolvedValue({ ...approvedRecord, reviewNote: 'Confirmed' } as any);

      await service.approveOffsiteAttendance(attendanceId, userId, { reviewNote: 'Confirmed' }, ctx);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewNote: 'Confirmed' }),
        }),
      );
    });

    it('records ATTENDANCE_OFFSITE_APPROVED audit event', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendance.update.mockResolvedValue(approvedRecord as any);

      await service.approveOffsiteAttendance(attendanceId, userId, {}, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_OFFSITE_APPROVED',
          targetType: 'ATTENDANCE',
          targetId: attendanceId,
          result: 'SUCCESS',
          actorUserId: ctx.actorUserId,
          actorRole: ctx.actorRole,
        }),
      );
    });

    it('audit metadata contains no raw GPS coordinates', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendance.update.mockResolvedValue(approvedRecord as any);

      await service.approveOffsiteAttendance(attendanceId, userId, {}, ctx);

      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).not.toHaveProperty('checkInLatitude');
      expect(event.metadata).not.toHaveProperty('checkInLongitude');
      expect(event.metadata).toHaveProperty('hasCoordinates');
    });

    it('still approves and returns result when audit write fails (best-effort)', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendance.update.mockResolvedValue(approvedRecord as any);
      mockAuditLog.record.mockRejectedValueOnce(new Error('audit DB down'));

      const result = await service.approveOffsiteAttendance(attendanceId, userId, {}, ctx);

      expect(result).toBeDefined();
    });
  });

  // ── rejectOffsiteAttendance ────────────────────────────────────────────────

  describe('rejectOffsiteAttendance', () => {
    const ctx = {
      actorUserId: 'admin-uuid-1',
      actorRole: 'HR_ADMIN',
      ipAddress: '10.0.0.1',
      userAgent: 'jest-test',
    };

    const pendingRecord = {
      ...mockAttendanceFull,
      attendanceSource: 'OFFSITE_UNPLANNED',
      reviewStatus: 'PENDING_REVIEW',
      checkInLatitude: 13.9,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    };

    const rejectedRecord = {
      ...pendingRecord,
      reviewStatus: 'REJECTED',
      reviewedAt: new Date(),
      reviewNote: 'No documentation',
    };

    it('throws NotFoundException when record does not exist', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.rejectOffsiteAttendance('missing-id', userId, {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when record is COMPANY_GEOFENCE with null reviewStatus (normal on-site, not a mixed checkout)', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockAttendanceFull,
        attendanceSource: 'COMPANY_GEOFENCE',
        reviewStatus: null,
      } as any);

      await expect(service.rejectOffsiteAttendance(attendanceId, userId, {})).rejects.toThrow(BadRequestException);
    });

    it('rejects COMPANY_GEOFENCE record when reviewStatus is PENDING_REVIEW (mixed checkout exception)', async () => {
      const mixedRecord = {
        ...mockAttendanceFull,
        attendanceSource: 'COMPANY_GEOFENCE',
        reviewStatus: 'PENDING_REVIEW',
        checkIn: new Date(),
        checkOut: new Date(),
        checkOutLatitude: 13.9,
      };
      prisma.attendance.findUnique.mockResolvedValue(mixedRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'reviewer-emp-id' });
      prisma.attendance.update.mockResolvedValue({ ...mixedRecord, reviewStatus: 'REJECTED' } as any);

      const result = await service.rejectOffsiteAttendance(attendanceId, userId, { reviewNote: 'Unverified location' });

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewStatus: AttendanceReviewStatus.REJECTED }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('throws BadRequestException when record is AUTO_ACCEPTED', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...mockAttendanceFull,
        attendanceSource: 'OFFSITE_PLANNED',
        reviewStatus: 'AUTO_ACCEPTED',
      } as any);

      await expect(service.rejectOffsiteAttendance(attendanceId, userId, {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when record is already REJECTED', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...pendingRecord,
        reviewStatus: 'REJECTED',
      } as any);

      await expect(service.rejectOffsiteAttendance(attendanceId, userId, {})).rejects.toThrow(BadRequestException);
    });

    it('updates record to REJECTED status', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'reviewer-emp-id' });
      prisma.attendance.update.mockResolvedValue(rejectedRecord as any);

      const result = await service.rejectOffsiteAttendance(attendanceId, userId, { reviewNote: 'No documentation' }, ctx);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attendanceId },
          data: expect.objectContaining({
            reviewStatus: AttendanceReviewStatus.REJECTED,
            reviewNote: 'No documentation',
          }),
        }),
      );
      expect(result).toMatchObject({ id: attendanceId });
    });

    it('records ATTENDANCE_OFFSITE_REJECTED audit event', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendance.update.mockResolvedValue(rejectedRecord as any);

      await service.rejectOffsiteAttendance(attendanceId, userId, { reviewNote: 'Reason' }, ctx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_OFFSITE_REJECTED',
          targetType: 'ATTENDANCE',
          targetId: attendanceId,
          result: 'SUCCESS',
        }),
      );
    });

    it('audit metadata contains no raw GPS coordinates', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendance.update.mockResolvedValue(rejectedRecord as any);

      await service.rejectOffsiteAttendance(attendanceId, userId, {}, ctx);

      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata).not.toHaveProperty('latitude');
      expect(event.metadata).not.toHaveProperty('longitude');
      expect(event.metadata).not.toHaveProperty('checkInLatitude');
      expect(event.metadata).not.toHaveProperty('checkInLongitude');
      expect(event.metadata).toHaveProperty('hasCoordinates');
    });

    it('still rejects and returns result when audit write fails (best-effort)', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendance.update.mockResolvedValue(rejectedRecord as any);
      mockAuditLog.record.mockRejectedValueOnce(new Error('audit DB down'));

      const result = await service.rejectOffsiteAttendance(attendanceId, userId, {}, ctx);

      expect(result).toBeDefined();
    });
  });

  // ── findOffsiteReview (MANAGER scope) ──────────────────────────────────────

  describe('findOffsiteReview — MANAGER scope', () => {
    const managerId = 'manager-user-uuid';
    const managerEmpId = 'manager-emp-uuid';
    const deptId = 'dept-uuid-1';
    const otherEmpId = 'other-emp-uuid';

    const pendingRecord = {
      ...mockAttendanceFull,
      employee: {
        id: otherEmpId,
        employeeCode: 'EMP002',
        firstName: 'Jane',
        lastName: 'Smith',
        department: { id: deptId, name: 'Engineering' },
        position: null,
      },
      attendanceSource: 'OFFSITE_UNPLANNED',
      reviewStatus: 'PENDING_REVIEW',
    };

    it('returns empty list when manager has no employee record', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      const result = await service.findOffsiteReview({}, managerId, 'MANAGER');

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns empty list when manager has no managedDepartment', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: managerEmpId, managedDepartment: null });

      const result = await service.findOffsiteReview({}, managerId, 'MANAGER');

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns only records from the managed department', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });
      prisma.$transaction.mockResolvedValue([[pendingRecord], 1] as any);

      const result = await service.findOffsiteReview({}, managerId, 'MANAGER');

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
      const findManyArgs = (prisma.attendance.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyArgs.where).toMatchObject({
        employee: { departmentId: deptId },
        NOT: { employeeId: managerEmpId },
      });
    });

    it('HR/SUPER_ADMIN path returns org-wide results without department filter', async () => {
      prisma.$transaction.mockResolvedValue([[pendingRecord], 1] as any);

      await service.findOffsiteReview({});

      const findManyArgs = (prisma.attendance.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyArgs.where).not.toHaveProperty('employee');
      expect(findManyArgs.where).not.toHaveProperty('NOT');
    });
  });

  // ── approveOffsiteAttendance (MANAGER scope) ──────────────────────────────

  describe('approveOffsiteAttendance — MANAGER scope', () => {
    const managerUserId = 'manager-user-uuid';
    const managerEmpId = 'manager-emp-uuid';
    const deptId = 'dept-uuid-1';
    const otherDeptId = 'other-dept-uuid';
    const targetEmpId = 'target-emp-uuid';

    const pendingRecord = {
      ...mockAttendanceFull,
      employee: {
        id: targetEmpId,
        employeeCode: 'EMP002',
        firstName: 'Jane',
        lastName: 'Smith',
        department: { id: deptId, name: 'Engineering' },
        position: null,
      },
      attendanceSource: 'OFFSITE_UNPLANNED',
      reviewStatus: 'PENDING_REVIEW',
      checkInLatitude: 13.9,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    };

    const approvedRecord = { ...pendingRecord, reviewStatus: 'APPROVED', reviewedAt: new Date() };

    const managerCtx = { actorUserId: managerUserId, actorRole: 'MANAGER', ipAddress: null, userAgent: null };

    it('throws ForbiddenException when manager has no managed department', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: managerEmpId, managedDepartment: null });

      await expect(
        service.approveOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when attendance employee is in a different department', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...pendingRecord,
        employee: { ...pendingRecord.employee, department: { id: otherDeptId, name: 'HR' } },
      } as any);
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });

      await expect(
        service.approveOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when manager attempts to approve their own record', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...pendingRecord,
        employee: { ...pendingRecord.employee, id: managerEmpId },
      } as any);
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });

      await expect(
        service.approveOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('approves a record in the manager\'s department', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });
      prisma.attendance.update.mockResolvedValue(approvedRecord as any);

      const result = await service.approveOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewStatus: 'APPROVED' }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('records actorRole=MANAGER in audit event', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });
      prisma.attendance.update.mockResolvedValue(approvedRecord as any);

      await service.approveOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: 'MANAGER', action: 'ATTENDANCE_OFFSITE_APPROVED' }),
      );
    });
  });

  // ── rejectOffsiteAttendance (MANAGER scope) ───────────────────────────────

  describe('rejectOffsiteAttendance — MANAGER scope', () => {
    const managerUserId = 'manager-user-uuid';
    const managerEmpId = 'manager-emp-uuid';
    const deptId = 'dept-uuid-1';
    const otherDeptId = 'other-dept-uuid';
    const targetEmpId = 'target-emp-uuid';

    const pendingRecord = {
      ...mockAttendanceFull,
      employee: {
        id: targetEmpId,
        employeeCode: 'EMP002',
        firstName: 'Jane',
        lastName: 'Smith',
        department: { id: deptId, name: 'Engineering' },
        position: null,
      },
      attendanceSource: 'OFFSITE_UNPLANNED',
      reviewStatus: 'PENDING_REVIEW',
      checkInLatitude: 13.9,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    };

    const rejectedRecord = { ...pendingRecord, reviewStatus: 'REJECTED', reviewedAt: new Date(), reviewNote: 'ไม่มีเอกสาร' };

    const managerCtx = { actorUserId: managerUserId, actorRole: 'MANAGER', ipAddress: null, userAgent: null };

    it('throws ForbiddenException when manager has no managed department', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: managerEmpId, managedDepartment: null });

      await expect(
        service.rejectOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when attendance employee is in a different department', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...pendingRecord,
        employee: { ...pendingRecord.employee, department: { id: otherDeptId, name: 'HR' } },
      } as any);
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });

      await expect(
        service.rejectOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when manager attempts to reject their own record', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...pendingRecord,
        employee: { ...pendingRecord.employee, id: managerEmpId },
      } as any);
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });

      await expect(
        service.rejectOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a record in the manager\'s department', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });
      prisma.attendance.update.mockResolvedValue(rejectedRecord as any);

      const result = await service.rejectOffsiteAttendance(attendanceId, managerUserId, { reviewNote: 'ไม่มีเอกสาร' }, managerCtx);

      expect(prisma.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewStatus: 'REJECTED' }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('records actorRole=MANAGER in audit event', async () => {
      prisma.attendance.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({
        id: managerEmpId,
        managedDepartment: { id: deptId },
      });
      prisma.attendance.update.mockResolvedValue(rejectedRecord as any);

      await service.rejectOffsiteAttendance(attendanceId, managerUserId, {}, managerCtx);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorRole: 'MANAGER', action: 'ATTENDANCE_OFFSITE_REJECTED' }),
      );
    });
  });

  // ── SEC-ATT-002: mobile payload metadata ────────────────────────────────────

  describe('SEC-ATT-002: DTO validation for capturedAt/timezoneOffsetMinutes/platform/nonce', () => {
    it('ClockInDto accepts a fully-populated mobile payload including the new fields', async () => {
      const dto = plainToInstance(ClockInDto, {
        source: 'mobile',
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
        accuracy: 25,
        capturedAt: '2026-06-13T01:30:00.000Z',
        timezoneOffsetMinutes: 420,
        platform: 'android',
        nonce: 'reserved-not-yet-enforced',
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('ClockInDto still accepts an empty payload (backward compatibility with older mobile builds)', async () => {
      const dto = plainToInstance(ClockInDto, {});
      expect(await validate(dto)).toHaveLength(0);
    });

    it('ClockInDto rejects a malformed capturedAt', async () => {
      const dto = plainToInstance(ClockInDto, { capturedAt: 'not-a-date' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'capturedAt')).toBe(true);
    });

    it('ClockInDto rejects an unrecognized platform value', async () => {
      const dto = plainToInstance(ClockInDto, { platform: 'desktop' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'platform')).toBe(true);
    });

    it('ClockOutDto accepts the new fields and rejects malformed capturedAt the same way', async () => {
      const ok = plainToInstance(ClockOutDto, {
        capturedAt: '2026-06-13T01:30:00.000Z',
        timezoneOffsetMinutes: -300,
        platform: 'ios',
      });
      expect(await validate(ok)).toHaveLength(0);

      const bad = plainToInstance(ClockOutDto, { capturedAt: 'nope' });
      const errors = await validate(bad);
      expect(errors.some((e) => e.property === 'capturedAt')).toBe(true);
    });

    it('OffsiteClockInDto accepts the new optional fields', async () => {
      const dto = plainToInstance(OffsiteClockInDto, {
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
        accuracy: 25,
        workLocationName: 'Client site',
        reason: 'Client meeting',
        capturedAt: '2026-06-13T01:30:00.000Z',
        timezoneOffsetMinutes: 420,
        platform: 'ios',
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('OffsiteClockOutDto accepts the new optional fields', async () => {
      const dto = plainToInstance(OffsiteClockOutDto, {
        latitude: COMPANY_LAT,
        longitude: COMPANY_LON,
        accuracy: 25,
        capturedAt: '2026-06-13T01:30:00.000Z',
        timezoneOffsetMinutes: 420,
        platform: 'web',
      });
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('SEC-ATT-003: DTO validation for isMockLocation', () => {
    it('ClockInDto accepts isMockLocation as a boolean', async () => {
      const dto = plainToInstance(ClockInDto, { isMockLocation: true });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('ClockInDto still accepts an empty payload without isMockLocation (backward compatibility)', async () => {
      const dto = plainToInstance(ClockInDto, {});
      expect((await validate(dto)).some((e) => e.property === 'isMockLocation')).toBe(false);
    });

    it('ClockInDto rejects a non-boolean isMockLocation', async () => {
      const dto = plainToInstance(ClockInDto, { isMockLocation: 'yes' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'isMockLocation')).toBe(true);
    });

    it('ClockOutDto accepts isMockLocation as a boolean', async () => {
      const dto = plainToInstance(ClockOutDto, { isMockLocation: false });
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('SEC-ATT-002: gpsAgeBucket + client metadata (clockIn)', () => {
    const ctx = {
      actorUserId: userId,
      actorRole: 'EMPLOYEE',
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test',
    };

    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({ ...mockAttendanceFull, status: 'PRESENT' } as any);
    });

    it('buckets a capturedAt from a few seconds ago as FRESH', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:30:30.000Z'));
      await service.clockIn(userId, { capturedAt: '2026-06-13T01:30:10.000Z' }, ctx);
      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata.gpsAgeBucket).toBe('FRESH');
    });

    it('buckets a capturedAt about a minute old as ACCEPTABLE', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:31:00.000Z'));
      await service.clockIn(userId, { capturedAt: '2026-06-13T01:30:00.000Z' }, ctx);
      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata.gpsAgeBucket).toBe('ACCEPTABLE');
    });

    it('rejects a capturedAt several minutes old with STALE_LOCATION even without a source field (SEC-ATT-003 bypass fix: payload-integrity checks no longer gated on source)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:40:00.000Z'));
      await expect(
        service.clockIn(userId, { capturedAt: '2026-06-13T01:30:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'STALE_LOCATION', source: null }),
        }),
      );
    });

    it('rejects a capturedAt in the future beyond the clock-skew tolerance with FUTURE_LOCATION even without a source field', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:30:00.000Z'));
      await expect(
        service.clockIn(userId, { capturedAt: '2026-06-13T01:35:00.000Z' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_GEOFENCE_REJECTED',
          metadata: expect.objectContaining({ reason: 'FUTURE_LOCATION', source: null }),
        }),
      );
    });

    it('buckets a missing capturedAt as UNKNOWN and does not reject the request (backward compatibility)', async () => {
      const result = await service.clockIn(userId, {}, ctx);
      expect(result).toBeDefined();

      // SEC-ATT-003 (patched): a MISSING_SOURCE_CAPTURED_AT soft-signal audit call now
      // precedes ATTENDANCE_CLOCK_IN — find the success event by action.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_CLOCK_IN');
      expect(event.metadata.gpsAgeBucket).toBe('UNKNOWN');
    });

    it('includes platform and timezoneOffsetMinutes in audit metadata when provided', async () => {
      await service.clockIn(userId, { platform: 'android', timezoneOffsetMinutes: 420 }, ctx);

      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_CLOCK_IN');
      expect(event.metadata.platform).toBe('android');
      expect(event.metadata.timezoneOffsetMinutes).toBe(420);
    });

    it('records hasNonce as a boolean but never logs the raw nonce value', async () => {
      await service.clockIn(userId, { nonce: 'super-secret-future-nonce-value' }, ctx);

      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_CLOCK_IN');
      expect(event.metadata.hasNonce).toBe(true);
      expect(event.metadata).not.toHaveProperty('nonce');
      expect(JSON.stringify(event.metadata)).not.toContain('super-secret-future-nonce-value');
    });
  });

  describe('SEC-ATT-002: gpsAgeBucket + client metadata (clockOut)', () => {
    const ctx = {
      actorUserId: userId,
      actorRole: 'EMPLOYEE',
      ipAddress: '127.0.0.1',
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

    it('buckets clock-out capturedAt freshness the same way as clock-in', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-13T01:30:30.000Z'));
      await service.clockOut(userId, { capturedAt: '2026-06-13T01:30:10.000Z' }, ctx);
      const event = mockAuditLog.record.mock.calls[0][0];
      expect(event.metadata.gpsAgeBucket).toBe('FRESH');
    });

    it('still clocks out and buckets UNKNOWN when capturedAt is missing (backward compatibility)', async () => {
      const result = await service.clockOut(userId, {}, ctx);
      expect(result).toBeDefined();

      // SEC-ATT-003 (patched): a MISSING_SOURCE_CAPTURED_AT soft-signal audit call now
      // precedes ATTENDANCE_CLOCK_OUT — find the success event by action.
      const event = mockAuditLog.record.mock.calls
        .map((call) => call[0])
        .find((call) => call.action === 'ATTENDANCE_CLOCK_OUT');
      expect(event.metadata.gpsAgeBucket).toBe('UNKNOWN');
    });
  });
});
