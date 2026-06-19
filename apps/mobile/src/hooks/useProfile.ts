import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { getProfile, changePassword as apiChangePassword } from '../api/client';
import { SessionExpiredError } from '../api/types';
import type { MobileUserProfile } from '../api/types';
import { useAuth } from '../auth/useAuth';

export type ProfileLoadState = 'idle' | 'loading' | 'success' | 'error';

export interface ProfileState {
  loadState: ProfileLoadState;
  profile: MobileUserProfile | null;
  error: string | null;
  actionLoading: boolean;
  refresh: () => void;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<{ success: boolean; mustChangePassword: boolean }>;
}

export function useProfile(): ProfileState {
  const { token, signOut, refreshUser } = useAuth();
  const router = useRouter();

  const [loadState, setLoadState] = useState<ProfileLoadState>('idle');
  const [profile, setProfile] = useState<MobileUserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoadState('loading');
    setError(null);

    try {
      const result = await getProfile(token);
      setProfile(result);
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

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string, confirmPassword: string) => {
      if (!token) throw new Error('ไม่พบ session กรุณาเข้าสู่ระบบใหม่');

      setActionLoading(true);
      try {
        const result = await apiChangePassword(token, {
          currentPassword,
          newPassword,
          confirmPassword,
        });
        await refreshUser(token);
        if (profile) {
          setProfile({ ...profile, mustChangePassword: result.mustChangePassword });
        }
        return result;
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          void handleSessionExpired();
          throw new Error('เซสชันหมดอายุ');
        }
        throw err instanceof Error ? err : new Error('เปลี่ยนรหัสผ่านไม่สำเร็จ');
      } finally {
        setActionLoading(false);
      }
    },
    [token, profile, refreshUser, handleSessionExpired],
  );

  return {
    loadState,
    profile,
    error,
    actionLoading,
    refresh: fetchData,
    changePassword,
  };
}
