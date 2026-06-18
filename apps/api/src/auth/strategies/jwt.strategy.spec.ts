import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { mockPrisma } from '../../test-utils/prisma.mock';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-for-unit-tests';
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => jest.clearAllMocks());

  describe('validate', () => {
    const dbUser = {
      id: 'user-uuid-1',
      email: 'admin@hr.local',
      username: 'admin',
      role: 'SUPER_ADMIN',
      isActive: true,
      mustChangePassword: false,
      employee: null,
    };

    it('returns safe user object including username and employeeId for a valid payload', async () => {
      prisma.user.findUnique.mockResolvedValue(dbUser as any);

      const result = await strategy.validate({
        sub: dbUser.id,
        email: dbUser.email,
        username: dbUser.username,
        role: dbUser.role,
        employeeId: null,
      });

      expect(result).toEqual({
        id: dbUser.id,
        email: dbUser.email,
        username: dbUser.username,
        role: dbUser.role,
        mustChangePassword: dbUser.mustChangePassword,
        employeeId: null,
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: dbUser.id } }),
      );
    });

    it('throws UnauthorizedException when user no longer exists in DB', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        strategy.validate({ sub: 'deleted-user', email: 'gone@hr.local', username: null, role: 'EMPLOYEE', employeeId: null }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...dbUser, isActive: false } as any);

      await expect(
        strategy.validate({ sub: dbUser.id, email: dbUser.email, username: dbUser.username, role: dbUser.role, employeeId: null }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
