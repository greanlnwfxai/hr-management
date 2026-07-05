import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceNonceService } from './attendance-nonce.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';
import { AttendanceNonceAction } from '../common/enums';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findFirst: jest.Mock };
  attendanceNonce: { create: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock };
};

describe('AttendanceNonceService', () => {
  let service: AttendanceNonceService;
  let prisma: PrismaMock;

  const userId = 'user-uuid-1';
  const employeeId = 'emp-uuid-1';

  beforeEach(async () => {
    prisma = mockPrisma() as PrismaMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceNonceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AttendanceNonceService>(AttendanceNonceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('issueNonce', () => {
    it('issues a nonce bound to the employee when one is linked to the user', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendanceNonce.create.mockResolvedValue({} as any);

      const result = await service.issueNonce(userId, AttendanceNonceAction.CLOCK_IN);

      expect(result.action).toBe(AttendanceNonceAction.CLOCK_IN);
      expect(typeof result.nonce).toBe('string');
      expect(result.nonce.length).toBeGreaterThanOrEqual(32);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(prisma.attendanceNonce.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            employeeId,
            action: AttendanceNonceAction.CLOCK_IN,
          }),
        }),
      );
    });

    it('issues a nonce with employeeId null when no Employee is linked to the user', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendanceNonce.create.mockResolvedValue({} as any);

      await service.issueNonce(userId, AttendanceNonceAction.CLOCK_OUT);

      expect(prisma.attendanceNonce.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ employeeId: null }),
        }),
      );
    });

    it('never persists the raw nonce value — only a hash', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendanceNonce.create.mockResolvedValue({} as any);

      const result = await service.issueNonce(userId, AttendanceNonceAction.CLOCK_IN);

      const createArgs = prisma.attendanceNonce.create.mock.calls[0][0];
      expect(createArgs.data).not.toHaveProperty('nonce');
      expect(createArgs.data.tokenHash).toBeDefined();
      expect(createArgs.data.tokenHash).not.toBe(result.nonce);
      expect(JSON.stringify(createArgs.data)).not.toContain(result.nonce);
    });

    it('generates a different nonce on every call', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: employeeId });
      prisma.attendanceNonce.create.mockResolvedValue({} as any);

      const first = await service.issueNonce(userId, AttendanceNonceAction.CLOCK_IN);
      const second = await service.issueNonce(userId, AttendanceNonceAction.CLOCK_IN);

      expect(first.nonce).not.toBe(second.nonce);
    });
  });

  describe('consumeNonce', () => {
    it('succeeds and atomically marks the nonce consumed when valid', async () => {
      prisma.attendanceNonce.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'raw-nonce-value');

      expect(result).toEqual({ ok: true });
      expect(prisma.attendanceNonce.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            action: AttendanceNonceAction.CLOCK_IN,
            consumedAt: null,
          }),
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
      // Diagnostic-only fallback lookup must not run on the success path.
      expect(prisma.attendanceNonce.findUnique).not.toHaveBeenCalled();
    });

    it('never sends the raw nonce to the database — only its hash', async () => {
      prisma.attendanceNonce.updateMany.mockResolvedValue({ count: 1 } as any);

      await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'super-secret-raw-nonce');

      const call = prisma.attendanceNonce.updateMany.mock.calls[0][0];
      expect(JSON.stringify(call)).not.toContain('super-secret-raw-nonce');
      expect(call.where.tokenHash).toBeDefined();
    });

    it('rejects with NONCE_INVALID when the nonce was never issued', async () => {
      prisma.attendanceNonce.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.attendanceNonce.findUnique.mockResolvedValue(null);

      const result = await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'never-issued');

      expect(result).toEqual({ ok: false, reason: 'NONCE_INVALID' });
    });

    it('rejects with NONCE_EXPIRED for a present-but-expired nonce', async () => {
      prisma.attendanceNonce.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.attendanceNonce.findUnique.mockResolvedValue({
        userId,
        action: AttendanceNonceAction.CLOCK_IN,
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      } as any);

      const result = await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'expired-nonce');

      expect(result).toEqual({ ok: false, reason: 'NONCE_EXPIRED' });
    });

    it('rejects with NONCE_REUSED for an already-consumed nonce', async () => {
      prisma.attendanceNonce.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.attendanceNonce.findUnique.mockResolvedValue({
        userId,
        action: AttendanceNonceAction.CLOCK_IN,
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
      } as any);

      const result = await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'reused-nonce');

      expect(result).toEqual({ ok: false, reason: 'NONCE_REUSED' });
    });

    it('rejects with NONCE_ACTION_MISMATCH when the nonce was issued for a different action', async () => {
      prisma.attendanceNonce.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.attendanceNonce.findUnique.mockResolvedValue({
        userId,
        action: AttendanceNonceAction.CLOCK_OUT,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
      } as any);

      const result = await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'wrong-action-nonce');

      expect(result).toEqual({ ok: false, reason: 'NONCE_ACTION_MISMATCH' });
    });

    it('rejects with NONCE_USER_MISMATCH when the nonce belongs to a different user', async () => {
      prisma.attendanceNonce.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.attendanceNonce.findUnique.mockResolvedValue({
        userId: 'another-user-uuid',
        action: AttendanceNonceAction.CLOCK_IN,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
      } as any);

      const result = await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'someone-elses-nonce');

      expect(result).toEqual({ ok: false, reason: 'NONCE_USER_MISMATCH' });
    });

    it('rejects a second consumption attempt with the same nonce (replay) even without a stored row change', async () => {
      // Simulates the race-safe path: the first call's atomic update flips
      // consumedAt, so a second call with the same raw nonce sees count === 0.
      prisma.attendanceNonce.updateMany
        .mockResolvedValueOnce({ count: 1 } as any)
        .mockResolvedValueOnce({ count: 0 } as any);
      prisma.attendanceNonce.findUnique.mockResolvedValue({
        userId,
        action: AttendanceNonceAction.CLOCK_IN,
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
      } as any);

      const first = await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'same-nonce');
      const second = await service.consumeNonce(userId, AttendanceNonceAction.CLOCK_IN, 'same-nonce');

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: false, reason: 'NONCE_REUSED' });
    });
  });
});
