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
});
