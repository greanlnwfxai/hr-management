'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuth, getUser, type AuthUser } from '@/lib/auth';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/hooks/useLanguage';
import { type TranslationKey } from '@/lib/i18n';

type NavDef = { href: string; labelKey: TranslationKey; testid: string };

function navForRole(role: AuthUser['role']): NavDef[] {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'HR_ADMIN':
      return [
        { href: '/dashboard',   labelKey: 'nav_dashboard',   testid: 'nav-dashboard' },
        { href: '/employees',   labelKey: 'nav_employees',   testid: 'nav-employees' },
        { href: '/departments', labelKey: 'nav_departments', testid: 'nav-departments' },
        { href: '/positions',   labelKey: 'nav_positions',   testid: 'nav-positions' },
        { href: '/attendance',                     labelKey: 'nav_attendance',        testid: 'nav-attendance' },
        { href: '/leave',                          labelKey: 'nav_leave',             testid: 'nav-leave' },
        { href: '/offsite',                        labelKey: 'nav_offsite',           testid: 'nav-offsite' },
        { href: '/audit-logs',                     labelKey: 'nav_audit_logs',        testid: 'nav-audit-logs' },
        { href: '/attendance/geofence-settings',   labelKey: 'nav_geofence_settings', testid: 'nav-geofence-settings' },
      ];
    case 'MANAGER':
      return [
        { href: '/dashboard',  labelKey: 'nav_dashboard',  testid: 'nav-dashboard' },
        { href: '/employees',  labelKey: 'nav_employees',  testid: 'nav-employees' },
        { href: '/attendance', labelKey: 'nav_attendance', testid: 'nav-attendance' },
        { href: '/leave',      labelKey: 'nav_leave',      testid: 'nav-leave' },
        { href: '/offsite',    labelKey: 'nav_offsite',    testid: 'nav-offsite' },
      ];
    case 'EMPLOYEE':
    default:
      return [
        { href: '/attendance', labelKey: 'nav_attendance', testid: 'nav-attendance' },
        { href: '/leave',      labelKey: 'nav_leave',      testid: 'nav-leave' },
      ];
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
    const onUserChange = () => setUser(getUser());
    window.addEventListener('hr-user-change', onUserChange);
    return () => window.removeEventListener('hr-user-change', onUserChange);
  }, []);

  const forced = user?.mustChangePassword === true;

  useEffect(() => {
    if (forced && pathname !== '/profile') {
      router.replace('/profile');
    }
  }, [forced, pathname, router]);

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  const nav = user ? navForRole(user.role) : [];

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 flex-col bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700 md:flex">
        <div className="flex h-14 items-center border-b border-zinc-200 dark:border-zinc-700 px-5">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">HR Management</span>
        </div>
        <nav className="flex-1 px-3 py-4">
          {forced ? (
            <>
              {nav.map((item) => (
                <span
                  key={item.href}
                  data-testid={item.testid}
                  title={t('profile_forced_nav_hint')}
                  className="flex items-center rounded-md px-3 py-2 text-sm font-medium mb-1 text-zinc-300 dark:text-zinc-600 cursor-not-allowed select-none"
                >
                  {t(item.labelKey)}
                </span>
              ))}
              <span
                data-testid="nav-forced-hint"
                className="flex items-center rounded-md px-3 py-2 text-xs text-amber-600 dark:text-amber-400 select-none"
              >
                {t('profile_forced_nav_hint')}
              </span>
            </>
          ) : (
            nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testid}
                className={`flex items-center rounded-md px-3 py-2 text-sm font-medium mb-1 transition-colors ${
                  pathname === item.href
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {t(item.labelKey)}
              </Link>
            ))
          )}
          <Link
            href="/profile"
            data-testid="nav-profile"
            className={`flex items-center rounded-md px-3 py-2 text-sm font-medium mb-1 transition-colors ${
              pathname === '/profile'
                ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {t('nav_profile')}
          </Link>
        </nav>
        <div className="border-t border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
          {user && (
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={user.email}>
              {user.email}
              <span className="ml-1 rounded bg-zinc-100 dark:bg-zinc-700 px-1 py-0.5 text-[10px] uppercase text-zinc-400 dark:text-zinc-400">
                {user.role.replace('_', ' ')}
              </span>
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <LanguageToggle />
            <ThemeToggle />
          </div>
          <button
            data-testid="btn-logout"
            onClick={handleLogout}
            className="w-full rounded-md border border-zinc-200 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            {t('nav_logout')}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 md:hidden">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">HR Management</span>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
            <button
              className="rounded p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 pb-3 md:hidden">
            {forced ? (
              <>
                {nav.map((item) => (
                  <span
                    key={item.href}
                    data-testid={item.testid}
                    className="flex items-center rounded-md px-3 py-2 text-sm font-medium mt-1 text-zinc-300 dark:text-zinc-600 cursor-not-allowed select-none"
                  >
                    {t(item.labelKey)}
                  </span>
                ))}
                <span className="flex items-center rounded-md px-3 py-2 text-xs text-amber-600 dark:text-amber-400 select-none">
                  {t('profile_forced_nav_hint')}
                </span>
              </>
            ) : (
              nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={item.testid}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center rounded-md px-3 py-2 text-sm font-medium mt-1 ${
                    pathname === item.href
                      ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {t(item.labelKey)}
                </Link>
              ))
            )}
            <Link
              href="/profile"
              data-testid="nav-profile"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center rounded-md px-3 py-2 text-sm font-medium mt-1 ${
                pathname === '/profile'
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {t('nav_profile')}
            </Link>
            <button
              data-testid="btn-logout"
              onClick={handleLogout}
              className="mt-2 w-full rounded-md border border-zinc-200 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300"
            >
              {t('nav_logout')}
            </button>
          </div>
        )}

        {forced && (
          <div
            data-testid="banner-must-change-pw"
            className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700 px-4 py-2 text-sm font-medium text-red-800 dark:text-red-300"
          >
            {t('profile_forced_banner')}
          </div>
        )}

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
