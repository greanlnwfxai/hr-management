import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { getMyOffSiteRequests, createOffSiteRequest } from '../api/client';
import { SessionExpiredError } from '../api/types';
import type { OffSiteRequestRecord, CreateOffSiteRequestPayload, PaginatedMeta } from '../api/types';
import { useAuth } from '../auth/useAuth';

export type OffSiteLoadState = 'idle' | 'loading' | 'success' | 'error';
export type OffSiteSubmitState = 'idle' | 'submitting' | 'success' | 'error';

export interface OffSiteRequestsState {
  loadState: OffSiteLoadState;
  requests: OffSiteRequestRecord[];
  meta: PaginatedMeta | null;
  error: string | null;
  submitState: OffSiteSubmitState;
  submitError: string | null;
  refresh: () => void;
  submit: (payload: CreateOffSiteRequestPayload) => Promise<boolean>;
}

export function useOffSiteRequests(): OffSiteRequestsState {
  const { token, signOut } = useAuth();
  const router = useRouter();

  const [loadState, setLoadState] = useState<OffSiteLoadState>('idle');
  const [requests, setRequests] = useState<OffSiteRequestRecord[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<OffSiteSubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadState('loading');
    setError(null);
    try {
      const res = await getMyOffSiteRequests(token, 1, 20);
      setRequests(res.data);
      setMeta(res.meta);
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

  useEffect(() => { void refresh(); }, [refresh]);

  const submit = useCallback(async (payload: CreateOffSiteRequestPayload): Promise<boolean> => {
    if (!token) return false;
    setSubmitState('submitting');
    setSubmitError(null);
    try {
      await createOffSiteRequest(token, payload);
      setSubmitState('success');
      void refresh();
      return true;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return false;
      }
      setSubmitError(err instanceof Error ? err.message : 'ไม่สามารถส่งคำขอได้');
      setSubmitState('error');
      return false;
    }
  }, [token, refresh, handleSessionExpired]);

  return { loadState, requests, meta, error, submitState, submitError, refresh, submit };
}
