import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { getDashboard, getProfile } from '../api/client';
import { SessionExpiredError } from '../api/types';
import type { DashboardSummary, MobileUserProfile } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { canSeeDashboard } from '../utils/roles';

export type DashboardLoadState = 'idle' | 'loading' | 'success' | 'error';

export interface DashboardState {
  loadState: DashboardLoadState;
  dashboard: DashboardSummary | null;
  profile: MobileUserProfile | null;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useDashboard(): DashboardState {
  const { token, user, signOut } = useAuth();
  const router = useRouter();

  const [loadState, setLoadState] = useState<DashboardLoadState>('idle');
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [profile, setProfile] = useState<MobileUserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const fetch = useCallback(async () => {
    if (!token) return;

    setLoadState('loading');
    setError(null);

    try {
      const role = user?.role ?? '';
      const [dashboardData, profileData] = await Promise.all([
        canSeeDashboard(role) ? getDashboard(token) : Promise.resolve(null),
        getProfile(token),
      ]);
      setDashboard(dashboardData);
      setProfile(profileData);
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
  }, [token, user, handleSessionExpired]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { loadState, dashboard, profile, error, lastUpdated, refresh: fetch };
}
