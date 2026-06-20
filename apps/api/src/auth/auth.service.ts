import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditLogEvent } from '../audit-log/audit-log.types';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

export interface AuditRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private auditLog: AuditLogService,
  ) {}

  async login(dto: LoginDto, ctx?: AuditRequestContext) {
    const raw = (dto.login ?? dto.email ?? '').trim().toLowerCase();
    if (!raw) throw new UnauthorizedException('Invalid credentials');

    const identifierType = raw.includes('@') ? 'email' : 'username';

    const user = await this.prisma.user.findFirst({
      where: raw.includes('@') ? { email: raw } : { username: raw },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        employee: { select: { id: true } },
      },
    });

    if (!user || !user.isActive) {
      await this.recordBestEffort({
        actorUserId: null,
        actorRole: null,
        action: 'AUTH_LOGIN_FAILURE',
        targetType: 'AUTH',
        targetId: null,
        targetLabel: null,
        result: 'FAILURE',
        ...this.contextFields(ctx),
        metadata: { loginIdentifierType: identifierType, reason: 'INVALID_CREDENTIALS' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      await this.recordBestEffort({
        actorUserId: null,
        actorRole: null,
        action: 'AUTH_LOGIN_FAILURE',
        targetType: 'AUTH',
        targetId: null,
        targetLabel: null,
        result: 'FAILURE',
        ...this.contextFields(ctx),
        metadata: { loginIdentifierType: identifierType, reason: 'INVALID_CREDENTIALS' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const employeeId = user.employee?.id ?? null;
    const payload = { sub: user.id, email: user.email, username: user.username, role: user.role, employeeId };
    const accessToken = await this.jwt.signAsync(payload);

    await this.recordBestEffort({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN_SUCCESS',
      targetType: 'AUTH',
      targetId: user.id,
      targetLabel: user.username ?? user.email,
      result: 'SUCCESS',
      ...this.contextFields(ctx),
      metadata: {
        loginIdentifierType: identifierType,
        mustChangePassword: user.mustChangePassword,
        ...(employeeId ? { employeeId } : {}),
      },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        employeeId,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        mustChangePassword: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department: { select: { name: true } },
            position: { select: { title: true } },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');

    const employeeId = user.employee?.id ?? null;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      employeeId,
      employee: user.employee
        ? {
            id: user.employee.id,
            firstName: user.employee.firstName,
            lastName: user.employee.lastName,
            employeeCode: user.employee.employeeCode,
            department: user.employee.department?.name ?? null,
            position: user.employee.position?.title ?? null,
          }
        : null,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ctx?: AuditRequestContext) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, role: true, email: true, username: true },
    });

    if (!user) throw new UnauthorizedException('User not found');

    const currentValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!currentValid) {
      throw new UnauthorizedException('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }

    const samePassword = await bcrypt.compare(dto.newPassword, user.password);
    if (samePassword) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องไม่เหมือนกับรหัสผ่านปัจจุบัน');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false },
    });

    await this.recordBestEffort({
      actorUserId: userId,
      actorRole: user.role ?? null,
      action: 'AUTH_PASSWORD_CHANGE',
      targetType: 'USER',
      targetId: userId,
      targetLabel: user.username ?? user.email ?? null,
      result: 'SUCCESS',
      ...this.contextFields(ctx),
      metadata: { mustChangePasswordCleared: true },
    });

    return { success: true, mustChangePassword: false };
  }

  private contextFields(ctx?: AuditRequestContext) {
    return {
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
    };
  }

  private async recordBestEffort(event: AuditLogEvent): Promise<void> {
    try {
      await this.auditLog.record(event);
    } catch {
      // best-effort: audit failures must not affect auth behavior
    }
  }
}
