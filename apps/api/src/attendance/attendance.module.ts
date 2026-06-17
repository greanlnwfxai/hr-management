import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { GeofenceConfigService } from './geofence-config.service';
import { GeofenceService } from './geofence.service';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, GeofenceService, GeofenceConfigService],
})
export class AttendanceModule {}
