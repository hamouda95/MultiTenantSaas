'use client';

import { useParams } from 'next/navigation';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Coins, HardDrive, Sparkles, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { api } from '@/lib/api';
import { moduleMeta } from '@/lib/modules';
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatNumber,
  percent,
  relativeTime,
} from '@/lib/utils';

function Stat({
  icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value ?? '—'}</p>
      )}
      {sub && !loading && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const { tenantId: id } = useParams<{ tenantId: string }>();
  const tenant = useQuery({ queryKey: ['tenant', id], queryFn: () => api.tenant(id) });
  const quota = useQuery({ queryKey: ['quotas', id], queryFn: () => api.quotas(id), retry: false });
  const members = useQuery({ queryKey: ['members', id], queryFn: () => api.members(id), retry: false });
  const modules = useQuery({ queryKey: ['modules', id], queryFn: () => api.modules(id), retry: false });
  const audit = useQuery({ queryKey: ['audit', id, 5], queryFn: () => api.auditLogs(id, 5), retry: false });

  const tokenPct = quota.data ? percent(quota.data.currentAiTokensUsed, quota.data.monthlyAiTokenBudget) : 0;
  const costPct = quota.data ? percent(quota.data.currentAiCostUsed, quota.data.monthlyAiCostBudget) : 0;
  const memberPct = quota.data && members.data ? percent(members.data.length, quota.data.maxMembers) : 0;
  const enabled = modules.data?.filter((m) => m.isEnabled) ?? [];

  return (
    <>
      <PageHeader title="Vue d'ensemble" description="Activité, consommation et modules de votre organisation." />

      {/* Bandeau de marque */}
      <section className="mb-6 overflow-hidden rounded-2xl bg-brand p-6 text-brand-fg shadow-sm sm:p-8">
        {tenant.isLoading ? (
          <Skeleton className="h-16 w-64 bg-white/20" />
        ) : tenant.error ? (
          <p className="text-sm opacity-90">Impossible de charger l'organisation.</p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm opacity-70">Organisation</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">{tenant.data?.name}</h2>
              <p className="mt-1 font-mono text-sm opacity-70">{tenant.data?.slug}</p>
            </div>
            <div className="text-right text-sm opacity-90">
              <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">
                {tenant.data?.status === 'ACTIVE' ? 'Active' : tenant.data?.status}
              </span>
              {tenant.data && <p className="mt-2 opacity-70">Créée le {formatDate(tenant.data.createdAt)}</p>}
            </div>
          </div>
        )}
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Membres"
          loading={members.isLoading}
          value={members.data ? formatNumber(members.data.length) : members.error ? 'Restreint' : undefined}
          sub={quota.data ? `sur ${formatNumber(quota.data.maxMembers)} autorisés` : undefined}
        />
        <Stat
          icon={<Sparkles className="h-4 w-4" />}
          label="Tokens IA (mois)"
          loading={quota.isLoading}
          value={quota.data ? formatNumber(quota.data.currentAiTokensUsed) : quota.error ? 'Restreint' : undefined}
          sub={quota.data ? `sur ${formatNumber(quota.data.monthlyAiTokenBudget)}` : undefined}
        />
        <Stat
          icon={<Coins className="h-4 w-4" />}
          label="Coût IA (mois)"
          loading={quota.isLoading}
          value={quota.data ? formatCurrency(quota.data.currentAiCostUsed) : quota.error ? 'Restreint' : undefined}
          sub={quota.data ? `budget ${formatCurrency(quota.data.monthlyAiCostBudget)}` : undefined}
        />
        <Stat
          icon={<HardDrive className="h-4 w-4" />}
          label="Stockage max"
          loading={quota.isLoading}
          value={quota.data ? formatBytes(quota.data.maxStorageBytes) : quota.error ? 'Restreint' : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Quotas & consommation</CardTitle>
            <CardDescription>
              {quota.data ? `Réinitialisation le ${formatDate(quota.data.resetCycleDate)}` : 'Cycle mensuel'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quota.isLoading ? (
              <div className="space-y-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : quota.error ? (
              <ErrorState error={quota.error} onRetry={() => quota.refetch()} />
            ) : quota.data ? (
              <div className="space-y-5">
                {[
                  {
                    label: 'Tokens IA',
                    detail: `${formatNumber(quota.data.currentAiTokensUsed)} / ${formatNumber(quota.data.monthlyAiTokenBudget)}`,
                    pct: tokenPct,
                  },
                  {
                    label: 'Budget IA',
                    detail: `${formatCurrency(quota.data.currentAiCostUsed)} / ${formatCurrency(quota.data.monthlyAiCostBudget)}`,
                    pct: costPct,
                  },
                  ...(members.data
                    ? [
                        {
                          label: 'Sièges utilisateurs',
                          detail: `${members.data.length} / ${quota.data.maxMembers}`,
                          pct: memberPct,
                        },
                      ]
                    : []),
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-muted">
                        {row.detail} · {Math.round(row.pct)} %
                      </span>
                    </div>
                    <Progress value={row.pct} label={row.label} />
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Modules actifs</CardTitle>
              <CardDescription>{modules.data ? `${enabled.length} activé(s)` : ' '}</CardDescription>
            </div>
            <Link href={`/t/${id}/modules`} className="text-sm text-accent hover:underline">
              Gérer
            </Link>
          </CardHeader>
          <CardContent>
            {modules.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : modules.error ? (
              <ErrorState error={modules.error} onRetry={() => modules.refetch()} />
            ) : enabled.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Aucun module activé.</p>
            ) : (
              <ul className="space-y-2">
                {enabled.map((m) => {
                  const meta = moduleMeta(m.moduleKey);
                  return (
                    <li key={m.id} className="flex items-center gap-3 text-sm">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-tint text-accent">
                        <meta.icon className="h-4 w-4" />
                      </span>
                      {meta.label}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Activité récente</CardTitle>
            <CardDescription>Les 5 derniers évènements d'audit.</CardDescription>
          </div>
          <Link href={`/t/${id}/audit`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Tout voir <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {audit.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : audit.error ? (
            <ErrorState error={audit.error} onRetry={() => audit.refetch()} />
          ) : audit.data && audit.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {audit.data.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-mono text-xs">{log.action}</span>
                    <span className="ml-2 text-muted">
                      {log.resourceType} · {log.resourceId}
                    </span>
                  </div>
                  <time className="shrink-0 text-xs text-muted" dateTime={log.createdAt} title={log.createdAt}>
                    {relativeTime(log.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucune activité" description="Les actions sensibles apparaîtront ici." />
          )}
        </CardContent>
      </Card>
    </>
  );
}
