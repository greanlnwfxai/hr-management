import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
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
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { CreateLeaveAdjustmentDto } from './dto/create-leave-adjustment.dto';
import { QueryLeaveAdjustmentDto } from './dto/query-leave-adjustment.dto';
import { LeaveAdjustmentService } from './leave-adjustment.service';

@ApiTags('Leave Adjustments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('leave-balances/:id/adjustments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveAdjustmentController {
  constructor(private leaveAdjustment: LeaveAdjustmentService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Create vacation leave adjustment (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Leave balance UUID' })
  @ApiResponse({ status: 201, description: 'Adjustment created' })
  @ApiResponse({ status: 400, description: 'Non-vacation balance or invalid input' })
  @ApiResponse({ status: 404, description: 'Leave balance not found' })
  @ApiResponse({ status: 422, description: 'Adjustment would make remaining balance negative' })
  @ApiForbiddenResponse({ description: 'Insufficient role (MANAGER and EMPLOYEE rejected)' })
  create(
    @Param('id', ParseUUIDPipe) balanceId: string,
    @Body() dto: CreateLeaveAdjustmentDto,
    @CurrentUser() user: { id: string; role: string },
    @Req() req: Request,
  ) {
    return this.leaveAdjustment.create(balanceId, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'List adjustment history for a leave balance (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Leave balance UUID' })
  @ApiResponse({ status: 200, description: 'Paginated adjustment history' })
  @ApiResponse({ status: 404, description: 'Leave balance not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role (MANAGER and EMPLOYEE rejected)' })
  findAll(
    @Param('id', ParseUUIDPipe) balanceId: string,
    @Query() query: QueryLeaveAdjustmentDto,
  ) {
    return this.leaveAdjustment.findAll(balanceId, query);
  }
}
