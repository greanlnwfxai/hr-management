import { Module } from '@nestjs/common';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health.controller';
import { LeaveBalanceModule } from './leave-balance/leave-balance.module';
import { LeaveModule } from './leave/leave.module';
import { PositionsModule } from './positions/positions.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, EmployeesModule, DepartmentsModule, PositionsModule, AttendanceModule, LeaveModule, LeaveBalanceModule, DashboardModule],
  controllers: [HealthController],
})
export class AppModule {}
