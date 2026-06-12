'use client';

import { useEffect, useState, useCallback } from 'react';
import { getEmployees, type Employee, type PaginatedResponse, ApiError } from '@/lib/api';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';

const STATUS_OPTIONS = ['', 'ACTIVE', 'INACTIVE', 'RESIGNED'];

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

export default function EmployeesPage() {
  const [result, setResult] = useState<PaginatedResponse<Employee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEmployees({ page, limit: 20, search: search || undefined, status: statusFilter || undefined });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, status: err.status });
      } else {
        setError({ message: 'Failed to load employees.' });
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(e.target.value);
    setPage(1);
  }

  const meta = result?.meta;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Employees</h1>
        {meta && (
          <span className="text-sm text-zinc-400">{meta.total} total</span>
        )}
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
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
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
          onChange={handleStatusChange}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || 'All Statuses'}</option>
          ))}
        </select>
      </div>

      {loading && <LoadingState message="Loading employees…" />}
      {!loading && error && <ErrorState message={error.message} status={error.status} onRetry={load} />}

      {!loading && !error && result && (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  {['Code', 'Name', 'Email', 'Department', 'Position', 'Status'].map((h) => (
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
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  result.data.map((emp) => (
                    <tr key={emp.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{emp.employeeCode}</td>
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        {emp.firstName} {emp.lastName}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{emp.email ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600">{emp.department?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-600">{emp.position?.title ?? '—'}</td>
                      <td className="px-4 py-3">{statusBadge(emp.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
              <span>
                Page {meta.page} of {meta.totalPages}
              </span>
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
