'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { FormError } from '@/components/ui/states';
import { useToast } from '@/components/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DEFAULT_PRIMARY, isHex } from '@/lib/color';
import { createTenantSchema, fieldErrors, type FieldErrors } from '@/lib/schemas';
import { slugify } from '@/lib/utils';

export function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [color, setColor] = useState(DEFAULT_PRIMARY);
  const [placementMode, setPlacementMode] = useState<'SHARED' | 'DEDICATED'>('SHARED');
  const [errors, setErrors] = useState<FieldErrors<{ name: string; slug: string; primaryColor: string }>>({});
  const [serverError, setServerError] = useState<{ message: string; details: string[] } | null>(null);

  const mutation = useMutation({
    mutationFn: api.createTenant,
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast('success', `Organisation « ${res.tenant.name} » créée.`);
      onClose();
      router.push(`/t/${res.tenant.id}`);
    },
    onError: (err) => {
      setServerError(
        err instanceof ApiError
          ? { message: err.message, details: err.details }
          : { message: 'Création impossible.', details: [] },
      );
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const parsed = fieldErrors(createTenantSchema, { name: name.trim(), slug, placementMode, primaryColor: color });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nouvelle organisation"
      description="Un espace isolé (tenant) avec ses membres, modules et quotas."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={serverError?.message} details={serverError?.details} />
        <Field label="Nom" error={errors.name}>
          {(p) => (
            <Input
              {...p}
              value={name}
              placeholder="Acme Corp"
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          )}
        </Field>
        <Field label="Identifiant (slug)" error={errors.slug} hint="Minuscules, chiffres et tirets. Doit être unique.">
          {(p) => (
            <Input
              {...p}
              value={slug}
              placeholder="acme-corp"
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          )}
        </Field>
        <Field label="Couleur principale" error={errors.primaryColor}>
          {(p) => (
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Choisir la couleur"
                value={isHex(color) && color.length === 7 ? color : DEFAULT_PRIMARY}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1"
              />
              <Input {...p} value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
            </div>
          )}
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Hébergement des données</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['SHARED', 'DEDICATED'] as const).map((mode) => {
              const disabled = mode === 'DEDICATED' && !user?.isPlatformAdmin;
              return (
                <label
                  key={mode}
                  className={`flex cursor-pointer flex-col rounded-lg border p-3 text-sm transition ${
                    placementMode === mode ? 'border-accent bg-accent-tint' : 'border-border hover:bg-surface-2'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name="placement"
                    className="sr-only"
                    checked={placementMode === mode}
                    disabled={disabled}
                    onChange={() => setPlacementMode(mode)}
                  />
                  <span className="font-medium">{mode === 'SHARED' ? 'Partagé' : 'Dédié'}</span>
                  <span className="mt-0.5 text-xs text-muted">
                    {mode === 'SHARED'
                      ? 'Isolation par Row-Level Security.'
                      : disabled
                        ? 'Réservé aux administrateurs plateforme.'
                        : 'Base de données physique dédiée.'}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Créer l'organisation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
