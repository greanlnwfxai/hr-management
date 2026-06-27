import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuditLogEvent } from '../audit-log/audit-log.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveAdjustmentDto } from './dto/create-leave-adjustment.dto';
import { QueryLeaveAdjustmentDto } from './dto/query-leave-adjustment.dto';

export interface AdjustmentAuditContext {
  actorUserId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const ADJUSTMENT_SELECT = {
  id: true,
  leaveBalanceId: true,
  deltaDays: true,
  reason: true,
  actorUserId: true,
  adjustedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
    },
  },
  createdAt: true,
} satisfies Prisma.LeaveAdjustmentSelect;

@Injectable()
export class LeaveAdjustmentService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async create(
    leaveBalanceId: string,
    dto: CreateLeaveAdjustmentDto,
    ctx: AdjustmentAuditContext,
  ) {
    const balance = await this.prisma.leaveBalance.findUnique({
      where: { id: leaveBalanceId },
    });
    if (!balance) throw new NotFoundException(`Leave balance ${leaveBalanceId} not found`);

    if ((balance.leaveType as string) !== 'VACATION') {
      throw new BadRequestException(
        'Only VACATION leave balances can be adjusted using this endpoint. ' +
          'Other leave types are not supported in v1.',
      );
    }

    const reason = dto.reason.trim();

    const agg = await this.prisma.leaveAdjustment.aggregate({
      where: { leaveBalanceId },
      _sum: { deltaDays: true },
    });
    const currentAdjSum = agg._sum.deltaDays ?? 0;
    const previousEffectiveTotalDays = balance.totalDays + currentAdjSum;
    const previousRemainingDays = previousEffectiveTotalDays - balance.usedDays;

    const newEffectiveTotalDays = previousEffectiveTotalDays + dto.deltaDays;
    const newRemainingDays = newEffectiveTotalDays - balance.usedDays;

    if (newRemainingDays < 0) {
      throw new UnprocessableEntityException(
        `Adjustment would result in negative remaining balance (${newRemainingDays} day(s)). ` +
          `Current effective remaining: ${previousRemainingDays} day(s).`,
      );
    }

    const actorEmp = ctx.actorUserId
      ? await this.prisma.employee.findFirst({
          where: { userId: ctx.actorUserId },
          select: { id: true },
        })
      : null;

    const adjustment = await this.prisma.leaveAdjustment.create({
      data: {
        leaveBalanceId,
        deltaDays: dto.deltaDays,
        reason,
        actorUserId: ctx.actorUserId ?? '',
        adjustedById: actorEmp?.id ?? null,
      },
      select: ADJUSTMENT_SELECT,
    });

    await this.recordBestEffort({
      actorUserId: ctx.actorUserId ?? null,
      actorRole: ctx.actorRole ?? null,
      action: 'LEAVE_BALANCE_ADJUSTED',
      targetType: 'LEAVE_BALANCE',
      targetId: leaveBalanceId,
      targetLabel: leaveBalanceId,
      result: 'SUCCESS',
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: {
        leaveBalanceId,
        employeeId: balance.employeeId,
        leaveType: balance.leaveType,
        year: balance.year,
        deltaDays: dto.deltaDays,
        reason,
        previousEffectiveTotalDays,
        newEffectiveTotalDays,
        previousRemainingDays,
        newRemainingDays,
      },
    });

    return {
      ...adjustment,
      effectiveTotalDays: newEffectiveTotalDays,
      effectiveRemainingDays: newRemainingDays,
    };
  }

  async findAll(leaveBalanceId: string, query: QueryLeaveAdjustmentDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const balance = await this.prisma.leaveBalance.findUnique({
      where: { id: leaveBalanceId },
      select: { id: true },
    });
    if (!balance) throw new NotFoundException(`Leave balance ${leaveBalanceId} not found`);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveAdjustment.findMany({
        where: { leaveBalanceId },
        skip,
        take: limit,
        select: ADJUSTMENT_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.leaveAdjustment.count({ where: { leaveBalanceId } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async recordBestEffort(event: AuditLogEvent): Promise<void> {
    try {
      await this.auditLog.record(event);
    } catch {
      // best-effort: adjustment workflow is never blocked by audit failure
    }
  }
}
