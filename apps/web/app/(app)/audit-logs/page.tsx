'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAuditLogs, type AuditLog, type PaginatedResponse, ApiError } from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import AccessDeniedCard from '@/components/AccessDeniedCard';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import { useLanguage } from '@/hooks/useLanguage';

const ROLES = ['', 'SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE'];
const RESULTS = ['', 'SUCCESS', 'FAILURE'];

type Filters = {
  action: string;
  targetType: string;
  actorRole: string;
  result: string;
  actorUserId: string;
  targetId: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  action: '', targetType: '', actorRole: '', result: '',
  actorUserId: '', targetId: '', dateFrom: '', dateTo: '',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function resultBadge(result: string) {
  const map: Record<string, string> = {
    SUCCESS: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    FAILURE: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[result] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>
      {result}
    </span>
  );
}

const INPUT = 'rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
      <dt className="min-w-[120px] text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 sm:mt-0 text-sm text-zinc-900 dark:text-zinc-100 break-all">{value ?? <span className="text-zinc-400 dark:text-zinc-500">—</span>}</dd>
    </div>
  );
}

export default function AuditLogsPage() {
  const { t } = useLanguage();
  const user = getUser();
  const admin = isAdmin(user);

  const [result, setResult] = useState<PaginatedResponse<AuditLog> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [page, setPage] = useState(1);

  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);

  const [detail, setDetail] = useState<AuditLog | null>(null);

  const load = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLogs({
        page,
        limit: 20,
        action: applied.action || undefined,
        targetType: applied.targetType || undefined,
        actorRole: applied.actorRole || undefined,
        result: applied.result || undefined,
        actorUserId: applied.actorUserId || undefined,
        targetId: applied.targetId || undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError
        ? { message: err.message, status: err.status }
        : { message: t('error_audit_logs') });
    } finally {
      setLoading(false);
    }
  }, [admin, page, applied]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setApplied(draft);
    setPage(1);
  }

  function handleReset() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  const hasFilters = Object.values(applied).some(Boolean);

  if (!admin) {
    return <AccessDeniedCard testid="access-denied-audit-logs" />;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 data-testid="page-title-audit-logs" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t('page_audit_logs')}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Review system activity and security-relevant events
        </p>
      </div>

      {/* Filter panel */}
      <form
        onSubmit={handleApply}
        className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Action</label>
            <input
              type="text"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
              placeholder="e.g. AUTH_LOGIN_SUCCESS"
              className={`${INPUT} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Target Type</label>
            <input
              type="text"
              value={draft.targetType}
              onChange={(e) => setDraft((d) => ({ ...d, targetType: e.target.value }))}
              placeholder="e.g. EMPLOYEE"
              className={`${INPUT} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Actor Role</label>
            <select
              value={draft.actorRole}
              onChange={(e) => setDraft((d) => ({ ...d, actorRole: e.target.value }))}
              className={`${INPUT} w-full`}
            >
              <option value="">All Roles</option>
              {ROLES.filter(Boolean).map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Result</label>
            <select
              value={draft.result}
              onChange={(e) => setDraft((d) => ({ ...d, result: e.target.value }))}
              className={`${INPUT} w-full`}
            >
              <option value="">All Results</option>
              {RESULTS.filter(Boolean).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Actor User ID</label>
            <input
              type="text"
              value={draft.actorUserId}
              onChange={(e) => setDraft((d) => ({ ...d, actorUserId: e.target.value }))}
              placeholder="User UUID"
              className={`${INPUT} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Target ID</label>
            <input
              type="text"
              value={draft.targetId}
              onChange={(e) => setDraft((d) => ({ ...d, targetId: e.target.value }))}
              placeholder="Target UUID"
              className={`${INPUT} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Date From</label>
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              className={`${INPUT} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Date To</label>
            <input
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
              className={`${INPUT} w-full`}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-800 dark:bg-zinc-200 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300"
          >
            Apply Filters
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-zinc-200 dark:border-zinc-600 px-4 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              {t('clear')}
            </button>
          )}
          {result && (
            <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
              {result.meta.total.toLocaleString()} record{result.meta.total !== 1 ? 's' : ''} · page {result.meta.page} of {result.meta.totalPages}
              {hasFilters && <span className="ml-1 rounded bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">filtered</span>}
            </span>
          )}
        </div>
      </form>

      {/* Table */}
      {loading && <LoadingState testid="loading-audit-logs" message={t('loading_audit_logs')} />}
      {!loading && error && <ErrorState testid="error-audit-logs" message={error.message} status={error.status} onRetry={load} />}
      {!loading && !error && result && (
        <>
          {result.data.length === 0 ? (
            <EmptyState testid="empty-audit-logs" message={t('empty_audit_logs')} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                  <tr>
                    {['Timestamp', 'Action', 'Result', 'Actor Role', 'Target Type', 'Target', 'Actor User ID', 'IP', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {result.data.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-900 dark:text-zinc-100 whitespace-nowrap max-w-[200px] truncate" title={log.action}>
                        {log.action}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {resultBadge(log.result)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {log.actorRole ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {log.targetType}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300 max-w-[150px] truncate" title={log.targetLabel ?? log.targetId ?? undefined}>
                        {log.targetLabel ?? log.targetId ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400 dark:text-zinc-500 max-w-[120px] truncate" title={log.actorUserId ?? undefined}>
                        {log.actorUserId ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                        {log.ipAddress ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          data-testid={`btn-detail-${log.id}`}
                          onClick={() => setDetail(log)}
                          className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.meta.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
              <span>Page {result.meta.page} of {result.meta.totalPages} ({result.meta.total.toLocaleString()} total)</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={result.meta.page <= 1}
                  className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40"
                >
                  {t('previous')}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(result.meta.totalPages, p + 1))}
                  disabled={result.meta.page >= result.meta.totalPages}
                  className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {detail && (
        <Modal title="Audit Log Detail" onClose={() => setDetail(null)} wide>
          <dl>
            <DetailRow label="ID" value={<span className="font-mono text-xs">{detail.id}</span>} />
            <DetailRow label="Timestamp" value={formatDateTime(detail.createdAt)} />
            <DetailRow label="Action" value={<span className="font-mono">{detail.action}</span>} />
            <DetailRow label="Result" value={resultBadge(detail.result)} />
            <DetailRow label="Actor Role" value={detail.actorRole} />
            <DetailRow label="Actor User ID" value={detail.actorUserId ? <span className="font-mono text-xs">{detail.actorUserId}</span> : null} />
            <DetailRow label="Target Type" value={detail.targetType} />
            <DetailRow label="Target ID" value={detail.targetId ? <span className="font-mono text-xs">{detail.targetId}</span> : null} />
            <DetailRow label="Target Label" value={detail.targetLabel} />
            <DetailRow label="IP Address" value={detail.ipAddress ? <span className="font-mono">{detail.ipAddress}</span> : null} />
            <DetailRow label="User Agent" value={
              detail.userAgent
                ? <span className="text-xs text-zinc-500 dark:text-zinc-400 break-all">{detail.userAgent}</span>
                : null
            } />
            <DetailRow label="Metadata" value={
              detail.metadata != null
                ? (
                  <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                )
                : null
            } />
          </dl>
        </Modal>
      )}
    </div>
  );
}
