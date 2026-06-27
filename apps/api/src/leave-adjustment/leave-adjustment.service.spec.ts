import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LeaveAdjustmentService } from './leave-adjustment.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { mockPrisma } from '../test-utils/prisma.mock';
import { CreateLeaveAdjustmentDto } from './dto/create-leave-adjustment.dto';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  leaveBalance: { findUnique: jest.Mock };
  leaveAdjustment: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
    groupBy: jest.Mock;
  };
  employee: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

describe('LeaveAdjustmentService', () => {
  let service: LeaveAdjustmentService;
  let prisma: PrismaMock;
  let auditLog: { record: jest.Mock };

  const balanceId = 'bal-uuid-1';
  const vacationBalance = {
    id: balanceId,
    employeeId: 'emp-uuid-1',
    leaveType: 'VACATION',
    year: 2026,
    totalDays: 10,
    usedDays: 3,
  };
  const sickBalance = {
    id: 'sick-bal-uuid-1',
    employeeId: 'emp-uuid-1',
    leaveType: 'SICK',
    year: 2026,
    totalDays: 10,
    usedDays: 3,
  };

  const mockAdjustmentRaw = {
    id: 'adj-uuid-1',
    leaveBalanceId: balanceId,
    deltaDays: 2,
    reason: 'Performance bonus days',
    actorUserId: 'user-uuid-1',
    adjustedBy: null,
    createdAt: new Date(),
  };

  const ctx = {
    actorUserId: 'user-uuid-1',
    actorRole: 'HR_ADMIN',
    ipAddress: '127.0.0.1',
    userAgent: 'test',
  };

  beforeEach(async () => {
    prisma = mockPrisma() as PrismaMock;
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveAdjustmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<LeaveAdjustmentService>(LeaveAdjustmentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('SUPER_ADMIN can create vacation adjustment', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(vacationBalance as any);
      prisma.leaveAdjustment.aggregate.mockResolvedValue({ _sum: { deltaDays: 0 } });
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-uuid-1' });
      prisma.leaveAdjustment.create.mockResolvedValue(mockAdjustmentRaw as any);

      const result = await service.create(
        balanceId,
        { deltaDays: 2, reason: 'Performance bonus days' },
        { ...ctx, actorRole: 'SUPER_ADMIN' },
      );

      expect(result.deltaDays).toBe(2);
      expect(result.effectiveTotalDays).toBe(12); // 10 + 2
      expect(result.effectiveRemainingDays).toBe(9); // 12 - 3
      expect(prisma.leaveAdjustment.create).toHaveBeenCalledTimes(1);
    });

    it('HR_ADMIN can create vacation adjustment', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(vacationBalance as any);
      prisma.leaveAdjustment.aggregate.mockResolvedValue({ _sum: { deltaDays: 0 } });
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-uuid-1' });
      prisma.leaveAdjustment.create.mockResolvedValue(mockAdjustmentRaw as any);

      const result = await service.create(
        balanceId,
        { deltaDays: 2, reason: 'Performance bonus days' },
        ctx,
      );

      expect(result.deltaDays).toBe(2);
    });

    it('rejects non-vacation leave balance with BadRequestException', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(sickBalance as any);

      await expect(
        service.create(balanceId, { deltaDays: 1, reason: 'Test reason here' }, ctx),
      ).rejects.toThrow(BadRequestException);
    });

    it('DTO rejects deltaDays of zero via @NotEquals(0)', async () => {
      const dto = plainToInstance(CreateLeaveAdjustmentDto, { deltaDays: 0, reason: 'Valid reason here' });
      const errors = await validate(dto);
      const deltaErrors = errors.find((e) => e.property === 'deltaDays');
      expect(deltaErrors).toBeDefined();
      expect(Object.values(deltaErrors!.constraints ?? {})).toContain('deltaDays must be non-zero');
    });

    it('DTO rejects whitespace-only reason after trim (prevents empty audit reason)', async () => {
      const dto = plainToInstance(CreateLeaveAdjustmentDto, { deltaDays: 1, reason: '     ' });
      const errors = await validate(dto);
      const reasonErrors = errors.find((e) => e.property === 'reason');
      expect(reasonErrors).toBeDefined();
    });

    it('DTO rejects reason shorter than 5 chars after trim', async () => {
      const dto = plainToInstance(CreateLeaveAdjustmentDto, { deltaDays: 1, reason: '  a  ' });
      const errors = await validate(dto);
      const reasonErrors = errors.find((e) => e.property === 'reason');
      expect(reasonErrors).toBeDefined();
    });

    it('throws UnprocessableEntityException when adjustment makes remaining balance negative', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue({
        ...vacationBalance,
        totalDays: 10,
        usedDays: 9,
      } as any);
      prisma.leaveAdjustment.aggregate.mockResolvedValue({ _sum: { deltaDays: 0 } });

      await expect(
        service.create(
          balanceId,
          { deltaDays: -2, reason: 'Correction adjustment value' },
          ctx,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws NotFoundException when balance does not exist', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      await expect(
        service.create('missing-id', { deltaDays: 1, reason: 'Test reason here' }, ctx),
      ).rejects.toThrow(NotFoundException);
    });

    it('trims whitespace from reason before saving', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(vacationBalance as any);
      prisma.leaveAdjustment.aggregate.mockResolvedValue({ _sum: { deltaDays: 0 } });
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-uuid-1' });
      prisma.leaveAdjustment.create.mockResolvedValue(mockAdjustmentRaw as any);

      await service.create(balanceId, { deltaDays: 1, reason: '  bonus days   ' }, ctx);

      expect(prisma.leaveAdjustment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reason: 'bonus days' }),
        }),
      );
    });

    it('records audit log on successful adjustment', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(vacationBalance as any);
      prisma.leaveAdjustment.aggregate.mockResolvedValue({ _sum: { deltaDays: 0 } });
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-uuid-1' });
      prisma.leaveAdjustment.create.mockResolvedValue(mockAdjustmentRaw as any);

      await service.create(balanceId, { deltaDays: 2, reason: 'Performance bonus days' }, ctx);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEAVE_BALANCE_ADJUSTED',
          result: 'SUCCESS',
          targetType: 'LEAVE_BALANCE',
          targetId: balanceId,
        }),
      );
    });

    it('does not block when cumulative adjustments keep remaining non-negative', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(vacationBalance as any);
      // Existing adj sum: -5; effective total = 10-5=5; remaining = 5-3=2; new delta = -2 → new remaining = 0 (OK)
      prisma.leaveAdjustment.aggregate.mockResolvedValue({ _sum: { deltaDays: -5 } });
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-uuid-1' });
      prisma.leaveAdjustment.create.mockResolvedValue({ ...mockAdjustmentRaw, deltaDays: -2 } as any);

      const result = await service.create(
        balanceId,
        { deltaDays: -2, reason: 'Correction for previous error' },
        ctx,
      );

      expect(result.effectiveRemainingDays).toBe(0);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated adjustment history for a balance', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue({ id: balanceId } as any);
      prisma.$transaction.mockResolvedValue([[mockAdjustmentRaw], 1] as any);

      const result = await service.findAll(balanceId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].deltaDays).toBe(2);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('throws NotFoundException when balance does not exist', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      await expect(service.findAll('missing-id', { page: 1, limit: 20 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
