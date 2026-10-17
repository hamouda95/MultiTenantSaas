'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
export default function InvitePage() {
  const { status } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setToken(window.location.hash.slice(1)); }, []);
  async function accept() {
    setBusy(true); setError('');
    try { const result = await api.acceptInvitation(token); window.location.assign(`/t/${result.tenantId}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Invitation invalide'); setBusy(false); }
  }
  return <main className="mx-auto max-w-md p-6"><Card className="space-y-4 p-6">
    <h1 className="text-xl font-semibold">Invitation à un espace de travail</h1>
    <p className="text-sm text-muted">Connectez-vous avec l’adresse e-mail invitée pour accepter.</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {status === 'anonymous' ? <Button onClick={() => router.push(`/login?invite=${encodeURIComponent(token)}`)}>Connexion / Créer un compte</Button>
      : <Button disabled={!token || status === 'loading'} loading={busy} onClick={accept}>Accepter l’invitation</Button>}
  </Card></main>;
}
