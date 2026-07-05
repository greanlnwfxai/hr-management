import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AttendanceNonceAction as PrismaAttendanceNonceAction,
  AttendanceRiskLevel as PrismaAttendanceRiskLevel,
  AttendanceRiskResult as PrismaAttendanceRiskResult,
  AttendanceRiskReviewStatus as PrismaAttendanceRiskReviewStatus,
} from '@prisma/client';
import {
  AttendanceNonceAction,
  AttendanceRiskLevel,
  AttendanceRiskReasonCode,
  AttendanceRiskResult,
  AttendanceRiskReviewStatus,
} from '../common/enums';
import { sanitizeMetadata } from '../audit-log/audit-log.sanitizer';
import { PrismaService } from '../prisma/prisma.service';
import { QueryRiskReviewDto } from './dto/query-risk-review.dto';
import { ReviewRiskReviewDto } from './dto/review-risk-review.dto';

// SEC-ATT-007A: severity mapping from sanitized reason code -> risk level, per
// the task's suggested mapping. A single event can trip more than one reason
// code (e.g. a missing capturedAt soft-allow observed alongside a rejected
// mock-location signal); scoreRisk() takes the highest severity among them.
//
// Reason codes not explicitly categorized in the task brief
// (INVALID_CAPTURED_AT, NONCE_ACTION_MISMATCH, NONCE_USER_MISMATCH) are
// grouped with their nearest documented sibling: INVALID_CAPTURED_AT sits
// alongside STALE/FUTURE_LOCATION (same enforcePayloadIntegrity rejection
// path); NONCE_ACTION_MISMATCH/NONCE_USER_MISMATCH sit alongside
// NONCE_INVALID/NONCE_EXPIRED ("invalid/expired nonce" bucket).
//
// DEVICE_INTEGRITY_UNAVAILABLE / NATIVE_ATTESTATION_UNAVAILABLE are scored
// here for schema/future completeness but are not emitted by any current
// hook (see attendance.service.ts) — wiring them in would flag ~100% of
// today's PWA-only traffic, which is not an actionable review signal.
const REASON_CODE_RISK_LEVEL: Record<AttendanceRiskReasonCode, AttendanceRiskLevel> = {
  [AttendanceRiskReasonCode.DEVICE_INTEGRITY_UNAVAILABLE]: AttendanceRiskLevel.LOW,
  [AttendanceRiskReasonCode.NATIVE_ATTESTATION_UNAVAILABLE]: AttendanceRiskLevel.LOW,
  [AttendanceRiskReasonCode.NONCE_MISSING_ALLOWED]: AttendanceRiskLevel.LOW,

  [AttendanceRiskReasonCode.MISSING_CAPTURED_AT]: AttendanceRiskLevel.MEDIUM,
  [AttendanceRiskReasonCode.MISSING_SOURCE_CAPTURED_AT]: AttendanceRiskLevel.MEDIUM,
  [AttendanceRiskReasonCode.LOW_LOCATION_ACCURACY]: AttendanceRiskLevel.MEDIUM,
  [AttendanceRiskReasonCode.GEOFENCE_EDGE_CASE]: AttendanceRiskLevel.MEDIUM,

  [AttendanceRiskReasonCode.STALE_LOCATION]: AttendanceRiskLevel.HIGH,
  [AttendanceRiskReasonCode.FUTURE_LOCATION]: AttendanceRiskLevel.HIGH,
  [AttendanceRiskReasonCode.INVALID_CAPTURED_AT]: AttendanceRiskLevel.HIGH,
  [AttendanceRiskReasonCode.GEOFENCE_REJECTED]: AttendanceRiskLevel.HIGH,
  [AttendanceRiskReasonCode.NONCE_INVALID]: AttendanceRiskLevel.HIGH,
  [AttendanceRiskReasonCode.NONCE_EXPIRED]: AttendanceRiskLevel.HIGH,
  [AttendanceRiskReasonCode.NONCE_ACTION_MISMATCH]: AttendanceRiskLevel.HIGH,
  [AttendanceRiskReasonCode.NONCE_USER_MISMATCH]: AttendanceRiskLevel.HIGH,

  [AttendanceRiskReasonCode.NONCE_REUSED]: AttendanceRiskLevel.CRITICAL,
  [AttendanceRiskReasonCode.MOCK_LOCATION_DETECTED]: AttendanceRiskLevel.CRITICAL,
  [AttendanceRiskReasonCode.SIMULATED_LOCATION_DETECTED]: AttendanceRiskLevel.CRITICAL,
};

const RISK_LEVEL_ORDER: Record<AttendanceRiskLevel, number> = {
  [AttendanceRiskLevel.LOW]: 0,
  [AttendanceRiskLevel.MEDIUM]: 1,
  [AttendanceRiskLevel.HIGH]: 2,
  [AttendanceRiskLevel.CRITICAL]: 3,
};

export interface RecordRiskReviewArgs {
  employeeId?: string | null;
  attendanceId?: string | null;
  userId?: string | null;
  action: AttendanceNonceAction;
  result: AttendanceRiskResult;
  reasonCodes: AttendanceRiskReasonCode[];
  source?: string | null;
  platform?: string | null;
  metadata?: Record<string, unknown> | null;
}

const RISK_REVIEW_SELECT = {
  id: true,
  employeeId: true,
  attendanceId: true,
  userId: true,
  action: true,
  result: true,
  riskLevel: true,
  reasonCodes: true,
  status: true,
  source: true,
  platform: true,
  metadataJson: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, name: true } },
    },
  },
  reviewedBy: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  },
} satisfies Prisma.AttendanceRiskReviewSelect;

@Injectable()
export class AttendanceRiskReviewService {
  constructor(private readonly prisma: PrismaService) {}

  // Highest-severity reason code wins. Never throws on an unmapped/unknown
  // code — falls back to LOW so a scoring gap can't accidentally suppress a
  // review row (falling back to CRITICAL would be the wrong direction here:
  // it would make an unmapped code page like the worst case instead of just
  // ensuring a row is created for future reclassification).
  scoreRisk(reasonCodes: AttendanceRiskReasonCode[]): AttendanceRiskLevel {
    let highest: AttendanceRiskLevel = AttendanceRiskLevel.LOW;
    for (const code of reasonCodes) {
      const level = REASON_CODE_RISK_LEVEL[code] ?? AttendanceRiskLevel.LOW;
      if (RISK_LEVEL_ORDER[level] > RISK_LEVEL_ORDER[highest]) highest = level;
    }
    return highest;
  }

  // Best-effort by convention (mirrors AuditLogService.record()) — the caller
  // (attendance.service.ts) wraps this in a try/catch so a risk-review write
  // failure never blocks or fails a clock-in/out.
  async recordReview(args: RecordRiskReviewArgs): Promise<void> {
    const riskLevel = this.scoreRisk(args.reasonCodes);
    const sanitizedMetadata = sanitizeMetadata(args.metadata ?? null);

    await this.prisma.attendanceRiskReview.create({
      data: {
        employeeId: args.employeeId ?? null,
        attendanceId: args.attendanceId ?? null,
        userId: args.userId ?? null,
        action: args.action as unknown as PrismaAttendanceNonceAction,
        result: args.result as unknown as PrismaAttendanceRiskResult,
        riskLevel: riskLevel as unknown as PrismaAttendanceRiskLevel,
        reasonCodes: args.reasonCodes,
        source: args.source ?? null,
        platform: args.platform ?? null,
        ...(sanitizedMetadata !== null && { metadataJson: sanitizedMetadata as Prisma.InputJsonValue }),
      },
    });
  }

  async findAll(query: QueryRiskReviewDto) {
    const { page = 1, limit = 20, employeeId, riskLevel, status, action, result, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceRiskReviewWhereInput = {
      ...(employeeId && { employeeId }),
      ...(riskLevel && { riskLevel: riskLevel as unknown as PrismaAttendanceRiskLevel }),
      ...(status && { status: status as unknown as PrismaAttendanceRiskReviewStatus }),
      ...(action && { action: action as unknown as PrismaAttendanceNonceAction }),
      ...(result && { result: result as unknown as PrismaAttendanceRiskResult }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendanceRiskReview.findMany({
        where,
        skip,
        take: limit,
        select: RISK_REVIEW_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.attendanceRiskReview.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const record = await this.prisma.attendanceRiskReview.findUnique({
      where: { id },
      select: RISK_REVIEW_SELECT,
    });
    if (!record) throw new NotFoundException(`Attendance risk review ${id} not found`);
    return record;
  }

  // Administrative status tracking only — does not touch the underlying
  // Attendance record. Any correction to the attendance record itself
  // remains out of scope for this task (see CTO Summary). reviewerUserId is
  // resolved to an Employee record here (mirrors approveOffsiteAttendance /
  // rejectOffsiteAttendance in attendance.service.ts) — best-effort: a
  // reviewer with no linked Employee record still gets to update status, just
  // without a resolvable reviewedById.
  async review(id: string, dto: ReviewRiskReviewDto, reviewerUserId: string): Promise<unknown> {
    const existing = await this.prisma.attendanceRiskReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Attendance risk review ${id} not found`);

    const reviewerEmp = await this.prisma.employee.findFirst({
      where: { userId: reviewerUserId },
      select: { id: true },
    });

    return this.prisma.attendanceRiskReview.update({
      where: { id },
      data: {
        status: dto.status as unknown as PrismaAttendanceRiskReviewStatus,
        reviewedAt: new Date(),
        ...(reviewerEmp && { reviewedById: reviewerEmp.id }),
        ...(dto.reviewNote !== undefined && { reviewNote: dto.reviewNote }),
      },
      select: RISK_REVIEW_SELECT,
    });
  }

  async setStatus(
    id: string,
    status: AttendanceRiskReviewStatus,
    reviewNote: string | undefined,
    reviewerUserId: string,
  ): Promise<unknown> {
    return this.review(id, { status, reviewNote }, reviewerUserId);
  }
}
