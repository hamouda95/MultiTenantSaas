'use client';

import { useParams } from 'next/navigation';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { useTenantSettings } from '@/components/tenant-theme';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, FormError } from '@/components/ui/states';
import { api, ApiError } from '@/lib/api';
import { useTenantAccess } from '@/lib/auth';
import { brandVars, isHex, normalizeHex } from '@/lib/color';
import { fieldErrors, settingsSchema, type FieldErrors } from '@/lib/schemas';
import type { ThemeMode } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Draft {
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  themeMode: ThemeMode;
  customDomain: string;
}

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'LIGHT', label: 'Clair', icon: Sun },
  { value: 'DARK', label: 'Sombre', icon: Moon },
  { value: 'SYSTEM', label: 'Système', icon: Monitor },
];

function ColorField({
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} error={error}>
      {(p) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} (sélecteur)`}
            disabled={disabled}
            value={normalizeHex(value) ?? '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1 disabled:cursor-not-allowed"
          />
          <Input {...p} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
        </div>
      )}
    </Field>
  );
}

function Preview({ draft, name }: { draft: Draft; name: string }) {
  const p = isHex(draft.primaryColor) ? draft.primaryColor : '#0f172a';
  const a = isHex(draft.accentColor) ? draft.accentColor : '#2563eb';
  const modeClass = draft.themeMode === 'DARK' ? 'dark' : draft.themeMode === 'LIGHT' ? 'light' : '';
  return (
    <div
      style={brandVars(p, a) as React.CSSProperties}
      className={cn(modeClass, 'overflow-hidden rounded-xl border border-border bg-bg text-fg')}
      aria-label="Aperçu du thème"
    >
      <div className="flex">
        <div className="w-32 shrink-0 space-y-3 border-r border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            {draft.logoUrl && /^https?:\/\//.test(draft.logoUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.logoUrl} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded bg-white object-contain p-0.5" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-[10px] font-bold text-brand-fg">
                {name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="truncate text-xs font-semibold">{name}</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="rounded-md bg-accent-tint px-2 py-1.5 font-medium text-accent">Vue d'ensemble</div>
            <div className="px-2 py-1.5 text-muted">Membres</div>
            <div className="px-2 py-1.5 text-muted">Modules</div>
          </div>
        </div>
        <div className="flex-1 space-y-3 p-4">
          <div className="rounded-lg bg-brand p-4 text-brand-fg">
            <p className="text-xs opacity-70">Organisation</p>
            <p className="text-lg font-semibold">{name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-brand-accent-fg">Action principale</span>
            <span className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium">Secondaire</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-2/3 rounded-full bg-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { tenantId: id } = useParams<{ tenantId: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canManage, workspace } = useTenantAccess(id);
  const settings = useTenantSettings(id);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FieldErrors<Draft>>({});
  const [serverError, setServerError] = useState<{ message: string; details: string[] } | null>(null);

  const saved: Draft | null = settings.data
    ? {
        logoUrl: settings.data.settings.logoUrl ?? '',
        primaryColor: settings.data.settings.primaryColor,
        accentColor: settings.data.settings.accentColor,
        themeMode: settings.data.settings.themeMode,
        customDomain: settings.data.settings.customDomain ?? '',
      }
    : null;

  // Initialise le brouillon à la première réponse de l'API.
  useEffect(() => {
    if (saved && !draft) setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof api.updateSettings>[1]) => api.updateSettings(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', id] });
      queryClient.invalidateQueries({ queryKey: ['audit', id] });
      toast('success', 'Apparence mise à jour.');
      setDraft(null); // se ré-synchronise depuis la réponse serveur
    },
    onError: (err) =>
      setServerError(
        err instanceof ApiError
          ? { message: err.message, details: err.details }
          : { message: 'Enregistrement impossible.', details: [] },
      ),
  });

  if (settings.isLoading) {
    return (
      <>
        <PageHeader title="Apparence" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </>
    );
  }
  if (settings.error || !draft || !saved) {
    return (
      <>
        <PageHeader title="Apparence" />
        <Card>
          <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
        </Card>
      </>
    );
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const dirty = (Object.keys(saved) as (keyof Draft)[]).some((k) => saved[k] !== draft[k]);
  const readOnly = !canManage;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !saved) return;
    setServerError(null);
    const parsed = fieldErrors(settingsSchema, draft);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    const body: Parameters<typeof api.updateSettings>[1] = {};
    if (draft.logoUrl !== saved.logoUrl) body.logoUrl = draft.logoUrl.trim() || null;
    if (draft.primaryColor !== saved.primaryColor) body.primaryColor = draft.primaryColor;
    if (draft.accentColor !== saved.accentColor) body.accentColor = draft.accentColor;
    if (draft.themeMode !== saved.themeMode) body.themeMode = draft.themeMode;
    if (draft.customDomain !== saved.customDomain) body.customDomain = draft.customDomain.trim() || null;
    mutation.mutate(body);
  }

  return (
    <>
      <PageHeader title="Apparence" description="Identité visuelle appliquée à toute l'interface de cette organisation." />

      {readOnly && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">
          <Lock className="h-4 w-4" /> Lecture seule : la permission « settings:manage » est requise pour modifier.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={onSubmit} noValidate className="space-y-6 lg:col-span-3">
          <FormError message={serverError?.message} details={serverError?.details} />

          <Card>
            <CardHeader>
              <CardTitle>Couleurs</CardTitle>
              <CardDescription>
                La couleur principale porte l'identité (bandeaux, logo). L'accent colore les actions et la navigation.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Couleur principale" value={draft.primaryColor} error={errors.primaryColor} disabled={readOnly} onChange={(v) => set('primaryColor', v)} />
              <ColorField label="Couleur d'accent" value={draft.accentColor} error={errors.accentColor} disabled={readOnly} onChange={(v) => set('accentColor', v)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mode d'affichage</CardTitle>
            </CardHeader>
            <CardContent>
              <div role="radiogroup" aria-label="Mode d'affichage" className="grid grid-cols-3 gap-2">
                {MODES.map(({ value, label, icon: Icon }) => (
                  <label
                    key={value}
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition',
                      draft.themeMode === value ? 'border-accent bg-accent-tint text-accent' : 'border-border hover:bg-surface-2',
                      readOnly && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input type="radio" name="mode" className="sr-only" disabled={readOnly} checked={draft.themeMode === value} onChange={() => set('themeMode', value)} />
                    <Icon className="h-5 w-5" />
                    {label}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Marque</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="URL du logo" error={errors.logoUrl} hint="Image hébergée (https://…). Laissez vide pour utiliser les initiales.">
                {(p) => <Input {...p} disabled={readOnly} placeholder="https://exemple.com/logo.png" value={draft.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} />}
              </Field>
              <Field label="Domaine personnalisé" error={errors.customDomain} hint="Sans protocole, par exemple app.exemple.com.">
                {(p) => <Input {...p} disabled={readOnly} placeholder="app.exemple.com" value={draft.customDomain} onChange={(e) => set('customDomain', e.target.value)} />}
              </Field>
            </CardContent>
          </Card>

          {!readOnly && (
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={!dirty || mutation.isPending}
                onClick={() => {
                  setDraft(saved);
                  setErrors({});
                  setServerError(null);
                }}
              >
                <RotateCcw className="h-4 w-4" /> Annuler les changements
              </Button>
              <Button type="submit" disabled={!dirty} loading={mutation.isPending}>
                Enregistrer
              </Button>
            </div>
          )}
        </form>

        <div className="lg:col-span-2">
          <div className="sticky top-20 space-y-3">
            <h2 className="text-sm font-semibold">Aperçu en direct</h2>
            <Preview draft={draft} name={workspace?.name ?? 'Organisation'} />
            <p className="text-xs text-muted">L'aperçu reflète vos modifications avant enregistrement.</p>
          </div>
        </div>
      </div>
    </>
  );
}
