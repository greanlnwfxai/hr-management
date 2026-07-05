import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { AttendanceNonceAction as PrismaAttendanceNonceAction } from '@prisma/client';
import { AttendanceNonceAction } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

// SEC-ATT-004: server-issued, single-use replay-protection nonce.
// Short-lived on purpose — long enough to cover a cold-start GPS fix (the
// mobile client fetches the nonce right before submitting, after location is
// already acquired), short enough to keep the reuse/theft window small.
const NONCE_TTL_SECONDS = 300;

export type NonceConsumeResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'NONCE_INVALID'
        | 'NONCE_EXPIRED'
        | 'NONCE_REUSED'
        | 'NONCE_ACTION_MISMATCH'
        | 'NONCE_USER_MISMATCH';
    };

@Injectable()
export class AttendanceNonceService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(rawNonce: string): string {
    return createHash('sha256').update(rawNonce).digest('hex');
  }

  async issueNonce(
    userId: string,
    action: AttendanceNonceAction,
  ): Promise<{ nonce: string; expiresAt: Date; action: AttendanceNonceAction }> {
    // Employee binding is best-effort ("employee if available" per spec) — a user
    // with no linked Employee record can still be issued a nonce; the follow-up
    // clock request will fail its own requireEmployeeId() check regardless.
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true },
    });

    const rawNonce = randomBytes(32).toString('hex');
    const tokenHash = this.hash(rawNonce);
    const expiresAt = new Date(Date.now() + NONCE_TTL_SECONDS * 1000);

    await this.prisma.attendanceNonce.create({
      data: {
        tokenHash,
        userId,
        employeeId: employee?.id ?? null,
        action: action as unknown as PrismaAttendanceNonceAction,
        expiresAt,
      },
    });

    return { nonce: rawNonce, expiresAt, action };
  }

  // Atomic single-use consumption: the conditional updateMany() is the actual
  // security gate (only one concurrent caller can flip consumedAt from null),
  // not the diagnostic lookup below it. If two requests race with the same
  // valid nonce, exactly one succeeds; the other observes count === 0 and is
  // classified as NONCE_REUSED by the fallback read.
  async consumeNonce(
    userId: string,
    action: AttendanceNonceAction,
    rawNonce: string,
  ): Promise<NonceConsumeResult> {
    const tokenHash = this.hash(rawNonce);
    const now = new Date();

    const consumed = await this.prisma.attendanceNonce.updateMany({
      where: {
        tokenHash,
        userId,
        action: action as unknown as PrismaAttendanceNonceAction,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (consumed.count === 1) return { ok: true };

    // Diagnostic-only lookup: never re-decides enforcement, only classifies
    // *why* the atomic update above matched zero rows, for the audit reason code.
    const row = await this.prisma.attendanceNonce.findUnique({ where: { tokenHash } });

    if (!row) return { ok: false, reason: 'NONCE_INVALID' };
    if (row.userId !== userId) return { ok: false, reason: 'NONCE_USER_MISMATCH' };
    if ((row.action as unknown as string) !== action) return { ok: false, reason: 'NONCE_ACTION_MISMATCH' };
    if (row.consumedAt !== null) return { ok: false, reason: 'NONCE_REUSED' };
    if (row.expiresAt <= now) return { ok: false, reason: 'NONCE_EXPIRED' };

    // Unreachable in practice (every disqualifying condition above is covered),
    // but keeps the function total rather than throwing on an unmodeled state.
    return { ok: false, reason: 'NONCE_INVALID' };
  }
}
