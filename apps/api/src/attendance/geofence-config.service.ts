import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EffectiveGeofenceConfig {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  maxAccuracyMeters: number;
  source: 'db' | 'env';
}

@Injectable()
export class GeofenceConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectiveConfig(): Promise<EffectiveGeofenceConfig> {
    const row = await this.prisma.geofenceConfig.findUnique({ where: { id: 'default' } });

    if (row) {
      return {
        enabled: row.enabled,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        radiusMeters: row.radiusMeters,
        maxAccuracyMeters: row.maxAccuracyMeters,
        source: 'db',
      };
    }

    const envLat = parseFloat(process.env.COMPANY_LATITUDE ?? '');
    const envLon = parseFloat(process.env.COMPANY_LONGITUDE ?? '');
    const radius = parseInt(process.env.COMPANY_GEOFENCE_RADIUS_METERS ?? '100', 10);
    const accuracy = parseInt(process.env.ATTENDANCE_GPS_MAX_ACCURACY_METERS ?? '100', 10);

    return {
      enabled: process.env.ATTENDANCE_GEOFENCE_ENABLED === 'true',
      latitude: isNaN(envLat) ? null : envLat,
      longitude: isNaN(envLon) ? null : envLon,
      radiusMeters: isNaN(radius) ? 100 : radius,
      maxAccuracyMeters: isNaN(accuracy) ? 100 : accuracy,
      source: 'env',
    };
  }
}
