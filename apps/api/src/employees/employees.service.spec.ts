import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

jest.mock('bcrypt');

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

  // ── provisionAccount ───────────────────────────────────────────────────────

  describe('provisionAccount', () => {
    const provisionDto = { username: 'j.doe', role: 'EMPLOYEE' };

    const mockNewUser = {
      id: 'user-uuid-1',
      email: 'emp_emp-uuid-1@hr.local',
      username: 'j.doe',
      role: 'EMPLOYEE',
      mustChangePassword: true,
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
    });

    it('creates a new user when employee has no linked account', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: null } as any);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockNewUser as any);

      const result = await service.provisionAccount('emp-uuid-1', provisionDto as any);

      expect(prisma.user.create).toHaveBeenCalled();
      expect(result).toMatchObject({
        userId: 'user-uuid-1',
        employeeId: 'emp-uuid-1',
        username: 'j.doe',
        mustChangePassword: true,
      });
    });

    it('returns temporaryPassword in the response', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: null } as any);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockNewUser as any);

      const result = await service.provisionAccount('emp-uuid-1', provisionDto as any);

      expect(result.temporaryPassword).toBeDefined();
      expect(typeof result.temporaryPassword).toBe('string');
      expect(result.temporaryPassword.length).toBeGreaterThan(0);
    });

    it('hashes the password before storing — does not persist plain text', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: null } as any);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockNewUser as any);

      const result = await service.provisionAccount('emp-uuid-1', provisionDto as any);

      expect(bcrypt.hash).toHaveBeenCalledWith(result.temporaryPassword, 10);
      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.password).toBe('hashed_password');
      expect(createCall.data.password).not.toBe(result.temporaryPassword);
    });

    it('sets mustChangePassword to true on the created user', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: null } as any);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockNewUser as any);

      await service.provisionAccount('emp-uuid-1', provisionDto as any);

      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.mustChangePassword).toBe(true);
    });

    it('updates the existing user when employee already has a linked account', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: 'user-uuid-1' } as any);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ ...mockNewUser, id: 'user-uuid-1' } as any);

      const result = await service.provisionAccount('emp-uuid-1', provisionDto as any);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-uuid-1' } }),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result.userId).toBe('user-uuid-1');
    });

    it('throws NotFoundException when employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.provisionAccount('missing-id', provisionDto as any)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when username is taken by another user', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: null } as any);
      prisma.user.findUnique.mockResolvedValue({ id: 'other-user-id', username: 'j.doe' } as any);

      await expect(service.provisionAccount('emp-uuid-1', provisionDto as any)).rejects.toThrow(ConflictException);
    });

    it('normalizes username to lowercase before lookup and storage', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: null } as any);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockNewUser as any);

      await service.provisionAccount('emp-uuid-1', { username: 'J.Doe', role: 'EMPLOYEE' } as any);

      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.username).toBe('j.doe');
    });
  });

  // ── resetAccountPassword ───────────────────────────────────────────────────

  describe('resetAccountPassword', () => {
    const mockUpdatedUser = {
      id: 'user-uuid-1',
      username: 'j.doe',
      email: 'j.doe@hr.local',
      role: 'EMPLOYEE',
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new_hashed_password');
    });

    it('generates a new password and returns it as temporaryPassword', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: 'user-uuid-1' } as any);
      prisma.user.update.mockResolvedValue(mockUpdatedUser as any);

      const result = await service.resetAccountPassword('emp-uuid-1');

      expect(result.temporaryPassword).toBeDefined();
      expect(typeof result.temporaryPassword).toBe('string');
      expect(result.temporaryPassword.length).toBeGreaterThan(0);
    });

    it('sets mustChangePassword to true in the response', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: 'user-uuid-1' } as any);
      prisma.user.update.mockResolvedValue(mockUpdatedUser as any);

      const result = await service.resetAccountPassword('emp-uuid-1');

      expect(result.mustChangePassword).toBe(true);
    });

    it('hashes the new password before storing', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: 'user-uuid-1' } as any);
      prisma.user.update.mockResolvedValue(mockUpdatedUser as any);

      const result = await service.resetAccountPassword('emp-uuid-1');

      expect(bcrypt.hash).toHaveBeenCalledWith(result.temporaryPassword, 10);
      const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.password).toBe('new_hashed_password');
      expect(updateCall.data.password).not.toBe(result.temporaryPassword);
    });

    it('throws NotFoundException when employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.resetAccountPassword('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when employee has no linked account', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-uuid-1', userId: null } as any);

      await expect(service.resetAccountPassword('emp-uuid-1')).rejects.toThrow(NotFoundException);
    });
  });
});
