import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Aggregated HR snapshot (SUPER_ADMIN, HR_ADMIN, MANAGER)' })
  @ApiResponse({
    status: 200,
    description: 'HR dashboard summary',
    schema: {
      example: {
        generatedAt: '2024-01-01T00:00:00.000Z',
        timezone: 'Asia/Bangkok',
        employees: { totalEmployees: 50, activeEmployees: 45, inactiveEmployees: 3, resignedEmployees: 2, totalDepartments: 5, totalPositions: 12 },
        attendance: { todayDate: '2024-01-01', todayPresentCount: 40, todayLateCount: 3, todayAbsentCount: 2, todayClockedInCount: 43, todayClockedOutCount: 20 },
        leave: { totalLeaveRequests: 30, pendingLeaveRequests: 5, approvedLeaveRequests: 20, rejectedLeaveRequests: 5, lowLeaveBalanceCount: 3 },
        recent: { employees: [], attendance: [], leaveRequests: [] },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  getSummary() {
    return this.dashboard.getSummary();
  }
}
