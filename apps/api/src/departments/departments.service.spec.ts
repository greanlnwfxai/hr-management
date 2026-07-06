import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  let prisma: ReturnType<typeof mockPrisma>;

  const mockDepartment = {
    id: 'dept-uuid-1',
    name: 'Engineering',
    description: 'Product engineering team',
    managerId: null,
    manager: null,
    _count: { employees: 0, positions: 0 },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DepartmentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated departments and correct meta', async () => {
      prisma.$transaction.mockResolvedValue([[mockDepartment], 1] as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({
        data: [mockDepartment],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });

    it('calculates totalPages correctly across multiple pages', async () => {
      prisma.$transaction.mockResolvedValue([[mockDepartment], 45] as any);

      const result = await service.findAll({ page: 2, limit: 20 });

      expect(result.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
    });

    it('returns empty data list when no departments match', async () => {
      prisma.$transaction.mockResolvedValue([[], 0] as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('applies a case-insensitive name search filter', async () => {
      prisma.$transaction.mockResolvedValue([[mockDepartment], 1] as any);

      await service.findAll({ page: 1, limit: 20, search: 'eng' });

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { contains: 'eng', mode: 'insensitive' } },
        }),
      );
    });

    it('omits the name filter entirely when no search term is given', async () => {
      prisma.$transaction.mockResolvedValue([[mockDepartment], 1] as any);

      await service.findAll({ page: 1, limit: 20 });

      expect(prisma.department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the department when found', async () => {
      prisma.department.findUnique.mockResolvedValue(mockDepartment as any);

      const result = await service.findOne('dept-uuid-1');

      expect(result).toEqual(mockDepartment);
      expect(prisma.department.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'dept-uuid-1' } }),
      );
    });

    it('throws NotFoundException when department does not exist', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('includes the id in the NotFoundException message', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow('missing-id');
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = { name: 'Engineering', description: 'Product engineering team' };

    it('creates and returns the new department', async () => {
      prisma.department.findUnique.mockResolvedValue(null);
      prisma.department.create.mockResolvedValue(mockDepartment as any);

      const result = await service.create(createDto as any);

      expect(prisma.department.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: createDto }),
      );
      expect(result).toEqual(mockDepartment);
    });

    it('throws ConflictException when department name already exists', async () => {
      prisma.department.findUnique.mockResolvedValue(mockDepartment as any);

      await expect(service.create(createDto as any)).rejects.toThrow(ConflictException);
      expect(prisma.department.create).not.toHaveBeenCalled();
    });

    it('creates a department with an assigned manager', async () => {
      const dtoWithManager = { ...createDto, managerId: 'emp-uuid-1' };
      prisma.department.findUnique.mockResolvedValue(null);
      prisma.department.create.mockResolvedValue({
        ...mockDepartment,
        managerId: 'emp-uuid-1',
        manager: { id: 'emp-uuid-1', firstName: 'Jane', lastName: 'Doe' },
      } as any);

      const result = await service.create(dtoWithManager as any);

      expect(prisma.department.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: dtoWithManager }),
      );
      expect(result.managerId).toBe('emp-uuid-1');
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns the department', async () => {
      prisma.department.findUnique.mockResolvedValue(mockDepartment as any);
      prisma.department.update.mockResolvedValue({ ...mockDepartment, description: 'Updated' } as any);

      const result = await service.update('dept-uuid-1', { description: 'Updated' } as any);

      expect(prisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'dept-uuid-1' }, data: { description: 'Updated' } }),
      );
      expect(result).toMatchObject({ description: 'Updated' });
    });

    it('throws NotFoundException when department does not exist', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { description: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when updated name is taken by another department', async () => {
      prisma.department.findUnique.mockResolvedValue(mockDepartment as any);
      prisma.department.findFirst.mockResolvedValue({ id: 'dept-uuid-2', name: 'Sales' } as any);

      await expect(
        service.update('dept-uuid-1', { name: 'Sales' } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.department.update).not.toHaveBeenCalled();
    });

    it('allows renaming a department to its own current name (no self-conflict)', async () => {
      prisma.department.findUnique.mockResolvedValue(mockDepartment as any);
      prisma.department.findFirst.mockResolvedValue(null);
      prisma.department.update.mockResolvedValue(mockDepartment as any);

      await service.update('dept-uuid-1', { name: 'Engineering' } as any);

      expect(prisma.department.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: 'Engineering', id: { not: 'dept-uuid-1' } } }),
      );
      expect(prisma.department.update).toHaveBeenCalled();
    });

    it('skips the name-conflict check when dto has no name field', async () => {
      prisma.department.findUnique.mockResolvedValue(mockDepartment as any);
      prisma.department.update.mockResolvedValue({ ...mockDepartment, managerId: 'emp-uuid-2' } as any);

      await service.update('dept-uuid-1', { managerId: 'emp-uuid-2' } as any);

      expect(prisma.department.findFirst).not.toHaveBeenCalled();
    });

    it('reassigns the department manager', async () => {
      prisma.department.findUnique.mockResolvedValue(mockDepartment as any);
      prisma.department.update.mockResolvedValue({
        ...mockDepartment,
        managerId: 'emp-uuid-9',
        manager: { id: 'emp-uuid-9', firstName: 'Sam', lastName: 'Lee' },
      } as any);

      const result = await service.update('dept-uuid-1', { managerId: 'emp-uuid-9' } as any);

      expect(prisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { managerId: 'emp-uuid-9' } }),
      );
      expect(result.managerId).toBe('emp-uuid-9');
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the department when it has no employees or positions', async () => {
      prisma.department.findUnique
        .mockResolvedValueOnce(mockDepartment as any) // findOne() existence check
        .mockResolvedValueOnce({ _count: { employees: 0, positions: 0 } } as any); // counts lookup
      prisma.department.delete.mockResolvedValue({} as any);

      const result = await service.remove('dept-uuid-1');

      expect(prisma.department.delete).toHaveBeenCalledWith({ where: { id: 'dept-uuid-1' } });
      expect(result).toEqual({ id: 'dept-uuid-1', deleted: true });
    });

    it('throws NotFoundException when department does not exist', async () => {
      prisma.department.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
      expect(prisma.department.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException (safe delete) when employees are still attached', async () => {
      prisma.department.findUnique
        .mockResolvedValueOnce(mockDepartment as any)
        .mockResolvedValueOnce({ _count: { employees: 3, positions: 0 } } as any);

      await expect(service.remove('dept-uuid-1')).rejects.toThrow(ConflictException);
      expect(prisma.department.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException (safe delete) when positions are still attached', async () => {
      prisma.department.findUnique
        .mockResolvedValueOnce(mockDepartment as any)
        .mockResolvedValueOnce({ _count: { employees: 0, positions: 2 } } as any);

      await expect(service.remove('dept-uuid-1')).rejects.toThrow(ConflictException);
      expect(prisma.department.delete).not.toHaveBeenCalled();
    });

    it('includes counts in the ConflictException message', async () => {
      prisma.department.findUnique
        .mockResolvedValueOnce(mockDepartment as any)
        .mockResolvedValueOnce({ _count: { employees: 3, positions: 2 } } as any);

      await expect(service.remove('dept-uuid-1')).rejects.toThrow(/3 employee.*2 position/);
    });
  });
});
