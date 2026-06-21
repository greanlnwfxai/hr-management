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
import { PatchGeofenceConfigDto } from './dto/patch-geofence-config.dto';
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
    await this.validateGeofence(dto, 'CLOCK_IN', ctx);

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
    await this.validateGeofence(dto, 'CLOCK_OUT', ctx);

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

  async getGeofenceConfig() {
    return this.geofenceConfig.getEffectiveConfig();
  }

  async updateGeofenceConfig(
    dto: PatchGeofenceConfigDto,
    ctx?: AttendanceAuditContext,
  ) {
    const current = await this.geofenceConfig.getEffectiveConfig();

    const merged = {
      enabled: dto.enabled ?? current.enabled,
      latitude: dto.latitude !== undefined ? dto.latitude : current.latitude,
      longitude: dto.longitude !== undefined ? dto.longitude : current.longitude,
      radiusMeters: dto.radiusMeters ?? current.radiusMeters,
      maxAccuracyMeters: dto.maxAccuracyMeters ?? current.maxAccuracyMeters,
    };

    if (merged.enabled && (merged.latitude === null || merged.longitude === null)) {
      throw new UnprocessableEntityException(
        'Geofence cannot be enabled without latitude and longitude.',
      );
    }

    const updatedByUserId = ctx?.actorUserId ?? null;

    const row = await this.prisma.geofenceConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        enabled: merged.enabled,
        latitude: merged.latitude,
        longitude: merged.longitude,
        radiusMeters: merged.radiusMeters,
        maxAccuracyMeters: merged.maxAccuracyMeters,
        updatedByUserId,
      },
      update: {
        enabled: merged.enabled,
        latitude: merged.latitude,
        longitude: merged.longitude,
        radiusMeters: merged.radiusMeters,
        maxAccuracyMeters: merged.maxAccuracyMeters,
        updatedByUserId,
      },
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'ATTENDANCE_GEOFENCE_CONFIG_UPDATED',
      targetType: 'GEOFENCE_CONFIG',
      targetId: 'default',
      targetLabel: 'company-geofence',
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        previousEnabled: current.enabled,
        previousHasCoordinates: current.latitude !== null && current.longitude !== null,
        previousRadiusMeters: current.radiusMeters,
        previousMaxAccuracyMeters: current.maxAccuracyMeters,
        previousSource: current.source,
        newEnabled: row.enabled,
        newHasCoordinates: row.latitude !== null && row.longitude !== null,
        newRadiusMeters: row.radiusMeters,
        newMaxAccuracyMeters: row.maxAccuracyMeters,
      },
    });

    return {
      enabled: row.enabled,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusMeters: row.radiusMeters,
      maxAccuracyMeters: row.maxAccuracyMeters,
      updatedByUserId: row.updatedByUserId,
      updatedAt: row.updatedAt,
      source: 'db' as const,
    };
  }

  // Geofence validation — only applied when source='mobile'.
  // Web and legacy (no source) requests are passed through without checks,
  // preserving backwards compatibility with the existing web attendance flow.
  private async validateGeofence(
    dto: ClockInDto | ClockOutDto,
    attemptType: 'CLOCK_IN' | 'CLOCK_OUT',
    ctx?: AttendanceAuditContext,
  ): Promise<void> {
    if (dto.source !== 'mobile') return;

    const config = await this.geofenceConfig.getEffectiveConfig();
    if (!config.enabled) return;

    if (dto.latitude === undefined || dto.longitude === undefined || dto.accuracy === undefined) {
      await this.recordGeofenceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        reason: 'MISSING_LOCATION',
        hasCoordinates: false,
        hasAccuracy: false,
        accuracyBucket: 'UNKNOWN',
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException(
        'Location is required for mobile attendance.',
      );
    }

    if (dto.accuracy > config.maxAccuracyMeters) {
      await this.recordGeofenceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        reason: 'POOR_ACCURACY',
        hasCoordinates: true,
        hasAccuracy: true,
        accuracyBucket: 'POOR',
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException(
        'GPS accuracy is too low. Please try again near the office.',
      );
    }

    if (config.latitude === null || config.longitude === null) {
      await this.recordGeofenceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        reason: 'GEOFENCE_NOT_CONFIGURED',
        hasCoordinates: true,
        hasAccuracy: true,
        accuracyBucket: 'ACCEPTABLE',
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException(
        'Attendance geofence is not configured.',
      );
    }

    const within = this.geofenceService.isWithinRadius(
      dto.latitude,
      dto.longitude,
      config.latitude,
      config.longitude,
      config.radiusMeters,
    );

    if (!within) {
      await this.recordGeofenceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        reason: 'OUTSIDE_RADIUS',
        hasCoordinates: true,
        hasAccuracy: true,
        accuracyBucket: 'ACCEPTABLE',
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException(
        'You are outside the allowed company area.',
      );
    }
  }

  private async recordGeofenceRejectedAuditBestEffort(args: {
    actorUserId: string | null;
    actorRole: string | null;
    attemptType: 'CLOCK_IN' | 'CLOCK_OUT';
    reason: 'MISSING_LOCATION' | 'POOR_ACCURACY' | 'GEOFENCE_NOT_CONFIGURED' | 'OUTSIDE_RADIUS';
    hasCoordinates: boolean;
    hasAccuracy: boolean;
    accuracyBucket: 'UNKNOWN' | 'ACCEPTABLE' | 'POOR';
    configSource: 'db' | 'env';
    geofenceEnabled: boolean;
  }): Promise<void> {
    await this.recordBestEffort({
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      action: 'ATTENDANCE_GEOFENCE_REJECTED',
      targetType: 'ATTENDANCE',
      targetId: null,
      targetLabel: args.attemptType === 'CLOCK_IN' ? 'clock-in-geofence-rejected' : 'clock-out-geofence-rejected',
      result: 'REJECTED',
      metadata: {
        attemptType: args.attemptType,
        source: 'mobile',
        reason: args.reason,
        hasCoordinates: args.hasCoordinates,
        hasAccuracy: args.hasAccuracy,
        accuracyBucket: args.accuracyBucket,
        configSource: args.configSource,
        geofenceEnabled: args.geofenceEnabled,
        result: 'REJECTED',
      },
    });
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
