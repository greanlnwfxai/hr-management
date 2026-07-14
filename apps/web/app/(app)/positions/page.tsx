'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getPositions, createPosition, updatePosition, deletePosition, getAllDepartments,
  type Position, type Department, type PaginatedResponse, ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import Toast, { type ToastData } from '@/components/Toast';
import AccessDeniedCard from '@/components/AccessDeniedCard';
import { useLanguage } from '@/hooks/useLanguage';

const INPUT = 'w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400';

type PosForm = { title: string; departmentId: string; description: string };
const EMPTY_FORM: PosForm = { title: '', departmentId: '', description: '' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

export default function PositionsPage() {
  const { t } = useLanguage();
  const user = getUser();
  const admin = isAdmin(user);

  const [result, setResult] = useState<PaginatedResponse<Position> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Position | null>(null);
  const [form, setForm] = useState<PosForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<ToastData | null>(null);

  const load = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPositions({ page, limit: 20, search: search || undefined, departmentId: deptFilter || undefined });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: 'Failed to load positions.' });
    } finally {
      setLoading(false);
    }
  }, [admin, page, search, deptFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!admin) return;
    getAllDepartments().then((d) => setDepartments(d.data)).catch(() => {});
  }, [admin]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError('');
    setModal('create');
  }

  function openEdit(pos: Position) {
    setEditTarget(pos);
    setForm({ title: pos.title, departmentId: pos.departmentId, description: pos.description ?? '' });
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
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (!form.departmentId) { setFormError('Department is required.'); return; }
    setSubmitting(true);
    try {
      const body = {
        title: form.title.trim(),
        departmentId: form.departmentId,
        ...(form.description.trim() && { description: form.description.trim() }),
      };
      if (modal === 'create') {
        await createPosition(body);
        setToast({ message: 'Position created successfully.', type: 'success' });
      } else if (editTarget) {
        await updatePosition(editTarget.id, body);
        setToast({ message: 'Position updated successfully.', type: 'success' });
      }
      closeModal();
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(pos: Position) {
    if (pos._count.employees > 0) {
      setToast({ message: `Cannot delete "${pos.title}" — ${pos._count.employees} employee(s) are assigned to it.`, type: 'error' });
      return;
    }
    if (!window.confirm(`Delete position "${pos.title}"? This cannot be undone.`)) return;
    try {
      await deletePosition(pos.id);
      setToast({ message: `Position "${pos.title}" deleted.`, type: 'success' });
      load();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Delete failed.', type: 'error' });
    }
  }

  const meta = result?.meta;

  if (!admin) {
    return <AccessDeniedCard testid="access-denied-positions" />;
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 data-testid="page-title-positions" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t('page_positions')}
        </h1>
        <div className="flex items-center gap-3">
          {meta && <span className="text-sm text-zinc-400 dark:text-zinc-500">{meta.total} total</span>}
          {admin && (
            <button onClick={openCreate} className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white">
              {t('pos_add')}
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('pos_search_placeholder')}
            className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white">{t('search')}</button>
          {(search || deptFilter) && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setDeptFilter(''); setPage(1); }} className="rounded-md border border-zinc-200 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">{t('clear')}</button>
          )}
        </form>
        <select
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
        >
          <option value="">{t('pos_all_depts')}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {loading && <LoadingState testid="loading-state" message={t('loading_positions')} />}
      {!loading && error && <ErrorState testid="error-state" message={error.message} status={error.status} onRetry={load} />}

      {!loading && !error && result && (
        <>
          {result.data.length === 0 ? (
            <EmptyState testid="empty-state" message={t('empty_positions')} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                  <tr>
                    {[
                      t('pos_col_title'), t('pos_col_dept'), t('pos_col_desc'),
                      t('pos_col_employees'), t('pos_col_created'),
                      ...(admin ? [t('actions')] : []),
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {result.data.map((pos) => (
                    <tr key={pos.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{pos.title}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{pos.department?.name ?? '—'}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-zinc-500 dark:text-zinc-400">{pos.description ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{pos._count.employees}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400 dark:text-zinc-500">{new Date(pos.createdAt).toLocaleDateString()}</td>
                      {admin && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(pos)} className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">{t('edit')}</button>
                            <button
                              onClick={() => handleDelete(pos)}
                              disabled={pos._count.employees > 0}
                              title={pos._count.employees > 0 ? 'Cannot delete: employees assigned' : ''}
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
        <Modal title={modal === 'create' ? t('pos_modal_add') : t('pos_modal_edit')} onClose={closeModal}>
          {formError && <div className="mb-3 rounded border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{formError}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label={t('pos_field_title')}>
              <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={INPUT} placeholder={t('pos_title_placeholder')} />
            </Field>
            <Field label={t('pos_field_dept')}>
              <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={INPUT}>
                <option value="">{t('pos_select_dept')}</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label={t('pos_field_desc')}>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT + ' resize-none'} placeholder="Optional description" />
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
