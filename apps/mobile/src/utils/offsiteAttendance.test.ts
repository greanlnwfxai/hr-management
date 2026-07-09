import {
  validateWorkLocationName,
  validateOffsiteReason,
  validateOffsiteNote,
  buildOffsiteClockInPayload,
  buildOffsiteClockOutPayload,
} from './offsiteAttendance';
import type { DeviceLocation } from '../hooks/useDeviceLocation';

const location: DeviceLocation = {
  latitude: 13.7563,
  longitude: 100.5018,
  accuracy: 12.5,
  capturedAt: '2026-07-09T02:00:00.000Z',
  platform: 'android',
};

describe('validateWorkLocationName', () => {
  it('rejects an empty value', () => {
    expect(validateWorkLocationName('')).not.toBe('');
    expect(validateWorkLocationName('   ')).not.toBe('');
  });

  it('accepts a non-empty value', () => {
    expect(validateWorkLocationName('ลูกค้า ABC')).toBe('');
  });
});

describe('validateOffsiteReason', () => {
  it('rejects reasons under 3 characters', () => {
    expect(validateOffsiteReason('')).not.toBe('');
    expect(validateOffsiteReason('ab')).not.toBe('');
  });

  it('accepts a reason with 3+ characters', () => {
    expect(validateOffsiteReason('พบลูกค้า')).toBe('');
  });
});

describe('validateOffsiteNote', () => {
  it('rejects an empty note', () => {
    expect(validateOffsiteNote('')).not.toBe('');
  });

  it('rejects a whitespace-only note', () => {
    expect(validateOffsiteNote('   ')).not.toBe('');
  });

  it('rejects a note under 3 characters', () => {
    expect(validateOffsiteNote('ok')).not.toBe('');
  });

  it('accepts a note with 3+ characters', () => {
    expect(validateOffsiteNote('เสร็จงานแล้ว')).toBe('');
  });

  it('returns a Thai-language error message', () => {
    expect(validateOffsiteNote('')).toMatch(/หมายเหตุ/);
  });
});

describe('buildOffsiteClockInPayload', () => {
  it('includes all location fields plus workLocationName/reason/timezoneOffsetMinutes', () => {
    const payload = buildOffsiteClockInPayload(location, 'ลูกค้า ABC', 'พบลูกค้า', -420);
    expect(payload).toMatchObject({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      capturedAt: location.capturedAt,
      platform: location.platform,
      workLocationName: 'ลูกค้า ABC',
      reason: 'พบลูกค้า',
      timezoneOffsetMinutes: -420,
    });
  });

  it('includes timezoneOffsetMinutes even when it is 0', () => {
    const payload = buildOffsiteClockInPayload(location, 'บ้าน', 'ทำงานที่บ้าน', 0);
    expect(payload.timezoneOffsetMinutes).toBe(0);
  });

  it('omits note and nonce when not provided', () => {
    const payload = buildOffsiteClockInPayload(location, 'บ้าน', 'ทำงานที่บ้าน', -420);
    expect(payload).not.toHaveProperty('note');
    expect(payload).not.toHaveProperty('nonce');
  });

  it('includes note and nonce when provided', () => {
    const payload = buildOffsiteClockInPayload(
      location,
      'บ้าน',
      'ทำงานที่บ้าน',
      -420,
      'หมายเหตุเพิ่มเติม',
      'nonce-abc-123',
    );
    expect(payload.note).toBe('หมายเหตุเพิ่มเติม');
    expect(payload.nonce).toBe('nonce-abc-123');
  });
});

describe('buildOffsiteClockOutPayload', () => {
  it('includes all location fields plus the required note and timezoneOffsetMinutes', () => {
    const payload = buildOffsiteClockOutPayload(location, -420, 'เสร็จงานแล้ว');
    expect(payload).toMatchObject({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      capturedAt: location.capturedAt,
      platform: location.platform,
      note: 'เสร็จงานแล้ว',
      timezoneOffsetMinutes: -420,
    });
  });

  it('includes timezoneOffsetMinutes even when it is 0', () => {
    const payload = buildOffsiteClockOutPayload(location, 0, 'เสร็จงานแล้ว');
    expect(payload.timezoneOffsetMinutes).toBe(0);
  });

  it('omits nonce when not provided', () => {
    const payload = buildOffsiteClockOutPayload(location, -420, 'เสร็จงานแล้ว');
    expect(payload).not.toHaveProperty('nonce');
  });

  it('includes nonce when provided', () => {
    const payload = buildOffsiteClockOutPayload(location, -420, 'เสร็จงานแล้ว', 'nonce-xyz-789');
    expect(payload.nonce).toBe('nonce-xyz-789');
  });
});
