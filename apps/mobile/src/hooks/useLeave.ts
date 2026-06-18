import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  getMyLeaveRequests,
  getMyLeaveBalance,
  createLeaveRequest,
} from '../api/client';
import { SessionExpiredError } from '../api/types';
import type {
  LeaveRequestRecord,
  LeaveBalanceRecord,
  CreateLeaveRequestPayload,
  LeaveType,
} from '../api/types';
import { useAuth } from '../auth/useAuth';

export type LeaveLoadState = 'idle' | 'loading' | 'success' | 'error';
export type LeaveSubmitState = 'idle' | 'submitting' | 'success' | 'error';

export interface LeaveState {
  loadState: LeaveLoadState;
  requests: LeaveRequestRecord[];
  balances: LeaveBalanceRecord[];
  error: string | null;
  submitState: LeaveSubmitState;
  submitError: string | null;
  submitMessage: string | null;
  refresh: () => void;
  submitRequest: (payload: CreateLeaveRequestPayload) => Promise<boolean>;
  resetSubmit: () => void;
}

export const LEAVE_TYPE_OPTIONS: Array<{ value: LeaveType; label: string }> = [
  { value: 'SICK', label: 'ลาป่วย' },
  { value: 'VACATION', label: 'ลาพักร้อน' },
  { value: 'PERSONAL', label: 'ลากิจ' },
  { value: 'OTHER', label: 'อื่น ๆ' },
];

export function leaveTypeLabel(type: LeaveType): string {
  switch (type) {
    case 'SICK': return 'ลาป่วย';
    case 'VACATION': return 'ลาพักร้อน';
    case 'PERSONAL': return 'ลากิจ';
    case 'OTHER': return 'อื่น ๆ';
  }
}

export function leaveStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return 'รอดำเนินการ';
    case 'APPROVED': return 'อนุมัติแล้ว';
    case 'REJECTED': return 'ปฏิเสธแล้ว';
    default: return status;
  }
}

export function leaveStatusColor(status: string): string {
  switch (status) {
    case 'APPROVED': return '#16a34a';
    case 'REJECTED': return '#dc2626';
    default: return '#d97706';
  }
}

export function useLeave(): LeaveState {
  const { token, signOut } = useAuth();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LeaveLoadState>('idle');
  const [requests, setRequests] = useState<LeaveRequestRecord[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [submitState, setSubmitState] = useState<LeaveSubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoadState('loading');
    setError(null);

    try {
      const [requestsData, balancesData] = await Promise.all([
        getMyLeaveRequests(token),
        getMyLeaveBalance(token),
      ]);
      setRequests(requestsData.data);
      setBalances(balancesData.data);
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

  const submitRequest = useCallback(async (payload: CreateLeaveRequestPayload): Promise<boolean> => {
    if (!token || submitState === 'submitting') return false;

    setSubmitState('submitting');
    setSubmitError(null);
    setSubmitMessage(null);

    try {
      await createLeaveRequest(token, payload);
      setSubmitMessage('ส่งคำขอลาสำเร็จ');
      setSubmitState('success');
      void fetchData();
      return true;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return false;
      }
      setSubmitError(translateLeaveError(err instanceof Error ? err.message : ''));
      setSubmitState('error');
      return false;
    }
  }, [token, submitState, fetchData, handleSessionExpired]);

  const resetSubmit = useCallback(() => {
    setSubmitState('idle');
    setSubmitError(null);
    setSubmitMessage(null);
  }, []);

  return {
    loadState,
    requests,
    balances,
    error,
    submitState,
    submitError,
    submitMessage,
    refresh: fetchData,
    submitRequest,
    resetSubmit,
  };
}

function translateLeaveError(msg: string): string {
  if (msg.includes('startDate must be on or before endDate')) {
    return 'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด';
  }
  if (msg.includes('overlaps with an existing')) {
    return 'มีคำขอลาที่ทับซ้อนกันอยู่แล้ว';
  }
  if (msg.includes('No employee profile')) {
    return 'ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้';
  }
  if (msg.includes('Insufficient leave balance')) {
    return 'วันลาคงเหลือไม่เพียงพอ';
  }
  if (msg.includes('ไม่สามารถเชื่อมต่อ')) {
    return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
  }
  return msg || 'ไม่สามารถส่งคำขอลาได้ กรุณาลองใหม่อีกครั้ง';
}
