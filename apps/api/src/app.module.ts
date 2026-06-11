import { Module } from '@nestjs/common';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health.controller';
import { PositionsModule } from './positions/positions.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, EmployeesModule, DepartmentsModule, PositionsModule, AttendanceModule],
  controllers: [HealthController],
})
export class AppModule {}
