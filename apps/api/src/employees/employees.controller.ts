import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../common/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private employees: EmployeesService) {}

  @Get()
  findAll(@Query() query: QueryEmployeeDto) {
    return this.employees.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.findOne(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.remove(id);
  }
}
