import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  getApprovalRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
} from '../api/client';
import { SessionExpiredError } from '../api/types';
import type { LeaveRequestRecord } from '../api/types';
import { useAuth } from '../auth/useAuth';

export type ApprovalsLoadState = 'idle' | 'loading' | 'success' | 'error';

export interface ApprovalsState {
  loadState: ApprovalsLoadState;
  requests: LeaveRequestRecord[];
  error: string | null;
  actionLoadingId: string | null;
  refresh: () => void;
  approve: (id: string) => Promise<boolean>;
  reject: (id: string, reason: string) => Promise<boolean>;
}

export function useApprovals(enabled = true): ApprovalsState {
  const { token, signOut } = useAuth();
  const router = useRouter();

  const [loadState, setLoadState] = useState<ApprovalsLoadState>('idle');
  const [requests, setRequests] = useState<LeaveRequestRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const fetchData = useCallback(async () => {
    if (!token || !enabled) return;

    setLoadState('loading');
    setError(null);

    try {
      const result = await getApprovalRequests(token, 'PENDING');
      setRequests(result.data);
      setLoadState('success');
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
      setLoadState('error');
    }
  }, [token, enabled, handleSessionExpired]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const approve = useCallback(async (id: string): Promise<boolean> => {
    if (!token || actionLoadingId) return false;

    setActionLoadingId(id);
    try {
      await approveLeaveRequest(token, id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      return true;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return false;
      }
      throw err instanceof Error ? err : new Error('ไม่สามารถอนุมัติคำขอได้');
    } finally {
      setActionLoadingId(null);
    }
  }, [token, actionLoadingId, handleSessionExpired]);

  const reject = useCallback(async (id: string, reason: string): Promise<boolean> => {
    if (!token || actionLoadingId) return false;

    setActionLoadingId(id);
    try {
      await rejectLeaveRequest(token, id, reason || undefined);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      return true;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return false;
      }
      throw err instanceof Error ? err : new Error('ไม่สามารถปฏิเสธคำขอได้');
    } finally {
      setActionLoadingId(null);
    }
  }, [token, actionLoadingId, handleSessionExpired]);

  return {
    loadState,
    requests,
    error,
    actionLoadingId,
    refresh: fetchData,
    approve,
    reject,
  };
}
