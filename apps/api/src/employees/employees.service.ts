import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
// Type-only import: erased at runtime, safe even if prisma generate hasn't run.
import type { EmployeeStatus as PrismaEmployeeStatus, UserRole as PrismaUserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generatePassword } from '../common/password.util';
import { normalizeUsername } from '../common/username.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ProvisionAccountDto } from './dto/provision-account.dto';

const EMPLOYEE_SELECT = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  hireDate: true,
  status: true,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, title: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryEmployeeDto) {
    const { page = 1, limit = 20, search, status, departmentId, positionId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      // Cast: local enum and Prisma enum share identical string values.
      ...(status && { status: status as unknown as PrismaEmployeeStatus }),
      ...(departmentId && { departmentId }),
      ...(positionId && { positionId }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, skip, take: limit, select: EMPLOYEE_SELECT, orderBy: { createdAt: 'desc' } }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: EMPLOYEE_SELECT,
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async create(dto: CreateEmployeeDto) {
    const existing = await this.prisma.employee.findFirst({
      where: { OR: [{ email: dto.email }, { employeeCode: dto.employeeCode }] },
    });
    if (existing) {
      throw new ConflictException('Employee with this email or code already exists');
    }

    const { status, dateOfBirth, hireDate, ...rest } = dto;
    return this.prisma.employee.create({
      data: {
        ...rest,
        ...(status !== undefined && { status: status as unknown as PrismaEmployeeStatus }),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        hireDate: new Date(hireDate),
      },
      select: EMPLOYEE_SELECT,
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);

    if (dto.email || dto.employeeCode) {
      const conflict = await this.prisma.employee.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { OR: [...(dto.email ? [{ email: dto.email }] : []), ...(dto.employeeCode ? [{ employeeCode: dto.employeeCode }] : [])] },
          ],
        },
      });
      if (conflict) throw new ConflictException('Email or employee code already taken');
    }

    const { status, dateOfBirth, hireDate, ...rest } = dto;
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...rest,
        ...(status !== undefined && { status: status as unknown as PrismaEmployeeStatus }),
        dateOfBirth: dateOfBirth !== undefined ? (dateOfBirth ? new Date(dateOfBirth) : undefined) : undefined,
        hireDate: hireDate ? new Date(hireDate) : undefined,
      },
      select: EMPLOYEE_SELECT,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: { status: 'INACTIVE' as PrismaEmployeeStatus },
      select: { id: true, status: true },
    });
  }

  async provisionAccount(employeeId: string, dto: ProvisionAccountDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    const username = normalizeUsername(dto.username);

    const existingUsername = await this.prisma.user.findUnique({ where: { username } });
    if (existingUsername && existingUsername.id !== employee.userId) {
      throw new ConflictException(`Username "${username}" is already taken`);
    }

    const temporaryPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const now = new Date();

    let user;
    if (employee.userId) {
      user = await this.prisma.user.update({
        where: { id: employee.userId },
        data: {
          username,
          password: hashedPassword,
          role: dto.role as unknown as PrismaUserRole,
          mustChangePassword: true,
          passwordGeneratedAt: now,
          ...(dto.email && { email: dto.email }),
        },
        select: { id: true, email: true, username: true, role: true, mustChangePassword: true },
      });
    } else {
      const email = dto.email ?? `emp_${employeeId}@hr.local`;
      const existingEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingEmail) throw new ConflictException(`Email "${email}" is already in use`);

      user = await this.prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          role: dto.role as unknown as PrismaUserRole,
          mustChangePassword: true,
          passwordGeneratedAt: now,
          employee: { connect: { id: employeeId } },
        },
        select: { id: true, email: true, username: true, role: true, mustChangePassword: true },
      });
    }

    return {
      userId: user.id,
      employeeId,
      username: user.username,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      temporaryPassword,
    };
  }

  async getAccount(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    if (!employee.userId) return { account: null };

    const user = await this.prisma.user.findUnique({
      where: { id: employee.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        passwordGeneratedAt: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return { account: user };
  }

  async resetAccountPassword(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    if (!employee.userId) throw new NotFoundException(`Employee ${employeeId} has no linked account`);

    const temporaryPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const user = await this.prisma.user.update({
      where: { id: employee.userId },
      data: { password: hashedPassword, mustChangePassword: true, passwordGeneratedAt: new Date() },
      select: { id: true, username: true, email: true, role: true },
    });

    return {
      userId: user.id,
      employeeId,
      username: user.username,
      email: user.email,
      role: user.role,
      mustChangePassword: true,
      temporaryPassword,
    };
  }
}
