'use client';

import { useParams } from 'next/navigation';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import { useTenantAccess } from '@/lib/auth';
import { MODULE_CATALOG, moduleMeta } from '@/lib/modules';
import type { ApiModule } from '@/lib/types';

export default function ModulesPage() {
  const { tenantId: id } = useParams<{ tenantId: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canManage } = useTenantAccess(id);
  const key = ['modules', id];

  const modules = useQuery({ queryKey: key, queryFn: () => api.modules(id), retry: false });

  const toggle = useMutation({
    mutationFn: (v: { moduleKey: string; isEnabled: boolean; configuration: Record<string, unknown> }) =>
      api.toggleModule(id, v.moduleKey, v.isEnabled, v.configuration),
    // Mise à jour optimiste, annulée en cas d'échec.
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApiModule[]>(key);
      queryClient.setQueryData<ApiModule[]>(key, (old = []) =>
        old.some((m) => m.moduleKey === v.moduleKey)
          ? old.map((m) => (m.moduleKey === v.moduleKey ? { ...m, isEnabled: v.isEnabled } : m))
          : [
              ...old,
              {
                id: `tmp-${v.moduleKey}`,
                tenantId: id,
                moduleKey: v.moduleKey,
                isEnabled: v.isEnabled,
                configuration: v.configuration,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
      );
      return { previous };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast('error', err instanceof ApiError ? err.message : 'Modification impossible.');
    },
    onSuccess: (_res, v) => {
      toast('success', `${moduleMeta(v.moduleKey).label} ${v.isEnabled ? 'activé' : 'désactivé'}.`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['audit', id] });
    },
  });

  // Catalogue connu + modules inconnus renvoyés par l'API.
  const known = MODULE_CATALOG.map((m) => m.key);
  const extra = (modules.data ?? []).filter((m) => !known.includes(m.moduleKey)).map((m) => m.moduleKey);
  const keys = [...known, ...extra];

  return (
    <>
      <PageHeader
        title="Modules"
        description="Activez ou désactivez les fonctionnalités disponibles pour cette organisation."
      />

      {!canManage && !modules.error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">
          <Lock className="h-4 w-4" /> Lecture seule : la permission « modules:manage » est requise pour modifier.
        </div>
      )}

      {modules.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : modules.error ? (
        <Card>
          <ErrorState error={modules.error} onRetry={() => modules.refetch()} />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {keys.map((k) => {
            const meta = moduleMeta(k);
            const current = modules.data?.find((m) => m.moduleKey === k);
            const enabled = Boolean(current?.isEnabled);
            const pending = toggle.isPending && toggle.variables?.moduleKey === k;
            return (
              <li key={k}>
                <Card className="flex h-full items-start gap-4 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent">
                    <meta.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{meta.label}</h3>
                      <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Activé' : 'Désactivé'}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">{meta.description}</p>
                    <p className="mt-2 font-mono text-xs text-muted">{k}</p>
                  </div>
                  <Switch
                    label={`${enabled ? 'Désactiver' : 'Activer'} ${meta.label}`}
                    checked={enabled}
                    disabled={!canManage || pending}
                    onCheckedChange={(next) =>
                      toggle.mutate({ moduleKey: k, isEnabled: next, configuration: current?.configuration ?? {} })
                    }
                  />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
