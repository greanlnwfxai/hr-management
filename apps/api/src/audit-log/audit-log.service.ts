import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeMetadata } from './audit-log.sanitizer';
import { AuditLogEvent } from './audit-log.types';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

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

  async findAll(query: QueryAuditLogDto) {
    const {
      page = 1,
      limit = 20,
      action,
      targetType,
      targetId,
      actorUserId,
      actorRole,
      result,
      dateFrom,
      dateTo,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(action && { action }),
      ...(targetType && { targetType }),
      ...(targetId && { targetId }),
      ...(actorUserId && { actorUserId }),
      ...(actorRole && { actorRole }),
      ...(result && { result }),
      ...((dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const record = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`AuditLog ${id} not found`);
    return record;
  }
}
