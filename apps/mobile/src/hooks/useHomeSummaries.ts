import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  getMyAttendance,
  getMyLeaveBalance,
  getMyLeaveRequests,
} from '../api/client';
import { SessionExpiredError } from '../api/types';
import type {
  AttendanceRecord,
  LeaveBalanceRecord,
  LeaveRequestRecord,
  LeaveRequestStatus,
  LeaveType,
} from '../api/types';
import { useAuth } from '../auth/useAuth';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 100;

export type HomeSummaryLoadState = 'idle' | 'loading' | 'success' | 'error';

export interface HomeLeaveSummaryCard {
  key: 'sick-first' | 'sick-over' | 'vacation';
  title: string;
  totalDays: number;
  usedDays: number;
  availableDays: number;
}

export interface HomeOvertimeSummary {
  overtimeMinutes: number;
  totalWorkMinutes: number;
}

export interface HomeSummaryState {
  loadState: HomeSummaryLoadState;
  leaveCards: HomeLeaveSummaryCard[];
  overtime: HomeOvertimeSummary;
  monthAttendance: AttendanceRecord[];
  approvedLeave: LeaveRequestRecord[];
  error: string | null;
  refresh: () => void;
}

export function useHomeSummaries(): HomeSummaryState {
  const { token, signOut } = useAuth();
  const router = useRouter();

  const [loadState, setLoadState] = useState<HomeSummaryLoadState>('idle');
  const [leaveCards, setLeaveCards] = useState<HomeLeaveSummaryCard[]>(defaultLeaveCards());
  const [overtime, setOvertime] = useState<HomeOvertimeSummary>({
    overtimeMinutes: 0,
    totalWorkMinutes: 0,
  });
  const [monthAttendance, setMonthAttendance] = useState<AttendanceRecord[]>([]);
  const [approvedLeave, setApprovedLeave] = useState<LeaveRequestRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [signOut, router]);

  const fetchData = useCallback(async () => {
    if (!token) {
      setLeaveCards(defaultLeaveCards());
      setOvertime({ overtimeMinutes: 0, totalWorkMinutes: 0 });
      setMonthAttendance([]);
      setApprovedLeave([]);
      setLoadState('idle');
      return;
    }

    setLoadState('loading');
    setError(null);

    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const monthStart = new Date(currentYear, now.getMonth(), 1);
      const monthEnd = new Date(currentYear, now.getMonth() + 1, 0);
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31);

      const [balances, approvedLeave, attendance] = await Promise.all([
        fetchAllLeaveBalances(token),
        fetchAllLeaveRequests(token, { status: 'APPROVED' }),
        fetchAllAttendance(token, {
          startDate: formatDateParam(monthStart),
          endDate: formatDateParam(monthEnd),
        }),
      ]);

      setLeaveCards(buildLeaveCards(balances, approvedLeave, currentYear, yearStart, yearEnd));
      setMonthAttendance(attendance);
      setApprovedLeave(approvedLeave);
      setOvertime(buildOvertimeSummary(attendance));
      setLoadState('success');
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        void handleSessionExpired();
        return;
      }
      setLeaveCards(defaultLeaveCards());
      setOvertime({ overtimeMinutes: 0, totalWorkMinutes: 0 });
      setMonthAttendance([]);
      setApprovedLeave([]);
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลสรุปได้');
      setLoadState('error');
    }
  }, [token, handleSessionExpired]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
    loadState,
    leaveCards,
    overtime,
    monthAttendance,
    approvedLeave,
    error,
    refresh: fetchData,
  };
}

async function fetchAllAttendance(
  token: string,
  params: { startDate?: string; endDate?: string },
): Promise<AttendanceRecord[]> {
  const records: AttendanceRecord[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await getMyAttendance(token, page, PAGE_LIMIT, params);
    records.push(...response.data);
    totalPages = response.meta.totalPages || 1;
    page += 1;
  }

  return records;
}

async function fetchAllLeaveBalances(token: string): Promise<LeaveBalanceRecord[]> {
  const records: LeaveBalanceRecord[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await getMyLeaveBalance(token, page, PAGE_LIMIT);
    records.push(...response.data);
    totalPages = response.meta.totalPages || 1;
    page += 1;
  }

  return records;
}

async function fetchAllLeaveRequests(
  token: string,
  params: {
    status?: LeaveRequestStatus;
    leaveType?: LeaveType;
    startDate?: string;
    endDate?: string;
  },
): Promise<LeaveRequestRecord[]> {
  const records: LeaveRequestRecord[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await getMyLeaveRequests(token, page, PAGE_LIMIT, params);
    records.push(...response.data);
    totalPages = response.meta.totalPages || 1;
    page += 1;
  }

  return records;
}

function buildLeaveCards(
  balances: LeaveBalanceRecord[],
  requests: LeaveRequestRecord[],
  year: number,
  yearStart: Date,
  yearEnd: Date,
): HomeLeaveSummaryCard[] {
  const currentYearBalances = balances.filter((balance) => balance.year === year);
  const sickBalance = currentYearBalances.find((balance) => balance.leaveType === 'SICK');
  const vacationBalance = currentYearBalances.find((balance) => balance.leaveType === 'VACATION');

  let sickUsedDays = 0;
  let vacationUsedDays = 0;

  for (const request of requests) {
    if (request.status !== 'APPROVED') continue;

    const usedDays = countOverlappingDays(request.startDate, request.endDate, yearStart, yearEnd);
    if (usedDays <= 0) continue;

    if (request.leaveType === 'SICK') {
      sickUsedDays += usedDays;
    } else if (request.leaveType === 'VACATION') {
      vacationUsedDays += usedDays;
    }
  }

  const sickTotal = sickBalance?.totalDays ?? 0;
  const sickFirstTotal = Math.min(30, sickTotal);
  const sickOverTotal = Math.max(0, sickTotal - 30);
  const sickFirstUsed = Math.min(30, sickUsedDays);
  const sickOverUsed = Math.max(0, sickUsedDays - 30);

  const vacationTotal = vacationBalance?.totalDays ?? 0;
  const vacationUsed = vacationUsedDays;

  return [
    {
      key: 'sick-first',
      title: 'ลาป่วย (30 วันแรก)',
      totalDays: sickFirstTotal,
      usedDays: sickFirstUsed,
      availableDays: Math.max(0, sickFirstTotal - sickFirstUsed),
    },
    {
      key: 'sick-over',
      title: 'ลาป่วย (เกิน 30 วัน)',
      totalDays: sickOverTotal,
      usedDays: sickOverUsed,
      availableDays: Math.max(0, sickOverTotal - sickOverUsed),
    },
    {
      key: 'vacation',
      title: 'ลาพักร้อน',
      totalDays: vacationTotal,
      usedDays: vacationUsed,
      availableDays: Math.max(0, vacationTotal - vacationUsed),
    },
  ];
}

function buildOvertimeSummary(attendance: AttendanceRecord[]): HomeOvertimeSummary {
  let overtimeMinutes = 0;
  let totalWorkMinutes = 0;

  for (const record of attendance) {
    if (!record.checkIn || !record.checkOut) continue;

    const checkIn = new Date(record.checkIn);
    const checkOut = new Date(record.checkOut);
    const workedMinutes = Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 60000);
    const scheduledCheckOut = new Date(
      checkOut.getFullYear(),
      checkOut.getMonth(),
      checkOut.getDate(),
      17,
      30,
    );

    totalWorkMinutes += workedMinutes;
    overtimeMinutes += Math.max(0, (checkOut.getTime() - scheduledCheckOut.getTime()) / 60000);
  }

  return { overtimeMinutes, totalWorkMinutes };
}

function defaultLeaveCards(): HomeLeaveSummaryCard[] {
  return [
    {
      key: 'sick-first',
      title: 'ลาป่วย (30 วันแรก)',
      totalDays: 0,
      usedDays: 0,
      availableDays: 0,
    },
    {
      key: 'sick-over',
      title: 'ลาป่วย (เกิน 30 วัน)',
      totalDays: 0,
      usedDays: 0,
      availableDays: 0,
    },
    {
      key: 'vacation',
      title: 'ลาพักร้อน',
      totalDays: 0,
      usedDays: 0,
      availableDays: 0,
    },
  ];
}

function formatDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string): Date {
  const datePart = value.includes('T') ? value.split('T')[0] : value;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function countOverlappingDays(
  startDate: string,
  endDate: string,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const leaveStart = parseDateOnly(startDate);
  const leaveEnd = parseDateOnly(endDate);
  const overlapStart = Math.max(leaveStart.getTime(), rangeStart.getTime());
  const overlapEnd = Math.min(leaveEnd.getTime(), rangeEnd.getTime());

  if (overlapStart > overlapEnd) return 0;
  return Math.floor((overlapEnd - overlapStart) / DAY_IN_MS) + 1;
}
