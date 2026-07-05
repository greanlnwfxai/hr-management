import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceNonceService } from './attendance-nonce.service';
import { GeofenceConfigService } from './geofence-config.service';
import { GeofenceService } from './geofence.service';

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, GeofenceService, GeofenceConfigService, AttendanceNonceService],
})
export class AttendanceModule {}
