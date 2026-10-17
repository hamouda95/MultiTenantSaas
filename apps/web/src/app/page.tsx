'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LAST_TENANT_KEY, useAuth, useWorkspaces } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

/** Point d'entrée : route vers /login, la dernière organisation utilisée, ou la liste des organisations. */
export default function Home() {
  const router = useRouter();
  const { status } = useAuth();
  const { data: workspaces, isError } = useWorkspaces();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
      return;
    }
    if (status !== 'authenticated') return;
    if (!workspaces && !isError) return;
    const last = window.localStorage.getItem(LAST_TENANT_KEY);
    const target = workspaces?.find((w) => w.tenantId === last) ?? (workspaces?.length === 1 ? workspaces[0] : null);
    router.replace(target ? `/t/${target.tenantId}` : '/workspaces');
  }, [status, workspaces, isError, router]);

  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Chargement">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  );
}
