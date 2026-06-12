'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getPositions,
  createPosition,
  updatePosition,
  deletePosition,
  getAllDepartments,
  type Position,
  type Department,
  type PaginatedResponse,
  ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import Toast, { type ToastData } from '@/components/Toast';

const INPUT = 'w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';

type PosForm = { title: string; departmentId: string; description: string };
const EMPTY_FORM: PosForm = { title: '', departmentId: '', description: '' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600">{label}</label>
      {children}
    </div>
  );
}

export default function PositionsPage() {
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
  }, [page, search, deptFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getAllDepartments().then((d) => setDepartments(d.data)).catch(() => {});
  }, []);

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

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Positions</h1>
        <div className="flex items-center gap-3">
          {meta && <span className="text-sm text-zinc-400">{meta.total} total</span>}
          {admin && (
            <button onClick={openCreate} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
              + Add Position
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
            placeholder="Search positions…"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">Search</button>
          {(search || deptFilter) && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setDeptFilter(''); setPage(1); }} className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">Clear</button>
          )}
        </form>
        <select
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none"
        >
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {loading && <LoadingState message="Loading positions…" />}
      {!loading && error && <ErrorState message={error.message} status={error.status} onRetry={load} />}

      {!loading && !error && result && (
        <>
          {result.data.length === 0 ? (
            <EmptyState message="No positions found." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    {['Title', 'Department', 'Description', 'Employees', 'Created', ...(admin ? ['Actions'] : [])].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {result.data.map((pos) => (
                    <tr key={pos.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">{pos.title}</td>
                      <td className="px-4 py-3 text-zinc-600">{pos.department?.name ?? '—'}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-zinc-500">{pos.description ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600">{pos._count.employees}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{new Date(pos.createdAt).toLocaleDateString()}</td>
                      {admin && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(pos)} className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">Edit</button>
                            <button
                              onClick={() => handleDelete(pos)}
                              disabled={pos._count.employees > 0}
                              title={pos._count.employees > 0 ? 'Cannot delete: employees assigned' : ''}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Delete
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
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
              <span>Page {meta.page} of {meta.totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={meta.page <= 1} className="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-40">Previous</button>
                <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={meta.page >= meta.totalPages} className="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <Modal title={modal === 'create' ? 'Add Position' : 'Edit Position'} onClose={closeModal}>
          {formError && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Title *">
              <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={INPUT} placeholder="e.g. Software Engineer" />
            </Field>
            <Field label="Department *">
              <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={INPUT}>
                <option value="">Select department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT + ' resize-none'} placeholder="Optional description" />
            </Field>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={closeModal} className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
              <button type="submit" disabled={submitting} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
                {submitting ? 'Saving…' : modal === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
