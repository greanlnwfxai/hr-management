import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  LeaveStatus as PrismaLeaveStatus,
  LeaveType as PrismaLeaveType,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuditLogEvent } from '../audit-log/audit-log.types';
import { LeaveStatus, UserRole } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveLeaveRequestDto } from './dto/approve-leave-request.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { QueryLeaveRequestDto } from './dto/query-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';

export interface LeaveAuditContext {
  actorUserId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const LEAVE_SELECT = {
  id: true,
  leaveType: true,
  startDate: true,
  endDate: true,
  totalDays: true,
  reason: true,
  status: true,
  approvedAt: true,
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
  approvedBy: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeaveRequestSelect;

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async create(userId: string, dto: CreateLeaveRequestDto) {
    const employeeId = await this.requireEmployeeId(userId);

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (start > end) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    const totalDays = this.calcTotalDays(start, end);

    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] as unknown as PrismaLeaveStatus[] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap) {
      throw new ConflictException(
        'Leave request overlaps with an existing pending or approved leave',
      );
    }

    return this.prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveType: dto.leaveType as unknown as PrismaLeaveType,
        startDate: start,
        endDate: end,
        totalDays,
        reason: dto.reason,
        status: LeaveStatus.PENDING as unknown as PrismaLeaveStatus,
      },
      select: LEAVE_SELECT,
    });
  }

  async findMy(userId: string, query: QueryLeaveRequestDto) {
    const employeeId = await this.requireEmployeeId(userId);
    return this.findAll({ ...query, employeeId });
  }

  async findAll(query: QueryLeaveRequestDto) {
    const { page = 1, limit = 20, employeeId, status, leaveType, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LeaveRequestWhereInput = {
      ...(employeeId && { employeeId }),
      ...(status && { status: status as unknown as PrismaLeaveStatus }),
      ...(leaveType && { leaveType: leaveType as unknown as PrismaLeaveType }),
      ...this.buildDateFilter(startDate, endDate),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        select: LEAVE_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, userId: string, userRole: string) {
    const record = await this.prisma.leaveRequest.findUnique({
      where: { id },
      select: LEAVE_SELECT,
    });
    if (!record) throw new NotFoundException(`Leave request ${id} not found`);

    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.HR_ADMIN || userRole === UserRole.MANAGER) {
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

  async approve(id: string, userId: string, _dto: ApproveLeaveRequestDto, ctx?: LeaveAuditContext) {
    const record = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Leave request ${id} not found`);
    if ((record.status as string) !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be approved');
    }

    const approverEmp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });

    // Require a matching leave balance record and sufficient remaining days.
    // Decision: all leave types (SICK/VACATION/PERSONAL/OTHER) require a balance.
    // If no balance exists, HR must create one via POST /leave-balances first.
    const leaveYear = record.startDate.getFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          year: leaveYear,
        },
      },
    });

    if (!balance) {
      throw new BadRequestException(
        `No leave balance found for this employee and leave type in ${leaveYear}. ` +
          `Create one via POST /leave-balances before approving.`,
      );
    }

    const remaining = balance.totalDays - balance.usedDays;
    if (record.totalDays > remaining) {
      throw new BadRequestException(
        `Insufficient leave balance: ${remaining} day(s) remaining, ${record.totalDays} requested`,
      );
    }

    // Atomic: deduct balance and approve in a single transaction.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: { increment: record.totalDays } },
      });

      return tx.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveStatus.APPROVED as unknown as PrismaLeaveStatus,
          approvedAt: new Date(),
          ...(approverEmp && { approvedById: approverEmp.id }),
        },
        select: LEAVE_SELECT,
      });
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'LEAVE_APPROVED',
      targetType: 'LEAVE_REQUEST',
      targetId: record.id,
      targetLabel: record.id,
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        leaveRequestId: record.id,
        employeeId: record.employeeId,
        leaveType: record.leaveType,
        startDate: record.startDate,
        endDate: record.endDate,
        totalDays: record.totalDays,
        status: 'APPROVED',
      },
    });

    return result;
  }

  async reject(id: string, userId: string, dto: RejectLeaveRequestDto, ctx?: LeaveAuditContext) {
    const record = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Leave request ${id} not found`);
    if ((record.status as string) !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be rejected');
    }

    const approverEmp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });

    const result = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveStatus.REJECTED as unknown as PrismaLeaveStatus,
        ...(approverEmp && { approvedById: approverEmp.id }),
      },
      select: LEAVE_SELECT,
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'LEAVE_REJECTED',
      targetType: 'LEAVE_REQUEST',
      targetId: record.id,
      targetLabel: record.id,
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        leaveRequestId: record.id,
        employeeId: record.employeeId,
        leaveType: record.leaveType,
        startDate: record.startDate,
        endDate: record.endDate,
        totalDays: record.totalDays,
        status: 'REJECTED',
        hasRejectionReason: !!dto.rejectReason,
      },
    });

    return result;
  }

  private async recordBestEffort(event: AuditLogEvent): Promise<void> {
    try {
      await this.auditLog.record(event);
    } catch {
      // best-effort: leave workflow is never blocked by audit failure
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

  private calcTotalDays(start: Date, end: Date): number {
    const ms = end.getTime() - start.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
  }

  private buildDateFilter(
    startDate?: string,
    endDate?: string,
  ): Prisma.LeaveRequestWhereInput {
    if (!startDate && !endDate) return {};
    return {
      ...(startDate && { startDate: { gte: new Date(startDate) } }),
      ...(endDate && { endDate: { lte: new Date(endDate) } }),
    };
  }
}
