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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { CreateLeaveBalanceDto } from './dto/create-leave-balance.dto';
import { QueryLeaveBalanceDto } from './dto/query-leave-balance.dto';
import { UpdateLeaveBalanceDto } from './dto/update-leave-balance.dto';
import { LeaveBalanceService } from './leave-balance.service';

@Controller('leave-balances')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveBalanceController {
  constructor(private leaveBalance: LeaveBalanceService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  create(@Body() dto: CreateLeaveBalanceDto) {
    return this.leaveBalance.create(dto);
  }

  // Declared before /:id so NestJS matches the static segment first
  @Get('my')
  findMy(
    @CurrentUser() user: { id: string },
    @Query() query: QueryLeaveBalanceDto,
  ) {
    return this.leaveBalance.findMy(user.id, query);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  findAll(@Query() query: QueryLeaveBalanceDto) {
    return this.leaveBalance.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leaveBalance.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveBalanceDto,
  ) {
    return this.leaveBalance.update(id, dto);
  }
}
