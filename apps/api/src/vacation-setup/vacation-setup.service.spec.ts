import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  VacationSetupService,
  completedYears,
  entitledDaysFor,
} from './vacation-setup.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { mockPrisma } from '../test-utils/prisma.mock';
import { CreateVacationSetupDto } from './dto/create-vacation-setup.dto';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findUnique: jest.Mock };
  leaveBalance: { findUnique: jest.Mock; create: jest.Mock };
};

describe('VacationSetupService', () => {
  let service: VacationSetupService;
  let prisma: PrismaMock;
  let auditLog: { record: jest.Mock };

  const TODAY = new Date('2026-06-28T00:00:00.000Z');

  const emp1yr = {
    id: 'emp-1yr',
    firstName: 'Alice',
    lastName: 'One',
    employeeCode: 'EMP001',
    hireDate: new Date('2025-06-28T00:00:00.000Z'), // exactly 1 year
  };
  const emp3yr = {
    id: 'emp-3yr',
    firstName: 'Bob',
    lastName: 'Three',
    employeeCode: 'EMP003',
    hireDate: new Date('2023-06-28T00:00:00.000Z'), // exactly 3 years
  };
  const emp5yr = {
    id: 'emp-5yr',
    firstName: 'Carol',
    lastName: 'Five',
    employeeCode: 'EMP005',
    hireDate: new Date('2021-06-28T00:00:00.000Z'), // exactly 5 years
  };
  const emp7yr = {
    id: 'emp-7yr',
    firstName: 'Dan',
    lastName: 'Seven',
    employeeCode: 'EMP007',
    hireDate: new Date('2019-06-28T00:00:00.000Z'), // exactly 7 years
  };
  const empLt1yr = {
    id: 'emp-lt1yr',
    firstName: 'Eve',
    lastName: 'New',
    employeeCode: 'EMP000',
    hireDate: new Date('2025-07-01T00:00:00.000Z'), // just under 1 year
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
        VacationSetupService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<VacationSetupService>(VacationSetupService);

    jest.useFakeTimers().setSystemTime(TODAY);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // ── Pure function: completedYears ─────────────────────────────────────────

  describe('completedYears (tenure boundary tests)', () => {
    it('exactly 1 year returns 1', () => {
      expect(completedYears(new Date('2025-06-28'), new Date('2026-06-28'))).toBe(1);
    });

    it('one day before 1 year returns 0', () => {
      expect(completedYears(new Date('2025-06-29'), new Date('2026-06-28'))).toBe(0);
    });

    it('exactly 3 years returns 3', () => {
      expect(completedYears(new Date('2023-06-28'), new Date('2026-06-28'))).toBe(3);
    });

    it('one day before 3 years returns 2', () => {
      expect(completedYears(new Date('2023-06-29'), new Date('2026-06-28'))).toBe(2);
    });

    it('exactly 5 years returns 5', () => {
      expect(completedYears(new Date('2021-06-28'), new Date('2026-06-28'))).toBe(5);
    });

    it('one day before 5 years returns 4', () => {
      expect(completedYears(new Date('2021-06-29'), new Date('2026-06-28'))).toBe(4);
    });

    it('exactly 7 years returns 7', () => {
      expect(completedYears(new Date('2019-06-28'), new Date('2026-06-28'))).toBe(7);
    });

    it('one day before 7 years returns 6', () => {
      expect(completedYears(new Date('2019-06-29'), new Date('2026-06-28'))).toBe(6);
    });
  });

  // ── Pure function: entitledDaysFor ────────────────────────────────────────

  describe('entitledDaysFor (policy tiers)', () => {
    it('0 years → 0 days (ineligible)', () => expect(entitledDaysFor(0)).toBe(0));
    it('1 year → 7 days', () => expect(entitledDaysFor(1)).toBe(7));
    it('2 years → 7 days', () => expect(entitledDaysFor(2)).toBe(7));
    it('3 years → 10 days', () => expect(entitledDaysFor(3)).toBe(10));
    it('4 years → 10 days', () => expect(entitledDaysFor(4)).toBe(10));
    it('5 years → 12 days', () => expect(entitledDaysFor(5)).toBe(12));
    it('6 years → 12 days', () => expect(entitledDaysFor(6)).toBe(12));
    it('7 years → 15 days', () => expect(entitledDaysFor(7)).toBe(15));
    it('10 years → 15 days', () => expect(entitledDaysFor(10)).toBe(15));
  });

  // ── suggest ───────────────────────────────────────────────────────────────

  describe('suggest', () => {
    it('returns eligible suggestion with isEligible=true for 1-year employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp1yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      const result = await service.suggest({ employeeId: emp1yr.id, year: 2026 });

      expect(result.isEligible).toBe(true);
      expect(result.completedYears).toBe(1);
      expect(result.suggestedEntitledDays).toBe(7);
      expect(result.hasExistingBalance).toBe(false);
    });

    it('returns isEligible=false for < 1 year employee (does NOT throw)', async () => {
      prisma.employee.findUnique.mockResolvedValue(empLt1yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      const result = await service.suggest({ employeeId: empLt1yr.id, year: 2026 });

      expect(result.isEligible).toBe(false);
      expect(result.suggestedEntitledDays).toBe(0);
    });

    it('reports hasExistingBalance=true when balance exists', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue({
        id: 'bal-existing',
        totalDays: 10,
        usedDays: 2,
      } as any);

      const result = await service.suggest({ employeeId: emp3yr.id, year: 2026 });

      expect(result.hasExistingBalance).toBe(true);
      expect(result.existingBalance).not.toBeNull();
    });

    it('throws NotFoundException when employee not found', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.suggest({ employeeId: 'missing-uuid', year: 2026 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when employee has no hireDate', async () => {
      prisma.employee.findUnique.mockResolvedValue({ ...emp1yr, hireDate: null } as any);

      await expect(
        service.suggest({ employeeId: emp1yr.id, year: 2026 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnprocessableEntityException for future year', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);

      await expect(
        service.suggest({ employeeId: emp3yr.id, year: 2027 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('returns correct tier for 5-year employee (12 days)', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp5yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      const result = await service.suggest({ employeeId: emp5yr.id, year: 2026 });

      expect(result.completedYears).toBe(5);
      expect(result.suggestedEntitledDays).toBe(12);
    });

    it('returns correct tier for 7-year employee (15 days)', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp7yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      const result = await service.suggest({ employeeId: emp7yr.id, year: 2026 });

      expect(result.completedYears).toBe(7);
      expect(result.suggestedEntitledDays).toBe(15);
    });
  });

  // ── setup ─────────────────────────────────────────────────────────────────

  describe('setup', () => {
    const dto = {
      employeeId: emp3yr.id,
      year: 2026,
      entitledDays: 10,
      remainingDays: 8,
    };

    const mockBalance = {
      id: 'bal-uuid-new',
      employeeId: emp3yr.id,
      leaveType: 'VACATION',
      year: 2026,
      totalDays: 10,
      usedDays: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('SUPER_ADMIN can create vacation balance', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue(mockBalance as any);

      const result = await service.setup(dto, { ...ctx, actorRole: 'SUPER_ADMIN' });

      expect(result.totalDays).toBe(10);
      expect(result.usedDays).toBe(2);
      expect(result.remainingDays).toBe(8);
      expect(prisma.leaveBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leaveType: 'VACATION',
            totalDays: 10,
            usedDays: 2,
          }),
        }),
      );
    });

    it('HR_ADMIN can create vacation balance', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue(mockBalance as any);

      const result = await service.setup(dto, ctx);

      expect(result.totalDays).toBe(10);
      expect(result.remainingDays).toBe(8);
    });

    it('derives usedDays = entitledDays - remainingDays', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue({ ...mockBalance, usedDays: 3 } as any);

      await service.setup({ ...dto, entitledDays: 10, remainingDays: 7 }, ctx);

      expect(prisma.leaveBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ usedDays: 3 }),
        }),
      );
    });

    it('throws UnprocessableEntityException for < 1 year tenure', async () => {
      prisma.employee.findUnique.mockResolvedValue(empLt1yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      await expect(
        service.setup({ ...dto, employeeId: empLt1yr.id }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ConflictException when VACATION balance already exists for the year', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(mockBalance as any);

      await expect(service.setup(dto, ctx)).rejects.toThrow(ConflictException);
    });

    it('throws UnprocessableEntityException when remainingDays > entitledDays', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      await expect(
        service.setup({ ...dto, entitledDays: 5, remainingDays: 8 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws NotFoundException when employee not found', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.setup(dto, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when employee has no hireDate', async () => {
      prisma.employee.findUnique.mockResolvedValue({ ...emp3yr, hireDate: null } as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      await expect(service.setup(dto, ctx)).rejects.toThrow(BadRequestException);
    });

    it('throws UnprocessableEntityException for future year', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);

      await expect(
        service.setup({ ...dto, year: 2027 }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('records audit event LEAVE_BALANCE_VACATION_SETUP', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue(mockBalance as any);

      await service.setup(dto, ctx);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEAVE_BALANCE_VACATION_SETUP',
          result: 'SUCCESS',
          targetType: 'LEAVE_BALANCE',
        }),
      );
    });

    it('includes entitlementOverridden=true in audit when entitledDays differs from policy', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue({ ...mockBalance, totalDays: 12 } as any);

      // emp3yr is 3 years → policy = 10; override to 12
      await service.setup({ ...dto, entitledDays: 12, remainingDays: 10 }, ctx);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            entitlementOverridden: true,
            entitledDays: 12,
            suggestedEntitledDays: 10,
          }),
        }),
      );
    });

    it('includes entitlementOverridden=false when entitledDays matches policy', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue(mockBalance as any);

      await service.setup(dto, ctx);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            entitlementOverridden: false,
          }),
        }),
      );
    });

    it('does not block setup when audit log throws', async () => {
      prisma.employee.findUnique.mockResolvedValue(emp3yr as any);
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue(mockBalance as any);
      auditLog.record.mockRejectedValue(new Error('audit DB down'));

      await expect(service.setup(dto, ctx)).resolves.toBeDefined();
    });

    it('DTO accepts remainingDays = entitledDays (0 used days)', async () => {
      const dtoFull = plainToInstance(CreateVacationSetupDto, {
        employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        year: 2026,
        entitledDays: 10,
        remainingDays: 10,
      });
      const errors = await validate(dtoFull);
      expect(errors).toHaveLength(0);
    });

    it('DTO rejects negative entitledDays', async () => {
      const dto2 = plainToInstance(CreateVacationSetupDto, {
        employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        year: 2026,
        entitledDays: -1,
        remainingDays: 0,
      });
      const errors = await validate(dto2);
      const field = errors.find((e) => e.property === 'entitledDays');
      expect(field).toBeDefined();
    });

    it('DTO rejects year below 2020', async () => {
      const dto2 = plainToInstance(CreateVacationSetupDto, {
        employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        year: 2019,
        entitledDays: 10,
        remainingDays: 8,
      });
      const errors = await validate(dto2);
      const field = errors.find((e) => e.property === 'year');
      expect(field).toBeDefined();
    });

    it('DTO rejects setupNote longer than 500 chars', async () => {
      const dto2 = plainToInstance(CreateVacationSetupDto, {
        employeeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        year: 2026,
        entitledDays: 10,
        remainingDays: 8,
        setupNote: 'x'.repeat(501),
      });
      const errors = await validate(dto2);
      const field = errors.find((e) => e.property === 'setupNote');
      expect(field).toBeDefined();
    });
  });
});
