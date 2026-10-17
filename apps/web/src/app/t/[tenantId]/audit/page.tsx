'use client';

import { useParams } from 'next/navigation';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, RefreshCw, ScrollText, Search } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { api } from '@/lib/api';
import { cn, formatDateTime, relativeTime } from '@/lib/utils';

const LIMITS = [25, 50, 100];

function actionTone(action: string) {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('remove') || a.includes('revoke')) return 'danger' as const;
  if (a.includes('create') || a.includes('add')) return 'success' as const;
  if (a.includes('update') || a.includes('toggle')) return 'accent' as const;
  return 'neutral' as const;
}

export default function AuditPage() {
  const { tenantId: id } = useParams<{ tenantId: string }>();
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const logs = useQuery({ queryKey: ['audit', id, limit], queryFn: () => api.auditLogs(id, limit), retry: false });

  const resourceTypes = useMemo(
    () => Array.from(new Set((logs.data ?? []).map((l) => l.resourceType))).sort(),
    [logs.data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (logs.data ?? []).filter(
      (l) =>
        (!resourceType || l.resourceType === resourceType) &&
        (!q ||
          l.action.toLowerCase().includes(q) ||
          l.resourceId.toLowerCase().includes(q) ||
          (l.actorId ?? '').toLowerCase().includes(q)),
    );
  }, [logs.data, search, resourceType]);

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        description="Historique immuable des actions sensibles, strictement limité à cette organisation."
        actions={
          <Button variant="secondary" onClick={() => logs.refetch()} loading={logs.isFetching && !logs.isLoading}>
            {!logs.isFetching && <RefreshCw className="h-4 w-4" />} Actualiser
          </Button>
        }
      />

      <Card>
        {logs.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : logs.error ? (
          <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
              <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input className="pl-9" placeholder="Action, ressource, acteur…" aria-label="Filtrer le journal" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select
                aria-label="Type de ressource"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              >
                <option value="">Toutes les ressources</option>
                {resourceTypes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                aria-label="Nombre d'entrées"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              >
                {LIMITS.map((l) => (
                  <option key={l} value={l}>
                    {l} dernières
                  </option>
                ))}
              </select>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="h-6 w-6" />}
                title={logs.data?.length ? 'Aucun résultat' : "Aucun évènement d'audit"}
                description={logs.data?.length ? 'Ajustez vos filtres.' : 'Les actions sensibles apparaîtront ici.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="w-8 px-3 py-3" />
                      <th scope="col" className="px-3 py-3 font-medium">Action</th>
                      <th scope="col" className="px-3 py-3 font-medium">Ressource</th>
                      <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Acteur</th>
                      <th scope="col" className="px-3 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => {
                      const open = expanded === l.id;
                      return (
                        <Fragment key={l.id}>
                          <tr className="cursor-pointer border-b border-border hover:bg-surface-2/60" onClick={() => setExpanded(open ? null : l.id)}>
                            <td className="px-3 py-3">
                              <button
                                aria-expanded={open}
                                aria-label={open ? 'Masquer les détails' : 'Afficher les détails'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpanded(open ? null : l.id);
                                }}
                                className="text-muted"
                              >
                                <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
                              </button>
                            </td>
                            <td className="px-3 py-3">
                              <Badge tone={actionTone(l.action)} className="font-mono">
                                {l.action}
                              </Badge>
                            </td>
                            <td className="px-3 py-3">
                              <span className="text-muted">{l.resourceType}</span>{' '}
                              <span className="font-mono text-xs">{l.resourceId}</span>
                            </td>
                            <td className="hidden px-3 py-3 font-mono text-xs text-muted md:table-cell">{l.actorId ?? 'système'}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-muted" title={formatDateTime(l.createdAt)}>
                              <time dateTime={l.createdAt}>{relativeTime(l.createdAt)}</time>
                            </td>
                          </tr>
                          {open && (
                            <tr className="border-b border-border bg-surface-2/40">
                              <td />
                              <td colSpan={4} className="px-3 py-4">
                                <dl className="mb-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                                  <div>
                                    <dt className="text-muted">Date exacte</dt>
                                    <dd>{formatDateTime(l.createdAt)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-muted">Adresse IP</dt>
                                    <dd className="font-mono">{l.ipAddress ?? '—'}</dd>
                                  </div>
                                  <div className="min-w-0">
                                    <dt className="text-muted">Agent utilisateur</dt>
                                    <dd className="truncate" title={l.userAgent ?? undefined}>{l.userAgent ?? '—'}</dd>
                                  </div>
                                </dl>
                                <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs">
                                  {JSON.stringify(l.payload, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
