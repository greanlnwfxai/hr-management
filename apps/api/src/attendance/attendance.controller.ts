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
import { UserRole } from '../common/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Post('clock-in')
  clockIn(
    @CurrentUser() user: { id: string },
    @Body() dto: ClockInDto,
  ) {
    return this.attendance.clockIn(user.id, dto);
  }

  @Post('clock-out')
  clockOut(
    @CurrentUser() user: { id: string },
    @Body() dto: ClockOutDto,
  ) {
    return this.attendance.clockOut(user.id, dto);
  }

  // Declared before /:id so NestJS matches the static segment first
  @Get('me')
  findMy(
    @CurrentUser() user: { id: string },
    @Query() query: QueryAttendanceDto,
  ) {
    return this.attendance.findMyAttendance(user.id, query);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  findAll(@Query() query: QueryAttendanceDto) {
    return this.attendance.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.attendance.findOne(id, user.id, user.role);
  }
}
