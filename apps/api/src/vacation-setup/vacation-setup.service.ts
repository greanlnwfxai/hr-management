import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuditLogEvent } from '../audit-log/audit-log.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVacationSetupDto } from './dto/create-vacation-setup.dto';
import { QueryVacationSetupDto } from './dto/query-vacation-setup.dto';

export interface VacationSetupAuditContext {
  actorUserId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Calendar-based completed years between two dates (using UTC to avoid DST drift). */
export function completedYears(hireDate: Date, asOf: Date = new Date()): number {
  const hy = hireDate.getUTCFullYear();
  const hm = hireDate.getUTCMonth();
  const hd = hireDate.getUTCDate();

  const ay = asOf.getUTCFullYear();
  const am = asOf.getUTCMonth();
  const ad = asOf.getUTCDate();

  let years = ay - hy;
  if (am < hm || (am === hm && ad < hd)) years--;
  return years;
}

/** Vacation entitlement policy (v1, no proration). */
export function entitledDaysFor(years: number): number {
  if (years < 1) return 0;
  if (years < 3) return 7;
  if (years < 5) return 10;
  if (years < 7) return 12;
  return 15;
}

function tierLabel(years: number): string {
  if (years < 1) return '< 1 year';
  if (years < 3) return '>= 1 year and < 3 years';
  if (years < 5) return '>= 3 years and < 5 years';
  if (years < 7) return '>= 5 years and < 7 years';
  return '>= 7 years';
}

@Injectable()
export class VacationSetupService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async suggest(dto: QueryVacationSetupDto) {
    const today = new Date();
    const currentYear = today.getUTCFullYear();

    if (dto.year > currentYear) {
      throw new UnprocessableEntityException(
        `Year ${dto.year} is in the future. Only current or past years are supported.`,
      );
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, hireDate: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    if (!employee.hireDate) {
      throw new BadRequestException(
        `Employee ${dto.employeeId} has no hireDate set. Vacation entitlement cannot be calculated.`,
      );
    }

    const years = completedYears(employee.hireDate, today);
    const months = completedMonthsTotal(employee.hireDate, today);
    const suggested = entitledDaysFor(years);
    const isEligible = years >= 1;

    const existing = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId: dto.employeeId,
          leaveType: 'VACATION',
          year: dto.year,
        },
      },
      select: { id: true, totalDays: true, usedDays: true },
    });

    return {
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeCode: employee.employeeCode,
      year: dto.year,
      hireDate: employee.hireDate.toISOString().slice(0, 10),
      completedYears: years,
      completedMonths: months,
      isEligible,
      suggestedEntitledDays: suggested,
      tierLabel: tierLabel(years),
      hasExistingBalance: !!existing,
      existingBalance: existing ?? null,
    };
  }

  async setup(dto: CreateVacationSetupDto, ctx: VacationSetupAuditContext) {
    const today = new Date();
    const currentYear = today.getUTCFullYear();

    if (dto.year > currentYear) {
      throw new UnprocessableEntityException(
        `Year ${dto.year} is in the future. Only current or past years are supported.`,
      );
    }

    if (dto.remainingDays > dto.entitledDays) {
      throw new UnprocessableEntityException(
        `remainingDays (${dto.remainingDays}) cannot exceed entitledDays (${dto.entitledDays}).`,
      );
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, hireDate: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    if (!employee.hireDate) {
      throw new BadRequestException(
        `Employee ${dto.employeeId} has no hireDate set. Vacation entitlement cannot be calculated.`,
      );
    }

    const years = completedYears(employee.hireDate, today);
    if (years < 1) {
      throw new UnprocessableEntityException(
        `Employee ${employee.employeeCode} has not completed 1 year of service (${years} completed year(s)). ` +
          `Vacation entitlement setup requires at least 1 year of tenure.`,
      );
    }

    const existing = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId: dto.employeeId,
          leaveType: 'VACATION',
          year: dto.year,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A VACATION leave balance already exists for employee ${employee.employeeCode} in year ${dto.year}. ` +
          `Use the adjustment ledger to modify it.`,
      );
    }

    const suggestedEntitledDays = entitledDaysFor(years);
    const usedDays = dto.entitledDays - dto.remainingDays;

    const balance = await this.prisma.leaveBalance.create({
      data: {
        employeeId: dto.employeeId,
        leaveType: 'VACATION',
        year: dto.year,
        totalDays: dto.entitledDays,
        usedDays,
      },
    });

    const setupNote = dto.setupNote ?? null;

    await this.recordBestEffort({
      actorUserId: ctx.actorUserId ?? null,
      actorRole: ctx.actorRole ?? null,
      action: 'LEAVE_BALANCE_VACATION_SETUP',
      targetType: 'LEAVE_BALANCE',
      targetId: balance.id,
      targetLabel: `${employee.employeeCode} VACATION ${dto.year}`,
      result: 'SUCCESS',
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: {
        leaveBalanceId: balance.id,
        employeeId: dto.employeeId,
        employeeCode: employee.employeeCode,
        year: dto.year,
        hireDate: employee.hireDate.toISOString().slice(0, 10),
        completedYears: years,
        entitledDays: dto.entitledDays,
        remainingDays: dto.remainingDays,
        usedDays,
        suggestedEntitledDays,
        entitlementOverridden: dto.entitledDays !== suggestedEntitledDays,
        setupNote,
      },
    });

    return {
      id: balance.id,
      employeeId: balance.employeeId,
      leaveType: balance.leaveType,
      year: balance.year,
      totalDays: balance.totalDays,
      usedDays: balance.usedDays,
      remainingDays: dto.remainingDays,
      completedYears: years,
      suggestedEntitledDays,
      entitlementOverridden: dto.entitledDays !== suggestedEntitledDays,
      createdAt: balance.createdAt,
    };
  }

  private async recordBestEffort(event: AuditLogEvent): Promise<void> {
    try {
      await this.auditLog.record(event);
    } catch {
      // best-effort: setup is never blocked by audit failure
    }
  }
}

/** Total completed months between two dates (UTC). */
function completedMonthsTotal(hireDate: Date, asOf: Date): number {
  const hy = hireDate.getUTCFullYear();
  const hm = hireDate.getUTCMonth();
  const hd = hireDate.getUTCDate();

  const ay = asOf.getUTCFullYear();
  const am = asOf.getUTCMonth();
  const ad = asOf.getUTCDate();

  let months = (ay - hy) * 12 + (am - hm);
  if (ad < hd) months--;
  return months;
}
