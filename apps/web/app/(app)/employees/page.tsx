'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee,
  getAllDepartments, getAllPositions,
  type Employee, type EmployeeFull, type Department, type Position,
  type PaginatedResponse, ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import Toast, { type ToastData } from '@/components/Toast';
import { useLanguage } from '@/hooks/useLanguage';

const STATUS_OPTIONS = ['', 'ACTIVE', 'INACTIVE', 'RESIGNED'];
const EMP_STATUS = ['ACTIVE', 'INACTIVE', 'RESIGNED'];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    INACTIVE: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400',
    RESIGNED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>
      {status}
    </span>
  );
}

type EmpForm = {
  employeeCode: string; firstName: string; lastName: string; email: string;
  phone: string; hireDate: string; dateOfBirth: string;
  departmentId: string; positionId: string; status: string;
};
const EMPTY_FORM: EmpForm = {
  employeeCode: '', firstName: '', lastName: '', email: '',
  phone: '', hireDate: '', dateOfBirth: '',
  departmentId: '', positionId: '', status: 'ACTIVE',
};

function formFromEmployee(e: EmployeeFull): EmpForm {
  return {
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email ?? '',
    phone: e.phone ?? '',
    hireDate: e.hireDate ? e.hireDate.slice(0, 10) : '',
    dateOfBirth: e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : '',
    departmentId: e.department?.id ?? '',
    positionId: e.position?.id ?? '',
    status: e.status,
  };
}

const INPUT = 'w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

export default function EmployeesPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const user = getUser();
  const admin = isAdmin(user);
  const isEmployee = user?.role === 'EMPLOYEE';
  const isManager = user?.role === 'MANAGER';

  const [result, setResult] = useState<PaginatedResponse<Employee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<EmployeeFull | null>(null);
  const [form, setForm] = useState<EmpForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<ToastData | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsFiltered, setPositionsFiltered] = useState<Position[]>([]);

  // Redirect EMPLOYEE away — they have no access to the employee list.
  useEffect(() => {
    if (isEmployee) router.replace('/profile');
  }, [isEmployee, router]);

  const load = useCallback(async () => {
    if (isEmployee) return; // no API call; loading stays true until redirect
    setLoading(true);
    setError(null);
    try {
      const data = await getEmployees({ page, limit: 20, search: search || undefined, status: statusFilter || undefined });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: t('error_employees') });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, isEmployee]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!admin) return;
    getAllDepartments().then((d) => setDepartments(d.data)).catch(() => {});
    getAllPositions().then((p) => setPositions(p.data)).catch(() => {});
  }, [admin]);

  useEffect(() => {
    if (form.departmentId) {
      setPositionsFiltered(positions.filter((p) => p.departmentId === form.departmentId));
    } else {
      setPositionsFiltered(positions);
    }
  }, [form.departmentId, positions]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  async function openCreate() {
    setForm(EMPTY_FORM);
    setFormError('');
    setModal('create');
  }

  async function openEdit(emp: Employee) {
    setFormError('');
    try {
      const full = await getEmployee(emp.id);
      setEditTarget(full);
      setForm(formFromEmployee(full));
      setModal('edit');
    } catch {
      setToast({ message: t('error_employees'), type: 'error' });
    }
  }

  function closeModal() {
    setModal(null);
    setEditTarget(null);
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.employeeCode || !form.firstName || !form.lastName || !form.email || !form.hireDate || !form.departmentId || !form.positionId) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        employeeCode: form.employeeCode,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        hireDate: form.hireDate,
        departmentId: form.departmentId,
        positionId: form.positionId,
        ...(form.phone && { phone: form.phone }),
        ...(form.dateOfBirth && { dateOfBirth: form.dateOfBirth }),
        ...(form.status && { status: form.status }),
      };
      if (modal === 'create') {
        await createEmployee(body);
        setToast({ message: 'Employee created successfully.', type: 'success' });
      } else if (editTarget) {
        await updateEmployee(editTarget.id, body);
        setToast({ message: 'Employee updated successfully.', type: 'success' });
      }
      closeModal();
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(emp: Employee) {
    if (!window.confirm(`Deactivate ${emp.firstName} ${emp.lastName}?`)) return;
    try {
      await deleteEmployee(emp.id);
      setToast({ message: `${emp.firstName} ${emp.lastName} deactivated.`, type: 'success' });
      load();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Deactivate failed.', type: 'error' });
    }
  }

  const meta = result?.meta;

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 data-testid="page-title-employees" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {isManager ? t('page_employees_team') : t('page_employees')}
        </h1>
        <div className="flex items-center gap-3">
          {meta && <span className="text-sm text-zinc-400 dark:text-zinc-500">{meta.total} total</span>}
          {admin && (
            <button
              data-testid="btn-add-employee"
              onClick={openCreate}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white"
            >
              {t('emp_add')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            data-testid="search-input"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('emp_search_placeholder')}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400"
          />
          <button
            data-testid="btn-search"
            type="submit"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white"
          >
            {t('search')}
          </button>
          {(search || statusFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); setStatusFilter(''); setPage(1); }}
              className="rounded-md border border-zinc-200 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              {t('clear')}
            </button>
          )}
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || t('emp_all_statuses')}</option>)}
        </select>
      </div>

      {loading && <LoadingState testid="loading-state" message={t('loading_employees')} />}
      {!loading && error && <ErrorState testid="error-state" message={error.message} status={error.status} onRetry={load} />}

      {!loading && !error && result && (
        <>
          {result.data.length === 0 ? (
            <EmptyState testid="empty-state" message={t('empty_employees_detail')} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                  <tr>
                    {[
                      t('emp_col_code'), t('emp_col_name'), t('emp_col_email'),
                      t('emp_col_dept'), t('emp_col_pos'), t('emp_col_status'),
                      ...(admin ? [t('emp_col_actions')] : []),
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {result.data.map((emp) => (
                    <tr key={emp.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">{emp.employeeCode}</td>
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        <Link href={`/employees/${emp.id}`} className="hover:underline hover:text-zinc-600 dark:hover:text-zinc-300">
                          {emp.firstName} {emp.lastName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{emp.email ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{emp.department?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{emp.position?.title ?? '—'}</td>
                      <td className="px-4 py-3">{statusBadge(emp.status)}</td>
                      {admin && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              data-testid="btn-edit-employee"
                              onClick={() => openEdit(emp)}
                              className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                            >
                              {t('edit')}
                            </button>
                            <button
                              onClick={() => handleDelete(emp)}
                              disabled={emp.status === 'INACTIVE'}
                              className="rounded border border-red-200 dark:border-red-800/50 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
                            >
                              {t('emp_deactivate')}
                            </button>
                          </div>
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

      {/* Create / Edit Modal */}
      {modal && (
        <Modal title={modal === 'create' ? t('emp_modal_add') : t('emp_modal_edit')} onClose={closeModal} wide>
          {formError && <div className="mb-3 rounded border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{formError}</div>}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('emp_field_code')}>
              <input type="text" required value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} className={INPUT} />
            </Field>
            <Field label={t('emp_field_first')}>
              <input type="text" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={INPUT} />
            </Field>
            <Field label={t('emp_field_last')}>
              <input type="text" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={INPUT} />
            </Field>
            <Field label={t('emp_field_email')}>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} />
            </Field>
            <Field label={t('emp_field_phone')}>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} />
            </Field>
            <Field label={t('emp_field_hire_date')}>
              <input type="date" required value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} className={INPUT} />
            </Field>
            <Field label={t('emp_field_dob')}>
              <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className={INPUT} />
            </Field>
            <Field label={t('emp_field_status')}>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT}>
                {EMP_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label={t('emp_field_dept')}>
              <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, positionId: '' })} className={INPUT}>
                <option value="">{t('emp_select_dept')}</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label={t('emp_field_pos')}>
              <select required value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })} className={INPUT}>
                <option value="">{t('emp_select_pos')}</option>
                {positionsFiltered.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className="rounded-md border border-zinc-200 dark:border-zinc-600 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">{t('cancel')}</button>
              <button type="submit" disabled={submitting} className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50">
                {submitting ? t('emp_saving') : modal === 'create' ? t('create') : t('save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
