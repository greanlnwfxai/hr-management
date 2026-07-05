import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceRiskReviewService } from './attendance-risk-review.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';
import {
  AttendanceNonceAction,
  AttendanceRiskLevel,
  AttendanceRiskReasonCode,
  AttendanceRiskResult,
  AttendanceRiskReviewStatus,
} from '../common/enums';

type PrismaMock = ReturnType<typeof mockPrisma> & {
  employee: { findFirst: jest.Mock };
  attendanceRiskReview: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('AttendanceRiskReviewService', () => {
  let service: AttendanceRiskReviewService;
  let prisma: PrismaMock;

  const employeeId = 'emp-uuid-1';
  const userId = 'user-uuid-1';

  beforeEach(async () => {
    prisma = mockPrisma() as PrismaMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceRiskReviewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AttendanceRiskReviewService>(AttendanceRiskReviewService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── scoreRisk ────────────────────────────────────────────────────────────

  describe('scoreRisk', () => {
    it('scores LOW for a rollout-compatibility signal', () => {
      expect(service.scoreRisk([AttendanceRiskReasonCode.NONCE_MISSING_ALLOWED])).toBe(AttendanceRiskLevel.LOW);
      expect(service.scoreRisk([AttendanceRiskReasonCode.DEVICE_INTEGRITY_UNAVAILABLE])).toBe(AttendanceRiskLevel.LOW);
    });

    it('scores MEDIUM for a missing capturedAt / low-accuracy / geofence-edge signal', () => {
      expect(service.scoreRisk([AttendanceRiskReasonCode.MISSING_CAPTURED_AT])).toBe(AttendanceRiskLevel.MEDIUM);
      expect(service.scoreRisk([AttendanceRiskReasonCode.LOW_LOCATION_ACCURACY])).toBe(AttendanceRiskLevel.MEDIUM);
      expect(service.scoreRisk([AttendanceRiskReasonCode.GEOFENCE_EDGE_CASE])).toBe(AttendanceRiskLevel.MEDIUM);
    });

    it('scores HIGH for stale/future location and invalid/expired nonce', () => {
      expect(service.scoreRisk([AttendanceRiskReasonCode.STALE_LOCATION])).toBe(AttendanceRiskLevel.HIGH);
      expect(service.scoreRisk([AttendanceRiskReasonCode.FUTURE_LOCATION])).toBe(AttendanceRiskLevel.HIGH);
      expect(service.scoreRisk([AttendanceRiskReasonCode.NONCE_INVALID])).toBe(AttendanceRiskLevel.HIGH);
      expect(service.scoreRisk([AttendanceRiskReasonCode.NONCE_EXPIRED])).toBe(AttendanceRiskLevel.HIGH);
      expect(service.scoreRisk([AttendanceRiskReasonCode.GEOFENCE_REJECTED])).toBe(AttendanceRiskLevel.HIGH);
    });

    it('scores CRITICAL for a reused nonce or mock/simulated location', () => {
      expect(service.scoreRisk([AttendanceRiskReasonCode.NONCE_REUSED])).toBe(AttendanceRiskLevel.CRITICAL);
      expect(service.scoreRisk([AttendanceRiskReasonCode.MOCK_LOCATION_DETECTED])).toBe(AttendanceRiskLevel.CRITICAL);
      expect(service.scoreRisk([AttendanceRiskReasonCode.SIMULATED_LOCATION_DETECTED])).toBe(AttendanceRiskLevel.CRITICAL);
    });

    it('takes the highest severity when multiple reason codes are present', () => {
      const level = service.scoreRisk([
        AttendanceRiskReasonCode.NONCE_MISSING_ALLOWED, // LOW
        AttendanceRiskReasonCode.MOCK_LOCATION_DETECTED, // CRITICAL
      ]);
      expect(level).toBe(AttendanceRiskLevel.CRITICAL);
    });

    it('defaults to LOW for an empty reason-code list', () => {
      expect(service.scoreRisk([])).toBe(AttendanceRiskLevel.LOW);
    });
  });

  // ── recordReview ─────────────────────────────────────────────────────────

  describe('recordReview', () => {
    it('creates a row with the derived risk level and given reason codes', async () => {
      prisma.attendanceRiskReview.create.mockResolvedValue({} as any);

      await service.recordReview({
        employeeId,
        userId,
        action: AttendanceNonceAction.CLOCK_IN,
        result: AttendanceRiskResult.REJECTED,
        reasonCodes: [AttendanceRiskReasonCode.MOCK_LOCATION_DETECTED],
        source: 'mobile',
        platform: 'android',
        metadata: { attemptType: 'CLOCK_IN' },
      });

      expect(prisma.attendanceRiskReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId,
            userId,
            action: AttendanceNonceAction.CLOCK_IN,
            result: AttendanceRiskResult.REJECTED,
            riskLevel: AttendanceRiskLevel.CRITICAL,
            reasonCodes: [AttendanceRiskReasonCode.MOCK_LOCATION_DETECTED],
            source: 'mobile',
            platform: 'android',
          }),
        }),
      );
    });

    it('never persists raw GPS coordinates in metadataJson', async () => {
      prisma.attendanceRiskReview.create.mockResolvedValue({} as any);

      await service.recordReview({
        employeeId,
        action: AttendanceNonceAction.CLOCK_IN,
        result: AttendanceRiskResult.REJECTED,
        reasonCodes: [AttendanceRiskReasonCode.STALE_LOCATION],
        metadata: { latitude: 13.7563, longitude: 100.5018, accuracy: 12, attemptType: 'CLOCK_IN' },
      });

      const createArgs = prisma.attendanceRiskReview.create.mock.calls[0][0];
      expect(createArgs.data.metadataJson.latitude).toBe('[REDACTED]');
      expect(createArgs.data.metadataJson.longitude).toBe('[REDACTED]');
      expect(createArgs.data.metadataJson.accuracy).toBe('[REDACTED]');
      expect(JSON.stringify(createArgs.data.metadataJson)).not.toContain('13.7563');
      expect(JSON.stringify(createArgs.data.metadataJson)).not.toContain('100.5018');
    });

    it('never persists a raw nonce value in metadataJson', async () => {
      prisma.attendanceRiskReview.create.mockResolvedValue({} as any);

      await service.recordReview({
        employeeId,
        action: AttendanceNonceAction.CLOCK_IN,
        result: AttendanceRiskResult.REJECTED,
        reasonCodes: [AttendanceRiskReasonCode.NONCE_REUSED],
        metadata: { nonce: 'super-secret-raw-nonce-value', attemptType: 'CLOCK_IN' },
      });

      const createArgs = prisma.attendanceRiskReview.create.mock.calls[0][0];
      expect(createArgs.data.metadataJson.nonce).toBe('[REDACTED]');
      expect(JSON.stringify(createArgs.data)).not.toContain('super-secret-raw-nonce-value');
    });

    it('defaults employeeId/attendanceId/userId to null when omitted', async () => {
      prisma.attendanceRiskReview.create.mockResolvedValue({} as any);

      await service.recordReview({
        action: AttendanceNonceAction.CLOCK_OUT,
        result: AttendanceRiskResult.FLAGGED,
        reasonCodes: [AttendanceRiskReasonCode.MISSING_CAPTURED_AT],
      });

      expect(prisma.attendanceRiskReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ employeeId: null, attendanceId: null, userId: null }),
        }),
      );
    });
  });

  // ── findAll / findOne ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('paginates and filters by employeeId/riskLevel/status', async () => {
      prisma.$transaction.mockResolvedValue([[{ id: 'risk-1' }], 1]);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        employeeId,
        riskLevel: AttendanceRiskLevel.HIGH,
        status: AttendanceRiskReviewStatus.PENDING,
      } as any);

      expect(result).toEqual({ data: [{ id: 'risk-1' }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
    });
  });

  describe('findOne', () => {
    it('returns the record when found', async () => {
      prisma.attendanceRiskReview.findUnique.mockResolvedValue({ id: 'risk-1' } as any);

      const result = await service.findOne('risk-1');
      expect(result).toEqual({ id: 'risk-1' });
    });

    it('throws NotFoundException when the record does not exist', async () => {
      prisma.attendanceRiskReview.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── review / setStatus ───────────────────────────────────────────────────

  describe('review', () => {
    it('updates status, reviewNote, reviewedAt, and resolves reviewedById from userId', async () => {
      prisma.attendanceRiskReview.findUnique.mockResolvedValue({ id: 'risk-1' } as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'reviewer-emp-1' });
      prisma.attendanceRiskReview.update.mockResolvedValue({ id: 'risk-1', status: 'REVIEWED' } as any);

      await service.review('risk-1', { status: AttendanceRiskReviewStatus.REVIEWED, reviewNote: 'Checked' }, userId);

      expect(prisma.attendanceRiskReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'risk-1' },
          data: expect.objectContaining({
            status: AttendanceRiskReviewStatus.REVIEWED,
            reviewedAt: expect.any(Date),
            reviewedById: 'reviewer-emp-1',
            reviewNote: 'Checked',
          }),
        }),
      );
    });

    it('still updates status when the reviewer has no linked Employee record', async () => {
      prisma.attendanceRiskReview.findUnique.mockResolvedValue({ id: 'risk-1' } as any);
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.attendanceRiskReview.update.mockResolvedValue({ id: 'risk-1', status: 'IGNORED' } as any);

      await service.review('risk-1', { status: AttendanceRiskReviewStatus.IGNORED }, userId);

      const updateArgs = prisma.attendanceRiskReview.update.mock.calls[0][0];
      expect(updateArgs.data).not.toHaveProperty('reviewedById');
    });

    it('throws NotFoundException when the risk review row does not exist', async () => {
      prisma.attendanceRiskReview.findUnique.mockResolvedValue(null);

      await expect(
        service.review('missing-id', { status: AttendanceRiskReviewStatus.APPROVED }, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setStatus', () => {
    it('delegates to review() with the given fixed status', async () => {
      prisma.attendanceRiskReview.findUnique.mockResolvedValue({ id: 'risk-1' } as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'reviewer-emp-1' });
      prisma.attendanceRiskReview.update.mockResolvedValue({ id: 'risk-1', status: 'APPROVED' } as any);

      await service.setStatus('risk-1', AttendanceRiskReviewStatus.APPROVED, 'Confirmed', userId);

      expect(prisma.attendanceRiskReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AttendanceRiskReviewStatus.APPROVED, reviewNote: 'Confirmed' }),
        }),
      );
    });
  });
});
