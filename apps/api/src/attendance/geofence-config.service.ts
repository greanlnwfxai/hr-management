import { Injectable } from '@nestjs/common';

@Injectable()
export class GeofenceConfigService {
  isEnabled(): boolean {
    return process.env.ATTENDANCE_GEOFENCE_ENABLED === 'true';
  }

  getCompanyLocation(): { lat: number; lon: number } | null {
    const lat = parseFloat(process.env.COMPANY_LATITUDE ?? '');
    const lon = parseFloat(process.env.COMPANY_LONGITUDE ?? '');
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat, lon };
  }

  getRadiusMeters(): number {
    const val = parseInt(process.env.COMPANY_GEOFENCE_RADIUS_METERS ?? '100', 10);
    return isNaN(val) ? 100 : val;
  }

  getMaxAccuracyMeters(): number {
    const val = parseInt(process.env.ATTENDANCE_GPS_MAX_ACCURACY_METERS ?? '100', 10);
    return isNaN(val) ? 100 : val;
  }
}
