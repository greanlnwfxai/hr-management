import { GeofenceService } from './geofence.service';

// Reference coordinates: Bangkok city center (used as company location in tests)
const COMPANY_LAT = 13.7563;
const COMPANY_LON = 100.5018;

// Degree offsets for known distances (latitude only, at this location):
//   1 degree lat ≈ 111,320 m  →  100 m ≈ 0.0008983°
//   50 m ≈ 0.0004491°
//   200 m ≈ 0.001797°
//   500 m ≈ 0.004491°
const OFFSET_50M = 0.0004491;
const OFFSET_99M = 0.0008893; // just inside 100 m boundary
const OFFSET_101M = 0.0009073; // just outside 100 m boundary
const OFFSET_200M = 0.001797;
const OFFSET_500M = 0.004491;

describe('GeofenceService', () => {
  let service: GeofenceService;

  beforeEach(() => {
    service = new GeofenceService();
  });

  // ── calculateDistanceMeters ───────────────────────────────────────────────

  describe('calculateDistanceMeters', () => {
    it('returns near 0 for identical coordinates', () => {
      const dist = service.calculateDistanceMeters(
        COMPANY_LAT, COMPANY_LON,
        COMPANY_LAT, COMPANY_LON,
      );
      expect(dist).toBeCloseTo(0, 5);
    });

    it('returns a positive value for distinct coordinates', () => {
      const dist = service.calculateDistanceMeters(
        COMPANY_LAT, COMPANY_LON,
        COMPANY_LAT + OFFSET_50M, COMPANY_LON,
      );
      expect(dist).toBeGreaterThan(0);
    });

    it('is symmetric — distance(A,B) equals distance(B,A)', () => {
      const d1 = service.calculateDistanceMeters(
        COMPANY_LAT, COMPANY_LON,
        COMPANY_LAT + OFFSET_200M, COMPANY_LON,
      );
      const d2 = service.calculateDistanceMeters(
        COMPANY_LAT + OFFSET_200M, COMPANY_LON,
        COMPANY_LAT, COMPANY_LON,
      );
      expect(d1).toBeCloseTo(d2, 6);
    });

    it('calculates ~50 m for a ~50 m latitude offset', () => {
      const dist = service.calculateDistanceMeters(
        COMPANY_LAT + OFFSET_50M, COMPANY_LON,
        COMPANY_LAT, COMPANY_LON,
      );
      expect(dist).toBeGreaterThan(45);
      expect(dist).toBeLessThan(55);
    });

    it('calculates ~200 m for a ~200 m latitude offset', () => {
      const dist = service.calculateDistanceMeters(
        COMPANY_LAT + OFFSET_200M, COMPANY_LON,
        COMPANY_LAT, COMPANY_LON,
      );
      expect(dist).toBeGreaterThan(185);
      expect(dist).toBeLessThan(215);
    });

    it('calculates ~500 m for a ~500 m latitude offset', () => {
      const dist = service.calculateDistanceMeters(
        COMPANY_LAT + OFFSET_500M, COMPANY_LON,
        COMPANY_LAT, COMPANY_LON,
      );
      expect(dist).toBeGreaterThan(475);
      expect(dist).toBeLessThan(525);
    });

    it('works correctly across hemispheres (negative latitude)', () => {
      const dist = service.calculateDistanceMeters(0, 0, -0.0009, 0);
      expect(dist).toBeGreaterThan(90);
      expect(dist).toBeLessThan(110);
    });

    it('works correctly across the prime meridian', () => {
      const dist = service.calculateDistanceMeters(0, -0.0009, 0, 0.0009);
      expect(dist).toBeGreaterThan(180);
      expect(dist).toBeLessThan(220);
    });
  });

  // ── isWithinRadius ────────────────────────────────────────────────────────

  describe('isWithinRadius', () => {
    const radius = 100;

    it('returns true when user is at the exact company location (0 m)', () => {
      expect(
        service.isWithinRadius(COMPANY_LAT, COMPANY_LON, COMPANY_LAT, COMPANY_LON, radius),
      ).toBe(true);
    });

    it('returns true when user is ~50 m away (well inside 100 m radius)', () => {
      expect(
        service.isWithinRadius(
          COMPANY_LAT + OFFSET_50M, COMPANY_LON,
          COMPANY_LAT, COMPANY_LON,
          radius,
        ),
      ).toBe(true);
    });

    it('returns true when user is ~99 m away (just inside boundary)', () => {
      expect(
        service.isWithinRadius(
          COMPANY_LAT + OFFSET_99M, COMPANY_LON,
          COMPANY_LAT, COMPANY_LON,
          radius,
        ),
      ).toBe(true);
    });

    it('returns false when user is ~101 m away (just outside boundary)', () => {
      expect(
        service.isWithinRadius(
          COMPANY_LAT + OFFSET_101M, COMPANY_LON,
          COMPANY_LAT, COMPANY_LON,
          radius,
        ),
      ).toBe(false);
    });

    it('returns false when user is ~200 m away', () => {
      expect(
        service.isWithinRadius(
          COMPANY_LAT + OFFSET_200M, COMPANY_LON,
          COMPANY_LAT, COMPANY_LON,
          radius,
        ),
      ).toBe(false);
    });

    it('returns false when user is ~500 m away', () => {
      expect(
        service.isWithinRadius(
          COMPANY_LAT + OFFSET_500M, COMPANY_LON,
          COMPANY_LAT, COMPANY_LON,
          radius,
        ),
      ).toBe(false);
    });

    it('respects a custom radius — 200 m radius allows a 150 m distance', () => {
      const offset150m = 0.001348;
      expect(
        service.isWithinRadius(
          COMPANY_LAT + offset150m, COMPANY_LON,
          COMPANY_LAT, COMPANY_LON,
          200,
        ),
      ).toBe(true);
    });

    it('respects a custom radius — 50 m radius rejects a 75 m distance', () => {
      const offset75m = 0.0006737;
      expect(
        service.isWithinRadius(
          COMPANY_LAT + offset75m, COMPANY_LON,
          COMPANY_LAT, COMPANY_LON,
          50,
        ),
      ).toBe(false);
    });
  });
});
