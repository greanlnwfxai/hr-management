import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { OffSiteService } from './off-site.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findFirst: jest.Mock; findUnique: jest.Mock };
  offSiteRequest: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

describe('OffSiteService', () => {
  let service: OffSiteService;
  let prisma: PrismaMock;
  let mockAuditLog: { record: jest.Mock };

  const userId = 'user-uuid-1';
  const employeeId = 'emp-uuid-1';
  const offSiteId = 'offsite-uuid-1';

  const mockOffSiteRecord = {
    id: offSiteId,
    date: new Date('2026-07-01'),
    reason: 'Client visit',
    status: 'PENDING',
    rejectReason: null,
    approvedAt: null,
    employee: { id: employeeId, employeeCode: 'EMP001', firstName: 'John', lastName: 'Doe', department: null, position: null },
    approvedBy: null,
    employeeId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createDto = {
    date: '2026-07-01',
    reason: 'Client visit',
  };

  beforeEach(async () => {
    prisma = mockPrisma() as PrismaMock;
    mockAuditLog = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OffSiteService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<OffSiteService>(OffSiteService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a PENDING off-site request for a linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.offSiteRequest.findFirst.mockResolvedValue(null);
      prisma.offSiteRequest.create.mockResolvedValue({ ...mockOffSiteRecord, status: 'PENDING' } as any);

      const result = await service.create(userId, createDto);

      expect(result.status).toBe('PENDING');
      expect(prisma.offSiteRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ employeeId }) }),
      );
    });

    it('throws BadRequestException when user has no linked employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.create(userId, createDto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an invalid date', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });

      await expect(service.create(userId, { ...createDto, date: 'not-a-date' })).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a PENDING/APPROVED request already exists for the date', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.offSiteRequest.findFirst.mockResolvedValue(mockOffSiteRecord as any);

      await expect(service.create(userId, createDto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findMy ─────────────────────────────────────────────────────────────────

  describe('findMy', () => {
    it('returns paginated off-site requests for the current employee', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.$transaction.mockResolvedValue([[mockOffSiteRecord], 1] as any);

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
    it('returns paginated off-site requests with correct meta', async () => {
      prisma.$transaction.mockResolvedValue([[mockOffSiteRecord], 1] as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });
  });

  // ── findAll: MANAGER department scoping (SEC-OFFSITE-001) ─────────────────

  describe('findAll: MANAGER department scoping', () => {
    const managerUserId = 'manager-user-uuid';
    const managerDeptId = 'dept-uuid-managed';

    const capturedWhere = () =>
      (prisma.offSiteRequest.findMany as jest.Mock).mock.calls[
        (prisma.offSiteRequest.findMany as jest.Mock).mock.calls.length - 1
      ][0].where;

    it('scopes results to the managed department when caller is MANAGER', async () => {
      prisma.employee.findFirst.mockResolvedValue({ managedDepartment: { id: managerDeptId } } as any);
      prisma.$transaction.mockResolvedValue([[mockOffSiteRecord], 1] as any);

      await service.findAll({ page: 1, limit: 20 }, { id: managerUserId, role: 'MANAGER' });

      expect(capturedWhere().employee).toEqual({ departmentId: managerDeptId });
    });

    it('keeps existing filters (status) alongside the MANAGER department scope', async () => {
      prisma.employee.findFirst.mockResolvedValue({ managedDepartment: { id: managerDeptId } } as any);
      prisma.$transaction.mockResolvedValue([[mockOffSiteRecord], 1] as any);

      await service.findAll({ page: 1, limit: 20, status: 'PENDING' } as any, { id: managerUserId, role: 'MANAGER' });

      const where = capturedWhere();
      expect(where.status).toBe('PENDING');
      expect(where.employee).toEqual({ departmentId: managerDeptId });
    });

    it('does not let a client-supplied employeeId widen MANAGER scope beyond their department', async () => {
      prisma.employee.findFirst.mockResolvedValue({ managedDepartment: { id: managerDeptId } } as any);
      prisma.$transaction.mockResolvedValue([[], 0] as any);

      await service.findAll(
        { page: 1, limit: 20, employeeId: 'outside-dept-emp-uuid' } as any,
        { id: managerUserId, role: 'MANAGER' },
      );

      const where = capturedWhere();
      expect(where.employeeId).toBe('outside-dept-emp-uuid');
      expect(where.employee).toEqual({ departmentId: managerDeptId });
    });

    it('returns an empty page without querying off-site requests when MANAGER has no managed department', async () => {
      prisma.employee.findFirst.mockResolvedValue({ managedDepartment: null } as any);

      const result = await service.findAll({ page: 1, limit: 20 }, { id: managerUserId, role: 'MANAGER' });

      expect(result).toEqual({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('leaves SUPER_ADMIN results unscoped (no department filter, no employee lookup)', async () => {
      prisma.$transaction.mockResolvedValue([[mockOffSiteRecord], 1] as any);

      await service.findAll({ page: 1, limit: 20 }, { id: 'admin-user-uuid', role: 'SUPER_ADMIN' });

      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
      expect(capturedWhere().employee).toBeUndefined();
    });

    it('leaves HR_ADMIN results unscoped (no department filter, no employee lookup)', async () => {
      prisma.$transaction.mockResolvedValue([[mockOffSiteRecord], 1] as any);

      await service.findAll({ page: 1, limit: 20 }, { id: 'hr-user-uuid', role: 'HR_ADMIN' });

      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
      expect(capturedWhere().employee).toBeUndefined();
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the record to an admin without ownership check', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(mockOffSiteRecord as any);

      const result = await service.findOne(offSiteId, userId, 'SUPER_ADMIN');

      expect(result).toMatchObject({ id: offSiteId });
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('returns the record to HR_ADMIN without ownership check', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(mockOffSiteRecord as any);

      const result = await service.findOne(offSiteId, userId, 'HR_ADMIN');

      expect(result).toMatchObject({ id: offSiteId });
    });

    // ── MANAGER department scoping (SEC-OFFSITE-001) ──────────────────────────

    it('MANAGER reads a same-department subordinate\'s off-site detail', async () => {
      const record = {
        ...mockOffSiteRecord,
        employee: { ...mockOffSiteRecord.employee, id: employeeId, department: { id: 'dept-uuid-1', name: 'Eng' } },
      };
      prisma.offSiteRequest.findUnique.mockResolvedValue(record as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: { id: 'dept-uuid-1' } } as any);

      const result = await service.findOne(offSiteId, userId, 'MANAGER');

      expect(result).toMatchObject({ id: offSiteId });
    });

    it('MANAGER reading an outside-department off-site detail throws ForbiddenException', async () => {
      const record = {
        ...mockOffSiteRecord,
        employee: { ...mockOffSiteRecord.employee, id: employeeId, department: { id: 'dept-uuid-OTHER', name: 'Sales' } },
      };
      prisma.offSiteRequest.findUnique.mockResolvedValue(record as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: { id: 'dept-uuid-1' } } as any);

      await expect(service.findOne(offSiteId, userId, 'MANAGER')).rejects.toThrow(ForbiddenException);
    });

    it('MANAGER reading their own off-site detail through this route throws ForbiddenException', async () => {
      const record = {
        ...mockOffSiteRecord,
        employee: { ...mockOffSiteRecord.employee, id: 'manager-emp-uuid', department: { id: 'dept-uuid-1', name: 'Eng' } },
      };
      prisma.offSiteRequest.findUnique.mockResolvedValue(record as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: { id: 'dept-uuid-1' } } as any);

      await expect(service.findOne(offSiteId, userId, 'MANAGER')).rejects.toThrow(ForbiddenException);
    });

    it('MANAGER with no managed department cannot read any off-site detail', async () => {
      const record = {
        ...mockOffSiteRecord,
        employee: { ...mockOffSiteRecord.employee, id: employeeId, department: { id: 'dept-uuid-1', name: 'Eng' } },
      };
      prisma.offSiteRequest.findUnique.mockResolvedValue(record as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: null } as any);

      await expect(service.findOne(offSiteId, userId, 'MANAGER')).rejects.toThrow(ForbiddenException);
    });

    it('allows an employee to view their own off-site request', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(mockOffSiteRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });

      const result = await service.findOne(offSiteId, userId, 'EMPLOYEE');

      expect(result).toMatchObject({ id: offSiteId });
    });

    it('throws ForbiddenException when employee tries to view another employee\'s record', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(mockOffSiteRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'other-emp-uuid' });

      await expect(service.findOne(offSiteId, userId, 'EMPLOYEE')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when off-site request does not exist', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', userId, 'SUPER_ADMIN')).rejects.toThrow(NotFoundException);
    });
  });

  // ── approve ────────────────────────────────────────────────────────────────

  describe('approve', () => {
    const pendingRecord = { ...mockOffSiteRecord, status: 'PENDING' };

    it('approves a PENDING request', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.offSiteRequest.update.mockResolvedValue({ ...mockOffSiteRecord, status: 'APPROVED' } as any);

      const result = await service.approve(offSiteId, userId, 'HR_ADMIN', {} as any);

      expect(result.status).toBe('APPROVED');
    });

    it('throws NotFoundException when off-site request does not exist', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(null);

      await expect(service.approve('missing', userId, 'HR_ADMIN', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for non-PENDING requests', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue({ ...pendingRecord, status: 'APPROVED' } as any);

      await expect(service.approve(offSiteId, userId, 'HR_ADMIN', {} as any)).rejects.toThrow(BadRequestException);
    });

    // ── MANAGER approve scope + self-approval (SEC-OFFSITE-001) ───────────────

    it('MANAGER approves a same-department subordinate\'s off-site request', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: { id: 'dept-uuid-1' } } as any);
      prisma.employee.findUnique.mockResolvedValue({ departmentId: 'dept-uuid-1' } as any);
      prisma.offSiteRequest.update.mockResolvedValue({ ...mockOffSiteRecord, status: 'APPROVED' } as any);

      const result = await service.approve(offSiteId, userId, 'MANAGER', {} as any);

      expect(result.status).toBe('APPROVED');
    });

    it('MANAGER approving an outside-department employee\'s off-site request throws ForbiddenException', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: { id: 'dept-uuid-1' } } as any);
      prisma.employee.findUnique.mockResolvedValue({ departmentId: 'dept-uuid-OTHER' } as any);

      await expect(service.approve(offSiteId, userId, 'MANAGER', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('MANAGER approving their own off-site request throws ForbiddenException', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId, managedDepartment: { id: 'dept-uuid-1' } } as any);
      prisma.employee.findUnique.mockResolvedValue({ departmentId: 'dept-uuid-1' } as any);

      await expect(service.approve(offSiteId, userId, 'MANAGER', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('MANAGER with no managed department cannot approve', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: null } as any);

      await expect(service.approve(offSiteId, userId, 'MANAGER', {} as any)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── reject ─────────────────────────────────────────────────────────────────

  describe('reject', () => {
    const pendingRecord = { ...mockOffSiteRecord, status: 'PENDING' };

    it('rejects a PENDING request and sets status to REJECTED', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.offSiteRequest.update.mockResolvedValue({ ...mockOffSiteRecord, status: 'REJECTED' } as any);

      const result = await service.reject(offSiteId, userId, 'HR_ADMIN', {} as any);

      expect(result.status).toBe('REJECTED');
    });

    it('throws NotFoundException when off-site request does not exist', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(null);

      await expect(service.reject('missing', userId, 'HR_ADMIN', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for non-PENDING requests', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue({ ...pendingRecord, status: 'APPROVED' } as any);

      await expect(service.reject(offSiteId, userId, 'HR_ADMIN', {} as any)).rejects.toThrow(BadRequestException);
    });

    // ── MANAGER reject scope + self-rejection (SEC-OFFSITE-001) ───────────────

    it('MANAGER rejects a same-department subordinate\'s off-site request', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: { id: 'dept-uuid-1' } } as any);
      prisma.employee.findUnique.mockResolvedValue({ departmentId: 'dept-uuid-1' } as any);
      prisma.offSiteRequest.update.mockResolvedValue({ ...mockOffSiteRecord, status: 'REJECTED' } as any);

      const result = await service.reject(offSiteId, userId, 'MANAGER', {} as any);

      expect(result.status).toBe('REJECTED');
    });

    it('MANAGER rejecting an outside-department employee\'s off-site request throws ForbiddenException', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: { id: 'dept-uuid-1' } } as any);
      prisma.employee.findUnique.mockResolvedValue({ departmentId: 'dept-uuid-OTHER' } as any);

      await expect(service.reject(offSiteId, userId, 'MANAGER', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('MANAGER rejecting their own off-site request throws ForbiddenException', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId, managedDepartment: { id: 'dept-uuid-1' } } as any);
      prisma.employee.findUnique.mockResolvedValue({ departmentId: 'dept-uuid-1' } as any);

      await expect(service.reject(offSiteId, userId, 'MANAGER', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('MANAGER with no managed department cannot reject', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue(pendingRecord as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'manager-emp-uuid', managedDepartment: null } as any);

      await expect(service.reject(offSiteId, userId, 'MANAGER', {} as any)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── audit: approve/reject best-effort ────────────────────────────────────────

  describe('audit logging', () => {
    it('records OFFSITE_APPROVED after successful approval', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue({ ...mockOffSiteRecord, status: 'PENDING' } as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.offSiteRequest.update.mockResolvedValue({ ...mockOffSiteRecord, status: 'APPROVED' } as any);

      await service.approve(offSiteId, userId, 'HR_ADMIN', {} as any, { actorUserId: 'actor-uuid', actorRole: 'HR_ADMIN' });

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OFFSITE_APPROVED', result: 'SUCCESS' }),
      );
    });

    it('still approves when audit write fails (best-effort)', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue({ ...mockOffSiteRecord, status: 'PENDING' } as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.offSiteRequest.update.mockResolvedValue({ ...mockOffSiteRecord, status: 'APPROVED' } as any);
      mockAuditLog.record.mockRejectedValueOnce(new Error('DB down'));

      const result = await service.approve(offSiteId, userId, 'HR_ADMIN', {} as any);

      expect(result.status).toBe('APPROVED');
    });

    it('metadata does not contain the raw reason text', async () => {
      prisma.offSiteRequest.findUnique.mockResolvedValue({ ...mockOffSiteRecord, status: 'PENDING', reason: 'sensitive location note' } as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'approver-emp-uuid' });
      prisma.offSiteRequest.update.mockResolvedValue({ ...mockOffSiteRecord, status: 'APPROVED' } as any);

      await service.approve(offSiteId, userId, 'HR_ADMIN', {} as any);

      const call = mockAuditLog.record.mock.calls[0][0];
      const metadataValues = Object.values(call.metadata ?? {});
      expect(metadataValues).not.toContain('sensitive location note');
    });
  });
});
