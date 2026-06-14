'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getLeave, getMyLeave, createLeaveRequest, approveLeave, rejectLeave,
  getMyLeaveBalances, getLeaveBalances, createLeaveBalance, updateLeaveBalance,
  getEmployees,
  type LeaveRequest, type LeaveBalance, type Employee, type PaginatedResponse, ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import Toast, { type ToastData } from '@/components/Toast';
import { useLanguage } from '@/hooks/useLanguage';

const LEAVE_TYPES = ['SICK', 'VACATION', 'PERSONAL', 'OTHER'];
const INPUT = 'w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>
      {status}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

type CreateForm = { leaveType: string; startDate: string; endDate: string; reason: string };
const EMPTY_FORM: CreateForm = { leaveType: 'SICK', startDate: '', endDate: '', reason: '' };

type BalCreateForm = { employeeId: string; leaveType: string; year: string; entitledDays: string };
const EMPTY_BAL_CREATE: BalCreateForm = { employeeId: '', leaveType: 'SICK', year: String(new Date().getFullYear()), entitledDays: '' };

type BalEditForm = { entitledDays: string; usedDays: string };

export default function LeavePage() {
  const { t } = useLanguage();
  const user = getUser();
  const admin = isAdmin(user);

  const [toast, setToast] = useState<ToastData | null>(null);

  const [result, setResult] = useState<PaginatedResponse<LeaveRequest> | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadLeave = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetcher = admin ? getLeave : getMyLeave;
      const data = await fetcher({ page, limit: 20 });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        try {
          const data = await getMyLeave({ page, limit: 20 });
          setResult(data);
        } catch (e2) {
          setError(e2 instanceof ApiError ? { message: e2.message, status: e2.status } : { message: t('error_leave') });
        }
      } else {
        setError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: t('error_leave') });
      }
    } finally {
      setLoading(false);
    }
  }, [page, admin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBalances() {
    try {
      const fetcher = admin ? getLeaveBalances : getMyLeaveBalances;
      const data = await fetcher();
      setBalances(data.data);
    } catch { /* non-critical */ }
  }

  useEffect(() => {
    loadLeave();
    loadBalances();
  }, [loadLeave]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove(id: string) {
    try {
      await approveLeave(id);
      setToast({ message: 'Leave request approved.', type: 'success' });
      loadLeave();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Action failed.', type: 'error' });
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectLeave(id);
      setToast({ message: 'Leave request rejected.', type: 'success' });
      loadLeave();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Action failed.', type: 'error' });
    }
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.startDate || !form.endDate) { setFormError('Start and end dates are required.'); return; }
    if (form.endDate < form.startDate) { setFormError('End date must be on or after start date.'); return; }
    setSubmitting(true);
    try {
      await createLeaveRequest({ leaveType: form.leaveType, startDate: form.startDate, endDate: form.endDate, reason: form.reason || undefined });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setToast({ message: 'Leave request submitted.', type: 'success' });
      loadLeave();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Leave Balance Admin ────────────────────────────────────────────────────
  const [balAdminResult, setBalAdminResult] = useState<PaginatedResponse<LeaveBalance> | null>(null);
  const [balAdminLoading, setBalAdminLoading] = useState(false);
  const [balAdminError, setBalAdminError] = useState<{ message: string; status?: number } | null>(null);
  const [balAdminPage, setBalAdminPage] = useState(1);
  const [balYearFilter, setBalYearFilter] = useState(String(new Date().getFullYear()));

  const [balModal, setBalModal] = useState<'create' | 'edit' | null>(null);
  const [editBalTarget, setEditBalTarget] = useState<LeaveBalance | null>(null);
  const [balCreateForm, setBalCreateForm] = useState<BalCreateForm>(EMPTY_BAL_CREATE);
  const [balEditForm, setBalEditForm] = useState<BalEditForm>({ entitledDays: '', usedDays: '' });
  const [balFormError, setBalFormError] = useState('');
  const [balSubmitting, setBalSubmitting] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);

  const loadBalAdmin = useCallback(async () => {
    if (!admin) return;
    setBalAdminLoading(true);
    setBalAdminError(null);
    try {
      const data = await getLeaveBalances({ page: balAdminPage, limit: 20, year: balYearFilter ? Number(balYearFilter) : undefined });
      setBalAdminResult(data);
    } catch (err) {
      setBalAdminError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: 'Failed to load leave balances.' });
    } finally {
      setBalAdminLoading(false);
    }
  }, [admin, balAdminPage, balYearFilter]);

  useEffect(() => {
    if (admin) {
      loadBalAdmin();
      getEmployees({ limit: 200 }).then((d) => setEmployees(d.data)).catch(() => {});
    }
  }, [admin, loadBalAdmin]);

  function openBalCreate() {
    setBalCreateForm({ ...EMPTY_BAL_CREATE, year: String(new Date().getFullYear()) });
    setBalFormError('');
    setBalModal('create');
  }

  function openBalEdit(bal: LeaveBalance) {
    setEditBalTarget(bal);
    setBalEditForm({ entitledDays: String(bal.totalDays), usedDays: String(bal.usedDays) });
    setBalFormError('');
    setBalModal('edit');
  }

  function closeBalModal() { setBalModal(null); setEditBalTarget(null); setBalFormError(''); }

  async function handleBalCreate(e: React.FormEvent) {
    e.preventDefault();
    setBalFormError('');
    const entitledDays = Number(balCreateForm.entitledDays);
    const year = Number(balCreateForm.year);
    if (!balCreateForm.employeeId) { setBalFormError('Employee is required.'); return; }
    if (!balCreateForm.year || isNaN(year)) { setBalFormError('Valid year is required.'); return; }
    if (!balCreateForm.entitledDays || isNaN(entitledDays) || entitledDays < 0) { setBalFormError('Valid entitled days required.'); return; }
    setBalSubmitting(true);
    try {
      await createLeaveBalance({ employeeId: balCreateForm.employeeId, leaveType: balCreateForm.leaveType, year, entitledDays });
      setToast({ message: 'Leave balance created.', type: 'success' });
      closeBalModal();
      loadBalAdmin();
      loadBalances();
    } catch (err) {
      setBalFormError(err instanceof ApiError ? err.message : 'Failed to create balance.');
    } finally {
      setBalSubmitting(false);
    }
  }

  async function handleBalEdit(e: React.FormEvent) {
    e.preventDefault();
    setBalFormError('');
    if (!editBalTarget) return;
    const body: { entitledDays?: number; usedDays?: number } = {};
    if (balEditForm.entitledDays !== '') body.entitledDays = Number(balEditForm.entitledDays);
    if (balEditForm.usedDays !== '') body.usedDays = Number(balEditForm.usedDays);
    if (Object.keys(body).length === 0) { setBalFormError('Provide at least one field to update.'); return; }
    setBalSubmitting(true);
    try {
      await updateLeaveBalance(editBalTarget.id, body);
      setToast({ message: 'Leave balance updated.', type: 'success' });
      closeBalModal();
      loadBalAdmin();
      loadBalances();
    } catch (err) {
      setBalFormError(err instanceof ApiError ? err.message : 'Failed to update balance.');
    } finally {
      setBalSubmitting(false);
    }
  }

  const meta = result?.meta;
  const balMeta = balAdminResult?.meta;

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 data-testid="page-title-leave" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t('page_leave')}
        </h1>
        <button
          data-testid="btn-request-leave"
          onClick={() => { setShowForm(!showForm); setFormError(''); }}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white"
        >
          {showForm ? t('cancel') : t('leave_request_btn')}
        </button>
      </div>

      {/* My leave balance cards */}
      {balances.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{t('leave_balances_section')}</p>
          <div className="flex flex-wrap gap-3">
            {balances.map((b) => (
              <div key={b.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{b.leaveType} · {b.year}</p>
                <p className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{b.remainingDays}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('leave_remaining')} / {b.totalDays}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div data-testid="section-new-request" className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
          <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('leave_new_request')}</h2>
          {formError && <div className="mb-3 rounded border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{formError}</div>}
          <form onSubmit={handleSubmitRequest} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('leave_type')}</label>
              <select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className={INPUT}>
                {LEAVE_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('leave_reason')}</label>
              <input type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={INPUT} placeholder={t('leave_reason_placeholder')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('leave_start_date')}</label>
              <input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('leave_end_date')}</label>
              <input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={submitting} className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50">
                {submitting ? t('leave_submitting') : t('leave_submit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <LoadingState testid="loading-leave" message={t('loading_leave')} />}
      {!loading && error && <ErrorState testid="error-leave" message={error.message} status={error.status} onRetry={loadLeave} />}

      {!loading && !error && result && (
        <>
          {result.data.length === 0 ? (
            <EmptyState testid="empty-leave" message={t('empty_leave')} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                  <tr>
                    {[
                      t('leave_col_employee'), t('leave_col_type'), t('leave_col_start'), t('leave_col_end'),
                      t('leave_col_days'), t('leave_col_status'), t('leave_col_reason'),
                      ...(admin ? [t('leave_col_actions')] : []),
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {result.data.map((req) => (
                    <tr key={req.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {req.employee ? `${req.employee.firstName} ${req.employee.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{req.leaveType}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(req.startDate)}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(req.endDate)}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{req.totalDays}</td>
                      <td className="px-4 py-3">{statusBadge(req.status)}</td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{req.reason ?? '—'}</td>
                      {admin && (
                        <td className="px-4 py-3">
                          {req.status === 'PENDING' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleApprove(req.id)} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">{t('leave_approve')}</button>
                              <button onClick={() => handleReject(req.id)} className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">{t('leave_reject')}</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
              <span>Page {meta.page} of {meta.totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={meta.page <= 1} className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40">{t('previous')}</button>
                <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={meta.page >= meta.totalPages} className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40">{t('next')}</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Leave Balance Admin ───────────────────────────────────────────────── */}
      {admin && (
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 data-testid="section-balance-admin" className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
              {t('leave_balance_admin')}
            </h2>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={balYearFilter}
                onChange={(e) => { setBalYearFilter(e.target.value); setBalAdminPage(1); }}
                placeholder="Year"
                className="w-24 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
              />
              <button
                data-testid="btn-add-balance"
                onClick={openBalCreate}
                className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white"
              >
                {t('leave_add_balance')}
              </button>
            </div>
          </div>

          {balAdminLoading && <LoadingState message={t('loading_balances')} />}
          {!balAdminLoading && balAdminError && <ErrorState message={balAdminError.message} status={balAdminError.status} onRetry={loadBalAdmin} />}

          {!balAdminLoading && !balAdminError && balAdminResult && (
            <>
              {balAdminResult.data.length === 0 ? (
                <EmptyState message={t('empty_balances')} />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                  <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                      <tr>
                        {[
                          t('leave_col_employee'), t('leave_col_type'), t('leave_col_year'),
                          t('leave_col_entitled'), t('leave_col_used'), t('leave_col_remaining'), t('actions'),
                        ].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                      {balAdminResult.data.map((bal) => (
                        <tr key={bal.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                            {bal.employee ? `${bal.employee.firstName} ${bal.employee.lastName}` : '—'}
                            {bal.employee?.employeeCode && (
                              <span className="ml-1 font-mono text-xs text-zinc-400 dark:text-zinc-500">{bal.employee.employeeCode}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bal.leaveType}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bal.year}</td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 font-medium">{bal.totalDays}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{bal.usedDays}</td>
                          <td className="px-4 py-3">
                            <span className={`font-medium ${bal.remainingDays <= 2 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{bal.remainingDays}</span>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => openBalEdit(bal)} className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">{t('edit')}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {balMeta && balMeta.totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                  <span>Page {balMeta.page} of {balMeta.totalPages} ({balMeta.total} total)</span>
                  <div className="flex gap-2">
                    <button onClick={() => setBalAdminPage((p) => Math.max(1, p - 1))} disabled={balMeta.page <= 1} className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40">{t('previous')}</button>
                    <button onClick={() => setBalAdminPage((p) => Math.min(balMeta.totalPages, p + 1))} disabled={balMeta.page >= balMeta.totalPages} className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40">{t('next')}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Balance Create Modal */}
      {balModal === 'create' && (
        <Modal title={t('leave_modal_add_balance')} onClose={closeBalModal}>
          {balFormError && <div className="mb-3 rounded border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{balFormError}</div>}
          <form onSubmit={handleBalCreate} className="space-y-4">
            <Field label={t('leave_field_employee')}>
              <select required value={balCreateForm.employeeId} onChange={(e) => setBalCreateForm({ ...balCreateForm, employeeId: e.target.value })} className={INPUT}>
                <option value="">{t('leave_select_employee')}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeCode})</option>
                ))}
              </select>
            </Field>
            <Field label={t('leave_field_type')}>
              <select required value={balCreateForm.leaveType} onChange={(e) => setBalCreateForm({ ...balCreateForm, leaveType: e.target.value })} className={INPUT}>
                {LEAVE_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
              </select>
            </Field>
            <Field label={t('leave_field_year')}>
              <input type="number" required value={balCreateForm.year} onChange={(e) => setBalCreateForm({ ...balCreateForm, year: e.target.value })} className={INPUT} placeholder={String(new Date().getFullYear())} />
            </Field>
            <Field label={t('leave_field_entitled')}>
              <input type="number" required min={0} value={balCreateForm.entitledDays} onChange={(e) => setBalCreateForm({ ...balCreateForm, entitledDays: e.target.value })} className={INPUT} placeholder="e.g. 10" />
            </Field>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={closeBalModal} className="rounded-md border border-zinc-200 dark:border-zinc-600 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">{t('cancel')}</button>
              <button type="submit" disabled={balSubmitting} className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50">
                {balSubmitting ? t('emp_saving') : t('create')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Balance Edit Modal */}
      {balModal === 'edit' && editBalTarget && (
        <Modal title={t('leave_modal_edit_balance')} onClose={closeBalModal}>
          <div className="mb-3 rounded bg-zinc-50 dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300">
            {editBalTarget.employee ? `${editBalTarget.employee.firstName} ${editBalTarget.employee.lastName}` : '—'}
            {' · '}{editBalTarget.leaveType} · {editBalTarget.year}
          </div>
          {balFormError && <div className="mb-3 rounded border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{balFormError}</div>}
          <form onSubmit={handleBalEdit} className="space-y-4">
            <Field label={t('leave_field_entitled')}>
              <input type="number" min={0} value={balEditForm.entitledDays} onChange={(e) => setBalEditForm({ ...balEditForm, entitledDays: e.target.value })} className={INPUT} />
            </Field>
            <Field label={t('leave_field_used')}>
              <input type="number" min={0} value={balEditForm.usedDays} onChange={(e) => setBalEditForm({ ...balEditForm, usedDays: e.target.value })} className={INPUT} />
            </Field>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={closeBalModal} className="rounded-md border border-zinc-200 dark:border-zinc-600 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">{t('cancel')}</button>
              <button type="submit" disabled={balSubmitting} className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50">
                {balSubmitting ? t('emp_saving') : t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
