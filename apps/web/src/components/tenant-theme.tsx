'use client';

import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { brandVars, DEFAULT_ACCENT, DEFAULT_PRIMARY } from '@/lib/color';
import type { ThemeMode } from '@/lib/types';

export const THEME_MODE_KEY = 'saas.themeMode';

export function useTenantSettings(tenantId: string) {
  return useQuery({
    queryKey: ['settings', tenantId],
    queryFn: () => api.settings(tenantId),
    retry: false, // un 403 (pas de settings:read) retombe simplement sur la marque par défaut
  });
}

function applyMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', mode === 'DARK' || (mode === 'SYSTEM' && prefersDark));
}

/**
 * Applique le branding du tenant (couleurs → CSS variables) et son mode de thème.
 * Le contraste du texte sur la couleur de marque est calculé automatiquement (WCAG).
 */
export function TenantThemeProvider({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const { data } = useTenantSettings(tenantId);
  const primary = data?.settings.primaryColor ?? DEFAULT_PRIMARY;
  const accent = data?.settings.accentColor ?? DEFAULT_ACCENT;
  const mode: ThemeMode = data?.settings.themeMode ?? 'SYSTEM';

  useEffect(() => {
    applyMode(mode);
    try {
      window.localStorage.setItem(THEME_MODE_KEY, mode);
    } catch {
      /* noop */
    }
    if (mode !== 'SYSTEM') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyMode('SYSTEM');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  return (
    <div style={brandVars(primary, accent) as React.CSSProperties} className="min-h-screen">
      {children}
    </div>
  );
}
