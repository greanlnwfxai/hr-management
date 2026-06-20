import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { UserRole } from '../common/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';

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
    @CurrentUser() user: { id: string },
    @Body() dto: ClockInDto,
  ) {
    return this.attendance.clockIn(user.id, dto);
  }

  @Post('clock-out')
  @ApiOperation({ summary: 'Clock out for today' })
  @ApiResponse({ status: 201, description: 'Clock-out recorded' })
  @ApiResponse({ status: 409, description: 'No active clock-in for today' })
  clockOut(
    @CurrentUser() user: { id: string },
    @Body() dto: ClockOutDto,
  ) {
    return this.attendance.clockOut(user.id, dto);
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
