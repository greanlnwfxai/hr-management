import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AttendanceStatus as PrismaAttendanceStatus } from '@prisma/client';
import { AttendanceStatus, UserRole } from '../common/enums';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuditLogEvent } from '../audit-log/audit-log.types';
import { PrismaService } from '../prisma/prisma.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { GeofenceConfigService } from './geofence-config.service';
import { GeofenceService } from './geofence.service';

export interface AttendanceAuditContext {
  actorUserId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const ATTENDANCE_SELECT = {
  id: true,
  date: true,
  checkIn: true,
  checkOut: true,
  status: true,
  note: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, name: true } },
      position: { select: { id: true, title: true } },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttendanceSelect;

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private geofenceService: GeofenceService,
    private geofenceConfig: GeofenceConfigService,
  ) {}

  async clockIn(userId: string, dto: ClockInDto, ctx?: AttendanceAuditContext) {
    await this.validateGeofence(dto);

    const employeeId = await this.requireEmployeeId(userId);
    const date = this.todayUtc();
    const now = new Date();

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (existing) throw new ConflictException('Already clocked in for today');

    const status = this.isLateInBangkok(now) ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;

    const result = await this.prisma.attendance.create({
      data: {
        employeeId,
        date,
        checkIn: now,
        status: status as unknown as PrismaAttendanceStatus,
        note: dto.note,
      },
      select: ATTENDANCE_SELECT,
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'ATTENDANCE_CLOCK_IN',
      targetType: 'ATTENDANCE',
      targetId: result.id,
      targetLabel: result.id,
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        attendanceId: result.id,
        employeeId,
        date: result.date,
        status: result.status,
        clockInAt: result.checkIn,
        hasCheckIn: true,
        hasCheckOut: result.checkOut !== null,
        hasNote: result.note !== null && result.note !== undefined,
      },
    });

    return result;
  }

  async clockOut(userId: string, dto: ClockOutDto, ctx?: AttendanceAuditContext) {
    await this.validateGeofence(dto);

    const employeeId = await this.requireEmployeeId(userId);
    const date = this.todayUtc();

    const record = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (!record) throw new NotFoundException('No clock-in found for today');
    if (record.checkOut) throw new ConflictException('Already clocked out for today');

    const result = await this.prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOut: new Date(),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      select: ATTENDANCE_SELECT,
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'ATTENDANCE_CLOCK_OUT',
      targetType: 'ATTENDANCE',
      targetId: result.id,
      targetLabel: result.id,
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        attendanceId: result.id,
        employeeId,
        date: result.date,
        status: result.status,
        clockInAt: result.checkIn,
        clockOutAt: result.checkOut,
        hasCheckIn: result.checkIn !== null,
        hasCheckOut: true,
        hasNote: result.note !== null && result.note !== undefined,
      },
    });

    return result;
  }

  async findMyAttendance(userId: string, query: QueryAttendanceDto) {
    const employeeId = await this.requireEmployeeId(userId);
    const { page = 1, limit = 20, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = {
      employeeId,
      ...this.buildDateFilter(startDate, endDate),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        select: ATTENDANCE_SELECT,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findAll(query: QueryAttendanceDto) {
    const { page = 1, limit = 20, startDate, endDate, employeeId, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = {
      ...(employeeId && { employeeId }),
      ...(status && { status: status as unknown as PrismaAttendanceStatus }),
      ...this.buildDateFilter(startDate, endDate),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        select: ATTENDANCE_SELECT,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, userId: string, userRole: string) {
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      select: ATTENDANCE_SELECT,
    });
    if (!record) throw new NotFoundException(`Attendance ${id} not found`);

    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.HR_ADMIN) {
      return record;
    }

    const emp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!emp || record.employee.id !== emp.id) {
      throw new ForbiddenException('Access denied');
    }

    return record;
  }

  // Geofence validation — only applied when source='mobile'.
  // Web and legacy (no source) requests are passed through without checks,
  // preserving backwards compatibility with the existing web attendance flow.
  private async validateGeofence(dto: ClockInDto | ClockOutDto): Promise<void> {
    if (dto.source !== 'mobile') return;
    if (!this.geofenceConfig.isEnabled()) return;

    if (dto.latitude === undefined || dto.longitude === undefined || dto.accuracy === undefined) {
      throw new UnprocessableEntityException(
        'Location is required for mobile attendance.',
      );
    }

    if (dto.accuracy > this.geofenceConfig.getMaxAccuracyMeters()) {
      throw new UnprocessableEntityException(
        'GPS accuracy is too low. Please try again near the office.',
      );
    }

    const company = this.geofenceConfig.getCompanyLocation();
    if (!company) {
      throw new UnprocessableEntityException(
        'Attendance geofence is not configured.',
      );
    }

    const within = this.geofenceService.isWithinRadius(
      dto.latitude,
      dto.longitude,
      company.lat,
      company.lon,
      this.geofenceConfig.getRadiusMeters(),
    );

    if (!within) {
      throw new UnprocessableEntityException(
        'You are outside the allowed company area.',
      );
    }
  }

  private async requireEmployeeId(userId: string): Promise<string> {
    const emp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!emp) {
      throw new BadRequestException('No employee profile linked to this account');
    }
    return emp.id;
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  // Business rule: LATE if clock-in is strictly after 08:30 Asia/Bangkok.
  // Timestamps are stored in UTC; only this evaluation uses the Bangkok offset.
  // Thailand does not observe DST → offset is always UTC+7 (420 min), never changes.
  // We shift `now` forward by 7 h so that getUTCHours/Minutes yield Bangkok wall-clock time.
  private isLateInBangkok(now: Date): boolean {
    const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, fixed — no DST in Thailand
    const bangkokWallClock = new Date(now.getTime() + BANGKOK_OFFSET_MS);
    const hour = bangkokWallClock.getUTCHours();
    const minute = bangkokWallClock.getUTCMinutes();
    return hour > 8 || (hour === 8 && minute > 30);
  }

  private buildDateFilter(
    startDate?: string,
    endDate?: string,
  ): Prisma.AttendanceWhereInput {
    if (!startDate && !endDate) return {};
    return {
      date: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    };
  }

  private async recordBestEffort(event: AuditLogEvent): Promise<void> {
    try { await this.auditLog.record(event); } catch { /* best-effort */ }
  }
}
