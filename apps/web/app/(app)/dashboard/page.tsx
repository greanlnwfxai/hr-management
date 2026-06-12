'use client';

import { useEffect, useState } from 'react';
import { getDashboard, type DashboardData } from '@/lib/api';
import { ApiError } from '@/lib/api';
import StatCard from '@/components/StatCard';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    PRESENT: 'bg-green-100 text-green-700',
    APPROVED: 'bg-green-100 text-green-700',
    INACTIVE: 'bg-zinc-100 text-zinc-600',
    ABSENT: 'bg-red-100 text-red-600',
    REJECTED: 'bg-red-100 text-red-600',
    LATE: 'bg-amber-100 text-amber-700',
    PENDING: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getDashboard();
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, status: err.status });
      } else {
        setError({ message: 'Failed to load dashboard.' });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingState message="Loading dashboard…" />;
  if (error) return <ErrorState message={error.message} status={error.status} onRetry={load} />;
  if (!data) return null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
        <span className="text-xs text-zinc-400">
          {formatDate(data.generatedAt)} · {data.timezone}
        </span>
      </div>

      {/* Employee stats */}
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Employees</p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={data.employees.totalEmployees} />
        <StatCard label="Active" value={data.employees.activeEmployees} />
        <StatCard label="Inactive" value={data.employees.inactiveEmployees} />
        <StatCard label="Resigned" value={data.employees.resignedEmployees} />
        <StatCard label="Departments" value={data.employees.totalDepartments} />
        <StatCard label="Positions" value={data.employees.totalPositions} />
      </div>

      {/* Attendance stats */}
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
        Attendance · {data.attendance.todayDate}
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Present" value={data.attendance.todayPresentCount} />
        <StatCard label="Late" value={data.attendance.todayLateCount} />
        <StatCard label="Absent" value={data.attendance.todayAbsentCount} />
        <StatCard label="Clocked In" value={data.attendance.todayClockedInCount} />
        <StatCard label="Clocked Out" value={data.attendance.todayClockedOutCount} />
      </div>

      {/* Leave stats */}
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Leave</p>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total" value={data.leave.totalLeaveRequests} />
        <StatCard label="Pending" value={data.leave.pendingLeaveRequests} />
        <StatCard label="Approved" value={data.leave.approvedLeaveRequests} />
        <StatCard label="Rejected" value={data.leave.rejectedLeaveRequests} />
        <StatCard label="Low Balance" value={data.leave.lowLeaveBalanceCount} />
      </div>

      {/* Recent sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent employees */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">Recent Employees</h2>
          {data.recent.employees.length === 0 ? (
            <p className="text-sm text-zinc-400">No recent employees.</p>
          ) : (
            <ul className="space-y-2">
              {data.recent.employees.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-800">{e.firstName} {e.lastName}</span>
                  {statusBadge(e.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent attendance */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">Recent Attendance</h2>
          {data.recent.attendance.length === 0 ? (
            <p className="text-sm text-zinc-400">No recent attendance.</p>
          ) : (
            <ul className="space-y-2">
              {data.recent.attendance.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-800">
                    {a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : a.date}
                  </span>
                  {statusBadge(a.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent leave requests */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">Recent Leave Requests</h2>
          {data.recent.leaveRequests.length === 0 ? (
            <p className="text-sm text-zinc-400">No recent leave requests.</p>
          ) : (
            <ul className="space-y-2">
              {data.recent.leaveRequests.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-800">
                    {l.employee
                      ? `${l.employee.firstName} ${l.employee.lastName}`
                      : l.leaveType}
                  </span>
                  {statusBadge(l.status)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
