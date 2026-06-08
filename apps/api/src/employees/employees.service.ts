import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
// Type-only import: erased at runtime, safe even if prisma generate hasn't run.
import type { EmployeeStatus as PrismaEmployeeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

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
}
