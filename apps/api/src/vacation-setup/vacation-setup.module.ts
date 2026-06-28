import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { VacationSetupController } from './vacation-setup.controller';
import { VacationSetupService } from './vacation-setup.service';

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [VacationSetupController],
  providers: [VacationSetupService],
})
export class VacationSetupModule {}
