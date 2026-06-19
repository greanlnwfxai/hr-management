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
import { ApproveLeaveRequestDto } from './dto/approve-leave-request.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { QueryLeaveRequestDto } from './dto/query-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';
import { LeaveService } from './leave.service';

@ApiTags('Leave Requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveController {
  constructor(private leave: LeaveService) {}

  @Post('request')
  @ApiOperation({ summary: 'Submit a leave request (own employee record required)' })
  @ApiResponse({ status: 201, description: 'Leave request created' })
  @ApiResponse({ status: 404, description: 'No employee record found for current user' })
  @ApiResponse({ status: 409, description: 'Overlapping leave request already exists' })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leave.create(user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Own leave requests (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated leave request list' })
  findMy(
    @CurrentUser() user: { id: string },
    @Query() query: QueryLeaveRequestDto,
  ) {
    return this.leave.findMy(user.id, query);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'All leave requests (SUPER_ADMIN, HR_ADMIN, MANAGER)' })
  @ApiResponse({ status: 200, description: 'Paginated leave request list' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  findAll(@Query() query: QueryLeaveRequestDto) {
    return this.leave.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get leave request by ID (owner or admin)' })
  @ApiParam({ name: 'id', description: 'Leave request UUID' })
  @ApiResponse({ status: 200, description: 'Leave request record' })
  @ApiResponse({ status: 403, description: 'Not the owner and not an admin' })
  @ApiResponse({ status: 404, description: 'Leave request not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leave.findOne(id, user.id, user.role);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Approve a PENDING leave request — deducts leave balance atomically (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Leave request UUID' })
  @ApiResponse({ status: 200, description: 'Leave request approved' })
  @ApiResponse({ status: 404, description: 'Leave request or leave balance not found' })
  @ApiResponse({ status: 409, description: 'Request not PENDING or insufficient leave balance' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ApproveLeaveRequestDto,
  ) {
    return this.leave.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Reject a PENDING leave request (SUPER_ADMIN, HR_ADMIN, MANAGER)' })
  @ApiParam({ name: 'id', description: 'Leave request UUID' })
  @ApiResponse({ status: 200, description: 'Leave request rejected' })
  @ApiResponse({ status: 404, description: 'Leave request not found' })
  @ApiResponse({ status: 409, description: 'Request is not PENDING' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectLeaveRequestDto,
  ) {
    return this.leave.reject(id, user.id, dto);
  }
}
