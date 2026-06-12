'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuth, getUser, type AuthUser } from '@/lib/auth';

type NavItem = { href: string; label: string };

function navForRole(role: AuthUser['role']): NavItem[] {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'HR_ADMIN':
      return [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/employees', label: 'Employees' },
        { href: '/departments', label: 'Departments' },
        { href: '/positions', label: 'Positions' },
        { href: '/attendance', label: 'Attendance' },
        { href: '/leave', label: 'Leave' },
      ];
    case 'MANAGER':
      return [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/employees', label: 'Employees' },
        { href: '/attendance', label: 'Attendance' },
        { href: '/leave', label: 'Leave' },
      ];
    case 'EMPLOYEE':
    default:
      return [
        { href: '/attendance', label: 'Attendance' },
        { href: '/leave', label: 'Leave' },
      ];
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  const nav = user ? navForRole(user.role) : [];

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Sidebar — desktop */}
      <aside className="hidden w-56 flex-col bg-white border-r border-zinc-200 md:flex">
        <div className="flex h-14 items-center border-b border-zinc-200 px-5">
          <span className="text-sm font-semibold text-zinc-800">HR Management</span>
        </div>
        <nav className="flex-1 px-3 py-4">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-md px-3 py-2 text-sm font-medium mb-1 transition-colors ${
                pathname === item.href
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-200 p-4">
          {user && (
            <p className="mb-2 truncate text-xs text-zinc-500" title={user.email}>
              {user.email}
              <span className="ml-1 rounded bg-zinc-100 px-1 py-0.5 text-[10px] uppercase text-zinc-400">
                {user.role.replace('_', ' ')}
              </span>
            </p>
          )}
          <button
            onClick={handleLogout}
            className="w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 md:hidden">
          <span className="text-sm font-semibold text-zinc-800">HR Management</span>
          <button
            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {menuOpen && (
          <div className="border-b border-zinc-200 bg-white px-4 pb-3 md:hidden">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center rounded-md px-3 py-2 text-sm font-medium mt-1 ${
                  pathname === item.href ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="mt-2 w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600"
            >
              Log out
            </button>
          </div>
        )}

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
