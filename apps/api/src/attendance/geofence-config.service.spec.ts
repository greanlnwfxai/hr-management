import { Test, TestingModule } from '@nestjs/testing';
import { GeofenceConfigService } from './geofence-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { mockPrisma } from '../test-utils/prisma.mock';

describe('GeofenceConfigService', () => {
  let service: GeofenceConfigService;
  let prisma: ReturnType<typeof mockPrisma>;

  const DB_ROW = {
    id: 'default',
    enabled: true,
    latitude: 13.7563,
    longitude: 100.5018,
    radiusMeters: 150,
    maxAccuracyMeters: 75,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeofenceConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<GeofenceConfigService>(GeofenceConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ATTENDANCE_GEOFENCE_ENABLED;
    delete process.env.COMPANY_LATITUDE;
    delete process.env.COMPANY_LONGITUDE;
    delete process.env.COMPANY_GEOFENCE_RADIUS_METERS;
    delete process.env.ATTENDANCE_GPS_MAX_ACCURACY_METERS;
  });

  describe('getEffectiveConfig — DB row present', () => {
    it('returns source=db and the DB row values when a row exists', async () => {
      (prisma.geofenceConfig.findUnique as jest.Mock).mockResolvedValue(DB_ROW);

      const cfg = await service.getEffectiveConfig();

      expect(cfg.source).toBe('db');
      expect(cfg.enabled).toBe(true);
      expect(cfg.latitude).toBe(13.7563);
      expect(cfg.longitude).toBe(100.5018);
      expect(cfg.radiusMeters).toBe(150);
      expect(cfg.maxAccuracyMeters).toBe(75);
    });

    it('does not fall through to env vars when a DB row is present', async () => {
      process.env.COMPANY_GEOFENCE_RADIUS_METERS = '999';
      (prisma.geofenceConfig.findUnique as jest.Mock).mockResolvedValue(DB_ROW);

      const cfg = await service.getEffectiveConfig();

      expect(cfg.source).toBe('db');
      expect(cfg.radiusMeters).toBe(150); // DB value, not 999
    });
  });

  describe('getEffectiveConfig — no DB row (env fallback)', () => {
    beforeEach(() => {
      (prisma.geofenceConfig.findUnique as jest.Mock).mockResolvedValue(null);
    });

    it('returns source=env when no DB row exists', async () => {
      const cfg = await service.getEffectiveConfig();
      expect(cfg.source).toBe('env');
    });

    it('reads enabled flag from ATTENDANCE_GEOFENCE_ENABLED', async () => {
      process.env.ATTENDANCE_GEOFENCE_ENABLED = 'true';
      const cfg = await service.getEffectiveConfig();
      expect(cfg.enabled).toBe(true);
    });

    it('enabled is false when ATTENDANCE_GEOFENCE_ENABLED is not "true"', async () => {
      process.env.ATTENDANCE_GEOFENCE_ENABLED = 'false';
      const cfg = await service.getEffectiveConfig();
      expect(cfg.enabled).toBe(false);
    });

    it('reads latitude and longitude from env vars', async () => {
      process.env.COMPANY_LATITUDE = '13.7563';
      process.env.COMPANY_LONGITUDE = '100.5018';
      const cfg = await service.getEffectiveConfig();
      expect(cfg.latitude).toBe(13.7563);
      expect(cfg.longitude).toBe(100.5018);
    });

    it('returns null latitude/longitude when env vars are absent', async () => {
      const cfg = await service.getEffectiveConfig();
      expect(cfg.latitude).toBeNull();
      expect(cfg.longitude).toBeNull();
    });

    it('returns null latitude/longitude when env vars are non-numeric', async () => {
      process.env.COMPANY_LATITUDE = 'not-a-number';
      process.env.COMPANY_LONGITUDE = 'also-not-a-number';
      const cfg = await service.getEffectiveConfig();
      expect(cfg.latitude).toBeNull();
      expect(cfg.longitude).toBeNull();
    });

    it('reads radiusMeters from COMPANY_GEOFENCE_RADIUS_METERS with default 100', async () => {
      process.env.COMPANY_GEOFENCE_RADIUS_METERS = '250';
      const cfg = await service.getEffectiveConfig();
      expect(cfg.radiusMeters).toBe(250);
    });

    it('defaults radiusMeters to 100 when env var is absent', async () => {
      const cfg = await service.getEffectiveConfig();
      expect(cfg.radiusMeters).toBe(100);
    });

    it('reads maxAccuracyMeters from ATTENDANCE_GPS_MAX_ACCURACY_METERS with default 100', async () => {
      process.env.ATTENDANCE_GPS_MAX_ACCURACY_METERS = '50';
      const cfg = await service.getEffectiveConfig();
      expect(cfg.maxAccuracyMeters).toBe(50);
    });

    it('defaults maxAccuracyMeters to 100 when env var is absent', async () => {
      const cfg = await service.getEffectiveConfig();
      expect(cfg.maxAccuracyMeters).toBe(100);
    });
  });
});
