const TOKEN_KEY = 'hr_access_token';
const USER_KEY = 'hr_user';

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  role: 'SUPER_ADMIN' | 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE';
  mustChangePassword?: boolean;
  employeeId?: string | null;
};

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';
}

export function isAdminOrManager(user: AuthUser | null): boolean {
  return isAdmin(user) || user?.role === 'MANAGER';
}
