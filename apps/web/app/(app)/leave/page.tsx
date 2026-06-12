'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getLeave,
  getMyLeave,
  createLeaveRequest,
  approveLeave,
  rejectLeave,
  getMyLeaveBalances,
  getLeaveBalances,
  type LeaveRequest,
  type LeaveBalance,
  type PaginatedResponse,
  ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';

const LEAVE_TYPES = ['SICK', 'VACATION', 'PERSONAL', 'OTHER'];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-blue-100 text-blue-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {status}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type CreateForm = {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
};

const EMPTY_FORM: CreateForm = { leaveType: 'SICK', startDate: '', endDate: '', reason: '' };

export default function LeavePage() {
  const user = getUser();
  const admin = isAdmin(user);

  const [result, setResult] = useState<PaginatedResponse<LeaveRequest> | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [actionError, setActionError] = useState('');

  const loadLeave = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetcher = admin ? getLeave : getMyLeave;
      const data = await fetcher({ page, limit: 20 });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Fallback to own leave if global forbidden
        try {
          const data = await getMyLeave({ page, limit: 20 });
          setResult(data);
        } catch (e2) {
          if (e2 instanceof ApiError) {
            setError({ message: e2.message, status: e2.status });
          } else {
            setError({ message: 'Failed to load leave.' });
          }
        }
      } else if (err instanceof ApiError) {
        setError({ message: err.message, status: err.status });
      } else {
        setError({ message: 'Failed to load leave.' });
      }
    } finally {
      setLoading(false);
    }
  }, [page, admin]);

  async function loadBalances() {
    try {
      const fetcher = admin ? getLeaveBalances : getMyLeaveBalances;
      const data = await fetcher();
      setBalances(data.data);
    } catch {
      // Non-critical — ignore balance load failure
    }
  }

  useEffect(() => {
    loadLeave();
    loadBalances();
  }, [loadLeave]);

  async function handleApprove(id: string) {
    setActionError('');
    try {
      await approveLeave(id);
      loadLeave();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  async function handleReject(id: string) {
    setActionError('');
    try {
      await rejectLeave(id);
      loadLeave();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.startDate || !form.endDate) {
      setFormError('Start and end dates are required.');
      return;
    }
    if (form.endDate < form.startDate) {
      setFormError('End date must be on or after start date.');
      return;
    }
    setSubmitting(true);
    try {
      await createLeaveRequest({
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadLeave();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  const meta = result?.meta;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Leave</h1>
        <button
          onClick={() => { setShowForm(!showForm); setFormError(''); }}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          {showForm ? 'Cancel' : 'Request Leave'}
        </button>
      </div>

      {/* Leave balances */}
      {balances.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Leave Balances</p>
          <div className="flex flex-wrap gap-3">
            {balances.map((b) => (
              <div key={b.id} className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
                <p className="text-xs text-zinc-500">{b.leaveType} · {b.year}</p>
                <p className="mt-0.5 text-lg font-semibold text-zinc-900">{b.remainingDays}</p>
                <p className="text-xs text-zinc-400">remaining / {b.totalDays}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-medium text-zinc-700">New Leave Request</h2>
          {formError && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmitRequest} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Leave Type</label>
              <select
                value={form.leaveType}
                onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              >
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Reason (optional)</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                placeholder="Brief reason"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Start Date</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">End Date</label>
              <input
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {actionError && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {loading && <LoadingState message="Loading leave requests…" />}
      {!loading && error && <ErrorState message={error.message} status={error.status} onRetry={loadLeave} />}

      {!loading && !error && result && (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  {['Employee', 'Type', 'Start', 'End', 'Days', 'Status', 'Reason', ...(admin ? ['Actions'] : [])].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {result.data.length === 0 ? (
                  <tr>
                    <td colSpan={admin ? 8 : 7} className="px-4 py-8 text-center text-zinc-400">
                      No leave requests found.
                    </td>
                  </tr>
                ) : (
                  result.data.map((req) => (
                    <tr key={req.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        {req.employee
                          ? `${req.employee.firstName} ${req.employee.lastName}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{req.leaveType}</td>
                      <td className="px-4 py-3 text-zinc-600">{formatDate(req.startDate)}</td>
                      <td className="px-4 py-3 text-zinc-600">{formatDate(req.endDate)}</td>
                      <td className="px-4 py-3 text-zinc-600">{req.totalDays}</td>
                      <td className="px-4 py-3">{statusBadge(req.status)}</td>
                      <td className="px-4 py-3 text-zinc-500">{req.reason ?? '—'}</td>
                      {admin && (
                        <td className="px-4 py-3">
                          {req.status === 'PENDING' && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleApprove(req.id)}
                                className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(req.id)}
                                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
              <span>Page {meta.page} of {meta.totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={meta.page <= 1}
                  className="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={meta.page >= meta.totalPages}
                  className="rounded border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
