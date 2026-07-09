import type { OffsiteClockInPayload, OffsiteClockOutPayload } from '../api/types';
import type { DeviceLocation } from '../hooks/useDeviceLocation';

export function validateWorkLocationName(value: string): string {
  return value.trim().length >= 1 ? '' : 'กรุณาระบุสถานที่ทำงาน';
}

export function validateOffsiteReason(value: string): string {
  return value.trim().length >= 3 ? '' : 'กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)';
}

export function validateOffsiteNote(value: string): string {
  return value.trim().length >= 3 ? '' : 'กรุณาระบุหมายเหตุ (อย่างน้อย 3 ตัวอักษร)';
}

export function buildOffsiteClockInPayload(
  location: DeviceLocation,
  workLocationName: string,
  reason: string,
  timezoneOffsetMinutes: number,
  note?: string,
  nonce?: string,
): OffsiteClockInPayload {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    capturedAt: location.capturedAt,
    platform: location.platform,
    workLocationName,
    reason,
    timezoneOffsetMinutes,
    ...(note ? { note } : {}),
    ...(nonce ? { nonce } : {}),
  };
}

// Off-site check-out always carries a required reason/note (product requirement:
// note must be provided every time), unlike check-in where `reason` already
// covers that requirement and `note` stays optional.
export function buildOffsiteClockOutPayload(
  location: DeviceLocation,
  timezoneOffsetMinutes: number,
  note: string,
  nonce?: string,
): OffsiteClockOutPayload {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    capturedAt: location.capturedAt,
    platform: location.platform,
    note,
    timezoneOffsetMinutes,
    ...(nonce ? { nonce } : {}),
  };
}
