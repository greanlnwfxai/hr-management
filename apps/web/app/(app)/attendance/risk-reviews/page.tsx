'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getRiskReviews,
  reviewRiskReview,
  type AttendanceRiskReview,
  type PaginatedResponse,
  ApiError,
} from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import Toast, { type ToastData } from '@/components/Toast';
import { useLanguage } from '@/hooks/useLanguage';

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['PENDING', 'REVIEWED', 'APPROVED', 'REJECTED', 'IGNORED'];
const RESULTS = ['ACCEPTED', 'REJECTED', 'FLAGGED'];
const ACTIONS = ['CLOCK_IN', 'CLOCK_OUT', 'OFFSITE_CLOCK_IN', 'OFFSITE_CLOCK_OUT'];

// Defense-in-depth only: apps/api/src/attendance/attendance-risk-review.service.ts
// already runs metadataJson through the same sanitizeMetadata() AuditLogService
// uses (redacts these keys before the row is ever written). This client-side
// pass exists so a row can never surface a raw value here even if a future
// bug or an older unsanitized row bypasses the server-side redaction.
const SENSITIVE_KEYS = new Set([
  'password', 'currentpassword', 'newpassword', 'confirmpassword',
  'passwordhash', 'hash', 'token', 'accesstoken', 'refreshtoken',
  'authorization', 'temporarypassword', 'temppassword', 'secret',
  'apikey', 'latitude', 'longitude', 'accuracy', 'distance', 'nonce', 'tokenhash',
]);

function redactSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redactSensitive(v);
    }
    return out;
  }
  return value;
}

const INPUT = 'rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function riskLevelBadge(level: string) {
  const cls: Record<string, string> = {
    LOW: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
    MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
    CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls[level] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>{level}</span>;
}

function statusBadge(status: string) {
  const cls: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    REVIEWED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    IGNORED: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400',
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>{status}</span>;
}

function resultBadge(result: string) {
  const cls: Record<string, string> = {
    ACCEPTED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    FLAGGED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls[result] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'}`}>{result}</span>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
      <dt className="min-w-[140px] text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 sm:mt-0 text-sm text-zinc-900 dark:text-zinc-100 break-all">{value ?? <span className="text-zinc-400 dark:text-zinc-500">—</span>}</dd>
    </div>
  );
}

type Filters = {
  status: string;
  riskLevel: string;
  result: string;
  action: string;
  employeeId: string;
  startDate: string;
  endDate: string;
};

const EMPTY_FILTERS: Filters = {
  status: '', riskLevel: '', result: '', action: '', employeeId: '', startDate: '', endDate: '',
};

export default function RiskReviewsPage() {
  const { t } = useLanguage();
  const user = getUser();
  const admin = isAdmin(user);

  const [listResult, setListResult] = useState<PaginatedResponse<AttendanceRiskReview> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [page, setPage] = useState(1);

  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);

  const [detail, setDetail] = useState<AttendanceRiskReview | null>(null);
  const [reviewStatus, setReviewStatus] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [toast, setToast] = useState<ToastData | null>(null);

  const load = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getRiskReviews({
        page,
        limit: 20,
        status: applied.status || undefined,
        riskLevel: applied.riskLevel || undefined,
        result: applied.result || undefined,
        action: applied.action || undefined,
        employeeId: applied.employeeId || undefined,
        startDate: applied.startDate || undefined,
        endDate: applied.endDate || undefined,
      });
      setListResult(data);
    } catch (err) {
      setError(err instanceof ApiError
        ? { message: err.message, status: err.status }
        : { message: t('error_risk_reviews') });
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

  function openDetail(rec: AttendanceRiskReview) {
    setReviewStatus(rec.status);
    setReviewNote('');
    setDetail(rec);
  }

  async function handleReviewSubmit() {
    if (!detail) return;
    setReviewSubmitting(true);
    try {
      await reviewRiskReview(detail.id, reviewStatus, reviewNote.trim() || undefined);
      setToast({ message: 'Risk review updated successfully.', type: 'success' });
      setDetail(null);
      load();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Failed to update risk review.', type: 'error' });
    } finally {
      setReviewSubmitting(false);
    }
  }

  const hasFilters = Object.values(applied).some(Boolean);

  if (!admin) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t('page_risk_reviews')}</h1>
        <ErrorState status={403} />
      </div>
    );
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-6">
        <h1 data-testid="page-title-risk-reviews" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t('page_risk_reviews')}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Review clock-in/out attempts flagged or rejected by SEC-ATT-002/003/004 anti-spoofing checks
        </p>
      </div>

      {/* Filter panel */}
      <form
        onSubmit={handleApply}
        className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Status</label>
            <select
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
              className={`${INPUT} w-full`}
              data-testid="filter-status"
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Risk Level</label>
            <select
              value={draft.riskLevel}
              onChange={(e) => setDraft((d) => ({ ...d, riskLevel: e.target.value }))}
              className={`${INPUT} w-full`}
              data-testid="filter-risk-level"
            >
              <option value="">All Levels</option>
              {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Result</label>
            <select
              value={draft.result}
              onChange={(e) => setDraft((d) => ({ ...d, result: e.target.value }))}
              className={`${INPUT} w-full`}
              data-testid="filter-result"
            >
              <option value="">All Results</option>
              {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Action</label>
            <select
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
              className={`${INPUT} w-full`}
              data-testid="filter-action"
            >
              <option value="">All Actions</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Employee ID</label>
            <input
              type="text"
              value={draft.employeeId}
              onChange={(e) => setDraft((d) => ({ ...d, employeeId: e.target.value }))}
              placeholder="Employee UUID"
              className={`${INPUT} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Date From</label>
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
              className={`${INPUT} w-full`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Date To</label>
            <input
              type="date"
              value={draft.endDate}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
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
          {listResult && (
            <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
              {listResult.meta.total.toLocaleString()} record{listResult.meta.total !== 1 ? 's' : ''} · page {listResult.meta.page} of {listResult.meta.totalPages}
              {hasFilters && <span className="ml-1 rounded bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">filtered</span>}
            </span>
          )}
        </div>
      </form>

      {/* Table */}
      {loading && <LoadingState testid="loading-risk-reviews" message={t('loading_risk_reviews')} />}
      {!loading && error && <ErrorState testid="error-risk-reviews" message={error.message} status={error.status} onRetry={load} />}
      {!loading && !error && listResult && (
        <>
          {listResult.data.length === 0 ? (
            <EmptyState testid="empty-risk-reviews" message={t('empty_risk_reviews')} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                  <tr>
                    {['Created', 'Employee', 'Action', 'Result', 'Risk', 'Status', 'Source / Platform', 'Reviewed', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {listResult.data.map((rec) => {
                    const emp = rec.employee;
                    const empName = emp ? `${emp.firstName} ${emp.lastName}` : '—';
                    return (
                      <tr key={rec.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                        <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          {formatDateTime(rec.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300 max-w-[160px] truncate" title={emp?.employeeCode}>
                          {empName}
                          {emp?.employeeCode && <span className="block text-zinc-400 dark:text-zinc-500">{emp.employeeCode}</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {rec.action}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{resultBadge(rec.result)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{riskLevelBadge(rec.riskLevel)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{statusBadge(rec.status)}</td>
                        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          {[rec.source, rec.platform].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          {rec.reviewedAt
                            ? `${rec.reviewedBy ? `${rec.reviewedBy.firstName} ${rec.reviewedBy.lastName}` : 'Reviewed'} · ${formatDateTime(rec.reviewedAt)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            data-testid={`btn-detail-${rec.id}`}
                            onClick={() => openDetail(rec)}
                            className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {listResult.meta.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
              <span>Page {listResult.meta.page} of {listResult.meta.totalPages} ({listResult.meta.total.toLocaleString()} total)</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={listResult.meta.page <= 1}
                  className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40"
                >
                  {t('previous')}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(listResult.meta.totalPages, p + 1))}
                  disabled={listResult.meta.page >= listResult.meta.totalPages}
                  className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail / review modal */}
      {detail && (
        <Modal title="Risk Review Detail" onClose={() => setDetail(null)} wide>
          <dl>
            <DetailRow label="ID" value={<span className="font-mono text-xs">{detail.id}</span>} />
            <DetailRow label="Created" value={formatDateTime(detail.createdAt)} />
            <DetailRow
              label="Employee"
              value={detail.employee
                ? `${detail.employee.firstName} ${detail.employee.lastName} (${detail.employee.employeeCode})${detail.employee.department ? ` · ${detail.employee.department.name}` : ''}`
                : null}
            />
            <DetailRow label="Action" value={<span className="font-mono">{detail.action}</span>} />
            <DetailRow label="Result" value={resultBadge(detail.result)} />
            <DetailRow label="Risk Level" value={riskLevelBadge(detail.riskLevel)} />
            <DetailRow label="Status" value={statusBadge(detail.status)} />
            <DetailRow
              label="Reason Codes"
              value={detail.reasonCodes.length > 0
                ? (
                  <div className="flex flex-wrap gap-1">
                    {detail.reasonCodes.map((code) => (
                      <span key={code} className="rounded bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:text-zinc-300">
                        {code}
                      </span>
                    ))}
                  </div>
                )
                : null}
            />
            <DetailRow label="Source" value={detail.source} />
            <DetailRow label="Platform" value={detail.platform} />
            <DetailRow
              label="Reviewed By"
              value={detail.reviewedBy ? `${detail.reviewedBy.firstName} ${detail.reviewedBy.lastName} (${detail.reviewedBy.employeeCode})` : null}
            />
            <DetailRow label="Reviewed At" value={detail.reviewedAt ? formatDateTime(detail.reviewedAt) : null} />
            <DetailRow label="Previous Note" value={detail.reviewNote} />
            <DetailRow
              label="Metadata"
              value={detail.metadataJson != null
                ? (
                  <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
                    {JSON.stringify(redactSensitive(detail.metadataJson), null, 2)}
                  </pre>
                )
                : null}
            />
          </dl>

          {/* Review action — uses the existing PATCH /attendance/risk-reviews/:id/review endpoint */}
          <div className="mt-4 border-t border-zinc-200 dark:border-zinc-700 pt-4">
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Update Review Status
            </label>
            <select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value)}
              className={`${INPUT} w-full`}
              data-testid="review-status-select"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="mb-1 mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Review Note (optional)
            </label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="e.g. Confirmed with employee — GPS delay, not spoofing."
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
            />
            <div className="mt-3 flex justify-end gap-3">
              <button
                onClick={() => setDetail(null)}
                disabled={reviewSubmitting}
                className="rounded-md border border-zinc-200 dark:border-zinc-600 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                data-testid="btn-submit-review"
                onClick={handleReviewSubmit}
                disabled={reviewSubmitting || reviewStatus === detail.status}
                className="rounded-md bg-zinc-800 dark:bg-zinc-200 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50"
              >
                {reviewSubmitting ? 'Saving…' : 'Update Review'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
