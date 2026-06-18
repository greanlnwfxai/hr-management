'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getEmployee,
  getLeaveBalances,
  getLeave,
  getAttendance,
  provisionEmployeeAccount,
  resetEmployeeAccountPassword,
  type EmployeeFull,
  type LeaveBalance,
  type LeaveRequest,
  type AttendanceRecord,
  type PaginatedResponse,
  type ProvisionedAccount,
  ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    INACTIVE: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400',
    RESIGNED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    PRESENT:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    LATE:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    ABSENT:   'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    PENDING:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>
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
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
      <dt className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-800 dark:text-zinc-200 sm:mt-0">{value}</dd>
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

  const [provUsername, setProvUsername] = useState('');
  const [provRole, setProvRole] = useState('EMPLOYEE');
  const [provLoading, setProvLoading] = useState(false);
  const [provError, setProvError] = useState('');
  const [provResult, setProvResult] = useState<ProvisionedAccount | null>(null);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<ProvisionedAccount | null>(null);
  const [resetError, setResetError] = useState('');

  const USERNAME_RE = /^[a-z0-9._-]+$/;

  useEffect(() => {
    if (!params.id) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const emp = await getEmployee(params.id);
        setEmployee(emp);

        if (admin) {
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

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setProvError('');
    setProvResult(null);
    if (!USERNAME_RE.test(provUsername)) {
      setProvError('ชื่อผู้ใช้ไม่ถูกต้อง: ใช้ได้เฉพาะ a-z 0-9 . _ -');
      return;
    }
    setProvLoading(true);
    try {
      const result = await provisionEmployeeAccount(params.id, { username: provUsername, role: provRole });
      setProvResult(result);
    } catch (err) {
      setProvError(err instanceof ApiError ? err.message : 'สร้างบัญชีล้มเหลว');
    } finally {
      setProvLoading(false);
    }
  }

  async function handleResetPassword() {
    setResetError('');
    setResetResult(null);
    setResetLoading(true);
    try {
      const result = await resetEmployeeAccountPassword(params.id);
      setResetResult(result);
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'รีเซ็ตรหัสผ่านล้มเหลว');
    } finally {
      setResetLoading(false);
    }
  }

  function suggestUsername(firstName?: string, lastName?: string): string {
    if (!firstName || !lastName) return '';
    const lastInitial = lastName[0]?.toLowerCase() ?? '';
    const firstPart = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!lastInitial.match(/[a-z]/) || !firstPart) return '';
    return `${lastInitial}.${firstPart}`;
  }

  if (loading) return <LoadingState message="Loading employee profile…" />;
  if (error) return <ErrorState message={error.message} status={error.status} />;
  if (!employee) return null;

  return (
    <div className="max-w-4xl">
      {/* Back */}
      <button
        onClick={() => router.push('/employees')}
        className="mb-5 flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Employees
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-zinc-400 dark:text-zinc-500">{employee.employeeCode}</p>
        </div>
        {statusBadge(employee.status)}
      </div>

      {/* Details card */}
      <div className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Employee Details</h2>
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

      {/* Account Provisioning — admin only */}
      {admin && (
        <div className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">บัญชีเข้าใช้งาน</h2>

          {provResult ? (
            <div className="rounded-md border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">⚠️ กรุณาคัดลอกรหัสผ่านนี้ไว้ ระบบจะแสดงเพียงครั้งเดียว</p>
              <p className="text-zinc-700 dark:text-zinc-300">ชื่อผู้ใช้: <span className="font-mono font-semibold">{provResult.username}</span></p>
              <p className="text-zinc-700 dark:text-zinc-300 mt-1">รหัสผ่านชั่วคราว: <span className="font-mono font-semibold text-red-600 dark:text-red-400">{provResult.temporaryPassword}</span></p>
              <button onClick={() => setProvResult(null)} className="mt-3 text-xs text-zinc-500 hover:text-zinc-700 underline">สร้างบัญชีใหม่</button>
            </div>
          ) : (
            <form onSubmit={handleProvision} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">ชื่อผู้ใช้</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={provUsername}
                    onChange={(e) => setProvUsername(e.target.value)}
                    placeholder="เช่น j.pichai"
                    className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    required
                  />
                  {employee && (
                    <button
                      type="button"
                      onClick={() => setProvUsername(suggestUsername(employee.firstName, employee.lastName))}
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      แนะนำ: {suggestUsername(employee.firstName, employee.lastName) || '—'}
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">อนุญาต: a-z 0-9 . _ -</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">บทบาท</label>
                <select
                  value={provRole}
                  onChange={(e) => setProvRole(e.target.value)}
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  <option value="HR_ADMIN">HR Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </div>
              {provError && <p className="text-xs text-red-600 dark:text-red-400">{provError}</p>}
              <button
                type="submit"
                disabled={provLoading || !provUsername.trim()}
                className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50"
              >
                {provLoading ? 'กำลังสร้าง…' : 'สร้างบัญชีเข้าใช้งาน'}
              </button>
            </form>
          )}

          {/* Reset Password */}
          <div className="mt-4 border-t border-zinc-100 dark:border-zinc-700 pt-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">รีเซ็ตรหัสผ่าน (สำหรับบัญชีที่มีอยู่แล้ว)</p>
            {resetResult ? (
              <div className="rounded-md border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ กรุณาคัดลอกรหัสผ่านนี้ไว้ ระบบจะแสดงเพียงครั้งเดียว</p>
                <p className="text-zinc-700 dark:text-zinc-300">รหัสผ่านชั่วคราว: <span className="font-mono font-semibold text-red-600 dark:text-red-400">{resetResult.temporaryPassword}</span></p>
                <button onClick={() => setResetResult(null)} className="mt-2 text-xs text-zinc-500 hover:text-zinc-700 underline">ปิด</button>
              </div>
            ) : (
              <>
                {resetError && <p className="text-xs text-red-600 dark:text-red-400 mb-1">{resetError}</p>}
                <button
                  onClick={handleResetPassword}
                  disabled={resetLoading}
                  className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                >
                  {resetLoading ? 'กำลังรีเซ็ต…' : 'รีเซ็ตรหัสผ่าน'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Leave Balances — admin only */}
      {admin && (
        <div className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Leave Balances</h2>
          {balances.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">No leave balances found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {balances.map((b) => (
                <div key={b.id} className="rounded-md border border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-700/50 p-3">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{b.leaveType} · {b.year}</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{b.remainingDays}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">remaining / {b.totalDays}</p>
                  <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">used: {b.usedDays}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Leave Requests — admin only */}
      {admin && leaveRequests && (
        <div className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Recent Leave Requests
            <span className="ml-2 text-xs font-normal text-zinc-400 dark:text-zinc-500">({leaveRequests.meta.total} total)</span>
          </h2>
          {leaveRequests.data.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">No leave requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100 dark:divide-zinc-700 text-sm">
                <thead>
                  <tr>
                    {['Type', 'Start', 'End', 'Days', 'Status'].map((h) => (
                      <th key={h} className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-700">
                  {leaveRequests.data.map((req) => (
                    <tr key={req.id}>
                      <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{req.leaveType}</td>
                      <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{formatDate(req.startDate)}</td>
                      <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{formatDate(req.endDate)}</td>
                      <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{req.totalDays}</td>
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
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Recent Attendance
            <span className="ml-2 text-xs font-normal text-zinc-400 dark:text-zinc-500">({attendance.meta.total} total)</span>
          </h2>
          {attendance.data.length === 0 ? (
            <EmptyState message="No attendance records." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100 dark:divide-zinc-700 text-sm">
                <thead>
                  <tr>
                    {['Date', 'Check-In', 'Check-Out', 'Status'].map((h) => (
                      <th key={h} className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-700">
                  {attendance.data.map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-2 pr-4 text-zinc-700 dark:text-zinc-300">{formatDate(rec.date)}</td>
                      <td className="py-2 pr-4 font-mono text-zinc-600 dark:text-zinc-400">{formatTime(rec.checkIn)}</td>
                      <td className="py-2 pr-4 font-mono text-zinc-600 dark:text-zinc-400">{formatTime(rec.checkOut)}</td>
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
