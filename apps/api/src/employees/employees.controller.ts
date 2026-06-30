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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../common/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ProvisionAccountDto } from './dto/provision-account.dto';
import { EmployeesService } from './employees.service';

@ApiTags('Employees')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private employees: EmployeesService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'List employees (paginated, filterable) — MANAGER sees own dept only' })
  @ApiResponse({ status: 200, description: 'Paginated employee list' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  findAll(@Query() query: QueryEmployeeDto, @CurrentUser() user?: Express.User) {
    const actor = user as { id?: string; role?: string } | undefined;
    return this.employees.findAll(query, { userId: actor?.id, role: actor?.role });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by ID — MANAGER sees own dept, EMPLOYEE sees self only' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'Employee record' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: Express.User) {
    const actor = user as { id?: string; role?: string } | undefined;
    return this.employees.findOne(id, { userId: actor?.id, role: actor?.role });
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Create employee (SUPER_ADMIN, HR_ADMIN)' })
  @ApiResponse({ status: 201, description: 'Employee created' })
  @ApiResponse({ status: 409, description: 'Employee code or email already exists' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Update employee fields (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'Employee updated' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Soft-delete employee — sets status to INACTIVE (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'Employee deactivated' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.remove(id);
  }

  @Get(':id/account')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Get linked login account info for an employee (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'Account info or null if no account linked' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  getAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.getAccount(id);
  }

  @Post(':id/account')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Provision a login account for an employee (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiResponse({ status: 201, description: 'Account provisioned — temporaryPassword shown once' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiResponse({ status: 409, description: 'Username or email already taken' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  provisionAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProvisionAccountDto,
    @CurrentUser() user: Express.User,
    @Req() req: Request,
  ) {
    const actor = user as { id: string; role: string };
    return this.employees.provisionAccount(id, dto, {
      actorUserId: actor.id,
      actorRole: actor.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Post(':id/account/reset-password')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Reset employee account password (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiResponse({ status: 201, description: 'Password reset — temporaryPassword shown once' })
  @ApiResponse({ status: 404, description: 'Employee or linked account not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  resetAccountPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Express.User,
    @Req() req: Request,
  ) {
    const actor = user as { id: string; role: string };
    return this.employees.resetAccountPassword(id, {
      actorUserId: actor.id,
      actorRole: actor.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }
}
