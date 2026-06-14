'use client';

import { useEffect, useState } from 'react';
import { getDashboard, type DashboardData } from '@/lib/api';
import { ApiError } from '@/lib/api';
import StatCard from '@/components/StatCard';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { useLanguage } from '@/hooks/useLanguage';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    PRESENT:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    INACTIVE: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
    ABSENT:   'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    LATE:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    PENDING:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const { t } = useLanguage();
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
        setError({ message: t('error_dashboard') });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState testid="loading-state" message={t('loading_dashboard')} />;
  if (error) return <ErrorState testid="error-state" message={error.message} status={error.status} onRetry={load} />;
  if (!data) return null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 data-testid="page-title-dashboard" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t('page_dashboard')}
        </h1>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {formatDate(data.generatedAt)} · {data.timezone}
        </span>
      </div>

      {/* Employee stats */}
      <p data-testid="stat-section-employees" className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {t('dash_employees')}
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard testid="stat-total"       label={t('dash_total')}       value={data.employees.totalEmployees} />
        <StatCard testid="stat-active"      label={t('dash_active')}      value={data.employees.activeEmployees} />
        <StatCard testid="stat-inactive"    label={t('dash_inactive')}    value={data.employees.inactiveEmployees} />
        <StatCard testid="stat-resigned"    label={t('dash_resigned')}    value={data.employees.resignedEmployees} />
        <StatCard testid="stat-departments" label={t('dash_departments')} value={data.employees.totalDepartments} />
        <StatCard testid="stat-positions"   label={t('dash_positions')}   value={data.employees.totalPositions} />
      </div>

      {/* Attendance stats */}
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {t('dash_attendance')} · {data.attendance.todayDate}
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard testid="stat-present"    label={t('dash_present')}     value={data.attendance.todayPresentCount} />
        <StatCard testid="stat-late"       label={t('dash_late')}        value={data.attendance.todayLateCount} />
        <StatCard testid="stat-absent"     label={t('dash_absent')}      value={data.attendance.todayAbsentCount} />
        <StatCard testid="stat-clocked-in" label={t('dash_clocked_in')}  value={data.attendance.todayClockedInCount} />
        <StatCard testid="stat-clocked-out" label={t('dash_clocked_out')} value={data.attendance.todayClockedOutCount} />
      </div>

      {/* Leave stats */}
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {t('dash_leave')}
      </p>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard testid="stat-leave-total"       label={t('dash_total')}       value={data.leave.totalLeaveRequests} />
        <StatCard testid="stat-pending"           label={t('dash_pending')}     value={data.leave.pendingLeaveRequests} />
        <StatCard testid="stat-approved"          label={t('dash_approved')}    value={data.leave.approvedLeaveRequests} />
        <StatCard testid="stat-rejected"          label={t('dash_rejected')}    value={data.leave.rejectedLeaveRequests} />
        <StatCard testid="stat-low-balance"       label={t('dash_low_balance')} value={data.leave.lowLeaveBalanceCount} />
      </div>

      {/* Recent sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
          <h2 data-testid="section-recent-employees" className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t('dash_recent_employees')}
          </h2>
          {data.recent.employees.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('dash_no_recent_employees')}</p>
          ) : (
            <ul className="space-y-2">
              {data.recent.employees.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-800 dark:text-zinc-200">{e.firstName} {e.lastName}</span>
                  {statusBadge(e.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
          <h2 data-testid="section-recent-attendance" className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t('dash_recent_attendance')}
          </h2>
          {data.recent.attendance.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('dash_no_recent_attendance')}</p>
          ) : (
            <ul className="space-y-2">
              {data.recent.attendance.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : a.date}
                  </span>
                  {statusBadge(a.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
          <h2 data-testid="section-recent-leave" className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t('dash_recent_leave')}
          </h2>
          {data.recent.leaveRequests.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('dash_no_recent_leave')}</p>
          ) : (
            <ul className="space-y-2">
              {data.recent.leaveRequests.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : l.leaveType}
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
