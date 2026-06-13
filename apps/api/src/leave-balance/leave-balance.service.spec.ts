import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LeaveBalanceService } from './leave-balance.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findUnique: jest.Mock; findFirst: jest.Mock };
  leaveBalance: { findUnique: jest.Mock; create: jest.Mock; findMany: jest.Mock; count: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

describe('LeaveBalanceService', () => {
  let service: LeaveBalanceService;
  let prisma: PrismaMock;

  const userId = 'user-uuid-1';
  const employeeId = 'emp-uuid-1';
  const balanceId = 'bal-uuid-1';

  // Raw DB record shape (without remainingDays — that's computed)
  const mockBalanceRaw = {
    id: balanceId,
    leaveType: 'SICK',
    year: 2026,
    totalDays: 10,
    usedDays: 3,
    employee: { id: employeeId, employeeCode: 'EMP001', firstName: 'John', lastName: 'Doe', department: null, position: null },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createDto = {
    employeeId,
    leaveType: 'SICK' as any,
    year: 2026,
    entitledDays: 10,
  };

  beforeEach(async () => {
    prisma = mockPrisma() as PrismaMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveBalanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LeaveBalanceService>(LeaveBalanceService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a balance and returns it with remainingDays computed', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: employeeId });
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue(mockBalanceRaw as any);

      const result = await service.create(createDto);

      expect(result).toMatchObject({ id: balanceId, totalDays: 10, usedDays: 3 });
      expect(result.remainingDays).toBe(7); // 10 - 3
    });

    it('initialises usedDays to 0 on the created record', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: employeeId });
      prisma.leaveBalance.findUnique.mockResolvedValue(null);
      prisma.leaveBalance.create.mockResolvedValue(mockBalanceRaw as any);

      await service.create(createDto);

      expect(prisma.leaveBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ usedDays: 0 }),
        }),
      );
    });

    it('throws BadRequestException when employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException for duplicate employeeId + leaveType + year combination', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: employeeId });
      prisma.leaveBalance.findUnique.mockResolvedValue(mockBalanceRaw as any);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated balances each with remainingDays computed', async () => {
      prisma.$transaction.mockResolvedValue([[mockBalanceRaw], 1] as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].remainingDays).toBe(7);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });
  });

  // ── findMy ─────────────────────────────────────────────────────────────────

  describe('findMy', () => {
    it('returns balances for the current employee', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.$transaction.mockResolvedValue([[mockBalanceRaw], 1] as any);

      const result = await service.findMy(userId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
    });

    it('throws BadRequestException when user has no linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.findMy(userId, {})).rejects.toThrow(BadRequestException);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns balance with remainingDays for SUPER_ADMIN without ownership check', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(mockBalanceRaw as any);

      const result = await service.findOne(balanceId, userId, 'SUPER_ADMIN');

      expect(result.remainingDays).toBe(7);
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('returns balance for MANAGER without ownership check', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(mockBalanceRaw as any);

      const result = await service.findOne(balanceId, userId, 'MANAGER');

      expect(result).toMatchObject({ id: balanceId });
    });

    it('allows an employee to view their own balance', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(mockBalanceRaw as any);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });

      const result = await service.findOne(balanceId, userId, 'EMPLOYEE');

      expect(result).toMatchObject({ id: balanceId });
    });

    it('throws ForbiddenException when employee views another employee\'s balance', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(mockBalanceRaw as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'other-emp-uuid' });

      await expect(service.findOne(balanceId, userId, 'EMPLOYEE')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when balance does not exist', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', userId, 'SUPER_ADMIN')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    const existingRaw = { id: balanceId, totalDays: 10, usedDays: 3 };

    it('updates entitledDays and returns balance with updated remainingDays', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(existingRaw as any);
      const updated = { ...mockBalanceRaw, totalDays: 15, usedDays: 3 };
      prisma.leaveBalance.update.mockResolvedValue(updated as any);

      const result = await service.update(balanceId, { entitledDays: 15 });

      expect(result.remainingDays).toBe(12); // 15 - 3
    });

    it('updates usedDays and reflects new remainingDays', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(existingRaw as any);
      const updated = { ...mockBalanceRaw, totalDays: 10, usedDays: 5 };
      prisma.leaveBalance.update.mockResolvedValue(updated as any);

      const result = await service.update(balanceId, { usedDays: 5 });

      expect(result.remainingDays).toBe(5); // 10 - 5
    });

    it('throws UnprocessableEntityException when update would result in negative remaining days', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(existingRaw as any);

      // entitledDays = 5, usedDays = 3 (existing) → remaining = 2 → ok
      // entitledDays = 2, usedDays = 3 → remaining = -1 → FAIL
      await expect(service.update(balanceId, { entitledDays: 2 })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws NotFoundException when balance does not exist', async () => {
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { entitledDays: 10 })).rejects.toThrow(NotFoundException);
    });
  });
});
