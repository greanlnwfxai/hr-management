import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeMetadata } from './audit-log.sanitizer';
import { AuditLogEvent } from './audit-log.types';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditLogEvent): Promise<void> {
    const sanitized = sanitizeMetadata(event.metadata);

    const data: Prisma.AuditLogCreateInput = {
      actorUserId: event.actorUserId ?? null,
      actorRole: event.actorRole ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId ?? null,
      targetLabel: event.targetLabel ?? null,
      result: event.result,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      ...(sanitized !== null ? { metadata: sanitized as Prisma.InputJsonValue } : {}),
    };

    await this.prisma.auditLog.create({ data });
  }
}
