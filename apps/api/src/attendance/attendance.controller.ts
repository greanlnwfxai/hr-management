import {
  Body,
  Controller,
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
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { MixedCheckoutExceptionDto } from './dto/mixed-checkout-exception.dto';
import { OffsiteClockInDto } from './dto/offsite-clock-in.dto';
import { OffsiteClockOutDto } from './dto/offsite-clock-out.dto';
import { PatchGeofenceConfigDto } from './dto/patch-geofence-config.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { ApproveOffsiteDto } from './dto/approve-offsite.dto';
import { RejectOffsiteDto } from './dto/reject-offsite.dto';
import { QueryOffsiteReviewDto } from './dto/query-offsite-review.dto';

@ApiTags('Attendance')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Post('clock-in')
  @ApiOperation({ summary: 'Clock in for today (LATE if after 08:30 Asia/Bangkok)' })
  @ApiResponse({ status: 201, description: 'Attendance record created' })
  @ApiResponse({ status: 409, description: 'Already clocked in today' })
  clockIn(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: ClockInDto,
    @Req() req: Request,
  ) {
    return this.attendance.clockIn(user.id, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Post('clock-out')
  @ApiOperation({ summary: 'Clock out for today' })
  @ApiResponse({ status: 201, description: 'Clock-out recorded' })
  @ApiResponse({ status: 409, description: 'No active clock-in for today' })
  clockOut(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: ClockOutDto,
    @Req() req: Request,
  ) {
    return this.attendance.clockOut(user.id, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Post('offsite/clock-in')
  @ApiOperation({ summary: 'Off-site clock-in (GPS required, no company radius check)' })
  @ApiResponse({ status: 201, description: 'Off-site attendance record created' })
  @ApiResponse({ status: 409, description: 'Already clocked in today' })
  @ApiResponse({ status: 422, description: 'GPS accuracy too poor (> 100 m)' })
  offsiteClockIn(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: OffsiteClockInDto,
    @Req() req: Request,
  ) {
    return this.attendance.clockInOffsite(user.id, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Post('offsite/clock-out')
  @ApiOperation({ summary: 'Off-site clock-out (GPS required)' })
  @ApiResponse({ status: 201, description: 'Off-site clock-out recorded' })
  @ApiResponse({ status: 400, description: 'Active clock-in is not an off-site record' })
  @ApiResponse({ status: 404, description: 'No clock-in found for today' })
  @ApiResponse({ status: 409, description: 'Already clocked out today' })
  offsiteClockOut(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: OffsiteClockOutDto,
    @Req() req: Request,
  ) {
    return this.attendance.clockOutOffsite(user.id, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Post('offsite/mixed-checkout-exception')
  @ApiOperation({ summary: 'Submit mixed checkout exception for ONSITE attendance outside company geofence (HR review required)' })
  @ApiResponse({ status: 200, description: 'Mixed checkout exception submitted — record set to PENDING_REVIEW' })
  @ApiResponse({ status: 404, description: 'No clock-in found for today' })
  @ApiResponse({ status: 409, description: 'Already checked out or exception already submitted' })
  @ApiResponse({ status: 422, description: 'Record is not ONSITE, or employee is inside geofence' })
  mixedCheckoutException(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: MixedCheckoutExceptionDto,
    @Req() req: Request,
  ) {
    return this.attendance.mixedCheckoutException(user.id, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Get('geofence-location')
  @ApiOperation({ summary: 'Get company geofence location for mobile map display (all authenticated users)' })
  @ApiResponse({ status: 200, description: 'Company location and radius for map display' })
  getGeofenceLocation() {
    return this.attendance.getGeofenceConfig();
  }

  @Get('geofence-config')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Get effective geofence configuration (SUPER_ADMIN, HR_ADMIN)' })
  @ApiResponse({ status: 200, description: 'Effective geofence config (DB or env fallback)' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  getGeofenceConfig() {
    return this.attendance.getGeofenceConfig();
  }

  @Patch('geofence-config')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Update geofence configuration (SUPER_ADMIN, HR_ADMIN)' })
  @ApiResponse({ status: 200, description: 'Updated geofence config' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  updateGeofenceConfig(
    @Body() dto: PatchGeofenceConfigDto,
    @CurrentUser() user: { id: string; role: string },
    @Req() req: Request,
  ) {
    return this.attendance.updateGeofenceConfig(dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Get('me')
  @ApiOperation({ summary: 'Own attendance history (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated attendance list' })
  findMy(
    @CurrentUser() user: { id: string },
    @Query() query: QueryAttendanceDto,
  ) {
    return this.attendance.findMyAttendance(user.id, query);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'All attendance records (SUPER_ADMIN, HR_ADMIN)' })
  @ApiResponse({ status: 200, description: 'Paginated attendance list' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  findAll(@Query() query: QueryAttendanceDto) {
    return this.attendance.findAll(query);
  }

  @Get('offsite-review')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'List off-site attendance records for review (SUPER_ADMIN, HR_ADMIN, MANAGER)' })
  @ApiResponse({ status: 200, description: 'Paginated off-site attendance list' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  findOffsiteReview(
    @Query() query: QueryOffsiteReviewDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.attendance.findOffsiteReview(query, user.id, user.role);
  }

  @Patch('offsite-review/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Approve a PENDING_REVIEW off-site attendance record (SUPER_ADMIN, HR_ADMIN, MANAGER)' })
  @ApiParam({ name: 'id', description: 'Attendance UUID' })
  @ApiResponse({ status: 200, description: 'Attendance record approved' })
  @ApiResponse({ status: 400, description: 'Record is not off-site or not PENDING_REVIEW' })
  @ApiResponse({ status: 404, description: 'Attendance record not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  approveOffsiteRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveOffsiteDto,
    @CurrentUser() user: { id: string; role: string },
    @Req() req: Request,
  ) {
    return this.attendance.approveOffsiteAttendance(id, user.id, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Patch('offsite-review/:id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Reject a PENDING_REVIEW off-site attendance record (SUPER_ADMIN, HR_ADMIN, MANAGER)' })
  @ApiParam({ name: 'id', description: 'Attendance UUID' })
  @ApiResponse({ status: 200, description: 'Attendance record rejected' })
  @ApiResponse({ status: 400, description: 'Record is not off-site or not PENDING_REVIEW' })
  @ApiResponse({ status: 404, description: 'Attendance record not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  rejectOffsiteRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOffsiteDto,
    @CurrentUser() user: { id: string; role: string },
    @Req() req: Request,
  ) {
    return this.attendance.rejectOffsiteAttendance(id, user.id, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get attendance record by ID (owner or admin)' })
  @ApiParam({ name: 'id', description: 'Attendance UUID' })
  @ApiResponse({ status: 200, description: 'Attendance record' })
  @ApiResponse({ status: 403, description: 'Not the owner and not an admin' })
  @ApiResponse({ status: 404, description: 'Attendance record not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.attendance.findOne(id, user.id, user.role);
  }
}
