'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getEmployee,
  getEmployeeAccount,
  getLeaveBalances,
  getLeave,
  getAttendance,
  provisionEmployeeAccount,
  resetEmployeeAccountPassword,
  type EmployeeFull,
  type EmployeeAccountInfo,
  type LeaveBalance,
  type LeaveRequest,
  type AttendanceRecord,
  type PaginatedResponse,
  type ProvisionedAccount,
  ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import { roleLabel } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
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

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
      <dt className="w-44 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-800 dark:text-zinc-200 sm:mt-0">{value}</dd>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: no-op if clipboard API unavailable
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded border border-zinc-300 dark:border-zinc-600 px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {t('acct_copied')}
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

// One-time password result panel (create or reset)
function TempPasswordPanel({
  result,
  onDone,
}: {
  result: ProvisionedAccount;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const loginInstruction = `ชื่อผู้ใช้: ${result.username ?? result.email}\nรหัสผ่านชั่วคราว: ${result.temporaryPassword}\n\nกรุณาเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก`;

  return (
    <div
      data-testid="temp-password-panel"
      className="rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-4"
    >
      <div className="flex items-start gap-2 mb-3">
        <svg className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('acct_temp_pw_panel_title')}</p>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 w-28 shrink-0">{t('acct_username')}</span>
          <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100" data-testid="temp-username">{result.username ?? result.email}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 w-28 shrink-0">{t('acct_reset_pw')}</span>
          <span className="font-mono text-sm font-bold text-red-600 dark:text-red-400" data-testid="temp-password">{result.temporaryPassword}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <CopyButton text={result.username ?? result.email} label={t('acct_copy_username')} />
        <CopyButton text={result.temporaryPassword} label={t('acct_copy_password')} />
        <CopyButton text={loginInstruction} label={t('acct_copy_login_instruction')} />
      </div>

      <div className="rounded border border-amber-200 dark:border-amber-700 bg-white/50 dark:bg-zinc-800/50 px-3 py-2 space-y-1 mb-4">
        <p className="text-xs text-amber-800 dark:text-amber-300">{t('acct_temp_pw_warning')}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('acct_temp_pw_must_change')}</p>
      </div>

      <button
        onClick={onDone}
        data-testid="btn-temp-pw-done"
        className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
      >
        {t('acct_temp_pw_done')}
      </button>
    </div>
  );
}

// Reset password confirmation dialog (inline, not modal)
function ResetConfirmPanel({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div
      data-testid="reset-confirm-panel"
      className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4"
    >
      <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">{t('acct_reset_confirm_title')}</p>
      <p className="text-xs text-red-700 dark:text-red-400 mb-4">{t('acct_reset_confirm_detail')}</p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={loading}
          data-testid="btn-confirm-reset"
          className="rounded-md bg-red-600 hover:bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? t('acct_resetting') : t('acct_reset_confirm_yes')}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

function suggestUsername(firstName?: string, lastName?: string): string {
  if (!firstName || !lastName) return '';
  const lastInitial = lastName[0]?.toLowerCase() ?? '';
  const firstPart = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!lastInitial.match(/[a-z]/) || !firstPart) return '';
  return `${lastInitial}.${firstPart}`;
}

const USERNAME_RE = /^[a-z0-9._-]+$/;

// Account management card (admin only)
function AccountCard({
  employeeId,
  employeeName,
  firstName,
  lastName,
  onAccountChanged,
}: {
  employeeId: string;
  employeeName: string;
  firstName?: string;
  lastName?: string;
  onAccountChanged?: () => void;
}) {
  const { lang, t } = useLanguage();
  const [accountInfo, setAccountInfo] = useState<EmployeeAccountInfo | undefined>(undefined);
  const [acctLoading, setAcctLoading] = useState(true);
  const [acctError, setAcctError] = useState('');

  const [provUsername, setProvUsername] = useState('');
  const [provRole, setProvRole] = useState('EMPLOYEE');
  const [provLoading, setProvLoading] = useState(false);
  const [provError, setProvError] = useState('');
  const [provResult, setProvResult] = useState<ProvisionedAccount | null>(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetResult, setResetResult] = useState<ProvisionedAccount | null>(null);

  const loadAccount = useCallback(async () => {
    setAcctLoading(true);
    setAcctError('');
    try {
      const res = await getEmployeeAccount(employeeId);
      setAccountInfo(res.account);
    } catch (err) {
      setAcctError(err instanceof ApiError ? err.message : t('acct_load_error'));
    } finally {
      setAcctLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setProvError('');
    if (!USERNAME_RE.test(provUsername)) {
      setProvError('ชื่อผู้ใช้ไม่ถูกต้อง: ใช้ได้เฉพาะ a-z 0-9 . _ -');
      return;
    }
    setProvLoading(true);
    try {
      const result = await provisionEmployeeAccount(employeeId, { username: provUsername, role: provRole });
      setProvResult(result);
      await loadAccount();
      onAccountChanged?.();
    } catch (err) {
      setProvError(err instanceof ApiError ? err.message : 'สร้างบัญชีล้มเหลว');
    } finally {
      setProvLoading(false);
    }
  }

  async function handleResetConfirm() {
    setResetError('');
    setResetLoading(true);
    try {
      const result = await resetEmployeeAccountPassword(employeeId);
      setResetResult(result);
      setShowResetConfirm(false);
      await loadAccount();
      onAccountChanged?.();
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'รีเซ็ตรหัสผ่านล้มเหลว');
      setShowResetConfirm(false);
    } finally {
      setResetLoading(false);
    }
  }

  function handleTempPwDone() {
    setProvResult(null);
    setResetResult(null);
  }

  return (
    <div
      data-testid="account-management-section"
      className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4"
    >
      <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('acct_section_title')}</h2>

      {acctLoading ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('acct_loading')}</p>
      ) : acctError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{acctError}</p>
      ) : (
        <>
          {/* One-time result panel (create or reset) — shown above all else */}
          {(provResult || resetResult) && (
            <div className="mb-4">
              <TempPasswordPanel result={(provResult ?? resetResult)!} onDone={handleTempPwDone} />
            </div>
          )}

          {/* No account */}
          {!accountInfo && !provResult && (
            <div>
              <div
                data-testid="no-account-state"
                className="mb-4 rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700/30 p-4"
              >
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('acct_no_account')}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('acct_no_account_detail')}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t('acct_create_prompt')}</p>
              </div>

              <form onSubmit={handleProvision} className="space-y-3" data-testid="create-account-form">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('acct_username')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={provUsername}
                      onChange={(e) => setProvUsername(e.target.value)}
                      placeholder="เช่น j.pichai"
                      data-testid="input-username"
                      className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      required
                    />
                    {(firstName || lastName) && suggestUsername(firstName, lastName) && (
                      <button
                        type="button"
                        onClick={() => setProvUsername(suggestUsername(firstName, lastName))}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                      >
                        แนะนำ: {suggestUsername(firstName, lastName)}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400">อนุญาต: a-z 0-9 . _ -</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('acct_role_label')}</label>
                  <select
                    value={provRole}
                    onChange={(e) => setProvRole(e.target.value)}
                    data-testid="select-role"
                    className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  >
                    <option value="EMPLOYEE">{roleLabel('EMPLOYEE', lang)}</option>
                    <option value="MANAGER">{roleLabel('MANAGER', lang)}</option>
                    <option value="HR_ADMIN">{roleLabel('HR_ADMIN', lang)}</option>
                    <option value="SUPER_ADMIN">{roleLabel('SUPER_ADMIN', lang)}</option>
                  </select>
                </div>
                {provError && <p className="text-xs text-red-600 dark:text-red-400">{provError}</p>}
                <button
                  type="submit"
                  disabled={provLoading || !provUsername.trim()}
                  data-testid="btn-create-account"
                  className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50"
                >
                  {provLoading ? t('acct_creating') : t('acct_create')}
                </button>
              </form>
            </div>
          )}

          {/* Account exists */}
          {accountInfo && !provResult && !resetResult && (
            <div>
              <dl data-testid="account-info-card">
                <InfoRow label={t('acct_username')} value={<span className="font-mono">{accountInfo.username ?? '—'}</span>} />
                <InfoRow label={t('acct_email')} value={accountInfo.email} />
                <InfoRow label={t('acct_role')} value={roleLabel(accountInfo.role, lang)} />
                <InfoRow
                  label={t('acct_status')}
                  value={
                    accountInfo.isActive ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-green-700 dark:text-green-400">{t('acct_status_active')}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-zinc-400" />
                        <span className="text-zinc-500 dark:text-zinc-400">{t('acct_status_inactive')}</span>
                      </span>
                    )
                  }
                />
                <InfoRow
                  label={t('acct_must_change_pw')}
                  value={
                    accountInfo.mustChangePassword ? (
                      <span className="text-amber-600 dark:text-amber-400">{t('acct_must_change_pw_yes')}</span>
                    ) : (
                      <span className="text-zinc-600 dark:text-zinc-400">{t('acct_must_change_pw_no')}</span>
                    )
                  }
                />
                <InfoRow label={t('acct_pw_generated_at')} value={formatDateTime(accountInfo.passwordGeneratedAt)} />
                <InfoRow label={t('acct_last_login')} value={formatDateTime(accountInfo.lastLoginAt)} />
              </dl>

              {/* Reset password section */}
              <div className="mt-4 border-t border-zinc-100 dark:border-zinc-700 pt-4">
                {resetError && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{resetError}</p>}
                {showResetConfirm ? (
                  <ResetConfirmPanel
                    onConfirm={handleResetConfirm}
                    onCancel={() => setShowResetConfirm(false)}
                    loading={resetLoading}
                  />
                ) : (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    data-testid="btn-reset-password"
                    className="rounded-md border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  >
                    {t('acct_reset_pw')}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
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

      {/* Account Management — admin only */}
      {admin && (
        <AccountCard
          employeeId={params.id}
          employeeName={`${employee.firstName} ${employee.lastName}`}
          firstName={employee.firstName}
          lastName={employee.lastName}
        />
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
