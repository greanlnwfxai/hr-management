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
    password: '$2b$10$hashedpassword',
    role: 'SUPER_ADMIN',
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
    it('returns accessToken and safe user object on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: mockUser.email, password: 'admin1234' });

      expect(result).toEqual({
        accessToken: 'mock.jwt.token',
        user: { id: mockUser.id, email: mockUser.email, role: mockUser.role },
      });
    });

    it('does not expose password hash in response', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: mockUser.email, password: 'admin1234' });

      expect((result.user as any).password).toBeUndefined();
    });

    it('signs JWT with only sub, email, role fields', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({ email: mockUser.email, password: 'admin1234' });

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('throws UnauthorizedException with generic message for unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@hr.local', password: 'pw' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('throws UnauthorizedException with generic message for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('does not reveal whether the account exists via different error messages', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknownUserError = await service.login({ email: 'x@hr.local', password: 'pw' }).catch((e) => e);

      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const wrongPasswordError = await service.login({ email: mockUser.email, password: 'wrong' }).catch((e) => e);

      expect(unknownUserError.message).toBe(wrongPasswordError.message);
    });
  });
});
