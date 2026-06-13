import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { CreateLeaveBalanceDto } from './dto/create-leave-balance.dto';
import { QueryLeaveBalanceDto } from './dto/query-leave-balance.dto';
import { UpdateLeaveBalanceDto } from './dto/update-leave-balance.dto';
import { LeaveBalanceService } from './leave-balance.service';

@ApiTags('Leave Balances')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('leave-balances')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveBalanceController {
  constructor(private leaveBalance: LeaveBalanceService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Create leave balance for an employee (SUPER_ADMIN, HR_ADMIN)' })
  @ApiResponse({ status: 201, description: 'Leave balance created' })
  @ApiResponse({ status: 409, description: 'Leave balance already exists for this employee/type/year' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  create(@Body() dto: CreateLeaveBalanceDto) {
    return this.leaveBalance.create(dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Own leave balances (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated leave balance list' })
  findMy(
    @CurrentUser() user: { id: string },
    @Query() query: QueryLeaveBalanceDto,
  ) {
    return this.leaveBalance.findMy(user.id, query);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'All leave balances (SUPER_ADMIN, HR_ADMIN, MANAGER)' })
  @ApiResponse({ status: 200, description: 'Paginated leave balance list' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  findAll(@Query() query: QueryLeaveBalanceDto) {
    return this.leaveBalance.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get leave balance by ID (owner, manager, or admin)' })
  @ApiParam({ name: 'id', description: 'Leave balance UUID' })
  @ApiResponse({ status: 200, description: 'Leave balance record' })
  @ApiResponse({ status: 403, description: 'Not the owner and not an admin or manager' })
  @ApiResponse({ status: 404, description: 'Leave balance not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leaveBalance.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Update entitledDays or usedDays (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Leave balance UUID' })
  @ApiResponse({ status: 200, description: 'Leave balance updated' })
  @ApiResponse({ status: 404, description: 'Leave balance not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveBalanceDto,
  ) {
    return this.leaveBalance.update(id, dto);
  }
}
