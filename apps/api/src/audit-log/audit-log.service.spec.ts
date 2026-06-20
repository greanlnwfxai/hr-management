import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: ReturnType<typeof mockPrisma>;

  const baseEvent = {
    action: 'AUTH_LOGIN_SUCCESS',
    targetType: 'AUTH',
    result: 'SUCCESS',
  };

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── record: required fields ─────────────────────────────────────────────────

  describe('record', () => {
    it('creates an audit log with required fields', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record(baseEvent);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AUTH_LOGIN_SUCCESS',
            targetType: 'AUTH',
            result: 'SUCCESS',
          }),
        }),
      );
    });

    it('creates an audit log with optional actor and target fields', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        actorUserId: 'user-uuid-1',
        actorRole: 'HR_ADMIN',
        targetId: 'target-uuid-1',
        targetLabel: 'john.doe',
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.actorUserId).toBe('user-uuid-1');
      expect(data.actorRole).toBe('HR_ADMIN');
      expect(data.targetId).toBe('target-uuid-1');
      expect(data.targetLabel).toBe('john.doe');
    });

    it('creates an audit log with null optional fields when not provided', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record(baseEvent);

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.actorUserId).toBeNull();
      expect(data.actorRole).toBeNull();
      expect(data.targetId).toBeNull();
      expect(data.targetLabel).toBeNull();
      expect(data.ipAddress).toBeNull();
      expect(data.userAgent).toBeNull();
    });

    it('creates an audit log with no metadata when metadata is absent', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record(baseEvent);

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('metadata');
    });

    it('creates an audit log with no metadata when metadata is null', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({ ...baseEvent, metadata: null });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('metadata');
    });

    it('passes action, result, and targetType through correctly', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        action: 'LEAVE_REQUEST_APPROVED',
        targetType: 'LEAVE_REQUEST',
        result: 'SUCCESS',
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.action).toBe('LEAVE_REQUEST_APPROVED');
      expect(data.targetType).toBe('LEAVE_REQUEST');
      expect(data.result).toBe('SUCCESS');
    });

    it('includes ip address and user agent when provided', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.ipAddress).toBe('192.168.1.1');
      expect(data.userAgent).toBe('Mozilla/5.0');
    });
  });

  // ── metadata sanitization ───────────────────────────────────────────────────

  describe('metadata sanitization', () => {
    it('preserves safe metadata fields', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: { leaveType: 'SICK', reason: 'medical', days: 3 },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata).toEqual({ leaveType: 'SICK', reason: 'medical', days: 3 });
    });

    it('redacts password key from metadata', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: { username: 'john', password: 'secret123' },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata).not.toHaveProperty('password', 'secret123');
      expect(data.metadata.password).toBe('[REDACTED]');
      expect(data.metadata.username).toBe('john');
    });

    it('redacts token key from metadata', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: { userId: 'u1', token: 'eyJhb...' },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata.token).toBe('[REDACTED]');
      expect(data.metadata.userId).toBe('u1');
    });

    it('redacts accessToken from metadata', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: { accessToken: 'eyJhb...' },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata.accessToken).toBe('[REDACTED]');
    });

    it('redacts refreshToken from metadata', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: { refreshToken: 'abc123' },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata.refreshToken).toBe('[REDACTED]');
    });

    it('redacts temporaryPassword from metadata', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: { temporaryPassword: 'Temp@1234' },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata.temporaryPassword).toBe('[REDACTED]');
    });

    it('redacts nested sensitive keys in metadata', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: {
          context: { password: 'should-be-gone', safeKey: 'keep-me' },
          topLevel: 'ok',
        },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata.context.password).toBe('[REDACTED]');
      expect(data.metadata.context.safeKey).toBe('keep-me');
      expect(data.metadata.topLevel).toBe('ok');
    });

    it('redacts sensitive keys inside arrays of objects', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: {
          items: [
            { id: '1', token: 'tok-abc' },
            { id: '2', safeField: 'value' },
          ],
        },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata.items[0].token).toBe('[REDACTED]');
      expect(data.metadata.items[0].id).toBe('1');
      expect(data.metadata.items[1].safeField).toBe('value');
    });

    it('does not mutate the original metadata input', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      const original = { password: 'secret', safe: 'data' };
      await service.record({ ...baseEvent, metadata: original });

      expect(original.password).toBe('secret');
    });

    it('handles case-insensitive sensitive key matching', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: { Authorization: 'Bearer token123' },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata.Authorization).toBe('[REDACTED]');
    });

    it('handles metadata with only null/undefined values safely', async () => {
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.record({
        ...baseEvent,
        metadata: { reason: null, note: undefined },
      });

      const { data } = prisma.auditLog.create.mock.calls[0][0];
      expect(data.metadata.reason).toBeNull();
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    const mockRows = [{ id: 'log-1', action: 'AUTH_LOGIN_SUCCESS' }];

    it('uses default page 1 and limit 20 when not provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({});

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('applies page and limit to skip and take', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ page: 3, limit: 10 });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(20);
      expect(call.take).toBe(10);
    });

    it('orders results by createdAt descending', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({});

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('filters by action when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ action: 'AUTH_LOGIN_SUCCESS' });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.action).toBe('AUTH_LOGIN_SUCCESS');
    });

    it('filters by targetType when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ targetType: 'EMPLOYEE' });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.targetType).toBe('EMPLOYEE');
    });

    it('filters by targetId when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ targetId: 'emp-uuid-1' });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.targetId).toBe('emp-uuid-1');
    });

    it('filters by actorUserId when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ actorUserId: 'user-uuid-1' });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.actorUserId).toBe('user-uuid-1');
    });

    it('filters by actorRole when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ actorRole: 'HR_ADMIN' });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.actorRole).toBe('HR_ADMIN');
    });

    it('filters by result when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ result: 'SUCCESS' });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.result).toBe('SUCCESS');
    });

    it('filters by dateFrom as createdAt gte', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ dateFrom: '2026-01-01' });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.createdAt).toEqual({ gte: new Date('2026-01-01') });
    });

    it('filters by dateTo as createdAt lte', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({ dateTo: '2026-06-30' });

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.createdAt).toEqual({ lte: new Date('2026-06-30') });
    });

    it('returns data and meta with total, page, limit, and totalPages', async () => {
      prisma.$transaction.mockResolvedValue([mockRows, 45]);

      const result = await service.findAll({ page: 2, limit: 20 });

      expect(result.data).toEqual(mockRows);
      expect(result.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
    });

    it('omits unset filter fields from the where clause', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({});

      const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).not.toHaveProperty('action');
      expect(call.where).not.toHaveProperty('targetType');
      expect(call.where).not.toHaveProperty('createdAt');
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the audit log record when found', async () => {
      const mockRecord = { id: 'log-uuid-1', action: 'AUTH_LOGIN_SUCCESS' };
      (prisma.auditLog.findUnique as jest.Mock).mockResolvedValue(mockRecord);

      const result = await service.findOne('log-uuid-1');

      expect(prisma.auditLog.findUnique).toHaveBeenCalledWith({ where: { id: 'log-uuid-1' } });
      expect(result).toEqual(mockRecord);
    });

    it('throws NotFoundException when the record does not exist', async () => {
      (prisma.auditLog.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow('AuditLog missing-id not found');
    });
  });
});
