'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMe, changePassword, ApiError, type MeResponse } from '@/lib/api';
import { getUser, setUser } from '@/lib/auth';
import { useLanguage } from '@/hooks/useLanguage';
import { roleLabel } from '@/lib/i18n';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';

const SPECIAL_CHARS = /[!@#$%^&*]/;

function pwRules(pw: string) {
  return {
    min8: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: SPECIAL_CHARS.test(pw),
  };
}

function RuleRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
      <span className="w-3 text-center">{ok ? '✓' : '✗'}</span>
      {label}
    </li>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4 py-2.5 border-b border-zinc-100 dark:border-zinc-700 last:border-0">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:w-40 shrink-0">{label}</span>
      <span className="text-sm text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { t, lang } = useLanguage();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getMe();
      setMe(data);
    } catch {
      setLoadError(t('profile_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const rules = pwRules(newPw);
  const allRulesPass = Object.values(rules).every(Boolean);
  const passwordsMatch = confirmPw.length > 0 && newPw === confirmPw;
  const canSubmit = currentPw.length > 0 && allRulesPass && passwordsMatch && !submitting;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    if (newPw !== confirmPw) {
      setPwError(t('profile_pw_mismatch'));
      return;
    }

    setPwError(null);
    setPwSuccess(null);
    setSubmitting(true);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw, confirmPassword: confirmPw });
      setPwSuccess(t('profile_change_success'));
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');

      // Refresh local auth state so the mustChangePassword banner clears
      const storedUser = getUser();
      if (storedUser) {
        const updated = { ...storedUser, mustChangePassword: false };
        setUser(updated);
        window.dispatchEvent(new CustomEvent('hr-user-change'));
      }
      // Re-fetch profile to reflect updated mustChangePassword
      const fresh = await getMe();
      setMe(fresh);
    } catch (err) {
      if (err instanceof ApiError) {
        setPwError(err.message);
      } else {
        setPwError(t('profile_error'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1
        data-testid="page-title-profile"
        className="text-xl font-semibold text-zinc-900 dark:text-zinc-50"
      >
        {t('page_profile')}
      </h1>

      {loading && <LoadingState message={t('profile_loading')} testid="profile-loading" />}

      {!loading && loadError && (
        <ErrorState message={loadError} onRetry={fetchMe} testid="profile-error" />
      )}

      {!loading && me && (
        <>
          {/* mustChangePassword warning */}
          {me.mustChangePassword && (
            <div
              data-testid="profile-must-change-pw"
              className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
            >
              <span className="font-medium">{t('profile_must_change_pw')}: </span>
              {t('profile_must_change_pw_banner')}
            </div>
          )}

          {/* Account info */}
          <section className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3">
            <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t('profile_account_info')}
            </h2>
            <FieldRow label={t('profile_email')} value={me.email} />
            <FieldRow label={t('profile_username')} value={me.username ?? '—'} />
            <FieldRow label={t('profile_role')} value={roleLabel(me.role, lang)} />
          </section>

          {/* Employee info */}
          {me.employee && (
            <section className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3">
              <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {t('profile_employee_info')}
              </h2>
              <FieldRow
                label={t('emp_col_name')}
                value={`${me.employee.firstName} ${me.employee.lastName}`}
              />
              <FieldRow label={t('profile_emp_code')} value={me.employee.employeeCode} />
              <FieldRow label={t('profile_dept')} value={me.employee.department ?? '—'} />
              <FieldRow label={t('profile_position')} value={me.employee.position ?? '—'} />
            </section>
          )}

          {/* Password change */}
          <section className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-4">
            <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {t('profile_change_password')}
            </h2>

            {pwSuccess && (
              <div
                data-testid="pw-change-success"
                className="mb-4 rounded-md border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-700 dark:text-green-400"
              >
                {pwSuccess}
              </div>
            )}

            {pwError && (
              <div
                data-testid="pw-change-error"
                className="mb-4 rounded-md border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400"
              >
                {pwError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4" data-testid="form-change-password">
              {/* Current password */}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('profile_current_password')}
                </label>
                <div className="relative">
                  <input
                    data-testid="input-current-password"
                    type={showCurrent ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs px-1"
                    tabIndex={-1}
                  >
                    {showCurrent ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('profile_new_password')}
                </label>
                <div className="relative">
                  <input
                    data-testid="input-new-password"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPw}
                    onChange={(e) => { setNewPw(e.target.value); setPwSuccess(null); }}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs px-1"
                    tabIndex={-1}
                  >
                    {showNew ? '🙈' : '👁'}
                  </button>
                </div>
                {newPw.length > 0 && (
                  <ul className="mt-2 space-y-0.5" data-testid="pw-rules">
                    <RuleRow ok={rules.min8}   label={t('profile_pw_rules_min8')} />
                    <RuleRow ok={rules.upper}  label={t('profile_pw_rules_upper')} />
                    <RuleRow ok={rules.lower}  label={t('profile_pw_rules_lower')} />
                    <RuleRow ok={rules.digit}  label={t('profile_pw_rules_digit')} />
                    <RuleRow ok={rules.special} label={t('profile_pw_rules_special')} />
                  </ul>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('profile_confirm_password')}
                </label>
                <div className="relative">
                  <input
                    data-testid="input-confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className={`${inputClass} ${confirmPw.length > 0 && !passwordsMatch ? 'border-red-400 dark:border-red-600' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs px-1"
                    tabIndex={-1}
                  >
                    {showConfirm ? '🙈' : '👁'}
                  </button>
                </div>
                {confirmPw.length > 0 && !passwordsMatch && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400" data-testid="pw-mismatch">
                    {t('profile_pw_mismatch')}
                  </p>
                )}
              </div>

              <button
                data-testid="btn-change-password"
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? t('profile_changing') : t('profile_change_submit')}
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
