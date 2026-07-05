import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { clockInOffsite, clockOutOffsite, issueAttendanceNonce } from '../api/client';
import { SessionExpiredError } from '../api/types';
import type { AttendanceRecord } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { useDeviceLocation, type DeviceLocation } from './useDeviceLocation';
import { getTimezoneOffsetMinutes } from '../utils/timezone';

export type OffsiteClockState = 'idle' | 'locating' | 'submitting' | 'success' | 'error';

export interface OffsiteAttendanceState {
  clockInState: OffsiteClockState;
  clockOutState: OffsiteClockState;
  clockActionError: string | null;
  clockActionMessage: string | null;
  performOffsiteClockIn: (
    workLocationName: string,
    reason: string,
    note?: string,
  ) => Promise<AttendanceRecord | null>;
  performOffsiteClockOut: (note?: string) => Promise<AttendanceRecord | null>;
  resetClockState: () => void;
}

export function useOffsiteAttendance(
  onSuccess?: (record: AttendanceRecord) => void,
): OffsiteAttendanceState {
  const { token, signOut } = useAuth();
  const router = useRouter();
  const { getLocation } = useDeviceLocation();
  const mountedRef = useRef(true);

  const [clockInState, setClockInState] = useState<OffsiteClockState>('idle');
  const [clockOutState, setClockOutState] = useState<OffsiteClockState>('idle');
  const [clockActionError, setClockActionError] = useState<string | null>(null);
  const [clockActionMessage, setClockActionMessage] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const performOffsiteClockIn = useCallback(async (
    workLocationName: string,
    reason: string,
    note?: string,
  ): Promise<AttendanceRecord | null> => {
    if (!token) return null;
    if (clockInState === 'locating' || clockInState === 'submitting') return null;

    setClockActionError(null);
    setClockActionMessage(null);
    setClockInState('locating');

    let location: DeviceLocation;
    try {
      location = await getLocation();
    } catch (err) {
      if (!mountedRef.current) return null;
      setClockActionError(
        err instanceof Error ? err.message : 'ไม่สามารถอ่านตำแหน่งได้',
      );
      setClockInState('error');
      return null;
    }

    if (!mountedRef.current) return null;
    setClockInState('submitting');

    // SEC-ATT-004: fetch the replay-protection nonce as late as possible (after
    // location is already acquired). Best-effort — falls back to submitting
    // without one on issuance failure (server-side soft-enforced today).
    let nonce: string | undefined;
    try {
      const nonceResponse = await issueAttendanceNonce(token, 'OFFSITE_CLOCK_IN');
      nonce = nonceResponse.nonce;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return null;
      }
    }

    try {
      const record = await clockInOffsite(token, {
        ...location,
        workLocationName,
        reason,
        timezoneOffsetMinutes: getTimezoneOffsetMinutes(),
        ...(note ? { note } : {}),
        ...(nonce ? { nonce } : {}),
      });
      if (!mountedRef.current) return null;
      setClockActionMessage('ลงเวลาเข้า (นอกสถานที่) สำเร็จ');
      setClockInState('success');
      onSuccess?.(record);
      return record;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return null;
      }
      if (!mountedRef.current) return null;
      setClockActionError(translateOffsiteError(err instanceof Error ? err.message : ''));
      setClockInState('error');
      return null;
    }
  }, [token, clockInState, getLocation, handleSessionExpired, onSuccess]);

  const performOffsiteClockOut = useCallback(async (
    note?: string,
  ): Promise<AttendanceRecord | null> => {
    if (!token) return null;
    if (clockOutState === 'locating' || clockOutState === 'submitting') return null;

    setClockActionError(null);
    setClockActionMessage(null);
    setClockOutState('locating');

    let location: DeviceLocation;
    try {
      location = await getLocation();
    } catch (err) {
      if (!mountedRef.current) return null;
      setClockActionError(
        err instanceof Error ? err.message : 'ไม่สามารถอ่านตำแหน่งได้',
      );
      setClockOutState('error');
      return null;
    }

    if (!mountedRef.current) return null;
    setClockOutState('submitting');

    // SEC-ATT-004: same late-fetch, best-effort pattern as off-site clock-in.
    let nonce: string | undefined;
    try {
      const nonceResponse = await issueAttendanceNonce(token, 'OFFSITE_CLOCK_OUT');
      nonce = nonceResponse.nonce;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return null;
      }
    }

    try {
      const record = await clockOutOffsite(token, {
        ...location,
        timezoneOffsetMinutes: getTimezoneOffsetMinutes(),
        ...(note ? { note } : {}),
        ...(nonce ? { nonce } : {}),
      });
      if (!mountedRef.current) return null;
      setClockActionMessage('ลงเวลาออก (นอกสถานที่) สำเร็จ');
      setClockOutState('success');
      onSuccess?.(record);
      return record;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return null;
      }
      if (!mountedRef.current) return null;
      setClockActionError(translateOffsiteError(err instanceof Error ? err.message : ''));
      setClockOutState('error');
      return null;
    }
  }, [token, clockOutState, getLocation, handleSessionExpired, onSuccess]);

  const resetClockState = useCallback(() => {
    setClockInState('idle');
    setClockOutState('idle');
    setClockActionError(null);
    setClockActionMessage(null);
  }, []);

  return {
    clockInState,
    clockOutState,
    clockActionError,
    clockActionMessage,
    performOffsiteClockIn,
    performOffsiteClockOut,
    resetClockState,
  };
}

function translateOffsiteError(msg: string): string {
  if (msg.includes('attendance session has expired')) {
    return 'คำขอลงเวลาหมดอายุ กรุณาลองใหม่อีกครั้ง';
  }
  if (msg.includes('GPS accuracy is too low') || msg.includes('accuracy')) {
    return 'ความแม่นยำ GPS ต่ำเกินไป กรุณาเดินออกนอกอาคารหรือลองใหม่';
  }
  if (msg.includes('Location is required') || msg.includes('location')) {
    return 'ต้องระบุตำแหน่งสำหรับการลงเวลานอกสถานที่';
  }
  if (msg.includes('กรุณาอนุญาตการเข้าถึงตำแหน่ง') || msg.includes('permission')) {
    return 'ต้องอนุญาตการเข้าถึงตำแหน่งสำหรับการลงเวลานอกสถานที่';
  }
  if (msg.includes('Already clocked in')) {
    return 'ลงเวลาเข้าไปแล้วสำหรับวันนี้';
  }
  if (msg.includes('Already clocked out')) {
    return 'ลงเวลาออกไปแล้วสำหรับวันนี้';
  }
  if (msg.includes('No clock-in found') || msg.includes('No active clock-in')) {
    return 'ยังไม่มีการลงเวลาเข้าสำหรับวันนี้';
  }
  if (msg.includes('No employee profile')) {
    return 'ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้';
  }
  if (msg.includes('workLocationName')) {
    return 'กรุณาระบุสถานที่ทำงาน';
  }
  if (msg.includes('reason')) {
    return 'กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)';
  }
  if (msg.includes('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')) {
    return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
  }
  return msg || 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง';
}
