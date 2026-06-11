import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { QueryPositionDto } from './dto/query-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

const POSITION_SELECT = {
  id: true,
  title: true,
  description: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  _count: { select: { employees: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PositionSelect;

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryPositionDto) {
    const { page = 1, limit = 20, search, departmentId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PositionWhereInput = {
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
      ...(departmentId && { departmentId }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.position.findMany({
        where,
        skip,
        take: limit,
        select: POSITION_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.position.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      select: POSITION_SELECT,
    });
    if (!position) throw new NotFoundException(`Position ${id} not found`);
    return position;
  }

  async create(dto: CreatePositionDto) {
    await this.assertDepartmentExists(dto.departmentId);

    try {
      return await this.prisma.position.create({
        data: dto,
        select: POSITION_SELECT,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Position "${dto.title}" already exists in this department`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdatePositionDto) {
    await this.findOne(id);

    if (dto.departmentId) {
      await this.assertDepartmentExists(dto.departmentId);
    }

    try {
      return await this.prisma.position.update({
        where: { id },
        data: dto,
        select: POSITION_SELECT,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Position "${dto.title}" already exists in this department`,
        );
      }
      throw err;
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    const counts = await this.prisma.position.findUnique({
      where: { id },
      select: { _count: { select: { employees: true } } },
    });

    const employeeCount = counts?._count.employees ?? 0;
    if (employeeCount > 0) {
      throw new ConflictException(
        `Cannot delete position: ${employeeCount} employee(s) are still assigned to it`,
      );
    }

    await this.prisma.position.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertDepartmentExists(departmentId: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!dept) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }
  }
}
