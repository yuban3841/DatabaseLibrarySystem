/**
 * 登录态管理。
 * token 放 localStorage；启动时调 /auth/me 校验有效性，失效自动清掉。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  /** 启动时校验登录态；期间页面应显示 loading */
  loading: boolean;
  hasPermission: (code: string) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(localStorage.getItem('clubcue_token')));

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('clubcue_token')) {
      setUser(null);
      return;
    }
    try {
      const me = await authApi.me();
      setUser(me);
      localStorage.setItem('clubcue_user', JSON.stringify(me));
    } catch {
      localStorage.removeItem('clubcue_token');
      localStorage.removeItem('clubcue_user');
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authApi.login({ username, password });
    localStorage.setItem('clubcue_token', result.token);
    localStorage.setItem('clubcue_user', JSON.stringify(result.user));
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const hasPermission = useCallback(
    (code: string) => Boolean(user?.permissions.includes(code)),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, hasPermission, login, logout, refresh }),
    [user, loading, hasPermission, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  return ctx;
}
