import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof mockPrisma>;
  let jwtService: { signAsync: jest.Mock };

  const mockUser = {
    id: 'user-uuid-1',
    email: 'admin@hr.local',
    username: 'admin',
    password: '$2b$10$hashedpassword',
    role: 'SUPER_ADMIN',
    isActive: true,
    mustChangePassword: false,
    employee: null,
  };

  beforeEach(async () => {
    prisma = mockPrisma();
    jwtService = { signAsync: jest.fn().mockResolvedValue('mock.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('returns accessToken and safe user object on valid email credentials', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: mockUser.email, password: 'admin1234' });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user.username).toBe(mockUser.username);
      expect(result.user.role).toBe(mockUser.role);
    });

    it('returns accessToken on valid username login', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ login: 'admin', password: 'admin1234' });

      expect(result.accessToken).toBe('mock.jwt.token');
    });

    it('normalizes login identifier to lowercase', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({ login: 'ADMIN', password: 'admin1234' });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { username: 'admin' } }),
      );
    });

    it('routes to email search when identifier contains @', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({ login: 'Admin@Hr.Local', password: 'admin1234' });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'admin@hr.local' } }),
      );
    });

    it('does not expose password hash in response', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: mockUser.email, password: 'admin1234' });

      expect((result.user as any).password).toBeUndefined();
    });

    it('signs JWT with sub, email, username, role, employeeId fields', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      prisma.user.update.mockResolvedValue({} as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({ email: mockUser.email, password: 'admin1234' });

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role,
        employeeId: null,
      });
    });

    it('throws UnauthorizedException with generic message for unknown user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@hr.local', password: 'pw' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('throws UnauthorizedException with generic message for wrong password', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('throws UnauthorizedException when login identifier is empty', async () => {
      await expect(
        service.login({ password: 'admin1234' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('does not reveal whether the account exists via different error messages', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const unknownUserError = await service.login({ email: 'x@hr.local', password: 'pw' }).catch((e) => e);

      prisma.user.findFirst.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const wrongPasswordError = await service.login({ email: mockUser.email, password: 'wrong' }).catch((e) => e);

      expect(unknownUserError.message).toBe(wrongPasswordError.message);
    });

    it('throws UnauthorizedException for inactive user', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, isActive: false } as any);

      await expect(
        service.login({ email: mockUser.email, password: 'admin1234' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });
  });
});
