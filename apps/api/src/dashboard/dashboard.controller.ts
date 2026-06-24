import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { DashboardService, RangePreset } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Aggregated HR snapshot with analytics (SUPER_ADMIN, HR_ADMIN, MANAGER)' })
  @ApiQuery({ name: 'range', required: false, enum: ['7d', 'thisMonth', 'lastMonth'], description: 'Date range preset for analytics (default: 7d)' })
  @ApiResponse({
    status: 200,
    description: 'HR dashboard summary with analytics',
    schema: {
      example: {
        generatedAt: '2024-01-01T00:00:00.000Z',
        timezone: 'Asia/Bangkok',
        employees: { totalEmployees: 50, activeEmployees: 45, inactiveEmployees: 3, resignedEmployees: 2, totalDepartments: 5, totalPositions: 12 },
        attendance: { todayDate: '2024-01-01', todayPresentCount: 40, todayLateCount: 3, todayAbsentCount: 2, todayClockedInCount: 43, todayClockedOutCount: 20 },
        leave: { totalLeaveRequests: 30, pendingLeaveRequests: 5, approvedLeaveRequests: 20, rejectedLeaveRequests: 5, lowLeaveBalanceCount: 3 },
        recent: { employees: [], attendance: [], leaveRequests: [] },
        analytics: {
          range: { from: '2024-01-01', to: '2024-01-07', preset: '7d' },
          attendanceTrend: [],
          leaveStatus: { pending: 0, approved: 0, rejected: 0 },
          leaveByDepartment: [],
          offSiteStatus: { pending: 0, approved: 0, rejected: 0 },
          overtimeTrend: [],
          topLeaveRequesters: [],
          recentOffSite: [],
        },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  getSummary(@Query('range') range?: string) {
    const validPresets: RangePreset[] = ['7d', 'thisMonth', 'lastMonth'];
    const preset: RangePreset = validPresets.includes(range as RangePreset)
      ? (range as RangePreset)
      : '7d';
    return this.dashboard.getSummary(preset);
  }
}
