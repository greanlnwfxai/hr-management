'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getEmployees,
  type Department, type Employee, type PaginatedResponse, ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import Toast, { type ToastData } from '@/components/Toast';
import AccessDeniedCard from '@/components/AccessDeniedCard';
import { useLanguage } from '@/hooks/useLanguage';
import { type Language } from '@/lib/i18n';

const INPUT = 'w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400';

type DeptForm = { name: string; description: string; managerId: string };
const EMPTY_FORM: DeptForm = { name: '', description: '', managerId: '' };

function formatDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

export default function DepartmentsPage() {
  const { t, lang } = useLanguage();
  const user = getUser();
  const admin = isAdmin(user);

  const [result, setResult] = useState<PaginatedResponse<Department> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [form, setForm] = useState<DeptForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<ToastData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const load = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDepartments({ page, limit: 20, search: search || undefined });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: 'Failed to load departments.' });
    } finally {
      setLoading(false);
    }
  }, [admin, page, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!admin) return;
    getEmployees({ limit: 100, status: 'ACTIVE' })
      .then((res) => setEmployees(res.data))
      .catch(() => {});
  }, [admin]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError('');
    setModal('create');
  }

  function openEdit(dept: Department) {
    setEditTarget(dept);
    setForm({ name: dept.name, description: dept.description ?? '', managerId: dept.managerId ?? '' });
    setFormError('');
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setEditTarget(null);
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        ...(form.description.trim() && { description: form.description.trim() }),
        managerId: form.managerId || null,
      };
      if (modal === 'create') {
        await createDepartment(body);
        setToast({ message: 'Department created successfully.', type: 'success' });
      } else if (editTarget) {
        await updateDepartment(editTarget.id, body);
        setToast({ message: 'Department updated successfully.', type: 'success' });
      }
      closeModal();
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(dept: Department) {
    if (dept._count.employees > 0 || dept._count.positions > 0) {
      setToast({ message: `Cannot delete "${dept.name}" — it has ${dept._count.employees} employee(s) and ${dept._count.positions} position(s).`, type: 'error' });
      return;
    }
    if (!window.confirm(`Delete department "${dept.name}"? This cannot be undone.`)) return;
    try {
      await deleteDepartment(dept.id);
      setToast({ message: `Department "${dept.name}" deleted.`, type: 'success' });
      load();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Delete failed.', type: 'error' });
    }
  }

  const meta = result?.meta;

  if (!admin) {
    return <AccessDeniedCard testid="access-denied-departments" />;
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 data-testid="page-title-departments" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t('page_departments')}
        </h1>
        <div className="flex items-center gap-3">
          {meta && (
            <span data-testid="dept-total" className="text-sm text-zinc-400 dark:text-zinc-500">
              {t('total_label').replace('{total}', meta.total.toLocaleString())}
            </span>
          )}
          {admin && (
            <button data-testid="btn-add-department" onClick={openCreate} className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white">
              {t('dept_add')}
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-3">
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }} className="flex gap-2">
          <input
            data-testid="search-input"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('dept_search_placeholder')}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
          />
          <button data-testid="btn-search" type="submit" className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white">{t('search')}</button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }} className="rounded-md border border-zinc-200 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">{t('clear')}</button>
          )}
        </form>
      </div>

      {loading && <LoadingState testid="loading-state" message={t('loading_departments')} />}
      {!loading && error && <ErrorState testid="error-state" message={error.message} status={error.status} onRetry={load} />}

      {!loading && !error && result && (
        <>
          {result.data.length === 0 ? (
            <EmptyState testid="empty-state" message={t('empty_departments')} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                  <tr>
                    {[
                      t('dept_col_name'), t('dept_col_desc'), t('dept_col_manager'), t('dept_col_employees'),
                      t('dept_col_positions'), t('dept_col_created'),
                      ...(admin ? [t('actions')] : []),
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {result.data.map((dept) => (
                    <tr key={dept.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{dept.name}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-zinc-500 dark:text-zinc-400">{dept.description ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {dept.manager ? `${dept.manager.firstName} ${dept.manager.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{dept._count.employees}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{dept._count.positions}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400 dark:text-zinc-500">{formatDate(dept.createdAt, lang)}</td>
                      {admin && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button data-testid="btn-edit-department" onClick={() => openEdit(dept)} className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">{t('edit')}</button>
                            <button
                              onClick={() => handleDelete(dept)}
                              disabled={dept._count.employees > 0 || dept._count.positions > 0}
                              title={dept._count.employees > 0 || dept._count.positions > 0 ? 'Cannot delete: has linked records' : ''}
                              className="rounded border border-red-200 dark:border-red-800/50 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {t('delete')}
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

      {modal && (
        <Modal title={modal === 'create' ? t('dept_modal_add') : t('dept_modal_edit')} onClose={closeModal}>
          {formError && <div className="mb-3 rounded border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{formError}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label={t('dept_field_name')}>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} placeholder={t('dept_name_placeholder')} />
            </Field>
            <Field label={t('dept_field_desc')}>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT + ' resize-none'} placeholder={t('dept_desc_placeholder')} />
            </Field>
            <Field label={t('dept_field_manager')}>
              <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })} className={INPUT}>
                <option value="">{t('dept_manager_none')}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-3 pt-1">
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
