import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LeaveType as PrismaLeaveType } from '@prisma/client';
import { UserRole } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveBalanceDto } from './dto/create-leave-balance.dto';
import { QueryLeaveBalanceDto } from './dto/query-leave-balance.dto';
import { UpdateLeaveBalanceDto } from './dto/update-leave-balance.dto';

const BALANCE_SELECT = {
  id: true,
  leaveType: true,
  year: true,
  totalDays: true,
  usedDays: true,
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
} satisfies Prisma.LeaveBalanceSelect;

type BalanceRaw = Prisma.LeaveBalanceGetPayload<{ select: typeof BALANCE_SELECT }>;

// DB column `totalDays` represents the original entitled quota.
// `adjustmentDays` is the sum of all LeaveAdjustment.deltaDays for this balance.
// `effectiveTotalDays` = totalDays + adjustmentDays.
// `remainingDays` = effectiveTotalDays - usedDays.
function withRemaining(record: BalanceRaw, adjustmentDays: number = 0) {
  const effectiveTotalDays = record.totalDays + adjustmentDays;
  return {
    ...record,
    adjustmentDays,
    effectiveTotalDays,
    remainingDays: effectiveTotalDays - record.usedDays,
  };
}

@Injectable()
export class LeaveBalanceService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateLeaveBalanceDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new BadRequestException(`Employee ${dto.employeeId} not found`);
    }

    const existing = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId: dto.employeeId,
          leaveType: dto.leaveType as unknown as PrismaLeaveType,
          year: dto.year,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Leave balance already exists for this employee, leave type, and year',
      );
    }

    const record = await this.prisma.leaveBalance.create({
      data: {
        employeeId: dto.employeeId,
        leaveType: dto.leaveType as unknown as PrismaLeaveType,
        year: dto.year,
        totalDays: dto.entitledDays,
        usedDays: 0,
      },
      select: BALANCE_SELECT,
    });

    return withRemaining(record, 0);
  }

  async findAll(query: QueryLeaveBalanceDto) {
    const { page = 1, limit = 20, employeeId, leaveType, year } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LeaveBalanceWhereInput = {
      ...(employeeId && { employeeId }),
      ...(leaveType && { leaveType: leaveType as unknown as PrismaLeaveType }),
      ...(year && { year }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leaveBalance.findMany({
        where,
        skip,
        take: limit,
        select: BALANCE_SELECT,
        orderBy: [{ year: 'desc' }, { leaveType: 'asc' }],
      }),
      this.prisma.leaveBalance.count({ where }),
    ]);

    const ids = data.map((d) => d.id);
    const adjSums =
      ids.length > 0
        ? await this.prisma.leaveAdjustment.groupBy({
            by: ['leaveBalanceId'],
            where: { leaveBalanceId: { in: ids } },
            _sum: { deltaDays: true },
          })
        : [];
    const adjMap = new Map(adjSums.map((a) => [a.leaveBalanceId, a._sum.deltaDays ?? 0]));

    return {
      data: data.map((r) => withRemaining(r, adjMap.get(r.id) ?? 0)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findMy(userId: string, query: QueryLeaveBalanceDto) {
    const emp = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!emp) {
      throw new BadRequestException('No employee profile linked to this account');
    }
    return this.findAll({ ...query, employeeId: emp.id });
  }

  async findOne(id: string, userId: string, userRole: string) {
    const record = await this.prisma.leaveBalance.findUnique({
      where: { id },
      select: BALANCE_SELECT,
    });
    if (!record) throw new NotFoundException(`Leave balance ${id} not found`);

    const canViewAll =
      userRole === UserRole.SUPER_ADMIN ||
      userRole === UserRole.HR_ADMIN ||
      userRole === UserRole.MANAGER;

    if (!canViewAll) {
      const emp = await this.prisma.employee.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!emp || record.employee.id !== emp.id) {
        throw new ForbiddenException('Access denied');
      }
    }

    const agg = await this.prisma.leaveAdjustment.aggregate({
      where: { leaveBalanceId: id },
      _sum: { deltaDays: true },
    });
    const adjustmentDays = agg._sum.deltaDays ?? 0;

    return withRemaining(record, adjustmentDays);
  }

  async update(id: string, dto: UpdateLeaveBalanceDto) {
    const existing = await this.prisma.leaveBalance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Leave balance ${id} not found`);

    // Harden: VACATION balance cannot be directly overwritten. Use the adjustment ledger.
    if ((existing.leaveType as string) === 'VACATION') {
      if (dto.entitledDays !== undefined || dto.usedDays !== undefined) {
        throw new BadRequestException(
          'Vacation leave balance cannot be directly overwritten. ' +
            'Use POST /leave-balances/:id/adjustments to adjust the entitled quota.',
        );
      }
    }

    const newTotal = dto.entitledDays !== undefined ? dto.entitledDays : existing.totalDays;
    const newUsed = dto.usedDays !== undefined ? dto.usedDays : existing.usedDays;

    if (newTotal - newUsed < 0) {
      throw new UnprocessableEntityException(
        'Update would result in negative remaining days',
      );
    }

    const record = await this.prisma.leaveBalance.update({
      where: { id },
      data: {
        ...(dto.entitledDays !== undefined && { totalDays: dto.entitledDays }),
        ...(dto.usedDays !== undefined && { usedDays: dto.usedDays }),
      },
      select: BALANCE_SELECT,
    });

    return withRemaining(record, 0);
  }
}
