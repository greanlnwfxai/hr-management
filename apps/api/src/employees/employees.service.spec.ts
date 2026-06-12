import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: ReturnType<typeof mockPrisma>;

  const mockEmployee = {
    id: 'emp-uuid-1',
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@hr.local',
    phone: null,
    dateOfBirth: null,
    hireDate: new Date('2024-01-01'),
    status: 'ACTIVE',
    department: { id: 'dept-uuid-1', name: 'Engineering' },
    position: { id: 'pos-uuid-1', title: 'Engineer' },
    manager: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated employees and correct meta', async () => {
      prisma.$transaction.mockResolvedValue([[mockEmployee], 1] as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({
        data: [mockEmployee],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });

    it('calculates totalPages correctly across multiple pages', async () => {
      prisma.$transaction.mockResolvedValue([[mockEmployee], 45] as any);

      const result = await service.findAll({ page: 2, limit: 20 });

      expect(result.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
    });

    it('returns empty data list when no employees match', async () => {
      prisma.$transaction.mockResolvedValue([[], 0] as any);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the employee when found', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee as any);

      const result = await service.findOne('emp-uuid-1');

      expect(result).toEqual(mockEmployee);
      expect(prisma.employee.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'emp-uuid-1' } }),
      );
    });

    it('throws NotFoundException when employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('includes the id in the NotFoundException message', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow('missing-id');
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      employeeCode: 'EMP002',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@hr.local',
      hireDate: '2024-06-01',
      departmentId: 'dept-uuid-1',
      positionId: 'pos-uuid-1',
    };

    it('creates and returns the new employee', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue({ ...mockEmployee, email: createDto.email } as any);

      const result = await service.create(createDto as any);

      expect(prisma.employee.create).toHaveBeenCalled();
      expect(result).toMatchObject({ email: createDto.email });
    });

    it('converts hireDate string to Date object before persisting', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(mockEmployee as any);

      await service.create(createDto as any);

      const createCall = prisma.employee.create.mock.calls[0][0];
      expect(createCall.data.hireDate).toBeInstanceOf(Date);
    });

    it('throws ConflictException when email already exists', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee as any);

      await expect(service.create(createDto as any)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when employeeCode already exists', async () => {
      prisma.employee.findFirst.mockResolvedValue({ ...mockEmployee, employeeCode: createDto.employeeCode } as any);

      await expect(service.create(createDto as any)).rejects.toThrow(ConflictException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns the employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee as any);
      prisma.employee.update.mockResolvedValue({ ...mockEmployee, firstName: 'Updated' } as any);

      const result = await service.update('emp-uuid-1', { firstName: 'Updated' } as any);

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'emp-uuid-1' } }),
      );
      expect(result).toMatchObject({ firstName: 'Updated' });
    });

    it('throws NotFoundException when employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { firstName: 'X' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when updated email is taken by another employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee as any);
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-uuid-2' } as any);

      await expect(
        service.update('emp-uuid-1', { email: 'taken@hr.local' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('skips conflict check when dto has no email or employeeCode', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee as any);
      prisma.employee.update.mockResolvedValue({ ...mockEmployee, phone: '0800000000' } as any);

      await service.update('emp-uuid-1', { phone: '0800000000' } as any);

      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes by setting status to INACTIVE', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee as any);
      prisma.employee.update.mockResolvedValue({ id: 'emp-uuid-1', status: 'INACTIVE' } as any);

      const result = await service.remove('emp-uuid-1');

      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-uuid-1' },
          data: { status: 'INACTIVE' },
        }),
      );
      expect(result).toEqual({ id: 'emp-uuid-1', status: 'INACTIVE' });
    });

    it('throws NotFoundException when employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
