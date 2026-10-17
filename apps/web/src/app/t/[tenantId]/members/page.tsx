'use client';

import { useParams } from 'next/navigation';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, FormError } from '@/components/ui/states';
import { api, ApiError } from '@/lib/api';
import { useTenantAccess } from '@/lib/auth';
import { addMemberSchema, fieldErrors } from '@/lib/schemas';
import type { Member } from '@/lib/types';
import { formatDate, initials } from '@/lib/utils';

const ROLE_OPTIONS = [
  { value: 'Member', label: 'Membre', hint: 'Accès standard.' },
  { value: 'Viewer', label: 'Lecteur', hint: 'Consultation uniquement.' },
  { value: 'Owner', label: 'Propriétaire', hint: 'Contrôle total de l’organisation.' },
];

function statusTone(status: string) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'INVITED') return 'accent' as const;
  return 'warning' as const;
}

function InviteDialog({
  tenantId,
  existing,
  open,
  onClose,
}: {
  tenantId: string;
  existing: Member[];
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [inviteLink, setInviteLink] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Member');
  const [emailError, setEmailError] = useState<string>();
  const [serverError, setServerError] = useState<{ message: string; details: string[] } | null>(null);

  const mutation = useMutation({
    mutationFn: (body: { email: string; role: string }) => api.addMember(tenantId, body),
    onSuccess: async (res, vars) => {
      await queryClient.invalidateQueries({ queryKey: ['members', tenantId] });
      await queryClient.invalidateQueries({ queryKey: ['audit', tenantId] });
      setInviteLink(`${window.location.origin}/invite#${res.invitationToken}`);
      toast('success', `Invitation créée pour ${vars.email}.`);
      setEmail('');
      setRole('Member');
    },
    onError: (err) =>
      setServerError(
        err instanceof ApiError
          ? { message: err.message, details: err.details }
          : { message: "Ajout impossible.", details: [] },
      ),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const parsed = fieldErrors(addMemberSchema, { email: email.trim(), role });
    if (!parsed.ok) {
      setEmailError(parsed.errors.email);
      return;
    }
    if (existing.some((m) => m.email.toLowerCase() === parsed.data.email.toLowerCase())) {
      setEmailError('Cette personne est déjà membre de l’organisation.');
      return;
    }
    setEmailError(undefined);
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onClose={() => { setInviteLink(''); onClose(); }} title="Ajouter un membre" description="Envoyez le lien à la personne invitée. Il expire dans 7 jours.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {inviteLink && <div className="space-y-2 rounded-lg bg-surface-2 p-3"><p className="text-sm">Lien d’invitation (à transmettre en privé)</p><Input readOnly value={inviteLink} onFocus={e => e.target.select()} /><Button type="button" onClick={() => navigator.clipboard.writeText(inviteLink)}>Copier</Button></div>}
        <FormError message={serverError?.message} details={serverError?.details} />
        <Field label="Adresse e-mail" error={emailError}>
          {(p) => (
            <Input
              {...p}
              type="email"
              placeholder="collegue@entreprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Rôle</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ROLE_OPTIONS.map((r) => (
              <label
                key={r.value}
                className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
                  role === r.value ? 'border-accent bg-accent-tint' : 'border-border hover:bg-surface-2'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  className="sr-only"
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                />
                <span className="block font-medium">{r.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{r.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { setInviteLink(''); onClose(); }}>
            Annuler
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Ajouter
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function MembersPage() {
  const { tenantId: id } = useParams<{ tenantId: string }>();
  const { canManage } = useTenantAccess(id);
  const toast = useToast();
  const client = useQueryClient();
  const update = useMutation({ mutationFn: ({ member, role }: { member: Member; role?: string }) => role ? api.updateMember(id, member.id, role) : api.removeMember(id, member.id),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['members', id] }); await client.invalidateQueries({ queryKey: ['workspaces'] }); await client.invalidateQueries({ queryKey: ['audit', id] }); },
    onError: e => toast('error', e instanceof Error ? e.message : 'Modification impossible') });
  const [search, setSearch] = useState('');
  const [inviting, setInviting] = useState(false);

  const members = useQuery({ queryKey: ['members', id], queryFn: () => api.members(id), retry: false });
  const quota = useQuery({ queryKey: ['quotas', id], queryFn: () => api.quotas(id), retry: false });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members.data ?? [];
    return (members.data ?? []).filter(
      (m) => m.email.toLowerCase().includes(q) || m.fullName.toLowerCase().includes(q) || m.roles.some((r) => r.toLowerCase().includes(q)),
    );
  }, [members.data, search]);

  const seatsFull = quota.data && members.data ? members.data.length >= quota.data.maxMembers : false;

  return (
    <>
      <PageHeader
        title="Membres"
        description={
          members.data && quota.data
            ? `${members.data.length} sur ${quota.data.maxMembers} sièges utilisés.`
            : 'Gérez les personnes ayant accès à cette organisation.'
        }
        actions={
          canManage && (
            <Button onClick={() => setInviting(true)} disabled={seatsFull} title={seatsFull ? 'Limite de sièges atteinte' : undefined}>
              <UserPlus className="h-4 w-4" /> Ajouter un membre
            </Button>
          )
        }
      />

      <Card>
        {members.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : members.error ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : (
          <>
            <div className="border-b border-border p-4">
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-9"
                  placeholder="Rechercher un nom, un e-mail, un rôle…"
                  aria-label="Rechercher un membre"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={search ? 'Aucun résultat' : 'Aucun membre'}
                description={search ? `Aucun membre ne correspond à « ${search} ».` : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="px-5 py-3 font-medium">Membre</th>
                      <th scope="col" className="px-5 py-3 font-medium">Rôles</th>
                      <th scope="col" className="px-5 py-3 font-medium">Statut</th>
                      <th scope="col" className="hidden px-5 py-3 font-medium sm:table-cell">Depuis le</th>{canManage && <th className="px-5 py-3">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((m) => (
                      <tr key={m.id} className="hover:bg-surface-2/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">
                              {initials(m.fullName || m.email)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{m.fullName}</p>
                              <p className="truncate text-xs text-muted">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {m.roles.length ? m.roles.map((r) => <Badge key={r} tone={r === 'Owner' ? 'accent' : 'neutral'}>{r}</Badge>) : <span className="text-muted">—</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                        </td>
                        <td className="hidden px-5 py-3 text-muted sm:table-cell">{formatDate(m.createdAt)}</td>
                        {canManage && <td className="px-5 py-3"><div className="flex gap-2"><select aria-label={`Rôle de ${m.email}`} className="rounded border border-border bg-surface p-2" value={m.roles[0] || 'Viewer'} disabled={update.isPending} onChange={e => update.mutate({ member: m, role: e.target.value })}>{ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select><Button variant="ghost" disabled={update.isPending} onClick={() => { if (window.confirm(`Retirer ${m.email} ?`)) update.mutate({ member: m }); }}>Retirer</Button></div></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      <InviteDialog tenantId={id} existing={members.data ?? []} open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}
