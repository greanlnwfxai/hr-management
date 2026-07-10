'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  getOffsiteReview,
  approveOffsiteReview,
  rejectOffsiteReview,
  type OffsiteReviewRecord,
  type PaginatedResponse,
  ApiError,
} from '@/lib/api';
import { getUser, isAdminOrManager } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import Toast, { type ToastData } from '@/components/Toast';
import { useLanguage } from '@/hooks/useLanguage';
import { type Language, offsiteReviewStatusLabel, offsiteReviewTypeLabel } from '@/lib/i18n';

const INPUT = 'rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none';

const STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'];

function isMixedCheckout(rec: OffsiteReviewRecord): boolean {
  return rec.attendanceSource === 'COMPANY_GEOFENCE';
}

function formatTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDistance(m: number | null | undefined, lang: Language): string {
  if (m === null || m === undefined) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} ${lang === 'th' ? 'กม.' : 'km'}`;
  return `${Math.round(m)} ${lang === 'th' ? 'ม.' : 'm'}`;
}

function reviewStatusBadge(status: string | null, lang: Language) {
  if (!status) return null;
  const cls: Record<string, string> = {
    PENDING_REVIEW: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls[status] ?? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>
      {offsiteReviewStatusLabel(status, lang)}
    </span>
  );
}

function typeBadge(rec: OffsiteReviewRecord, lang: Language) {
  const mixed = isMixedCheckout(rec);
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
      mixed
        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
    }`}>
      {offsiteReviewTypeLabel(mixed, lang)}
    </span>
  );
}

export default function OffsiteReviewPage() {
  const { t, lang } = useLanguage();
  const user = getUser();

  const [result, setResult] = useState<PaginatedResponse<OffsiteReviewRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [page, setPage] = useState(1);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('PENDING_REVIEW');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const [approveTarget, setApproveTarget] = useState<OffsiteReviewRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OffsiteReviewRecord | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [toast, setToast] = useState<ToastData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOffsiteReview({
        page,
        limit: 20,
        reviewStatus: reviewStatusFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        employeeId: employeeId.trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.message, status: err.status }
          : { message: t('error_offsite_review') },
      );
    } finally {
      setLoading(false);
    }
  }, [page, reviewStatusFilter, startDate, endDate, employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  function openApprove(rec: OffsiteReviewRecord) {
    setApproveNote('');
    setApproveTarget(rec);
  }

  function openReject(rec: OffsiteReviewRecord) {
    setRejectNote('');
    setRejectTarget(rec);
  }

  async function handleApprove() {
    if (!approveTarget) return;
    setActionLoading(true);
    try {
      await approveOffsiteReview(approveTarget.id, approveNote.trim() || undefined);
      const name = [approveTarget.employee?.firstName, approveTarget.employee?.lastName].filter(Boolean).join(' ');
      const message = `${t('offsite_review_toast_approve_prefix')}${name ? t('offsite_review_toast_for_word') + name : ''}${t('offsite_review_toast_success_suffix')}`;
      setToast({ message, type: 'success' });
      setApproveTarget(null);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setToast({ message: err.message || t('offsite_review_toast_approve_status_changed'), type: 'error' });
        setApproveTarget(null);
        load();
      } else {
        setToast({ message: err instanceof ApiError ? err.message : t('offsite_review_toast_approve_failed'), type: 'error' });
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget || rejectNote.trim().length < 3) return;
    setActionLoading(true);
    try {
      await rejectOffsiteReview(rejectTarget.id, rejectNote.trim());
      const name = [rejectTarget.employee?.firstName, rejectTarget.employee?.lastName].filter(Boolean).join(' ');
      const message = `${t('offsite_review_toast_reject_prefix')}${name ? t('offsite_review_toast_for_word') + name : ''}${t('offsite_review_toast_success_suffix')}`;
      setToast({ message, type: 'success' });
      setRejectTarget(null);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setToast({ message: err.message || t('offsite_review_toast_reject_status_changed'), type: 'error' });
        setRejectTarget(null);
        load();
      } else {
        setToast({ message: err instanceof ApiError ? err.message : t('offsite_review_toast_reject_failed'), type: 'error' });
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (!isAdminOrManager(user)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">{t('offsite_review_access_denied_title')}</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('offsite_review_access_denied_detail')}</p>
        <Link href="/attendance" className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline">
          {t('offsite_review_back_link')}
        </Link>
      </div>
    );
  }

  const hasFilters = Boolean(startDate || endDate || employeeId || reviewStatusFilter !== 'PENDING_REVIEW');

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 data-testid="page-title-offsite-review" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {user?.role === 'MANAGER' ? t('page_offsite_review_manager') : t('page_offsite_review')}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{t('offsite_review_subtitle')}</p>
        </div>
        <Link
          href="/attendance"
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {t('offsite_review_back_link')}
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={reviewStatusFilter}
          onChange={(e) => { setReviewStatusFilter(e.target.value); setPage(1); }}
          className={INPUT}
          data-testid="filter-review-status"
        >
          <option value="">{t('offsite_review_filter_all_statuses')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{offsiteReviewStatusLabel(s, lang)}</option>)}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          className={INPUT}
          title={t('offsite_review_filter_date_from')}
        />
        <span className="text-xs text-zinc-400 dark:text-zinc-500">–</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          className={INPUT}
          title={t('offsite_review_filter_date_to')}
        />
        <input
          type="text"
          value={employeeId}
          onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}
          placeholder={t('offsite_review_filter_employee_placeholder')}
          title={t('offsite_review_filter_employee')}
          data-testid="filter-employee-id"
          className={`${INPUT} w-44`}
        />
        {hasFilters && (
          <button
            onClick={() => { setReviewStatusFilter('PENDING_REVIEW'); setStartDate(''); setEndDate(''); setEmployeeId(''); setPage(1); }}
            className="rounded border border-zinc-200 dark:border-zinc-600 px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            {t('offsite_review_clear_filters')}
          </button>
        )}
      </div>

      {/* Content */}
      {loading && <LoadingState testid="loading-offsite-review" message={t('loading_offsite_review')} />}
      {!loading && error && (
        <ErrorState testid="error-offsite-review" message={error.message} status={error.status} onRetry={load} />
      )}
      {!loading && !error && result && (
        <>
          {result.meta.total > 0 && (
            <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
              {result.meta.total.toLocaleString()} {result.meta.total !== 1 ? t('offsite_review_records_plural') : t('offsite_review_records_singular')}
            </p>
          )}
          {result.data.length === 0 ? (
            <EmptyState testid="empty-offsite-review" message={t('empty_offsite_review')} />
          ) : (
            <div className="space-y-4">
              {result.data.map((rec) => (
                <RecordCard
                  key={rec.id}
                  rec={rec}
                  lang={lang}
                  t={t}
                  onApprove={() => openApprove(rec)}
                  onReject={() => openReject(rec)}
                />
              ))}
            </div>
          )}
          {result.meta.totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
              <span>{t('offsite_review_page_word')} {result.meta.page} / {result.meta.totalPages}</span>
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

      {/* Approve modal */}
      {approveTarget && (
        <Modal title={t('offsite_review_modal_approve_title')} onClose={() => setApproveTarget(null)}>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            {t('offsite_review_modal_approve_prefix')}{' '}
            <strong>{approveTarget.employee?.firstName} {approveTarget.employee?.lastName}</strong>{' '}
            {t('offsite_review_modal_date_prefix')} {formatDate(approveTarget.date, lang)}
          </p>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t('offsite_review_note_optional_label')}
          </label>
          <textarea
            value={approveNote}
            onChange={(e) => setApproveNote(e.target.value)}
            placeholder={t('offsite_review_note_placeholder')}
            maxLength={500}
            rows={3}
            className="w-full resize-none rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
          />
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => setApproveTarget(null)}
              disabled={actionLoading}
              className="rounded-md border border-zinc-200 dark:border-zinc-600 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
            >
              {t('offsite_review_cancel')}
            </button>
            <button
              data-testid="btn-confirm-approve"
              onClick={handleApprove}
              disabled={actionLoading}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading ? t('offsite_review_btn_processing') : t('offsite_review_btn_approve')}
            </button>
          </div>
        </Modal>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <Modal title={t('offsite_review_modal_reject_title')} onClose={() => setRejectTarget(null)}>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            {t('offsite_review_modal_reject_prefix')}{' '}
            <strong>{rejectTarget.employee?.firstName} {rejectTarget.employee?.lastName}</strong>{' '}
            {t('offsite_review_modal_date_prefix')} {formatDate(rejectTarget.date, lang)}
          </p>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t('offsite_review_reject_reason_required')} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder={t('offsite_review_reject_placeholder')}
            maxLength={500}
            rows={3}
            className="w-full resize-none rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
          />
          {rejectNote.trim().length > 0 && rejectNote.trim().length < 3 && (
            <p className="mt-1 text-xs text-red-500">{t('offsite_review_reject_min_length_hint')}</p>
          )}
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => setRejectTarget(null)}
              disabled={actionLoading}
              className="rounded-md border border-zinc-200 dark:border-zinc-600 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
            >
              {t('offsite_review_cancel')}
            </button>
            <button
              data-testid="btn-confirm-reject"
              onClick={handleReject}
              disabled={actionLoading || rejectNote.trim().length < 3}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading ? t('offsite_review_btn_processing') : t('offsite_review_btn_reject')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type CardProps = {
  rec: OffsiteReviewRecord;
  lang: Language;
  t: (key: import('@/lib/i18n').TranslationKey) => string;
  onApprove: () => void;
  onReject: () => void;
};

function RecordCard({ rec, lang, t, onApprove, onReject }: CardProps) {
  const isPending = rec.reviewStatus === 'PENDING_REVIEW';
  const emp = rec.employee;
  const empName = emp ? `${emp.firstName} ${emp.lastName}` : '—';
  const empMeta = [emp?.employeeCode, emp?.department?.name, emp?.position?.title].filter(Boolean).join(' · ');

  return (
    <div
      data-testid="offsite-review-card"
      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm"
    >
      {/* Badges + date */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {typeBadge(rec, lang)}
        {reviewStatusBadge(rec.reviewStatus, lang)}
        <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">{formatDate(rec.date, lang)}</span>
      </div>

      {/* Employee info */}
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{empName}</p>
      {empMeta && <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{empMeta}</p>}

      {/* Times */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        <span>{t('offsite_review_checkin_label')}: <strong className="text-zinc-800 dark:text-zinc-200">{formatTime(rec.checkIn, lang)}</strong></span>
        <span>{t('offsite_review_checkout_label')}: <strong className="text-zinc-800 dark:text-zinc-200">{formatTime(rec.checkOut, lang)}</strong></span>
      </div>

      {/* Location & reason */}
      {rec.workLocationName && (
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {t('offsite_review_location_label')}: <span className="text-zinc-800 dark:text-zinc-200">{rec.workLocationName}</span>
        </div>
      )}
      {rec.offsiteReason && (
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {t('offsite_review_reason_label')}: <span className="text-zinc-800 dark:text-zinc-200">{rec.offsiteReason}</span>
        </div>
      )}
      {rec.note && (
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {t('offsite_review_note_label')}: <span className="text-zinc-800 dark:text-zinc-200">{rec.note}</span>
        </div>
      )}

      {/* GPS metrics (distance/accuracy only — no raw coordinates) */}
      {(rec.checkOutDistanceFromCompanyMeters != null || rec.checkOutAccuracyMeters != null) && (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          {rec.checkOutDistanceFromCompanyMeters != null && (
            <span>{t('offsite_review_distance_checkout_label')}: {formatDistance(rec.checkOutDistanceFromCompanyMeters, lang)}</span>
          )}
          {rec.checkOutAccuracyMeters != null && (
            <span>{t('offsite_review_accuracy_label')}: {formatDistance(rec.checkOutAccuracyMeters, lang)}</span>
          )}
        </div>
      )}

      {/* Review result (if already resolved) */}
      {rec.reviewStatus !== 'PENDING_REVIEW' && rec.reviewedAt && (
        <div className="mt-3 rounded-md bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            {t('offsite_review_reviewed_by_label')}:{' '}
            <span data-testid="reviewer-name" className="text-zinc-700 dark:text-zinc-300">
              {rec.reviewedBy ? `${rec.reviewedBy.firstName} ${rec.reviewedBy.lastName}` : t('offsite_review_reviewed_by_unknown')}
            </span>
            {' '}· {t('offsite_review_reviewed_at_label')} {formatDateTime(rec.reviewedAt, lang)}
          </span>
          {rec.reviewNote && <span className="mt-0.5 block">{t('offsite_review_note_label')}: {rec.reviewNote}</span>}
        </div>
      )}
      {isPending && (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          {t('offsite_review_reviewed_by_label')}: <span data-testid="reviewer-name">{t('offsite_review_reviewed_by_fallback')}</span>
        </p>
      )}

      {/* Action buttons (PENDING_REVIEW only) */}
      {isPending && (
        <div className="mt-4 flex gap-3 border-t border-zinc-100 dark:border-zinc-700 pt-4">
          <button
            data-testid="btn-approve"
            onClick={onApprove}
            className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            {t('offsite_review_btn_approve')}
          </button>
          <button
            data-testid="btn-reject"
            onClick={onReject}
            className="rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-zinc-800 px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            {t('offsite_review_btn_reject')}
          </button>
        </div>
      )}
    </div>
  );
}
