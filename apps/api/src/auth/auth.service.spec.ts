import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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

  describe('getMe', () => {
    it('returns user profile with mustChangePassword and employeeId', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role,
        mustChangePassword: false,
        employee: null,
      } as any);

      const result = await service.getMe(mockUser.id);

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.mustChangePassword).toBe(false);
      expect(result.employeeId).toBeNull();
      expect(result.employee).toBeNull();
    });

    it('includes employee sub-object when employee is linked', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role,
        mustChangePassword: true,
        employee: {
          id: 'emp-uuid-1',
          firstName: 'John',
          lastName: 'Doe',
          employeeCode: 'EMP001',
          department: { name: 'Engineering' },
          position: { title: 'Developer' },
        },
      } as any);

      const result = await service.getMe(mockUser.id);

      expect(result.employeeId).toBe('emp-uuid-1');
      expect(result.mustChangePassword).toBe(true);
      expect(result.employee).toMatchObject({
        id: 'emp-uuid-1',
        firstName: 'John',
        lastName: 'Doe',
        employeeCode: 'EMP001',
        department: 'Engineering',
        position: 'Developer',
      });
    });

    it('throws UnauthorizedException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('nonexistent-id')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    const userId = mockUser.id;
    const dto = {
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
      confirmPassword: 'NewPass1!',
    };

    it('changes password and returns success with mustChangePassword false', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, password: '$2b$10$hash' } as any);
      prisma.user.update.mockResolvedValue({} as any);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)  // currentPassword valid
        .mockResolvedValueOnce(false); // newPassword !== currentPassword
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');

      const result = await service.changePassword(userId, dto);

      expect(result).toEqual({ success: true, mustChangePassword: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { password: '$2b$10$newhash', mustChangePassword: false },
      });
    });

    it('sets mustChangePassword to false in database', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, password: '$2b$10$hash' } as any);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');
      prisma.user.update.mockResolvedValue({} as any);

      await service.changePassword(userId, dto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mustChangePassword: false }),
        }),
      );
    });

    it('throws UnauthorizedException when current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, password: '$2b$10$hash' } as any);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.changePassword(userId, dto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when confirmPassword does not match newPassword', async () => {
      await expect(
        service.changePassword(userId, { ...dto, confirmPassword: 'DifferentPass1!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when new password is same as current password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, password: '$2b$10$hash' } as any);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)   // currentPassword valid
        .mockResolvedValueOnce(true);  // newPassword === currentPassword

      await expect(
        service.changePassword(userId, { ...dto, newPassword: 'OldPass1!', confirmPassword: 'OldPass1!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not expose password hash in response', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userId, password: '$2b$10$hash' } as any);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');
      prisma.user.update.mockResolvedValue({} as any);

      const result = await service.changePassword(userId, dto);

      expect((result as any).password).toBeUndefined();
    });
  });
});
