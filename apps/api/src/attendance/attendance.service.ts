import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AttendanceReviewStatus as PrismaAttendanceReviewStatus,
  AttendanceSource as PrismaAttendanceSource,
  AttendanceStatus as PrismaAttendanceStatus,
  OffSiteStatus as PrismaOffSiteStatus,
  WorkMode as PrismaWorkMode,
} from '@prisma/client';
import {
  AttendanceNonceAction,
  AttendanceReviewStatus,
  AttendanceSource,
  AttendanceStatus,
  OffSiteStatus,
  UserRole,
  WorkMode,
} from '../common/enums';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuditLogEvent } from '../audit-log/audit-log.types';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceNonceService, type NonceConsumeResult } from './attendance-nonce.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { MixedCheckoutExceptionDto } from './dto/mixed-checkout-exception.dto';
import { OffsiteClockInDto } from './dto/offsite-clock-in.dto';
import { OffsiteClockOutDto } from './dto/offsite-clock-out.dto';
import { PatchGeofenceConfigDto } from './dto/patch-geofence-config.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { ApproveOffsiteDto } from './dto/approve-offsite.dto';
import { RejectOffsiteDto } from './dto/reject-offsite.dto';
import { QueryOffsiteReviewDto } from './dto/query-offsite-review.dto';
import { GeofenceConfigService } from './geofence-config.service';
import { GeofenceService } from './geofence.service';

export interface AttendanceAuditContext {
  actorUserId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// SEC-ATT-002 introduced informational GPS-freshness bucketing (no rejection).
// SEC-ATT-003 promotes the same thresholds to hard rejection: STALE and FUTURE now 422,
// via enforcePayloadIntegrity(). A missing `capturedAt` remains accepted (soft-enforced
// only — see MISSING_CAPTURED_AT/MISSING_SOURCE_CAPTURED_AT below) because there is no
// confirmed data that every mobile client in the fleet has picked up the SEC-ATT-002
// build yet; hard-rejecting it is a follow-up once that rollout is confirmed complete.
//
// SEC-ATT-003 patch (source-omission bypass fix): payload-integrity checks
// (INVALID/FUTURE/STALE `capturedAt`, `isMockLocation: true`) run for every
// clock-in/out and off-site clock-in/out request whenever the relevant field is
// present, regardless of `source` — a self-reported `source` field is exactly as
// forgeable as any other client-supplied field, so gating anti-spoofing checks on it
// was itself a bypass (a caller could omit/forge `source` to skip every check). Only
// the company-radius checks (MISSING_LOCATION/POOR_ACCURACY/GEOFENCE_NOT_CONFIGURED/
// OUTSIDE_RADIUS, in validateGeofence()) remain gated behind `source === 'mobile'` +
// `config.enabled` — whether to require radius enforcement for non-mobile-sourced
// calls is a separate, still-open question (SEC-ATT-001 §15 Open Question #1), not
// resolved by this patch. `source` values are restricted to `'web' | 'mobile'` by the
// DTO's `@IsIn()` validator, so any other value already 400s before reaching the
// service — there is no "unsupported source" case to handle here.
type GpsAgeBucket = 'FRESH' | 'ACCEPTABLE' | 'STALE' | 'FUTURE' | 'UNKNOWN';
type CapturedAtStatus = 'MISSING' | 'INVALID' | 'FRESH' | 'ACCEPTABLE' | 'STALE' | 'FUTURE';
const GPS_AGE_FRESH_SECONDS = 30;
const GPS_AGE_ACCEPTABLE_SECONDS = 120;
const GPS_FUTURE_SKEW_TOLERANCE_SECONDS = 30;

const ATTENDANCE_SELECT = {
  id: true,
  date: true,
  checkIn: true,
  checkOut: true,
  status: true,
  workMode: true,
  note: true,
  attendanceSource: true,
  reviewStatus: true,
  workLocationName: true,
  offsiteReason: true,
  offSiteRequestId: true,
  checkInLatitude: true,
  checkInLongitude: true,
  checkInAccuracyMeters: true,
  checkInDistanceFromCompanyMeters: true,
  checkOutLatitude: true,
  checkOutLongitude: true,
  checkOutAccuracyMeters: true,
  checkOutDistanceFromCompanyMeters: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNote: true,
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

// Review API response select — identical to ATTENDANCE_SELECT but without raw GPS coordinates.
// MANAGER and HR review responses must not expose lat/lon (privacy requirement REQ-002G §8.5).
const REVIEW_SELECT = {
  id: true,
  date: true,
  checkIn: true,
  checkOut: true,
  status: true,
  workMode: true,
  note: true,
  attendanceSource: true,
  reviewStatus: true,
  workLocationName: true,
  offsiteReason: true,
  offSiteRequestId: true,
  checkInAccuracyMeters: true,
  checkInDistanceFromCompanyMeters: true,
  checkOutAccuracyMeters: true,
  checkOutDistanceFromCompanyMeters: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNote: true,
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
    private attendanceNonce: AttendanceNonceService,
  ) {}

  // SEC-ATT-004: issue a short-lived, single-use replay-protection nonce for
  // the given clock action. Any authenticated user may request one (mirrors
  // the clock-in/out endpoints themselves — no @Roles restriction).
  async issueNonce(userId: string, action: AttendanceNonceAction) {
    return this.attendanceNonce.issueNonce(userId, action);
  }

  async clockIn(userId: string, dto: ClockInDto, ctx?: AttendanceAuditContext) {
    const employeeId = await this.requireEmployeeId(userId);
    // Runs before the workMode branch so OFFSITE payloads can't dodge it either —
    // workMode is as self-reported/forgeable as source.
    await this.enforcePayloadIntegrity(dto, 'CLOCK_IN', ctx);
    const date = this.todayUtc();
    const now = new Date();

    let offSiteRequestId: string | undefined;

    if (dto.workMode === WorkMode.OFFSITE) {
      // Off-site mode: GPS required but radius check skipped.
      // Verify there is an APPROVED off-site request for today.
      if (dto.latitude === undefined || dto.longitude === undefined || dto.accuracy === undefined) {
        throw new UnprocessableEntityException('Location is required for off-site attendance.');
      }
      const approved = await this.prisma.offSiteRequest.findFirst({
        where: {
          employeeId,
          date,
          status: OffSiteStatus.APPROVED as unknown as PrismaOffSiteStatus,
        },
        select: { id: true },
      });
      if (!approved) {
        throw new ForbiddenException('ไม่พบคำขอทำงานนอกสถานที่ที่อนุมัติแล้วสำหรับวันนี้');
      }
      offSiteRequestId = approved.id;
    } else {
      await this.validateGeofence(dto, 'CLOCK_IN', ctx);
    }

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (existing) throw new ConflictException('Already clocked in for today');

    // SEC-ATT-004: consumed last, right before the write, so a nonce is only
    // burned once every other validation (payload integrity, geofence, dup-day)
    // has already passed.
    await this.enforceNonce(dto, AttendanceNonceAction.CLOCK_IN, 'CLOCK_IN', userId, ctx);

    const status = this.isLateInBangkok(now) ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
    const workMode = dto.workMode ?? WorkMode.ONSITE;

    const result = await this.prisma.attendance.create({
      data: {
        employeeId,
        date,
        checkIn: now,
        status: status as unknown as PrismaAttendanceStatus,
        workMode: workMode as unknown as PrismaWorkMode,
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
        workMode,
        clockInAt: result.checkIn,
        hasCheckIn: true,
        hasCheckOut: result.checkOut !== null,
        hasNote: result.note !== null && result.note !== undefined,
        hasCoordinates: !!(dto.latitude),
        ...this.clientMetadata(dto),
        ...(offSiteRequestId && { offSiteRequestId }),
      },
    });

    return result;
  }

  async clockOut(userId: string, dto: ClockOutDto, ctx?: AttendanceAuditContext) {
    // Bug fix: fetch record first so we can skip geofence for off-site check-outs.
    // Previously, validateGeofence() was called before fetching the record, making
    // it impossible to check attendanceSource. Off-site records must not fail company
    // geofence validation on clock-out.
    const employeeId = await this.requireEmployeeId(userId);
    await this.enforcePayloadIntegrity(dto, 'CLOCK_OUT', ctx);
    const date = this.todayUtc();

    const record = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (!record) throw new NotFoundException('No clock-in found for today');
    if (record.checkOut) throw new ConflictException('Already clocked out for today');

    // Only validate company geofence for COMPANY_GEOFENCE records.
    // Off-site records bypass company radius — their location was captured at clock-in.
    const src = (record as any).attendanceSource ?? AttendanceSource.COMPANY_GEOFENCE;
    if (src === AttendanceSource.COMPANY_GEOFENCE) {
      await this.validateGeofence(dto, 'CLOCK_OUT', ctx);
    }

    // SEC-ATT-004: consumed last, right before the write.
    await this.enforceNonce(dto, AttendanceNonceAction.CLOCK_OUT, 'CLOCK_OUT', userId, ctx);

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
        ...this.clientMetadata(dto),
      },
    });

    return result;
  }

  async clockInOffsite(userId: string, dto: OffsiteClockInDto, ctx?: AttendanceAuditContext) {
    const employeeId = await this.requireEmployeeId(userId);
    await this.enforcePayloadIntegrity(dto, 'CLOCK_IN', ctx);
    const date = this.todayBangkok();
    const now = new Date();

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (existing) throw new ConflictException('Already clocked in for today');

    // Planned path: look up an APPROVED off-site request for today (Bangkok calendar date).
    const approvedRequest = await this.prisma.offSiteRequest.findFirst({
      where: {
        employeeId,
        date,
        status: OffSiteStatus.APPROVED as unknown as PrismaOffSiteStatus,
      },
      select: { id: true },
    });

    const attendanceSource = approvedRequest
      ? AttendanceSource.OFFSITE_PLANNED
      : AttendanceSource.OFFSITE_UNPLANNED;

    const reviewStatus = approvedRequest
      ? AttendanceReviewStatus.AUTO_ACCEPTED
      : AttendanceReviewStatus.PENDING_REVIEW;

    // Compute distance from company HQ (best-effort; null when geofence not configured).
    const config = await this.geofenceConfig.getEffectiveConfig();
    let checkInDistanceFromCompanyMeters: number | null = null;
    if (config.latitude !== null && config.longitude !== null) {
      checkInDistanceFromCompanyMeters = this.geofenceService.calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        config.latitude,
        config.longitude,
      );
    }

    // SEC-ATT-004: consumed last, right before the write.
    await this.enforceNonce(dto, AttendanceNonceAction.OFFSITE_CLOCK_IN, 'CLOCK_IN', userId, ctx);

    const status = this.isLateInBangkok(now) ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;

    const result = await this.prisma.attendance.create({
      data: {
        employeeId,
        date,
        checkIn: now,
        status: status as unknown as PrismaAttendanceStatus,
        workMode: WorkMode.OFFSITE as unknown as PrismaWorkMode,
        note: dto.note,
        attendanceSource: attendanceSource as unknown as PrismaAttendanceSource,
        reviewStatus: reviewStatus as unknown as PrismaAttendanceReviewStatus,
        workLocationName: dto.workLocationName,
        offsiteReason: dto.reason,
        checkInLatitude: dto.latitude,
        checkInLongitude: dto.longitude,
        checkInAccuracyMeters: dto.accuracy,
        checkInDistanceFromCompanyMeters,
        ...(approvedRequest && { offSiteRequestId: approvedRequest.id }),
      },
      select: ATTENDANCE_SELECT,
    });

    const accuracyBucket = dto.accuracy <= 20 ? 'HIGH' : dto.accuracy <= 50 ? 'MEDIUM' : 'LOW';

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'ATTENDANCE_OFFSITE_CLOCK_IN',
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
        workMode: WorkMode.OFFSITE,
        attendanceSource,
        reviewStatus,
        clockInAt: result.checkIn,
        hasCoordinates: true,
        accuracyBucket,
        workLocationName: dto.workLocationName,
        hasReason: true,
        hasNote: dto.note !== undefined,
        isPlanned: !!approvedRequest,
        hasOffSiteRequestId: !!approvedRequest,
        hasDistanceData: checkInDistanceFromCompanyMeters !== null,
        ...this.clientMetadata(dto),
      },
    });

    return result;
  }

  async clockOutOffsite(userId: string, dto: OffsiteClockOutDto, ctx?: AttendanceAuditContext) {
    const employeeId = await this.requireEmployeeId(userId);
    await this.enforcePayloadIntegrity(dto, 'CLOCK_OUT', ctx);
    const date = this.todayBangkok();

    const record = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (!record) throw new NotFoundException('No clock-in found for today');
    if (record.checkOut) throw new ConflictException('Already clocked out for today');

    const src = (record as any).attendanceSource;
    if (!src || src === AttendanceSource.COMPANY_GEOFENCE) {
      throw new BadRequestException(
        'This endpoint is for off-site attendance only. Use POST /attendance/clock-out for office clock-out.',
      );
    }

    const config = await this.geofenceConfig.getEffectiveConfig();
    let checkOutDistanceFromCompanyMeters: number | null = null;
    if (config.latitude !== null && config.longitude !== null) {
      checkOutDistanceFromCompanyMeters = this.geofenceService.calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        config.latitude,
        config.longitude,
      );
    }

    // SEC-ATT-004: consumed last, right before the write.
    await this.enforceNonce(dto, AttendanceNonceAction.OFFSITE_CLOCK_OUT, 'CLOCK_OUT', userId, ctx);

    const result = await this.prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOut: new Date(),
        checkOutLatitude: dto.latitude,
        checkOutLongitude: dto.longitude,
        checkOutAccuracyMeters: dto.accuracy,
        checkOutDistanceFromCompanyMeters,
        ...(dto.note !== undefined && { note: dto.note }),
      },
      select: ATTENDANCE_SELECT,
    });

    const accuracyBucket = dto.accuracy <= 20 ? 'HIGH' : dto.accuracy <= 50 ? 'MEDIUM' : 'LOW';

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'ATTENDANCE_OFFSITE_CLOCK_OUT',
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
        workMode: WorkMode.OFFSITE,
        attendanceSource: src,
        clockInAt: result.checkIn,
        clockOutAt: result.checkOut,
        hasCoordinates: true,
        accuracyBucket,
        hasNote: dto.note !== undefined,
        hasDistanceData: checkOutDistanceFromCompanyMeters !== null,
        ...this.clientMetadata(dto),
      },
    });

    return result;
  }

  async mixedCheckoutException(
    userId: string,
    dto: MixedCheckoutExceptionDto,
    ctx?: AttendanceAuditContext,
  ) {
    const employeeId = await this.requireEmployeeId(userId);
    const date = this.todayUtc();

    const record = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });
    if (!record) throw new NotFoundException('No clock-in found for today');
    if (record.checkOut) throw new ConflictException('Already clocked out for today');

    const src = (record as any).attendanceSource ?? AttendanceSource.COMPANY_GEOFENCE;
    if (src !== AttendanceSource.COMPANY_GEOFENCE) {
      throw new UnprocessableEntityException(
        'This endpoint is for ONSITE attendance only. Off-site records should use POST /attendance/offsite/clock-out.',
      );
    }

    const revStatus = (record as any).reviewStatus as string | null;
    if (revStatus !== null) {
      throw new ConflictException(
        'A mixed checkout exception has already been submitted for this attendance record.',
      );
    }

    // Reject the exception when the employee is actually inside the company geofence —
    // they should use the normal clock-out instead.
    const config = await this.geofenceConfig.getEffectiveConfig();
    if (config.enabled && config.latitude !== null && config.longitude !== null) {
      const within = this.geofenceService.isWithinRadius(
        dto.latitude,
        dto.longitude,
        config.latitude,
        config.longitude,
        config.radiusMeters,
      );
      if (within) {
        throw new UnprocessableEntityException(
          'You are inside the company area. Please use the normal clock-out instead.',
        );
      }
    }

    let checkOutDistanceFromCompanyMeters: number | null = null;
    if (config.latitude !== null && config.longitude !== null) {
      checkOutDistanceFromCompanyMeters = this.geofenceService.calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        config.latitude,
        config.longitude,
      );
    }

    const result = await this.prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOut: new Date(),
        checkOutLatitude: dto.latitude,
        checkOutLongitude: dto.longitude,
        checkOutAccuracyMeters: dto.accuracy,
        checkOutDistanceFromCompanyMeters,
        workLocationName: dto.workLocationName,
        offsiteReason: dto.reason,
        ...(dto.note !== undefined && { note: dto.note }),
        reviewStatus: AttendanceReviewStatus.PENDING_REVIEW as unknown as PrismaAttendanceReviewStatus,
        // attendanceSource stays COMPANY_GEOFENCE — check-in truth preserved
        // workMode stays ONSITE — payroll unchanged
      },
      select: ATTENDANCE_SELECT,
    });

    const accuracyBucket = dto.accuracy <= 20 ? 'HIGH' : dto.accuracy <= 50 ? 'MEDIUM' : 'LOW';

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'ATTENDANCE_MIXED_CHECKOUT_SUBMITTED',
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
        attendanceSource: AttendanceSource.COMPANY_GEOFENCE,
        newReviewStatus: AttendanceReviewStatus.PENDING_REVIEW,
        workLocationName: dto.workLocationName,
        hasCoordinates: true,
        accuracyBucket,
        hasDistanceData: checkOutDistanceFromCompanyMeters !== null,
        hasNote: dto.note !== undefined,
        checkoutAt: result.checkOut,
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

  async findOffsiteReview(query: QueryOffsiteReviewDto, userId?: string, userRole?: string) {
    const { page = 1, limit = 20, startDate, endDate, employeeId, reviewStatus } = query;
    const skip = (page - 1) * limit;

    // MANAGER scope: return only records from their managed department.
    if (userRole === UserRole.MANAGER) {
      if (!userId) return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };

      const managerEmp = await this.prisma.employee.findFirst({
        where: { userId },
        select: { id: true, managedDepartment: { select: { id: true } } },
      });

      // No employee record or no managed department → empty list (fallback to HR queue).
      if (!managerEmp?.managedDepartment) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }

      const deptId = managerEmp.managedDepartment.id;

      const where: Prisma.AttendanceWhereInput = {
        OR: [
          {
            attendanceSource: {
              in: [
                AttendanceSource.OFFSITE_UNPLANNED,
                AttendanceSource.OFFSITE_PLANNED,
              ] as unknown as PrismaAttendanceSource[],
            },
          },
          {
            attendanceSource: AttendanceSource.COMPANY_GEOFENCE as unknown as PrismaAttendanceSource,
            reviewStatus: { not: null } as any,
          },
        ],
        employee: { departmentId: deptId },
        NOT: { employeeId: managerEmp.id },
        ...(reviewStatus && { reviewStatus: reviewStatus as unknown as PrismaAttendanceReviewStatus }),
        ...(employeeId && { employeeId }),
        ...this.buildDateFilter(startDate, endDate),
      };

      const [data, total] = await this.prisma.$transaction([
        this.prisma.attendance.findMany({ where, skip, take: limit, select: REVIEW_SELECT, orderBy: { date: 'desc' } }),
        this.prisma.attendance.count({ where }),
      ]);

      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    const where: Prisma.AttendanceWhereInput = {
      OR: [
        {
          attendanceSource: {
            in: [
              AttendanceSource.OFFSITE_UNPLANNED,
              AttendanceSource.OFFSITE_PLANNED,
            ] as unknown as PrismaAttendanceSource[],
          },
        },
        // Mixed checkout exceptions: ONSITE check-in → off-site check-out pending HR review.
        // Identified by COMPANY_GEOFENCE source + non-null reviewStatus.
        {
          attendanceSource: AttendanceSource.COMPANY_GEOFENCE as unknown as PrismaAttendanceSource,
          reviewStatus: { not: null } as any,
        },
      ],
      ...(reviewStatus && { reviewStatus: reviewStatus as unknown as PrismaAttendanceReviewStatus }),
      ...(employeeId && { employeeId }),
      ...this.buildDateFilter(startDate, endDate),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        select: REVIEW_SELECT,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async approveOffsiteAttendance(
    id: string,
    userId: string,
    dto: ApproveOffsiteDto,
    ctx?: AttendanceAuditContext,
  ) {
    // Load with ATTENDANCE_SELECT (includes raw GPS) for audit hasCoordinates check.
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      select: ATTENDANCE_SELECT,
    });
    if (!record) throw new NotFoundException(`Attendance ${id} not found`);

    const src = (record as any).attendanceSource as string | null;
    const revStatus = (record as any).reviewStatus as string | null;

    // Mixed checkout exceptions (COMPANY_GEOFENCE + PENDING_REVIEW) are reviewable.
    // Normal COMPANY_GEOFENCE records (no reviewStatus) and null-source records are not.
    const isMixedCheckout =
      src === AttendanceSource.COMPANY_GEOFENCE &&
      revStatus === AttendanceReviewStatus.PENDING_REVIEW;
    if (!src || (src === AttendanceSource.COMPANY_GEOFENCE && !isMixedCheckout)) {
      throw new BadRequestException(
        'This attendance record is not an off-site record and cannot be reviewed.',
      );
    }

    if (revStatus !== AttendanceReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Only PENDING_REVIEW records can be approved. Current status: ${revStatus ?? 'none'}.`,
      );
    }

    const reviewerEmp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true, managedDepartment: { select: { id: true } } },
    });

    // MANAGER scope check: must have a managed department, record must belong to that
    // department, and manager cannot self-review.
    if (ctx?.actorRole === UserRole.MANAGER) {
      if (!reviewerEmp?.managedDepartment) {
        throw new ForbiddenException('คุณไม่ได้รับมอบหมายให้ดูแลแผนกใด');
      }
      if (record.employee.department?.id !== reviewerEmp.managedDepartment.id) {
        throw new ForbiddenException('คุณไม่มีสิทธิ์ตรวจสอบบันทึกของพนักงานนอกแผนก');
      }
      if (record.employee.id === reviewerEmp.id) {
        throw new ForbiddenException('ไม่สามารถอนุมัติบันทึกการลงเวลาของตัวเองได้');
      }
    }

    const result = await this.prisma.attendance.update({
      where: { id },
      data: {
        reviewStatus: AttendanceReviewStatus.APPROVED as unknown as PrismaAttendanceReviewStatus,
        reviewedAt: new Date(),
        ...(reviewerEmp && { reviewedById: reviewerEmp.id }),
        ...(dto.reviewNote !== undefined && { reviewNote: dto.reviewNote }),
      },
      select: REVIEW_SELECT,
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'ATTENDANCE_OFFSITE_APPROVED',
      targetType: 'ATTENDANCE',
      targetId: result.id,
      targetLabel: result.id,
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        attendanceId: id,
        employeeId: record.employee.id,
        date: record.date,
        attendanceSource: src,
        previousReviewStatus: revStatus,
        newReviewStatus: AttendanceReviewStatus.APPROVED,
        hasReviewNote: !!dto.reviewNote,
        hasReviewedByEmployee: reviewerEmp !== null,
        hasCoordinates: !!(record as any).checkInLatitude,
      },
    });

    return result;
  }

  async rejectOffsiteAttendance(
    id: string,
    userId: string,
    dto: RejectOffsiteDto,
    ctx?: AttendanceAuditContext,
  ) {
    // Load with ATTENDANCE_SELECT (includes raw GPS) for audit hasCoordinates check.
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      select: ATTENDANCE_SELECT,
    });
    if (!record) throw new NotFoundException(`Attendance ${id} not found`);

    const src = (record as any).attendanceSource as string | null;
    const revStatus = (record as any).reviewStatus as string | null;

    // Mixed checkout exceptions (COMPANY_GEOFENCE + PENDING_REVIEW) are reviewable.
    // Normal COMPANY_GEOFENCE records (no reviewStatus) and null-source records are not.
    const isMixedCheckout =
      src === AttendanceSource.COMPANY_GEOFENCE &&
      revStatus === AttendanceReviewStatus.PENDING_REVIEW;
    if (!src || (src === AttendanceSource.COMPANY_GEOFENCE && !isMixedCheckout)) {
      throw new BadRequestException(
        'This attendance record is not an off-site record and cannot be reviewed.',
      );
    }

    if (revStatus !== AttendanceReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Only PENDING_REVIEW records can be rejected. Current status: ${revStatus ?? 'none'}.`,
      );
    }

    const reviewerEmp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true, managedDepartment: { select: { id: true } } },
    });

    // MANAGER scope check: must have a managed department, record must belong to that
    // department, and manager cannot self-review.
    if (ctx?.actorRole === UserRole.MANAGER) {
      if (!reviewerEmp?.managedDepartment) {
        throw new ForbiddenException('คุณไม่ได้รับมอบหมายให้ดูแลแผนกใด');
      }
      if (record.employee.department?.id !== reviewerEmp.managedDepartment.id) {
        throw new ForbiddenException('คุณไม่มีสิทธิ์ตรวจสอบบันทึกของพนักงานนอกแผนก');
      }
      if (record.employee.id === reviewerEmp.id) {
        throw new ForbiddenException('ไม่สามารถปฏิเสธบันทึกการลงเวลาของตัวเองได้');
      }
    }

    const result = await this.prisma.attendance.update({
      where: { id },
      data: {
        reviewStatus: AttendanceReviewStatus.REJECTED as unknown as PrismaAttendanceReviewStatus,
        reviewedAt: new Date(),
        ...(reviewerEmp && { reviewedById: reviewerEmp.id }),
        ...(dto.reviewNote !== undefined && { reviewNote: dto.reviewNote }),
      },
      select: REVIEW_SELECT,
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'ATTENDANCE_OFFSITE_REJECTED',
      targetType: 'ATTENDANCE',
      targetId: result.id,
      targetLabel: result.id,
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        attendanceId: id,
        employeeId: record.employee.id,
        date: record.date,
        attendanceSource: src,
        previousReviewStatus: revStatus,
        newReviewStatus: AttendanceReviewStatus.REJECTED,
        hasReviewNote: !!dto.reviewNote,
        hasReviewedByEmployee: reviewerEmp !== null,
        hasCoordinates: !!(record as any).checkInLatitude,
      },
    });

    return result;
  }

  // SEC-ATT-003 (patched): payload-integrity checks (capturedAt format/freshness,
  // isMockLocation) run for EVERY clock-in/out and off-site clock-in/out request
  // whenever the relevant field is present — independent of `source` and independent
  // of `config.enabled`. These are anti-spoofing controls, not radius/geofence
  // controls: an admin disabling company-radius enforcement, or a caller that
  // omits/never had a `source` field (web, offsite, legacy), is not also opting out
  // of "is this GPS fix plausible" validation. Only the company-radius checks in
  // validateGeofence() below remain gated behind `source === 'mobile'`.
  //
  // hasCoordinates/hasAccuracy/accuracyBucket for the audit trail are computed
  // defensively here (not assumed true) since this runs before any location-presence
  // check and for callers (offsite) that may not carry a `source` field at all.
  private async enforcePayloadIntegrity(
    dto: {
      source?: 'web' | 'mobile';
      capturedAt?: string;
      isMockLocation?: boolean;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
    },
    attemptType: 'CLOCK_IN' | 'CLOCK_OUT',
    ctx?: AttendanceAuditContext,
  ): Promise<void> {
    const config = await this.geofenceConfig.getEffectiveConfig();
    const requestSource = dto.source ?? null;

    const hasCoordinatesForAudit = dto.latitude !== undefined && dto.longitude !== undefined;
    const hasAccuracyForAudit = dto.accuracy !== undefined;
    const accuracyBucketForAudit: 'UNKNOWN' | 'ACCEPTABLE' | 'POOR' = !hasAccuracyForAudit
      ? 'UNKNOWN'
      : dto.accuracy! > config.maxAccuracyMeters
        ? 'POOR'
        : 'ACCEPTABLE';

    const capturedAtStatus = this.classifyCapturedAt(dto.capturedAt);

    if (capturedAtStatus === 'INVALID') {
      // Defense-in-depth: `@IsISO8601()` on the DTO already rejects malformed values
      // with a 400 before this code runs. This branch guards against a well-formed
      // ISO-8601 string that class-validator accepts but Date.parse cannot use.
      await this.recordGeofenceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        reason: 'INVALID_CAPTURED_AT',
        source: requestSource,
        hasCoordinates: hasCoordinatesForAudit,
        hasAccuracy: hasAccuracyForAudit,
        accuracyBucket: accuracyBucketForAudit,
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException('Location data is invalid. Please try again.');
    }

    if (capturedAtStatus === 'MISSING') {
      // Soft-enforced by explicit decision: log for visibility, do not block.
      // Promote to a hard rejection once mobile fleet rollout of the SEC-ATT-002
      // build is confirmed complete. Distinguishing MISSING_SOURCE_CAPTURED_AT (no
      // `source` at all — web, offsite, or a very old client) from MISSING_CAPTURED_AT
      // (a `source` was given but capturedAt wasn't) gives visibility into which
      // population still needs to update, without changing the soft-enforce decision.
      await this.recordCapturedAtMissingAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        source: requestSource,
        reason: requestSource ? 'MISSING_CAPTURED_AT' : 'MISSING_SOURCE_CAPTURED_AT',
        configSource: config.source,
      });
    }

    if (capturedAtStatus === 'FUTURE') {
      await this.recordGeofenceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        reason: 'FUTURE_LOCATION',
        source: requestSource,
        hasCoordinates: hasCoordinatesForAudit,
        hasAccuracy: hasAccuracyForAudit,
        accuracyBucket: accuracyBucketForAudit,
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException('Location data is invalid. Please try again.');
    }

    if (capturedAtStatus === 'STALE') {
      await this.recordGeofenceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        reason: 'STALE_LOCATION',
        source: requestSource,
        hasCoordinates: hasCoordinatesForAudit,
        hasAccuracy: hasAccuracyForAudit,
        accuracyBucket: accuracyBucketForAudit,
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException('Location data has expired. Please try again.');
    }

    // SEC-ATT-003: only fires when the client platform itself reports a mock/simulated
    // fix. No current production client (PWA) sends this — see clock-in/out DTOs and
    // the CTO Summary's PWA-limitation statement. Reserved for a future native build.
    if (dto.isMockLocation === true) {
      await this.recordGeofenceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        reason: 'MOCK_LOCATION_DETECTED',
        source: requestSource,
        hasCoordinates: hasCoordinatesForAudit,
        hasAccuracy: hasAccuracyForAudit,
        accuracyBucket: accuracyBucketForAudit,
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException('Location data is invalid. Please try again.');
    }
  }

  // SEC-ATT-004: server-issued, single-use replay-protection nonce, consumed
  // atomically last (right before the DB write) in every clock-in/out and
  // off-site clock-in/out path, so that only requests that already passed
  // every other check (payload integrity, geofence, dup-day) ever get a
  // chance to burn a nonce.
  //
  // Rollout decision (explicit user sign-off, mirrors the SEC-ATT-003
  // MISSING_CAPTURED_AT precedent): a MISSING nonce is soft-enforced — the
  // request still succeeds — because POST /attendance/nonce is new in this
  // task and no currently-shipping mobile/PWA build can fetch or send a real
  // nonce yet; hard-rejecting it immediately would make every clock-in/out
  // fail fleet-wide until every client updates. A PRESENT nonce, however, is
  // always strictly enforced regardless of this soft/hard toggle: invalid,
  // expired, reused, wrong-action, and wrong-user nonces all hard-reject.
  // Promote MISSING to a hard rejection in a follow-up once fleet rollout of
  // this task's mobile changes is confirmed complete.
  //
  // `mixedCheckoutException` is NOT covered by nonce enforcement — out of
  // scope for this task (see CTO Summary "Known Limitations"); it remains a
  // documented, currently-open replay gap on that one endpoint.
  private async enforceNonce(
    dto: { nonce?: string; source?: 'web' | 'mobile' },
    nonceAction: AttendanceNonceAction,
    attemptType: 'CLOCK_IN' | 'CLOCK_OUT',
    userId: string,
    ctx?: AttendanceAuditContext,
  ): Promise<void> {
    if (!dto.nonce) {
      await this.recordNonceMissingAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        nonceAction,
        source: dto.source ?? null,
      });
      return;
    }

    const result: NonceConsumeResult = await this.attendanceNonce.consumeNonce(
      userId,
      nonceAction,
      dto.nonce,
    );

    if (!result.ok) {
      await this.recordNonceRejectedAuditBestEffort({
        actorUserId: ctx?.actorUserId ?? null,
        actorRole: ctx?.actorRole ?? null,
        attemptType,
        nonceAction,
        source: dto.source ?? null,
        reason: result.reason,
      });
      // Deliberately generic — does not reveal which specific nonce check
      // failed (spec §8's "no detail that would help an attacker distinguish
      // reused from expired from never-issued").
      throw new UnprocessableEntityException(
        'Your attendance session has expired. Please try again.',
      );
    }
  }

  private async recordNonceMissingAuditBestEffort(args: {
    actorUserId: string | null;
    actorRole: string | null;
    attemptType: 'CLOCK_IN' | 'CLOCK_OUT';
    nonceAction: AttendanceNonceAction;
    source: string | null;
  }): Promise<void> {
    await this.recordBestEffort({
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      action: 'ATTENDANCE_NONCE_MISSING',
      targetType: 'ATTENDANCE',
      targetId: null,
      targetLabel: args.attemptType === 'CLOCK_IN' ? 'clock-in-nonce-missing' : 'clock-out-nonce-missing',
      result: 'ALLOWED',
      metadata: {
        attemptType: args.attemptType,
        nonceAction: args.nonceAction,
        source: args.source,
        reason: 'NONCE_MISSING',
        result: 'ALLOWED',
      },
    });
  }

  private async recordNonceRejectedAuditBestEffort(args: {
    actorUserId: string | null;
    actorRole: string | null;
    attemptType: 'CLOCK_IN' | 'CLOCK_OUT';
    nonceAction: AttendanceNonceAction;
    source: string | null;
    reason:
      | 'NONCE_INVALID'
      | 'NONCE_EXPIRED'
      | 'NONCE_REUSED'
      | 'NONCE_ACTION_MISMATCH'
      | 'NONCE_USER_MISMATCH';
  }): Promise<void> {
    await this.recordBestEffort({
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      action: 'ATTENDANCE_NONCE_REJECTED',
      targetType: 'ATTENDANCE',
      targetId: null,
      targetLabel: args.attemptType === 'CLOCK_IN' ? 'clock-in-nonce-rejected' : 'clock-out-nonce-rejected',
      result: 'REJECTED',
      metadata: {
        attemptType: args.attemptType,
        nonceAction: args.nonceAction,
        source: args.source,
        reason: args.reason,
        result: 'REJECTED',
      },
    });
  }

  // Company-radius geofence validation — only applied when source='mobile' and
  // config.enabled. Web/offsite/legacy (no source) requests skip radius enforcement,
  // preserving backwards compatibility with the existing web attendance flow. Whether
  // to require radius enforcement for non-mobile-sourced calls is a separate, still-open
  // question (SEC-ATT-001 §15 Open Question #1), not resolved here. Payload-integrity
  // checks (capturedAt/isMockLocation) are no longer gated on `source` — see
  // enforcePayloadIntegrity() above, called separately by every clock-in/out path
  // before this function runs.
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
        source: 'mobile',
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
        source: 'mobile',
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
        source: 'mobile',
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
        source: 'mobile',
        hasCoordinates: true,
        hasAccuracy: true,
        accuracyBucket: 'ACCEPTABLE',
        configSource: config.source,
        geofenceEnabled: config.enabled,
      });
      throw new UnprocessableEntityException({
        message: 'You are outside the allowed company area.',
        code: 'OUTSIDE_GEOFENCE',
      });
    }
  }

  private async recordGeofenceRejectedAuditBestEffort(args: {
    actorUserId: string | null;
    actorRole: string | null;
    attemptType: 'CLOCK_IN' | 'CLOCK_OUT';
    reason:
      | 'MISSING_LOCATION'
      | 'POOR_ACCURACY'
      | 'GEOFENCE_NOT_CONFIGURED'
      | 'OUTSIDE_RADIUS'
      | 'INVALID_CAPTURED_AT'
      | 'STALE_LOCATION'
      | 'FUTURE_LOCATION'
      | 'MOCK_LOCATION_DETECTED';
    source: string | null;
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
        source: args.source,
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

  // SEC-ATT-003 (patched): soft-enforcement signal for a missing `capturedAt`, on any
  // request regardless of `source`. Deliberately NOT `result: 'REJECTED'` — the request
  // still succeeds. This gives HR/security visibility into how much of the fleet still
  // omits `capturedAt` before a future task promotes this to a hard rejection.
  // `reason` distinguishes a `source`-bearing caller that dropped `capturedAt`
  // (MISSING_CAPTURED_AT) from a caller with no `source` concept at all — web, offsite,
  // or a pre-SEC-ATT-002 client (MISSING_SOURCE_CAPTURED_AT).
  private async recordCapturedAtMissingAuditBestEffort(args: {
    actorUserId: string | null;
    actorRole: string | null;
    attemptType: 'CLOCK_IN' | 'CLOCK_OUT';
    source: string | null;
    reason: 'MISSING_CAPTURED_AT' | 'MISSING_SOURCE_CAPTURED_AT';
    configSource: 'db' | 'env';
  }): Promise<void> {
    await this.recordBestEffort({
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      action: 'ATTENDANCE_CAPTURED_AT_MISSING',
      targetType: 'ATTENDANCE',
      targetId: null,
      targetLabel: args.attemptType === 'CLOCK_IN' ? 'clock-in-captured-at-missing' : 'clock-out-captured-at-missing',
      result: 'ALLOWED',
      metadata: {
        attemptType: args.attemptType,
        source: args.source,
        reason: args.reason,
        configSource: args.configSource,
        result: 'ALLOWED',
      },
    });
  }

  // SEC-ATT-002/003: classifies a client-supplied capturedAt against server receipt time.
  // MISSING and INVALID are distinguished so callers can soft-allow one (missing, pending
  // confirmed mobile rollout) while hard-rejecting the other (unparseable value).
  private classifyCapturedAt(capturedAt: string | undefined, now: Date = new Date()): CapturedAtStatus {
    if (!capturedAt) return 'MISSING';
    const capturedMs = Date.parse(capturedAt);
    if (Number.isNaN(capturedMs)) return 'INVALID';

    const ageSeconds = (now.getTime() - capturedMs) / 1000;
    if (ageSeconds < -GPS_FUTURE_SKEW_TOLERANCE_SECONDS) return 'FUTURE';
    if (ageSeconds <= GPS_AGE_FRESH_SECONDS) return 'FRESH';
    if (ageSeconds <= GPS_AGE_ACCEPTABLE_SECONDS) return 'ACCEPTABLE';
    return 'STALE';
  }

  // SEC-ATT-002: bucketed freshness signal for audit/risk-scoring (SEC-ATT-007). Missing
  // and invalid both collapse to 'UNKNOWN' here — this bucket is informational only, the
  // MISSING vs. INVALID distinction that matters for rejection lives in classifyCapturedAt().
  private computeGpsAgeBucket(capturedAt: string | undefined, now: Date = new Date()): GpsAgeBucket {
    const status = this.classifyCapturedAt(capturedAt, now);
    return status === 'MISSING' || status === 'INVALID' ? 'UNKNOWN' : status;
  }

  // SEC-ATT-002: client-supplied metadata that is safe to audit-log as-is — never raw
  // GPS (already covered by AUDIT_SENSITIVE_KEYS) and never the reserved nonce value
  // itself (presence only), since it is earmarked as a future replay-protection secret.
  private clientMetadata(dto: {
    source?: 'web' | 'mobile';
    platform?: 'ios' | 'android' | 'web';
    timezoneOffsetMinutes?: number;
    capturedAt?: string;
    nonce?: string;
  }) {
    return {
      source: dto.source ?? null,
      platform: dto.platform ?? null,
      timezoneOffsetMinutes: dto.timezoneOffsetMinutes ?? null,
      gpsAgeBucket: this.computeGpsAgeBucket(dto.capturedAt),
      hasNonce: !!dto.nonce,
    };
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

  // Returns today's calendar date in Asia/Bangkok (UTC+7, no DST).
  // Off-site clock-in uses this so that staff working after midnight UTC
  // (i.e., 07:00–00:00 BKK) are recorded on the correct Thai calendar date.
  private todayBangkok(): Date {
    const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowBkk = new Date(Date.now() + BANGKOK_OFFSET_MS);
    return new Date(Date.UTC(nowBkk.getUTCFullYear(), nowBkk.getUTCMonth(), nowBkk.getUTCDate()));
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
