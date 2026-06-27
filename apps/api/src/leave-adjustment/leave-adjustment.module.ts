import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { LeaveAdjustmentController } from './leave-adjustment.controller';
import { LeaveAdjustmentService } from './leave-adjustment.service';

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [LeaveAdjustmentController],
  providers: [LeaveAdjustmentService],
})
export class LeaveAdjustmentModule {}
