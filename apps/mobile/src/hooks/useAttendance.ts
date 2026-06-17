import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { getMyAttendance, getTodayAttendance } from '../api/client';
import { SessionExpiredError } from '../api/types';
import type { AttendanceRecord, PaginatedMeta } from '../api/types';
import { useAuth } from '../auth/useAuth';

export type AttendanceLoadState = 'idle' | 'loading' | 'success' | 'error';

export interface AttendanceState {
  loadState: AttendanceLoadState;
  today: AttendanceRecord | null;
  history: AttendanceRecord[];
  historyMeta: PaginatedMeta | null;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useAttendance(): AttendanceState {
  const { token, signOut } = useAuth();
  const router = useRouter();

  const [loadState, setLoadState] = useState<AttendanceLoadState>('idle');
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [historyMeta, setHistoryMeta] = useState<PaginatedMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoadState('loading');
    setError(null);

    try {
      const [todayData, historyData] = await Promise.all([
        getTodayAttendance(token),
        getMyAttendance(token, 1, 10),
      ]);
      setToday(todayData);
      setHistory(historyData.data);
      setHistoryMeta(historyData.meta);
      setLastUpdated(new Date());
      setLoadState('success');
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

  return { loadState, today, history, historyMeta, error, lastUpdated, refresh: fetchData };
}
