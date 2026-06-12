'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  clockIn,
  clockOut,
  getMyAttendance,
  getAttendance,
  type AttendanceRecord,
  type PaginatedResponse,
  ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Toast, { type ToastData } from '@/components/Toast';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PRESENT: 'bg-green-100 text-green-700',
    LATE: 'bg-amber-100 text-amber-700',
    ABSENT: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {status}
    </span>
  );
}

function formatTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const INPUT = 'rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';

export default function AttendancePage() {
  const user = getUser();
  const admin = isAdmin(user);

  const [toast, setToast] = useState<ToastData | null>(null);

  // Today's record
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [clockLoading, setClockLoading] = useState(false);

  // My attendance history
  const [myResult, setMyResult] = useState<PaginatedResponse<AttendanceRecord> | null>(null);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState<{ message: string; status?: number } | null>(null);
  const [myPage, setMyPage] = useState(1);
  const [myStartDate, setMyStartDate] = useState('');
  const [myEndDate, setMyEndDate] = useState('');

  // Admin all attendance
  const [allResult, setAllResult] = useState<PaginatedResponse<AttendanceRecord> | null>(null);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState<{ message: string; status?: number } | null>(null);
  const [allPage, setAllPage] = useState(1);
  const [allStatus, setAllStatus] = useState('');
  const [allStartDate, setAllStartDate] = useState('');
  const [allEndDate, setAllEndDate] = useState('');

  // Bangkok time
  const [bangkokNow, setBangkokNow] = useState('');

  useEffect(() => {
    function tick() {
      setBangkokNow(new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const loadMyAttendance = useCallback(async () => {
    setMyLoading(true);
    setMyError(null);
    try {
      const data = await getMyAttendance({
        page: myPage,
        limit: 10,
        startDate: myStartDate || undefined,
        endDate: myEndDate || undefined,
      });
      setMyResult(data);
      const today = new Date().toISOString().slice(0, 10);
      const rec = data.data.find((r) => r.date?.slice(0, 10) === today);
      if (rec) setTodayRecord(rec);
    } catch (err) {
      setMyError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: 'Failed to load attendance.' });
    } finally {
      setMyLoading(false);
    }
  }, [myPage, myStartDate, myEndDate]);

  const loadAllAttendance = useCallback(async () => {
    if (!admin) return;
    setAllLoading(true);
    setAllError(null);
    try {
      const data = await getAttendance({
        page: allPage,
        limit: 20,
        status: allStatus || undefined,
        startDate: allStartDate || undefined,
        endDate: allEndDate || undefined,
      });
      setAllResult(data);
    } catch (err) {
      setAllError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: 'Failed to load all attendance.' });
    } finally {
      setAllLoading(false);
    }
  }, [admin, allPage, allStatus, allStartDate, allEndDate]);

  useEffect(() => { loadMyAttendance(); }, [loadMyAttendance]);
  useEffect(() => { loadAllAttendance(); }, [loadAllAttendance]);

  async function handleClockIn() {
    setClockLoading(true);
    try {
      const rec = await clockIn();
      setTodayRecord(rec);
      setToast({ message: `Clocked in at ${formatTime(rec.checkIn)} — Status: ${rec.status}`, type: 'success' });
      loadMyAttendance();
    } catch (err) {
      if (err instanceof ApiError) {
        setToast({ message: err.status === 409 ? 'Already clocked in for today.' : err.message, type: 'error' });
      } else {
        setToast({ message: 'Clock in failed.', type: 'error' });
      }
    } finally {
      setClockLoading(false);
    }
  }

  async function handleClockOut() {
    setClockLoading(true);
    try {
      const rec = await clockOut();
      setTodayRecord(rec);
      setToast({ message: `Clocked out at ${formatTime(rec.checkOut)}`, type: 'success' });
      loadMyAttendance();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setToast({ message: 'Already clocked out for today.', type: 'error' });
        else if (err.status === 404) setToast({ message: 'No clock-in found for today. Please clock in first.', type: 'error' });
        else setToast({ message: err.message, type: 'error' });
      } else {
        setToast({ message: 'Clock out failed.', type: 'error' });
      }
    } finally {
      setClockLoading(false);
    }
  }

  function clearMyFilters() {
    setMyStartDate('');
    setMyEndDate('');
    setMyPage(1);
  }

  function clearAllFilters() {
    setAllStatus('');
    setAllStartDate('');
    setAllEndDate('');
    setAllPage(1);
  }

  const hasClockedIn = !!todayRecord?.checkIn;
  const hasClockedOut = !!todayRecord?.checkOut;

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Attendance</h1>
        <div className="text-right">
          <p className="font-mono text-sm text-zinc-700">{bangkokNow}</p>
          <p className="text-xs text-zinc-400">Asia/Bangkok (UTC+7) · Late after 09:00</p>
        </div>
      </div>

      {/* Clock In / Out panel */}
      <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-zinc-700">Today's Attendance</h2>

        {todayRecord && (
          <div className="mb-4 flex flex-wrap gap-4 text-sm text-zinc-600">
            <span>Check-in: <strong className="text-zinc-900">{formatTime(todayRecord.checkIn)}</strong></span>
            <span>Check-out: <strong className="text-zinc-900">{formatTime(todayRecord.checkOut)}</strong></span>
            <span>Status: {statusBadge(todayRecord.status)}</span>
          </div>
        )}

        {!todayRecord && !myLoading && (
          <p className="mb-4 text-sm text-zinc-400">No attendance record for today yet.</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleClockIn}
            disabled={clockLoading || hasClockedIn}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {clockLoading && !hasClockedIn ? 'Clocking in…' : 'Clock In'}
          </button>
          <button
            onClick={handleClockOut}
            disabled={clockLoading || !hasClockedIn || hasClockedOut}
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
          >
            {clockLoading && hasClockedIn && !hasClockedOut ? 'Clocking out…' : 'Clock Out'}
          </button>
        </div>
      </div>

      {/* My attendance history */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-700">My Attendance History</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={myStartDate} onChange={(e) => { setMyStartDate(e.target.value); setMyPage(1); }} className={INPUT} title="Start date" />
            <span className="text-xs text-zinc-400">to</span>
            <input type="date" value={myEndDate} onChange={(e) => { setMyEndDate(e.target.value); setMyPage(1); }} className={INPUT} title="End date" />
            {(myStartDate || myEndDate) && (
              <button onClick={clearMyFilters} className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50">Clear</button>
            )}
          </div>
        </div>
        {myLoading && <LoadingState message="Loading…" />}
        {!myLoading && myError && <ErrorState message={myError.message} status={myError.status} onRetry={loadMyAttendance} />}
        {!myLoading && !myError && myResult && (
          <>
            {myResult.data.length === 0 ? (
              <EmptyState message="No attendance records for the selected range." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                <table className="min-w-full divide-y divide-zinc-200 text-sm">
                  <thead className="bg-zinc-50">
                    <tr>
                      {['Date', 'Check-In', 'Check-Out', 'Status', 'Note'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {myResult.data.map((rec) => (
                      <tr key={rec.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 text-zinc-900">{formatDate(rec.date)}</td>
                        <td className="px-4 py-3 font-mono text-zinc-600">{formatTime(rec.checkIn)}</td>
                        <td className="px-4 py-3 font-mono text-zinc-600">{formatTime(rec.checkOut)}</td>
                        <td className="px-4 py-3">{statusBadge(rec.status)}</td>
                        <td className="px-4 py-3 text-xs text-zinc-400">{rec.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {myResult.meta.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
                <span>Page {myResult.meta.page} of {myResult.meta.totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setMyPage((p) => Math.max(1, p - 1))} disabled={myResult.meta.page <= 1} className="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-40">Previous</button>
                  <button onClick={() => setMyPage((p) => Math.min(myResult.meta.totalPages, p + 1))} disabled={myResult.meta.page >= myResult.meta.totalPages} className="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Admin: all attendance */}
      {admin && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-700">All Attendance Records</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select value={allStatus} onChange={(e) => { setAllStatus(e.target.value); setAllPage(1); }} className={INPUT}>
                <option value="">All Statuses</option>
                <option value="PRESENT">PRESENT</option>
                <option value="LATE">LATE</option>
                <option value="ABSENT">ABSENT</option>
              </select>
              <input type="date" value={allStartDate} onChange={(e) => { setAllStartDate(e.target.value); setAllPage(1); }} className={INPUT} title="Start date" />
              <span className="text-xs text-zinc-400">to</span>
              <input type="date" value={allEndDate} onChange={(e) => { setAllEndDate(e.target.value); setAllPage(1); }} className={INPUT} title="End date" />
              {(allStatus || allStartDate || allEndDate) && (
                <button onClick={clearAllFilters} className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50">Clear</button>
              )}
            </div>
          </div>
          {allLoading && <LoadingState message="Loading all records…" />}
          {!allLoading && allError && <ErrorState message={allError.message} status={allError.status} onRetry={loadAllAttendance} />}
          {!allLoading && !allError && allResult && (
            <>
              {allResult.data.length === 0 ? (
                <EmptyState message="No attendance records for the selected filters." />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        {['Employee', 'Date', 'Check-In', 'Check-Out', 'Status'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {allResult.data.map((rec) => (
                        <tr key={rec.id} className="hover:bg-zinc-50">
                          <td className="px-4 py-3 font-medium text-zinc-900">
                            {rec.employee ? `${rec.employee.firstName} ${rec.employee.lastName}` : '—'}
                            {rec.employee?.employeeCode && (
                              <span className="ml-1 font-mono text-xs text-zinc-400">{rec.employee.employeeCode}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{formatDate(rec.date)}</td>
                          <td className="px-4 py-3 font-mono text-zinc-600">{formatTime(rec.checkIn)}</td>
                          <td className="px-4 py-3 font-mono text-zinc-600">{formatTime(rec.checkOut)}</td>
                          <td className="px-4 py-3">{statusBadge(rec.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {allResult.meta.totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
                  <span>Page {allResult.meta.page} of {allResult.meta.totalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setAllPage((p) => Math.max(1, p - 1))} disabled={allResult.meta.page <= 1} className="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-40">Previous</button>
                    <button onClick={() => setAllPage((p) => Math.min(allResult.meta.totalPages, p + 1))} disabled={allResult.meta.page >= allResult.meta.totalPages} className="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
