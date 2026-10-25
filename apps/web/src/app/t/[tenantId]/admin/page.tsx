'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, KeyRound, Palette, Puzzle, ShieldCheck, UserRoundCog, Users } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/states';
import { api } from '@/lib/api';
import { useTenantAccess } from '@/lib/auth';

export default function AdminPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { canManage, isPlatformAdmin, roles } = useTenantAccess(tenantId);
  const members = useQuery({ queryKey: ['members', tenantId], queryFn: () => api.members(tenantId), retry: false });
  const modules = useQuery({ queryKey: ['modules', tenantId], queryFn: () => api.modules(tenantId), retry: false });
  const base = `/t/${tenantId}`;
  const links = [
    { href: '/members', title: 'Utilisateurs & invitations', detail: 'Comptes, invitations, rôles et retrait des accès.', icon: Users },
    { href: '/audit', title: 'Journal des activités', detail: 'Consulter les opérations et modifications enregistrées.', icon: ClipboardList },
    { href: '/modules', title: 'Modules ERP', detail: 'Configurer les fonctionnalités disponibles pour l’organisation.', icon: Puzzle },
    { href: '/settings', title: 'Paramètres & identité', detail: 'Personnaliser les couleurs, le logo et les préférences.', icon: Palette },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Administration du groupe" description="Un espace central pour gérer les utilisateurs, les accès et les paramètres de votre organisation." />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
        <ShieldCheck className="h-5 w-5 text-accent" aria-hidden />
        <span className="text-sm font-medium">{canManage || isPlatformAdmin ? 'Gestion autorisée' : 'Consultation uniquement'}</span>
        {roles.map(role => <Badge key={role}>{role}</Badge>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><div className="p-5"><Users className="mb-3 h-5 w-5 text-accent" /><p className="text-2xl font-semibold">{members.isLoading ? '…' : members.data?.length ?? '—'}</p><p className="text-sm text-muted">Utilisateurs de l’organisation</p></div></Card>
        <Card><div className="p-5"><KeyRound className="mb-3 h-5 w-5 text-accent" /><p className="text-2xl font-semibold">{members.isLoading ? '…' : new Set(members.data?.flatMap(m => m.roles) ?? []).size}</p><p className="text-sm text-muted">Rôles actuellement attribués</p></div></Card>
        <Card><div className="p-5"><Building2 className="mb-3 h-5 w-5 text-accent" /><p className="text-2xl font-semibold">{modules.isLoading ? '…' : modules.data?.length ?? '—'}</p><p className="text-sm text-muted">Modules configurés</p></div></Card>
      </div>
      {members.error && <ErrorState error={members.error} onRetry={() => members.refetch()} />}
      <h2 className="text-lg font-semibold">Gestion de l’organisation</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {links.map(({ href, title, detail, icon: Icon }) => (
          <Link key={href} href={`${base}${href}`} className="group rounded-xl border border-border bg-surface p-5 transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Icon className="mb-3 h-6 w-6 text-accent" aria-hidden />
            <h3 className="font-semibold group-hover:text-accent">{title}</h3>
            <p className="mt-1 text-sm text-muted">{detail}</p>
          </Link>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted">
        <div className="flex items-center gap-2 font-medium text-fg"><UserRoundCog className="h-4 w-4" /> Sécurité des accès</div>
        <p className="mt-2">Les modifications de membres et de rôles utilisent les autorisations existantes du serveur. Les droits détaillés par département, société et magasin nécessitent une extension des règles métier côté API avant leur activation.</p>
      </div>
      {isPlatformAdmin && <Link href="/administration" className="inline-flex text-sm font-medium text-accent underline underline-offset-4">Administration de la plateforme</Link>}
    </div>
  );
}
