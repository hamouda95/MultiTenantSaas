'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { FormError } from '@/components/ui/states';
import { ApiError } from '@/lib/api';
import { LAST_TENANT_KEY, useAuth } from '@/lib/auth';
import { fieldErrors, loginSchema, type FieldErrors } from '@/lib/schemas';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, login, register } = useAuth();
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<{ email: string; password: string }>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(params.get('invite') ? `/invite#${params.get('invite')}` : '/');
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const parsed = fieldErrors(loginSchema, { email: email.trim(), password: password || undefined });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const workspaces = creating
        ? await register(parsed.data.email, parsed.data.password, fullName, params.get('invite') || undefined)
        : await login(parsed.data.email, parsed.data.password);
      if (params.get('invite')) { router.replace(`/invite#${params.get('invite')}`); return; }
      const last = window.localStorage.getItem(LAST_TENANT_KEY);
      const target = workspaces.find((w) => w.tenantId === last) ?? (workspaces.length === 1 ? workspaces[0] : null);
      router.replace(target ? `/t/${target.tenantId}` : '/workspaces');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Connexion impossible.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {params.get('expired') && (
        <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          Votre session a expiré. Veuillez vous reconnecter.
        </div>
      )}
      <FormError message={serverError} />
      {creating && <Field label="Nom complet">{p => <Input {...p} value={fullName} minLength={2} maxLength={255} onChange={e => setFullName(e.target.value)} required />}</Field>}
      <Field label="Adresse e-mail" error={errors.email}>
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            placeholder="vous@entreprise.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        )}
      </Field>
      <Field label="Mot de passe" error={errors.password} hint="Au moins 12 caractères.">
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        {creating ? 'Créer mon compte' : 'Se connecter'}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setCreating(!creating)}>
        {creating ? 'Déjà un compte ? Connexion' : 'Créer un compte'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-fg shadow">
            <Layers className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
          <p className="mt-1 text-sm text-muted">Accédez à vos organisations.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
