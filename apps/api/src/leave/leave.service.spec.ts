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
