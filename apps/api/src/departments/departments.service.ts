import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

const DEPARTMENT_SELECT = {
  id: true,
  name: true,
  description: true,
  managerId: true,
  manager: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { employees: true, positions: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DepartmentSelect;

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryDepartmentDto) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DepartmentWhereInput = {
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        skip,
        take: limit,
        select: DEPARTMENT_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      select: DEPARTMENT_SELECT,
    });
    if (!department) throw new NotFoundException(`Department ${id} not found`);
    return department;
  }

  async create(dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Department with this name already exists');
    }

    return this.prisma.department.create({
      data: dto,
      select: DEPARTMENT_SELECT,
    });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);

    if (dto.name) {
      const conflict = await this.prisma.department.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Department name already taken');
    }

    return this.prisma.department.update({
      where: { id },
      data: dto,
      select: DEPARTMENT_SELECT,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Safe delete: block if related employees or positions exist.
    const counts = await this.prisma.department.findUnique({
      where: { id },
      select: { _count: { select: { employees: true, positions: true } } },
    });

    const employeeCount = counts?._count.employees ?? 0;
    const positionCount = counts?._count.positions ?? 0;

    if (employeeCount > 0 || positionCount > 0) {
      throw new ConflictException(
        `Cannot delete department: ${employeeCount} employee(s) and ${positionCount} position(s) are still attached`,
      );
    }

    await this.prisma.department.delete({ where: { id } });
    return { id, deleted: true };
  }
}
