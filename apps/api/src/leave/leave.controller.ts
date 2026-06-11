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
import { ApproveLeaveRequestDto } from './dto/approve-leave-request.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { QueryLeaveRequestDto } from './dto/query-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';
import { LeaveService } from './leave.service';

@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveController {
  constructor(private leave: LeaveService) {}

  @Post('request')
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leave.create(user.id, dto);
  }

  // Declared before /:id so NestJS matches the static segment first
  @Get('me')
  findMy(
    @CurrentUser() user: { id: string },
    @Query() query: QueryLeaveRequestDto,
  ) {
    return this.leave.findMy(user.id, query);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  findAll(@Query() query: QueryLeaveRequestDto) {
    return this.leave.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leave.findOne(id, user.id, user.role);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ApproveLeaveRequestDto,
  ) {
    return this.leave.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectLeaveRequestDto,
  ) {
    return this.leave.reject(id, user.id, dto);
  }
}
