'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getEmployee,
  getLeaveBalances,
  getLeave,
  getAttendance,
  type EmployeeFull,
  type LeaveBalance,
  type LeaveRequest,
  type AttendanceRecord,
  type PaginatedResponse,
  ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    INACTIVE: 'bg-zinc-100 text-zinc-500',
    RESIGNED: 'bg-red-100 text-red-600',
    PRESENT: 'bg-green-100 text-green-700',
    LATE: 'bg-amber-100 text-amber-700',
    ABSENT: 'bg-red-100 text-red-600',
    PENDING: 'bg-blue-100 text-blue-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {status}
    </span>
  );
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-zinc-100 last:border-0">
      <dt className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-800 sm:mt-0">{value}</dd>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = getUser();
  const admin = isAdmin(user);

  const [employee, setEmployee] = useState<EmployeeFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<PaginatedResponse<LeaveRequest> | null>(null);
  const [attendance, setAttendance] = useState<PaginatedResponse<AttendanceRecord> | null>(null);

  useEffect(() => {
    if (!params.id) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const emp = await getEmployee(params.id);
        setEmployee(emp);

        if (admin) {
          // Load related data in parallel — non-fatal if they fail
          await Promise.allSettled([
            getLeaveBalances({ employeeId: params.id, limit: 20 }).then((r) => setBalances(r.data)),
            getLeave({ employeeId: params.id, limit: 5 }).then((r) => setLeaveRequests(r)),
            getAttendance({ employeeId: params.id, limit: 5 }).then((r) => setAttendance(r)),
          ]);
        }
      } catch (err) {
        setError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: 'Failed to load employee.' });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params.id, admin]);

  if (loading) return <LoadingState message="Loading employee profile…" />;
  if (error) return <ErrorState message={error.message} status={error.status} />;
  if (!employee) return null;

  return (
    <div className="max-w-4xl">
      {/* Back */}
      <button
        onClick={() => router.push('/employees')}
        className="mb-5 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Employees
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-zinc-400">{employee.employeeCode}</p>
        </div>
        {statusBadge(employee.status)}
      </div>

      {/* Details card */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white px-6 py-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-700">Employee Details</h2>
        <dl>
          <InfoRow label="Full Name" value={`${employee.firstName} ${employee.lastName}`} />
          <InfoRow label="Employee Code" value={<span className="font-mono">{employee.employeeCode}</span>} />
          <InfoRow label="Email" value={employee.email ?? '—'} />
          <InfoRow label="Phone" value={employee.phone ?? '—'} />
          <InfoRow label="Status" value={statusBadge(employee.status)} />
          <InfoRow label="Department" value={employee.department?.name ?? '—'} />
          <InfoRow label="Position" value={employee.position?.title ?? '—'} />
          <InfoRow label="Manager" value={employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : '—'} />
          <InfoRow label="Hire Date" value={formatDate(employee.hireDate)} />
          <InfoRow label="Date of Birth" value={formatDate(employee.dateOfBirth)} />
          <InfoRow label="Created" value={formatDate(employee.createdAt)} />
        </dl>
      </div>

      {/* Leave Balances — admin only */}
      {admin && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white px-6 py-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">Leave Balances</h2>
          {balances.length === 0 ? (
            <p className="text-sm text-zinc-400">No leave balances found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {balances.map((b) => (
                <div key={b.id} className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">{b.leaveType} · {b.year}</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">{b.remainingDays}</p>
                  <p className="text-xs text-zinc-400">remaining / {b.totalDays}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">used: {b.usedDays}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Leave Requests — admin only */}
      {admin && leaveRequests && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white px-6 py-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">
            Recent Leave Requests
            <span className="ml-2 text-xs font-normal text-zinc-400">({leaveRequests.meta.total} total)</span>
          </h2>
          {leaveRequests.data.length === 0 ? (
            <p className="text-sm text-zinc-400">No leave requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100 text-sm">
                <thead>
                  <tr>
                    {['Type', 'Start', 'End', 'Days', 'Status'].map((h) => (
                      <th key={h} className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {leaveRequests.data.map((req) => (
                    <tr key={req.id}>
                      <td className="py-2 pr-4 text-zinc-700">{req.leaveType}</td>
                      <td className="py-2 pr-4 text-zinc-600">{formatDate(req.startDate)}</td>
                      <td className="py-2 pr-4 text-zinc-600">{formatDate(req.endDate)}</td>
                      <td className="py-2 pr-4 text-zinc-600">{req.totalDays}</td>
                      <td className="py-2">{statusBadge(req.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Recent Attendance — admin only */}
      {admin && attendance && (
        <div className="rounded-lg border border-zinc-200 bg-white px-6 py-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700">
            Recent Attendance
            <span className="ml-2 text-xs font-normal text-zinc-400">({attendance.meta.total} total)</span>
          </h2>
          {attendance.data.length === 0 ? (
            <EmptyState message="No attendance records." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100 text-sm">
                <thead>
                  <tr>
                    {['Date', 'Check-In', 'Check-Out', 'Status'].map((h) => (
                      <th key={h} className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {attendance.data.map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-2 pr-4 text-zinc-700">{formatDate(rec.date)}</td>
                      <td className="py-2 pr-4 font-mono text-zinc-600">{formatTime(rec.checkIn)}</td>
                      <td className="py-2 pr-4 font-mono text-zinc-600">{formatTime(rec.checkOut)}</td>
                      <td className="py-2">{statusBadge(rec.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
