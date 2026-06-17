import React, { createContext, useContext, useEffect, useState } from 'react';
import { login } from '../api/client';
import {
  clearToken,
  clearUser,
  getToken,
  getUser,
  saveToken,
  saveUser,
} from './storage';
import type { AuthContextValue, AuthUser } from './types';

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

const INITIAL_STATE: AuthState = {
  token: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  useEffect(() => {
    void restoreSession();
  }, []);

  async function restoreSession() {
    try {
      const [token, user] = await Promise.all([getToken(), getUser()]);
      if (token && user) {
        setState({
          token,
          user,
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });
      } else {
        setState((s) => ({ ...s, isLoading: false }));
      }
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }

  async function signIn(email: string, password: string) {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const { accessToken, user } = await login(email, password);
      await Promise.all([saveToken(accessToken), saveUser(user)]);
      setState({
        token: accessToken,
        user,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ',
      }));
    }
  }

  async function signOut() {
    await Promise.all([clearToken(), clearUser()]);
    setState({
      token: null,
      user: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
