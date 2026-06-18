import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const raw = (dto.login ?? dto.email ?? '').trim().toLowerCase();
    if (!raw) throw new UnauthorizedException('Invalid credentials');

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

    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const employeeId = user.employee?.id ?? null;
    const payload = { sub: user.id, email: user.email, username: user.username, role: user.role, employeeId };
    const accessToken = await this.jwt.signAsync(payload);

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
}
