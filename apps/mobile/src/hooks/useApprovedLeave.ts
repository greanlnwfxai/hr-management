import { useCallback, useEffect, useState } from 'react';
import { getMyLeaveRequests } from '../api/client';
import { SessionExpiredError } from '../api/types';
import type { LeaveRequestRecord } from '../api/types';
import { useAuth } from '../auth/useAuth';

const PAGE_LIMIT = 100;

export type ApprovedLeaveLoadState = 'idle' | 'loading' | 'success' | 'error';

export interface ApprovedLeaveState {
  loadState: ApprovedLeaveLoadState;
  approvedLeave: LeaveRequestRecord[];
  refresh: () => void;
}

/**
 * Fetches every APPROVED leave request for the current employee (no
 * start/endDate filter — the backend's date-range filter only matches
 * requests fully contained within the queried window, so it can miss a
 * multi-day request that merely overlaps a given day). Callers overlay
 * this list onto specific calendar dates client-side.
 */
export function useApprovedLeave(): ApprovedLeaveState {
  const { token, signOut } = useAuth();
  const [loadState, setLoadState] = useState<ApprovedLeaveLoadState>('idle');
  const [approvedLeave, setApprovedLeave] = useState<LeaveRequestRecord[]>([]);

  const fetchData = useCallback(async () => {
    if (!token) {
      setApprovedLeave([]);
      setLoadState('idle');
      return;
    }

    setLoadState('loading');

    try {
      const records: LeaveRequestRecord[] = [];
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const response = await getMyLeaveRequests(token, page, PAGE_LIMIT, { status: 'APPROVED' });
        records.push(...response.data);
        totalPages = response.meta.totalPages || 1;
        page += 1;
      }

      setApprovedLeave(records);
      setLoadState('success');
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        await signOut();
        return;
      }
      setApprovedLeave([]);
      setLoadState('error');
    }
  }, [token, signOut]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { loadState, approvedLeave, refresh: fetchData };
}
