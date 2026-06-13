import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findFirst: jest.Mock };
  attendance: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

// Bangkok UTC offset: UTC+7 = 25200000 ms
// Bangkok 09:00 = UTC 02:00 → PRESENT (not strictly after 09:00)
// Bangkok 09:01 = UTC 02:01 → LATE
// Bangkok 08:59 = UTC 01:59 → PRESENT
const BANGKOK_PRESENT_UTC = '2026-06-13T02:00:00.000Z'; // Bangkok 09:00 — boundary: PRESENT
const BANGKOK_LATE_UTC = '2026-06-13T02:01:00.000Z';    // Bangkok 09:01 — one minute past: LATE
const BANGKOK_EARLY_UTC = '2026-06-13T01:59:00.000Z';   // Bangkok 08:59 — PRESENT

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: PrismaMock;

  const userId = 'user-uuid-1';
  const employeeId = 'emp-uuid-1';
  const attendanceId = 'att-uuid-1';

  // Raw attendance record returned by findUnique (no ATTENDANCE_SELECT shape needed here)
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
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
    it('creates a PRESENT record when clocking in at exactly Bangkok 09:00', async () => {
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

    it('creates a LATE record when clocking in at Bangkok 09:01', async () => {
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

    it('creates a PRESENT record when clocking in at Bangkok 08:59', async () => {
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

    it('throws ForbiddenException when employee views another employee\'s record', async () => {
      prisma.attendance.findUnique.mockResolvedValue(mockAttendanceFull as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'other-emp-uuid' });

      await expect(service.findOne(attendanceId, userId, 'EMPLOYEE')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when attendance record does not exist', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', userId, 'SUPER_ADMIN')).rejects.toThrow(NotFoundException);
    });
  });
});
