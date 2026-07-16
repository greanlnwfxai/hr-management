import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OffSiteStatus as PrismaOffSiteStatus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuditLogEvent } from '../audit-log/audit-log.types';
import { OffSiteStatus, UserRole } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveOffSiteRequestDto } from './dto/approve-off-site-request.dto';
import { CreateOffSiteRequestDto } from './dto/create-off-site-request.dto';
import { QueryOffSiteRequestDto } from './dto/query-off-site-request.dto';
import { RejectOffSiteRequestDto } from './dto/reject-off-site-request.dto';

export interface OffSiteAuditContext {
  actorUserId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const OFFSITE_SELECT = {
  id: true,
  date: true,
  reason: true,
  status: true,
  rejectReason: true,
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
} satisfies Prisma.OffSiteRequestSelect;

@Injectable()
export class OffSiteService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async create(userId: string, dto: CreateOffSiteRequestDto) {
    const employeeId = await this.requireEmployeeId(userId);

    const targetDate = new Date(dto.date);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    // App-level overlap guard: one PENDING/APPROVED per date (REJECTED can be resubmitted)
    const existing = await this.prisma.offSiteRequest.findFirst({
      where: {
        employeeId,
        date: targetDate,
        status: { in: [OffSiteStatus.PENDING, OffSiteStatus.APPROVED] as unknown as PrismaOffSiteStatus[] },
      },
    });
    if (existing) {
      throw new ConflictException('คุณมีคำขอทำงานนอกสถานที่สำหรับวันนี้อยู่แล้ว');
    }

    return this.prisma.offSiteRequest.create({
      data: {
        employeeId,
        date: targetDate,
        reason: dto.reason,
        status: OffSiteStatus.PENDING as unknown as PrismaOffSiteStatus,
      },
      select: OFFSITE_SELECT,
    });
  }

  async findMy(userId: string, query: QueryOffSiteRequestDto) {
    const employeeId = await this.requireEmployeeId(userId);
    return this.findAll({ ...query, employeeId });
  }

  async findAll(query: QueryOffSiteRequestDto, currentUser?: { id: string; role: string }) {
    const { page = 1, limit = 20, status, date, employeeId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OffSiteRequestWhereInput = {
      ...(employeeId && { employeeId }),
      ...(status && { status: status as unknown as PrismaOffSiteStatus }),
      ...(date && { date: new Date(date) }),
    };

    // MANAGER scope: intersect with the manager's managed department so no
    // query param (e.g. employeeId) can widen results beyond it. SUPER_ADMIN
    // and HR_ADMIN are unaffected; findMy() never passes currentUser so the
    // employee's own /off-site/me scope is untouched by this branch.
    if (currentUser?.role === UserRole.MANAGER) {
      const managerEmp = await this.prisma.employee.findFirst({
        where: { userId: currentUser.id },
        select: { managedDepartment: { select: { id: true } } },
      });
      if (!managerEmp?.managedDepartment) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
      where.employee = { departmentId: managerEmp.managedDepartment.id };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.offSiteRequest.findMany({
        where,
        skip,
        take: limit,
        select: OFFSITE_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.offSiteRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, userId: string, userRole: string) {
    const record = await this.prisma.offSiteRequest.findUnique({
      where: { id },
      select: OFFSITE_SELECT,
    });
    if (!record) throw new NotFoundException(`Off-site request ${id} not found`);

    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.HR_ADMIN) {
      return record;
    }

    // MANAGER detail read follows the same department scope as findAll/approve/reject:
    // only same-department subordinate off-site requests are readable here, never the
    // manager's own request (that goes through /off-site/me) and never another department's.
    if (userRole === UserRole.MANAGER) {
      const managerEmp = await this.prisma.employee.findFirst({
        where: { userId },
        select: { id: true, managedDepartment: { select: { id: true } } },
      });
      if (
        !managerEmp?.managedDepartment ||
        managerEmp.managedDepartment.id !== record.employee.department?.id ||
        managerEmp.id === record.employee.id
      ) {
        throw new ForbiddenException('Access denied');
      }
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

  async approve(id: string, userId: string, userRole: string, _dto: ApproveOffSiteRequestDto, ctx?: OffSiteAuditContext) {
    const record = await this.prisma.offSiteRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Off-site request ${id} not found`);
    if ((record.status as string) !== OffSiteStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be approved');
    }

    const approverEmp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true, managedDepartment: { select: { id: true } } },
    });

    if (userRole === UserRole.MANAGER) {
      const requestEmployee = await this.prisma.employee.findUnique({
        where: { id: record.employeeId },
        select: { departmentId: true },
      });
      if (!approverEmp?.managedDepartment || approverEmp.managedDepartment.id !== requestEmployee?.departmentId) {
        throw new ForbiddenException('คุณสามารถอนุมัติได้เฉพาะพนักงานในแผนกของคุณเท่านั้น');
      }
      if (approverEmp.id === record.employeeId) {
        throw new ForbiddenException('ไม่สามารถอนุมัติคำขอทำงานนอกสถานที่ของตัวเองได้');
      }
    }

    const result = await this.prisma.offSiteRequest.update({
      where: { id },
      data: {
        status: OffSiteStatus.APPROVED as unknown as PrismaOffSiteStatus,
        approvedAt: new Date(),
        ...(approverEmp && { approvedById: approverEmp.id }),
      },
      select: OFFSITE_SELECT,
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'OFFSITE_APPROVED',
      targetType: 'OFF_SITE_REQUEST',
      targetId: record.id,
      targetLabel: record.id,
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        offSiteRequestId: record.id,
        employeeId: record.employeeId,
        date: record.date,
        status: 'APPROVED',
      },
    });

    return result;
  }

  async reject(id: string, userId: string, userRole: string, dto: RejectOffSiteRequestDto, ctx?: OffSiteAuditContext) {
    const record = await this.prisma.offSiteRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Off-site request ${id} not found`);
    if ((record.status as string) !== OffSiteStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be rejected');
    }

    const approverEmp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true, managedDepartment: { select: { id: true } } },
    });

    if (userRole === UserRole.MANAGER) {
      const requestEmployee = await this.prisma.employee.findUnique({
        where: { id: record.employeeId },
        select: { departmentId: true },
      });
      if (!approverEmp?.managedDepartment || approverEmp.managedDepartment.id !== requestEmployee?.departmentId) {
        throw new ForbiddenException('คุณสามารถปฏิเสธได้เฉพาะพนักงานในแผนกของคุณเท่านั้น');
      }
      if (approverEmp.id === record.employeeId) {
        throw new ForbiddenException('ไม่สามารถปฏิเสธคำขอทำงานนอกสถานที่ของตัวเองได้');
      }
    }

    const result = await this.prisma.offSiteRequest.update({
      where: { id },
      data: {
        status: OffSiteStatus.REJECTED as unknown as PrismaOffSiteStatus,
        rejectReason: dto.rejectReason,
        ...(approverEmp && { approvedById: approverEmp.id }),
      },
      select: OFFSITE_SELECT,
    });

    await this.recordBestEffort({
      actorUserId: ctx?.actorUserId ?? null,
      actorRole: ctx?.actorRole ?? null,
      action: 'OFFSITE_REJECTED',
      targetType: 'OFF_SITE_REQUEST',
      targetId: record.id,
      targetLabel: record.id,
      result: 'SUCCESS',
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: {
        offSiteRequestId: record.id,
        employeeId: record.employeeId,
        date: record.date,
        status: 'REJECTED',
        hasRejectReason: !!dto.rejectReason,
      },
    });

    return result;
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

  private async recordBestEffort(event: AuditLogEvent): Promise<void> {
    try { await this.auditLog.record(event); } catch { /* best-effort */ }
  }
}
