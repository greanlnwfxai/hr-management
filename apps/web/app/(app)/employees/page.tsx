'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getAllDepartments,
  getAllPositions,
  type Employee,
  type EmployeeFull,
  type Department,
  type Position,
  type PaginatedResponse,
  ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import Modal from '@/components/Modal';

const STATUS_OPTIONS = ['', 'ACTIVE', 'INACTIVE', 'RESIGNED'];
const EMP_STATUS = ['ACTIVE', 'INACTIVE', 'RESIGNED'];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    INACTIVE: 'bg-zinc-100 text-zinc-500',
    RESIGNED: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-500'}`}>
      {status}
    </span>
  );
}

type EmpForm = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  hireDate: string;
  dateOfBirth: string;
  departmentId: string;
  positionId: string;
  status: string;
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

export default function EmployeesPage() {
  const user = getUser();
  const admin = isAdmin(user);

  const [result, setResult] = useState<PaginatedResponse<Employee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // CRUD state
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<EmployeeFull | null>(null);
  const [form, setForm] = useState<EmpForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  // Dropdown data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsFiltered, setPositionsFiltered] = useState<Position[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEmployees({ page, limit: 20, search: search || undefined, status: statusFilter || undefined });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: 'Failed to load employees.' });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

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
    setFormSuccess('');
    setModal('create');
  }

  async function openEdit(emp: Employee) {
    setFormError('');
    setFormSuccess('');
    try {
      const full = await getEmployee(emp.id);
      setEditTarget(full);
      setForm(formFromEmployee(full));
      setModal('edit');
    } catch {
      setActionError('Failed to load employee details.');
    }
  }

  function closeModal() {
    setModal(null);
    setEditTarget(null);
    setFormError('');
    setFormSuccess('');
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
        setFormSuccess('Employee created successfully.');
      } else if (editTarget) {
        await updateEmployee(editTarget.id, body);
        setFormSuccess('Employee updated successfully.');
      }
      load();
      setTimeout(closeModal, 800);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(emp: Employee) {
    if (!window.confirm(`Deactivate ${emp.firstName} ${emp.lastName}? This sets their status to INACTIVE.`)) return;
    setActionError('');
    try {
      await deleteEmployee(emp.id);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  const meta = result?.meta;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Employees</h1>
        <div className="flex items-center gap-3">
          {meta && <span className="text-sm text-zinc-400">{meta.total} total</span>}
          {admin && (
            <button
              onClick={openCreate}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
            >
              + Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search employees…"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Search
          </button>
          {(search || statusFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); setStatusFilter(''); setPage(1); }}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Clear
            </button>
          )}
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </select>
      </div>

      {actionError && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</div>
      )}

      {loading && <LoadingState message="Loading employees…" />}
      {!loading && error && <ErrorState message={error.message} status={error.status} onRetry={load} />}

      {!loading && !error && result && (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  {['Code', 'Name', 'Email', 'Department', 'Position', 'Status', ...(admin ? ['Actions'] : [])].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {result.data.length === 0 ? (
                  <tr><td colSpan={admin ? 7 : 6} className="px-4 py-8 text-center text-zinc-400">No employees found.</td></tr>
                ) : (
                  result.data.map((emp) => (
                    <tr key={emp.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{emp.employeeCode}</td>
                      <td className="px-4 py-3 font-medium text-zinc-900">{emp.firstName} {emp.lastName}</td>
                      <td className="px-4 py-3 text-zinc-500">{emp.email ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600">{emp.department?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600">{emp.position?.title ?? '—'}</td>
                      <td className="px-4 py-3">{statusBadge(emp.status)}</td>
                      {admin && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => openEdit(emp)}
                              className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(emp)}
                              disabled={emp.status === 'INACTIVE'}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                            >
                              Deactivate
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

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

      {/* Create / Edit Modal */}
      {modal && (
        <Modal title={modal === 'create' ? 'Add Employee' : 'Edit Employee'} onClose={closeModal} wide>
          {formError && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}
          {formSuccess && <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{formSuccess}</div>}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Employee Code *">
              <input type="text" required value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} className={INPUT} />
            </Field>
            <Field label="First Name *">
              <input type="text" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Last Name *">
              <input type="text" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Email *">
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Phone">
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Hire Date *">
              <input type="date" required value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Date of Birth">
              <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT}>
                {EMP_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Department *">
              <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, positionId: '' })} className={INPUT}>
                <option value="">Select department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Position *">
              <select required value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })} className={INPUT}>
                <option value="">Select position</option>
                {positionsFiltered.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
              <button type="submit" disabled={submitting} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
                {submitting ? 'Saving…' : modal === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const INPUT = 'w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600">{label}</label>
      {children}
    </div>
  );
}
