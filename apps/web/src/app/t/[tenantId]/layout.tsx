'use client';

import { useParams } from 'next/navigation';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2, SearchX } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { TenantThemeProvider } from '@/components/tenant-theme';
import { EmptyState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { LAST_TENANT_KEY, useRequireAuth, useTenantAccess, useWorkspaces } from '@/lib/auth';

export default function TenantLayout({ children }: { children: ReactNode }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const ready = useRequireAuth();
  const { isLoading } = useWorkspaces();
  const { workspace, isPlatformAdmin } = useTenantAccess(tenantId);

  useEffect(() => {
    if (workspace) window.localStorage.setItem(LAST_TENANT_KEY, tenantId);
  }, [workspace, tenantId]);

  if (!ready || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Chargement">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  // Les admins plateforme peuvent ouvrir n'importe quel tenant ; les autres doivent en être membres.
  if (!workspace && !isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <EmptyState
          icon={<SearchX className="h-6 w-6" />}
          title="Organisation introuvable"
          description="Cette organisation n'existe pas ou vous n'en êtes pas membre actif."
          action={
            <Link href="/workspaces">
              <Button variant="secondary">Voir mes organisations</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <TenantThemeProvider tenantId={tenantId}>
      <AppShell tenantId={tenantId}>{children}</AppShell>
    </TenantThemeProvider>
  );
}
