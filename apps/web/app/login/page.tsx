'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, ApiError } from '@/lib/api';
import { setToken, setUser, getToken, type AuthUser } from '@/lib/auth';
import { useLanguage } from '@/hooks/useLanguage';
import LanguageToggle from '@/components/LanguageToggle';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      setToken(data.accessToken);
      setUser(data.user as AuthUser);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t('login_error_invalid'));
      } else {
        setError(t('login_error_failed'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t('login_title')}</h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{t('login_subtitle')}</p>
          </div>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        {error && (
          <div
            data-testid="login-error"
            className="mb-4 rounded-md border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('login_email')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400"
              placeholder="admin@hr.local"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('login_password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400"
              placeholder="••••••••"
            />
          </div>

          <button
            data-testid="btn-signin"
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50"
          >
            {loading ? t('login_submitting') : t('login_submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
