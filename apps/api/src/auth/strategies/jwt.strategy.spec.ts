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
    it('returns safe user object (id, email, role) for a valid payload', async () => {
      const dbUser = { id: 'user-uuid-1', email: 'admin@hr.local', role: 'SUPER_ADMIN' };
      prisma.user.findUnique.mockResolvedValue(dbUser as any);

      const result = await strategy.validate({
        sub: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
      });

      expect(result).toEqual(dbUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: dbUser.id } }),
      );
    });

    it('throws UnauthorizedException when user no longer exists in DB', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        strategy.validate({ sub: 'deleted-user', email: 'gone@hr.local', role: 'EMPLOYEE' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
