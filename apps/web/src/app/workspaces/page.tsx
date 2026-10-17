'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, LogOut, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { CreateWorkspaceDialog } from '@/components/create-workspace-dialog';
import { LAST_TENANT_KEY, useAuth, useRequireAuth, useWorkspaces } from '@/lib/auth';
import { initials } from '@/lib/utils';

export default function WorkspacesPage() {
  const ready = useRequireAuth();
  const { user, logout } = useAuth();
  const { data: workspaces, isLoading, error, refetch } = useWorkspaces();
  const [creating, setCreating] = useState(false);

  if (!ready) return null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vos organisations</h1>
          <p className="mt-1 text-sm text-muted">
            Connecté en tant que <span className="font-medium text-fg">{user?.email}</span>
            {user?.isPlatformAdmin && (
              <Badge tone="accent" className="ml-2">
                Admin plateforme
              </Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={logout}>
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Déconnexion</span>
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nouvelle
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Card>
      ) : workspaces && workspaces.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="Aucune organisation"
            description="Créez votre première organisation pour commencer, ou demandez à un propriétaire de vous inviter."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Créer une organisation
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {workspaces?.map((w) => (
            <li key={w.tenantId}>
              <Link
                href={`/t/${w.tenantId}`}
                onClick={() => window.localStorage.setItem(LAST_TENANT_KEY, w.tenantId)}
                className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-accent"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold">
                  {initials(w.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{w.name}</p>
                  <p className="truncate font-mono text-xs text-muted">{w.slug}</p>
                </div>
                <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                  {w.roles.map((r) => (
                    <Badge key={r}>{r}</Badge>
                  ))}
                  {w.tenantStatus !== 'ACTIVE' && <Badge tone="warning">{w.tenantStatus}</Badge>}
                </div>
                <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </main>
  );
}
