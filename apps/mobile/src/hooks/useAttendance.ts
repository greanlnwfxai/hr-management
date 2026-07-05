import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  getMyAttendance,
  getTodayAttendance,
  clockIn as apiClockIn,
  clockOut as apiClockOut,
  getTodayOffSiteStatus,
} from '../api/client';
import { SessionExpiredError, ApiCodedError } from '../api/types';
import type { AttendanceRecord, OffSiteRequestRecord, PaginatedMeta } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { useDeviceLocation, type DeviceLocation } from './useDeviceLocation';
import { getTimezoneOffsetMinutes } from '../utils/timezone';

export type AttendanceLoadState = 'idle' | 'loading' | 'success' | 'error';
export type ClockActionState = 'idle' | 'locating' | 'submitting' | 'success' | 'error';

export interface AttendanceState {
  loadState: AttendanceLoadState;
  today: AttendanceRecord | null;
  history: AttendanceRecord[];
  historyMeta: PaginatedMeta | null;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  clockInState: ClockActionState;
  clockOutState: ClockActionState;
  clockActionError: string | null;
  clockActionMessage: string | null;
  clockOutOutsideGeofence: boolean;
  performClockIn: () => Promise<void>;
  performClockOut: () => Promise<void>;
  todayOffSite: OffSiteRequestRecord | null;
}

export function useAttendance(): AttendanceState {
  const { token, signOut } = useAuth();
  const router = useRouter();
  const { getLocation } = useDeviceLocation();

  const [loadState, setLoadState] = useState<AttendanceLoadState>('idle');
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [historyMeta, setHistoryMeta] = useState<PaginatedMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [todayOffSite, setTodayOffSite] = useState<OffSiteRequestRecord | null>(null);

  const [clockInState, setClockInState] = useState<ClockActionState>('idle');
  const [clockOutState, setClockOutState] = useState<ClockActionState>('idle');
  const [clockActionError, setClockActionError] = useState<string | null>(null);
  const [clockActionMessage, setClockActionMessage] = useState<string | null>(null);
  const [clockOutOutsideGeofence, setClockOutOutsideGeofence] = useState(false);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoadState('loading');
    setError(null);

    try {
      const [todayData, historyData, offSiteData] = await Promise.all([
        getTodayAttendance(token),
        getMyAttendance(token, 1, 10),
        getTodayOffSiteStatus(token).catch(() => null),
      ]);
      setToday(todayData);
      setHistory(historyData.data);
      setHistoryMeta(historyData.meta);
      setTodayOffSite(offSiteData);
      setLastUpdated(new Date());
      setLoadState('success');
      if (todayData?.checkOut) setClockOutOutsideGeofence(false);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
      setLoadState('error');
    }
  }, [token, handleSessionExpired]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const performClockIn = useCallback(async () => {
    if (!token || clockInState === 'locating' || clockInState === 'submitting') return;

    setClockActionError(null);
    setClockActionMessage(null);
    setClockInState('locating');

    let location: DeviceLocation;
    try {
      location = await getLocation();
    } catch (err) {
      setClockActionError(err instanceof Error ? err.message : 'ไม่สามารถอ่านตำแหน่งได้');
      setClockInState('error');
      return;
    }

    if (location.accuracy > 100) {
      setClockActionError('ความแม่นยำ GPS ต่ำเกินไป กรุณาเดินออกนอกอาคารหรือลองใหม่อีกครั้ง');
      setClockInState('error');
      return;
    }

    setClockInState('submitting');
    try {
      const result = await apiClockIn(token, {
        source: 'mobile',
        ...location,
        timezoneOffsetMinutes: getTimezoneOffsetMinutes(),
      });
      setToday(prev =>
        prev
          ? { ...prev, checkIn: result.checkIn, status: result.status }
          : {
              ...result,
              workMode: 'ONSITE',
              note: null,
              employee: { id: '', employeeCode: '', firstName: '', lastName: '' },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
      );
      setClockActionMessage('ลงเวลาเข้าสำเร็จ');
      setClockInState('success');
      void fetchData();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return;
      }
      setClockActionError(translateClockError(err instanceof Error ? err.message : ''));
      setClockInState('error');
    }
  }, [token, clockInState, getLocation, fetchData, handleSessionExpired]);

  const performClockOut = useCallback(async () => {
    if (!token || clockOutState === 'locating' || clockOutState === 'submitting') return;

    setClockActionError(null);
    setClockActionMessage(null);
    setClockOutOutsideGeofence(false);
    setClockOutState('locating');

    let location: DeviceLocation;
    try {
      location = await getLocation();
    } catch (err) {
      setClockActionError(err instanceof Error ? err.message : 'ไม่สามารถอ่านตำแหน่งได้');
      setClockOutState('error');
      return;
    }

    if (location.accuracy > 100) {
      setClockActionError('ความแม่นยำ GPS ต่ำเกินไป กรุณาเดินออกนอกอาคารหรือลองใหม่อีกครั้ง');
      setClockOutState('error');
      return;
    }

    setClockOutState('submitting');
    try {
      const result = await apiClockOut(token, {
        source: 'mobile',
        ...location,
        timezoneOffsetMinutes: getTimezoneOffsetMinutes(),
      });
      setToday(prev => prev ? { ...prev, checkOut: result.checkOut, status: result.status } : prev);
      setClockActionMessage('ลงเวลาออกสำเร็จ');
      setClockOutState('success');
      void fetchData();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return;
      }
      if (err instanceof ApiCodedError && err.code === 'OUTSIDE_GEOFENCE') {
        setClockOutOutsideGeofence(true);
        setClockActionError('คุณอยู่นอกพื้นที่บริษัท กรุณาใช้เช็คเอาท์นอกสถานที่');
      } else {
        setClockActionError(translateClockError(err instanceof Error ? err.message : ''));
      }
      setClockOutState('error');
    }
  }, [token, clockOutState, getLocation, fetchData, handleSessionExpired]);

  return {
    loadState,
    today,
    history,
    historyMeta,
    error,
    lastUpdated,
    refresh: fetchData,
    clockInState,
    clockOutState,
    clockActionError,
    clockActionMessage,
    clockOutOutsideGeofence,
    performClockIn,
    performClockOut,
    todayOffSite,
  };
}

function translateClockError(msg: string): string {
  if (msg.includes('outside the allowed company area')) {
    return 'คุณอยู่นอกพื้นที่บริษัทที่อนุญาต';
  }
  if (msg.includes('GPS accuracy is too low')) {
    return 'ความแม่นยำของ GPS ต่ำเกินไป กรุณาลองใหม่ใกล้อาคารสำนักงาน';
  }
  if (msg.includes('Location is required')) {
    return 'ต้องระบุตำแหน่งสำหรับการลงเวลาผ่านมือถือ';
  }
  if (msg.includes('geofence is not configured')) {
    return 'ระบบตรวจสอบตำแหน่งยังไม่ได้รับการตั้งค่า';
  }
  if (msg.includes('Already clocked in')) {
    return 'ลงเวลาเข้าไปแล้วสำหรับวันนี้';
  }
  if (msg.includes('Already clocked out')) {
    return 'ลงเวลาออกไปแล้วสำหรับวันนี้';
  }
  if (msg.includes('No clock-in found')) {
    return 'ยังไม่มีการลงเวลาเข้าสำหรับวันนี้';
  }
  if (msg.includes('No employee profile')) {
    return 'ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้';
  }
  if (msg.includes('ไม่พบคำขอทำงานนอกสถานที่')) {
    return 'ไม่พบคำขอทำงานนอกสถานที่ที่อนุมัติแล้วสำหรับวันนี้';
  }
  return msg || 'ไม่สามารถลงเวลาได้ กรุณาลองใหม่อีกครั้ง';
}
