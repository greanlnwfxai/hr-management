import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
