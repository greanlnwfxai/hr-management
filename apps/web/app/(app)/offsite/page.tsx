'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getOffSiteRequests, approveOffSiteRequest, rejectOffSiteRequest,
  type OffSiteRequest, type PaginatedResponse, ApiError,
} from '@/lib/api';
import { getUser } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import Toast, { type ToastData } from '@/components/Toast';
import { useLanguage } from '@/hooks/useLanguage';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  };
  const labels: Record<string, string> = { PENDING: 'รอการอนุมัติ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function OffSitePage() {
  const { t } = useLanguage();
  const user = getUser();
  const canApprove = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN' || user?.role === 'MANAGER';

  const [result, setResult] = useState<PaginatedResponse<OffSiteRequest> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOffSiteRequests({ page, limit: 20, status: statusFilter || undefined });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, status: err.status } : { message: 'โหลดข้อมูลไม่สำเร็จ' });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(req: OffSiteRequest) {
    if (!window.confirm(`อนุมัติคำขอทำงานนอกสถานที่ของ ${req.employee?.firstName} ${req.employee?.lastName} วันที่ ${req.date.split('T')[0]}?`)) return;
    setActionId(req.id);
    try {
      await approveOffSiteRequest(req.id);
      setToast({ message: 'อนุมัติคำขอสำเร็จ', type: 'success' });
      load();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'ไม่สามารถอนุมัติได้', type: 'error' });
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(req: OffSiteRequest) {
    const reason = window.prompt(`เหตุผลที่ไม่อนุมัติ (ถ้ามี):`);
    if (reason === null) return;
    setActionId(req.id);
    try {
      await rejectOffSiteRequest(req.id, reason || undefined);
      setToast({ message: 'ปฏิเสธคำขอสำเร็จ', type: 'success' });
      load();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'ไม่สามารถปฏิเสธได้', type: 'error' });
    } finally {
      setActionId(null);
    }
  }

  const meta = result?.meta;

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {t('nav_offsite')}
        </h1>
        {meta && <span className="text-sm text-zinc-400 dark:text-zinc-500">{meta.total} total</span>}
      </div>

      <div className="mb-4 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none"
        >
          <option value="">ทุกสถานะ</option>
          <option value="PENDING">รอการอนุมัติ</option>
          <option value="APPROVED">อนุมัติแล้ว</option>
          <option value="REJECTED">ไม่อนุมัติ</option>
        </select>
        {statusFilter && (
          <button onClick={() => { setStatusFilter(''); setPage(1); }} className="rounded-md border border-zinc-200 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700">
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {loading && <LoadingState testid="loading-state" message="กำลังโหลด..." />}
      {!loading && error && <ErrorState testid="error-state" message={error.message} status={error.status} onRetry={load} />}

      {!loading && !error && result && (
        <>
          {result.data.length === 0 ? (
            <EmptyState testid="empty-state" message="ไม่พบคำขอทำงานนอกสถานที่" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                  <tr>
                    {['พนักงาน', 'แผนก', 'วันที่', 'เหตุผล', 'สถานะ', ...(canApprove ? ['การดำเนินการ'] : [])].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {result.data.map((req) => (
                    <tr key={req.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {req.employee ? `${req.employee.firstName} ${req.employee.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                        {req.employee?.department?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                        {req.date.split('T')[0]}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-zinc-500 dark:text-zinc-400">
                        {req.reason ?? '—'}
                      </td>
                      <td className="px-4 py-3">{statusBadge(req.status)}</td>
                      {canApprove && (
                        <td className="px-4 py-3">
                          {req.status === 'PENDING' ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleApprove(req)}
                                disabled={actionId === req.id}
                                className="rounded border border-green-200 dark:border-green-800/50 px-2 py-1 text-xs text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40"
                              >
                                อนุมัติ
                              </button>
                              <button
                                onClick={() => handleReject(req)}
                                disabled={actionId === req.id}
                                className="rounded border border-red-200 dark:border-red-800/50 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
                              >
                                ปฏิเสธ
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                              {req.approvedBy ? `โดย ${req.approvedBy.firstName}` : '—'}
                            </span>
                          )}
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
              <span>หน้า {meta.page} จาก {meta.totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={meta.page <= 1} className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40">{t('previous')}</button>
                <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={meta.page >= meta.totalPages} className="rounded border border-zinc-200 dark:border-zinc-600 px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40">{t('next')}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
