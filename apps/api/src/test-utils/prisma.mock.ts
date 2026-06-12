import { PrismaService } from '../prisma/prisma.service';

export function mockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    employee: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as jest.Mocked<PrismaService> & {
    user: { findUnique: jest.Mock };
    employee: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
}
