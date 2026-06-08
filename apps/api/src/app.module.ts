import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, EmployeesModule],
  controllers: [HealthController],
})
export class AppModule {}
