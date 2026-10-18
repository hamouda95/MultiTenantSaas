'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, setUnauthorizedHandler } from './api';
import type { ApiUser, Workspace } from './types';

export const LAST_TENANT_KEY = 'saas.lastTenant';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: ApiUser | null;
  /** true quand la session a été fermée par un 401 (jeton expiré/invalide). */
  expired: boolean;
  login: (email: string, password?: string) => Promise<Workspace[]>;
  register: (email: string, password: string, fullName: string, invitationToken?: string) => Promise<Workspace[]>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<ApiUser | null>(null);
  const [expired, setExpired] = useState(false);

  const clearSession = useCallback(() => {
    try { window.localStorage.removeItem(LAST_TENANT_KEY); } catch {}
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Hydratation de la session (côté client uniquement, évite tout mismatch SSR).
  useEffect(() => {
    let active = true;
    // Remove tokens from older frontend versions.
    try { window.localStorage.removeItem('saas.token'); window.localStorage.removeItem('saas.user'); } catch {}
    api.me().then(({ profile }) => {
      if (active) { setUser(profile); setStatus('authenticated'); }
    }).catch(() => { if (active) setStatus('anonymous'); });
    return () => { active = false; };
  }, []);

  // Un 401 sur n'importe quel appel authentifié ferme la session ; la redirection
  // est ensuite faite par useRequireAuth (un seul décideur, pas de course entre deux replace()).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setExpired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password?: string) => {
      const res = await api.login(email, password);
      queryClient.clear();
      queryClient.setQueryData(['workspaces'], res.workspaces);
      setUser(res.user);
      setExpired(false);
      setStatus('authenticated');
      return res.workspaces;
    },
    [queryClient],
  );

  const register = useCallback(async (email: string, password: string, fullName: string, invitationToken?: string) => {
    const res = await api.register(email, password, fullName, invitationToken);
    queryClient.clear();
    queryClient.setQueryData(['workspaces'], res.workspaces);
    setUser(res.user); setExpired(false); setStatus('authenticated');
    return res.workspaces;
  }, [queryClient]);

  const logout = useCallback(async () => {
    await api.logout();
    clearSession();
    setExpired(false);
    router.replace('/login');
  }, [clearSession, router]);

  const value = useMemo(() => ({ status, user, expired, login, register, logout }), [status, user, expired, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/** Redirige vers /login si aucune session. Retourne true quand la session est prête. */
export function useRequireAuth() {
  const { status, expired } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anonymous') router.replace(expired ? '/login?expired=1' : '/login');
  }, [status, expired, router]);
  return status === 'authenticated';
}

export function useWorkspaces() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: api.workspaces,
    enabled: status === 'authenticated',
    staleTime: 30_000,
  });
}

/**
 * Droits côté interface. IMPORTANT : ce n'est qu'un confort d'affichage.
 * L'autorité reste le serveur (TenantMembershipGuard + RbacGuard) ; toute action
 * interdite renvoie 403 et est affichée comme telle.
 */
export function useTenantAccess(tenantId: string) {
  const { user } = useAuth();
  const { data: workspaces, isLoading } = useWorkspaces();
  const workspace = workspaces?.find((w) => w.tenantId === tenantId) ?? null;
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const roles = workspace?.roles ?? (isPlatformAdmin ? ['PLATFORM_ADMIN'] : []);
  const canManage = isPlatformAdmin || roles.includes('Owner');
  return { workspace, roles, canManage, isPlatformAdmin, isLoading };
}
