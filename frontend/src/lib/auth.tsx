import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';
import { AuthContext, type AuthState } from './authContext';

interface Session {
  token: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  const queryClient = useQueryClient();

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api<{ user: User }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [logout]);

  const start = useCallback((s: Session) => {
    setToken(s.token);
    setUser(s.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      logout,
      login: async (email, password) => start(await api<Session>('/api/auth/login', { body: { email, password }, auth: false })),
      register: async (name, email, password) => start(await api<Session>('/api/auth/register', { body: { name, email, password }, auth: false })),
      demo: async (role) => start(await api<Session>('/api/auth/demo', { body: { role }, auth: false })),
    }),
    [user, loading, logout, start],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
