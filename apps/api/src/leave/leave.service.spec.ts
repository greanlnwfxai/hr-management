import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { LeaveService } from './leave.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

// Helper type so TypeScript knows the mock shape
type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findFirst: jest.Mock; findUnique: jest.Mock };
  leaveRequest: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  leaveBalance: { findUnique: jest.Mock };
  leaveAdjustment: { aggregate: jest.Mock };
  $transaction: jest.Mock;
};

describe('LeaveService', () => {
  let service: LeaveService;
  let prisma: PrismaMock;
  let mockAuditLog: { record: jest.Mock };

  const userId = 'user-uuid-1';
  const employeeId = 'emp-uuid-1';
  const leaveId = 'leave-uuid-1';

  const mockLeaveRecord = {
    id: leaveId,
    leaveType: 'SICK',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-03'),
    totalDays: 3,
    reason: 'Unwell',
    status: 'PENDING',
    employee: { id: employeeId, employeeCode: 'EMP001', firstName: 'John', lastName: 'Doe', department: null, position: null },
    approvedBy: null,
    approvedAt: null,
    employeeId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createDto = {
    leaveType: 'SICK' as any,
    startDate: '2026-07-01',
    endDate: '2026-07-03',
    reason: 'Unwell',
  };

  beforeEach(async () => {
    prisma = mockPrisma() as PrismaMock;
    mockAuditLog = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<LeaveService>(LeaveService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a PENDING leave request for a linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.leaveRequest.findFirst.mockResolvedValue(null);
      prisma.leaveRequest.create.mockResolvedValue({ ...mockLeaveRecord, status: 'PENDING' } as any);

      const result = await service.create(userId, createDto);

      expect(result.status).toBe('PENDING');
      expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId,
            totalDays: 3,
          }),
        }),
      );
    });

    it('calculates totalDays correctly (3 days for Jul 1–3)', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.leaveRequest.findFirst.mockResolvedValue(null);
      prisma.leaveRequest.create.mockResolvedValue(mockLeaveRecord as any);

      await service.create(userId, createDto);

      const createCall = (prisma.leaveRequest.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.totalDays).toBe(3);
    });

    it('throws BadRequestException when user has no linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.create(userId, createDto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when startDate is after endDate', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });

      await expect(
        service.create(userId, { ...createDto, startDate: '2026-07-05', endDate: '2026-07-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when leave overlaps existing PENDING/APPROVED leave', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.leaveRequest.findFirst.mockResolvedValue(mockLeaveRecord as any);

      await expect(service.create(userId, createDto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findMy ─────────────────────────────────────────────────────────────────

  describe('findMy', () => {
    it('returns paginated leave requests for the current employee', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.$transaction.mockResolvedValue([[mockLeaveRecord], 1] as any);

      const result = await service.findMy(userId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('throws BadRequestException when user has no linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.findMy(userId, {})).rejects.toThrow(BadRequestException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated leave requests with correct meta', async () => {
      prisma.$transaction.mockResolvedValue([[mockLeaveRecord], 1] as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });
  });

  // ── findMy: date range overlap filtering ─────────────────────────────────────
  // HOTFIX-LEAVE-ME-OVERLAP-001: leave.startDate <= queryEnd AND leave.endDate >= queryStart

  describe('findMy: date range overlap filtering', () => {
    const leaveJul8to10 = {
      ...mockLeaveRecord,
      startDate: new Date('2026-07-08'),
      endDate: new Date('2026-07-10'),
    };

    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.$transaction.mockResolvedValue([[leaveJul8to10], 1]);
    });

    const capturedWhere = () =>
      (prisma.leaveRequest.findMany as jest.Mock).mock.calls[
        (prisma.leaveRequest.findMany as jest.Mock).mock.calls.length - 1
      ][0].where;

    // Evaluate the constructed Prisma where-clause's date conditions against a leave
    // record's actual dates, the same way Postgres would evaluate lte/gte comparisons.
    const overlaps = (where: any, leave: { startDate: Date; endDate: Date }) => {
      const startOk = !where.startDate || leave.startDate.getTime() <= where.startDate.lte.getTime();
      const endOk = !where.endDate || leave.endDate.getTime() >= where.endDate.gte.getTime();
      return startOk && endOk;
    };

    it('1. exact same-day query inside range returns leave (query Jul 9–9 vs leave Jul 8–10)', async () => {
      await service.findMy(userId, { startDate: '2026-07-09', endDate: '2026-07-09' } as any);
      expect(overlaps(capturedWhere(), leaveJul8to10)).toBe(true);
    });

    it('2. query range inside multi-day leave returns leave (query Jul 9–20 vs leave Jul 8–10)', async () => {
      await service.findMy(userId, { startDate: '2026-07-09', endDate: '2026-07-20' } as any);
      expect(overlaps(capturedWhere(), leaveJul8to10)).toBe(true);
    });

    it('3. query starts before leave and ends on leave start returns leave (query Jul 7–8 vs leave Jul 8–10)', async () => {
      await service.findMy(userId, { startDate: '2026-07-07', endDate: '2026-07-08' } as any);
      expect(overlaps(capturedWhere(), leaveJul8to10)).toBe(true);
    });

    it('4. query starts on leave end and ends after leave returns leave (query Jul 10–10 vs leave Jul 8–10)', async () => {
      await service.findMy(userId, { startDate: '2026-07-10', endDate: '2026-07-10' } as any);
      expect(overlaps(capturedWhere(), leaveJul8to10)).toBe(true);
    });

    it('5. query range fully contains leave returns leave (query Jul 1–31 vs leave Jul 8–10)', async () => {
      await service.findMy(userId, { startDate: '2026-07-01', endDate: '2026-07-31' } as any);
      expect(overlaps(capturedWhere(), leaveJul8to10)).toBe(true);
    });

    it('6. query range after leave returns no leave (query Jul 11–12 vs leave Jul 8–10)', async () => {
      await service.findMy(userId, { startDate: '2026-07-11', endDate: '2026-07-12' } as any);
      expect(overlaps(capturedWhere(), leaveJul8to10)).toBe(false);
    });

    it('7. query range before leave returns no leave (query Jul 1–7 vs leave Jul 8–10)', async () => {
      await service.findMy(userId, { startDate: '2026-07-01', endDate: '2026-07-07' } as any);
      expect(overlaps(capturedWhere(), leaveJul8to10)).toBe(false);
    });

    it('only startDate provided filters by endDate >= queryStart (open-ended range)', async () => {
      await service.findMy(userId, { startDate: '2026-07-09' } as any);
      const where = capturedWhere();
      expect(where.startDate).toBeUndefined();
      expect(where.endDate).toEqual({ gte: new Date('2026-07-09') });
    });

    it('only endDate provided filters by startDate <= queryEnd (open-ended range)', async () => {
      await service.findMy(userId, { endDate: '2026-07-09' } as any);
      const where = capturedWhere();
      expect(where.endDate).toBeUndefined();
      expect(where.startDate).toEqual({ lte: new Date('2026-07-09') });
    });

    it('no date filters provided applies no date constraint', async () => {
      await service.findMy(userId, { page: 1, limit: 20 } as any);
      const where = capturedWhere();
      expect(where.startDate).toBeUndefined();
      expect(where.endDate).toBeUndefined();
    });

    it('8. status filter still works alongside overlap date filter', async () => {
      await service.findMy(userId, {
        status: 'APPROVED',
        startDate: '2026-07-09',
        endDate: '2026-07-20',
      } as any);
      const where = capturedWhere();
      expect(where.status).toBe('APPROVED');
      expect(overlaps(where, leaveJul8to10)).toBe(true);
    });

    it('9. auth isolation: findMy always scopes by the caller\'s own employeeId, ignoring any employeeId in the query', async () => {
      await service.findMy(userId, {
        employeeId: 'someone-elses-emp-uuid',
        startDate: '2026-07-09',
        endDate: '2026-07-09',
      } as any);
      const where = capturedWhere();
      expect(where.employeeId).toBe(employeeId);
      expect(where.employeeId).not.toBe('someone-elses-emp-uuid');
    });

    it('10. status filter (e.g. REJECTED) is combined with, not replaced by, the overlap filter', async () => {
      await service.findMy(userId, {
        status: 'REJECTED',
        startDate: '2026-07-09',
        endDate: '2026-07-09',
      } as any);
      const where = capturedWhere();
      expect(where.status).toBe('REJECTED');
      expect(where.startDate).toEqual({ lte: new Date('2026-07-09') });
      expect(where.endDate).toEqual({ gte: new Date('2026-07-09') });
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the record to an admin without ownership check', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(mockLeaveRecord as any);

      const result = await service.findOne(leaveId, userId, 'SUPER_ADMIN');

      expect(result).toMatchObject({ id: leaveId });
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('returns the record to HR_ADMIN without ownership check', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(mockLeaveRecord as any);

      const result = await service.findOne(leaveId, userId, 'HR_ADMIN');

      expect(result).toMatchObject({ id: leaveId });
    });

    it('returns the record to MANAGER without ownership check', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(mockLeaveRecord as any);

      const result = await service.findOne(leaveId, userId, 'MANAGER');

      expect(result).toMatchObject({ id: leaveId });
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('allows an employee to view their own leave request', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(mockLeaveRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });

      const result = await service.findOne(leaveId, userId, 'EMPLOYEE');

      expect(result).toMatchObject({ id: leaveId });
    });

    it('throws ForbiddenException when employee tries to view another employee\'s record', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(mockLeaveRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'other-emp-uuid' });

      await expect(service.findOne(leaveId, userId, 'EMPLOYEE')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when leave request does not exist', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', userId, 'SUPER_ADMIN')).rejects.toThrow(NotFoundException);
    });
  });

  // ── approve ────────────────────────────────────────────────────────────────

  describe('approve', () => {
    const pendingRecord = { ...mockLeaveRecord, status: 'PENDING', totalDays: 3, startDate: new Date('2026-07-01') };
    const balance = { id: 'bal-uuid-1', totalDays: 10, usedDays: 2, employeeId };
    const txMock = {
      leaveBalance: { update: jest.fn().mockResolvedValue({}) },
      leaveRequest: { update: jest.fn().mockResolvedValue({ ...mockLeaveRecord, status: 'APPROVED' }) },
    };

    it('approves a PENDING request and deducts the leave balance in one transaction', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.leaveBalance.findUnique.mockResolvedValue(balance as any);
      prisma.$transaction.mockImplementation((fn: any) => fn(txMock));

      const result = await service.approve(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(result.status).toBe('APPROVED');
      expect(txMock.leaveBalance.update).toHaveBeenCalled();
      expect(txMock.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: leaveId } }),
      );
    });

    it('throws NotFoundException when leave request does not exist', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(null);

      await expect(service.approve('missing', userId, 'HR_ADMIN', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for non-PENDING leave requests', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({ ...pendingRecord, status: 'APPROVED' } as any);

      await expect(service.approve(leaveId, userId, 'HR_ADMIN', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no leave balance record exists', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.leaveBalance.findUnique.mockResolvedValue(null);

      await expect(service.approve(leaveId, userId, 'HR_ADMIN', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when remaining days are insufficient', async () => {
      const tightBalance = { ...balance, totalDays: 5, usedDays: 3 }; // remaining = 2, requested = 3
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.leaveBalance.findUnique.mockResolvedValue(tightBalance as any);

      await expect(service.approve(leaveId, userId, 'HR_ADMIN', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('approves when positive vacation adjustment makes otherwise-insufficient balance sufficient', async () => {
      // base: totalDays=5, usedDays=3, requested=3 → base remaining=2, would fail without adjustment
      // after +1 adjustment: effectiveTotal=6, remaining=3, requested=3 → OK
      const tightBalance = { ...balance, totalDays: 5, usedDays: 3 };
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.leaveBalance.findUnique.mockResolvedValue(tightBalance as any);
      prisma.leaveAdjustment.aggregate.mockResolvedValue({ _sum: { deltaDays: 1 } });
      prisma.$transaction.mockImplementation((fn: any) => fn(txMock));

      const result = await service.approve(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(result.status).toBe('APPROVED');
    });
  });

  // ── reject ─────────────────────────────────────────────────────────────────

  describe('reject', () => {
    const pendingRecord = { ...mockLeaveRecord, status: 'PENDING' };

    it('rejects a PENDING request and sets status to REJECTED', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.leaveRequest.update.mockResolvedValue({ ...mockLeaveRecord, status: 'REJECTED' } as any);

      const result = await service.reject(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(result.status).toBe('REJECTED');
      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: leaveId },
          data: expect.objectContaining({ status: 'REJECTED' }),
        }),
      );
    });

    it('throws NotFoundException when leave request does not exist', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(null);

      await expect(service.reject('missing', userId, 'HR_ADMIN', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for non-PENDING leave requests', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({ ...pendingRecord, status: 'APPROVED' } as any);

      await expect(service.reject(leaveId, userId, 'HR_ADMIN', {} as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ── audit: approve ─────────────────────────────────────────────────────────

  describe('audit: approve', () => {
    const pendingRecord = {
      ...mockLeaveRecord,
      status: 'PENDING',
      totalDays: 3,
      startDate: new Date('2026-07-01'),
      reason: 'Unwell',
    };
    const balance = { id: 'bal-uuid-1', totalDays: 10, usedDays: 2, employeeId };
    const txMock = {
      leaveBalance: { update: jest.fn().mockResolvedValue({}) },
      leaveRequest: { update: jest.fn().mockResolvedValue({ ...mockLeaveRecord, status: 'APPROVED' }) },
    };

    const setupApproveSuccess = () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.leaveBalance.findUnique.mockResolvedValue(balance as any);
      prisma.$transaction.mockImplementation((fn: any) => fn(txMock));
    };

    it('records LEAVE_APPROVED after successful approval', async () => {
      setupApproveSuccess();
      await service.approve(leaveId, userId, 'HR_ADMIN', {} as any, { actorUserId: 'actor-uuid', actorRole: 'HR_ADMIN' });

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LEAVE_APPROVED', result: 'SUCCESS' }),
      );
    });

    it('sets actorUserId and actorRole from context on LEAVE_APPROVED', async () => {
      setupApproveSuccess();
      await service.approve(leaveId, userId, 'HR_ADMIN', {} as any, { actorUserId: 'actor-uuid', actorRole: 'HR_ADMIN' });

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: 'actor-uuid', actorRole: 'HR_ADMIN' }),
      );
    });

    it('sets targetType to LEAVE_REQUEST on LEAVE_APPROVED', async () => {
      setupApproveSuccess();
      await service.approve(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'LEAVE_REQUEST' }),
      );
    });

    it('sets targetId to leave request id on LEAVE_APPROVED', async () => {
      setupApproveSuccess();
      await service.approve(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: leaveId }),
      );
    });

    it('sets result to SUCCESS on LEAVE_APPROVED', async () => {
      setupApproveSuccess();
      await service.approve(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'SUCCESS' }),
      );
    });

    it('metadata contains safe scalar fields only — no reason field', async () => {
      setupApproveSuccess();
      await service.approve(leaveId, userId, 'HR_ADMIN', {} as any);

      const call = mockAuditLog.record.mock.calls[0][0];
      expect(call.metadata).toMatchObject({
        leaveRequestId: leaveId,
        employeeId,
        leaveType: 'SICK',
        totalDays: 3,
        status: 'APPROVED',
      });
      expect(call.metadata).not.toHaveProperty('reason');
    });

    it('metadata does not contain the employee leave reason value even if reason is on the record', async () => {
      setupApproveSuccess();
      await service.approve(leaveId, userId, 'HR_ADMIN', {} as any);

      const call = mockAuditLog.record.mock.calls[0][0];
      const metadataValues = Object.values(call.metadata ?? {});
      expect(metadataValues).not.toContain('Unwell');
    });

    it('still approves when audit write fails (best-effort)', async () => {
      setupApproveSuccess();
      mockAuditLog.record.mockRejectedValueOnce(new Error('DB down'));

      const result = await service.approve(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(result.status).toBe('APPROVED');
    });
  });

  // ── audit: reject ──────────────────────────────────────────────────────────

  describe('audit: reject', () => {
    const pendingRecord = { ...mockLeaveRecord, status: 'PENDING', reason: 'Unwell' };

    const setupRejectSuccess = () => {
      prisma.leaveRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid', managedDepartment: { id: 'dept-uuid-1' } });
      prisma.employee.findUnique.mockResolvedValue({ departmentId: 'dept-uuid-1' });
      prisma.leaveRequest.update.mockResolvedValue({ ...mockLeaveRecord, status: 'REJECTED' } as any);
    };

    it('records LEAVE_REJECTED after successful rejection', async () => {
      setupRejectSuccess();
      await service.reject(leaveId, userId, 'MANAGER', {} as any, { actorUserId: 'actor-uuid', actorRole: 'MANAGER' });

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LEAVE_REJECTED', result: 'SUCCESS' }),
      );
    });

    it('sets actorUserId and actorRole from context on LEAVE_REJECTED', async () => {
      setupRejectSuccess();
      await service.reject(leaveId, userId, 'MANAGER', {} as any, { actorUserId: 'actor-uuid', actorRole: 'MANAGER' });

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: 'actor-uuid', actorRole: 'MANAGER' }),
      );
    });

    it('sets targetType to LEAVE_REQUEST on LEAVE_REJECTED', async () => {
      setupRejectSuccess();
      await service.reject(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'LEAVE_REQUEST' }),
      );
    });

    it('sets targetId to leave request id on LEAVE_REJECTED', async () => {
      setupRejectSuccess();
      await service.reject(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: leaveId }),
      );
    });

    it('sets result to SUCCESS on LEAVE_REJECTED', async () => {
      setupRejectSuccess();
      await service.reject(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'SUCCESS' }),
      );
    });

    it('metadata uses hasRejectionReason boolean instead of raw rejection reason', async () => {
      setupRejectSuccess();
      await service.reject(leaveId, userId, 'HR_ADMIN', { rejectReason: 'sensitive text' } as any);

      const call = mockAuditLog.record.mock.calls[0][0];
      expect(call.metadata.hasRejectionReason).toBe(true);
      expect(call.metadata).not.toHaveProperty('rejectReason');
    });

    it('metadata does not contain raw rejection reason string value', async () => {
      setupRejectSuccess();
      await service.reject(leaveId, userId, 'HR_ADMIN', { rejectReason: 'sensitive text' } as any);

      const call = mockAuditLog.record.mock.calls[0][0];
      const metadataValues = Object.values(call.metadata ?? {});
      expect(metadataValues).not.toContain('sensitive text');
    });

    it('still rejects when audit write fails (best-effort)', async () => {
      setupRejectSuccess();
      mockAuditLog.record.mockRejectedValueOnce(new Error('DB down'));

      const result = await service.reject(leaveId, userId, 'HR_ADMIN', {} as any);

      expect(result.status).toBe('REJECTED');
    });
  });
});
