"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/states";
const labels: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspendue",
  ARCHIVED: "Archivée",
  DELETED: "Corbeille",
};
export default function Administration() {
  const ready = useRequireAuth(),
    client = useQueryClient();
  const q = useQuery({
    queryKey: ["administration"],
    queryFn: api.administration,
    enabled: ready,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function change(id: string, version: number, d: FormData) {
    setBusy(true);
    setError("");
    try {
      await api.holdingLifecycle(id, {
        version,
        mode: d.get("mode"),
        confirmation: d.get("confirmation"),
        reason: d.get("reason"),
      });
      await client.invalidateQueries({ queryKey: ["administration"] });
      await client.invalidateQueries({ queryKey: ["workspaces"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    setBusy(true);
    setError("");
    try {
      const data = await api.exportHolding(id);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `holding-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export impossible");
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return null;
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <Link href="/workspaces" className="text-accent">
        ← Mes organisations
      </Link>
      <h1 className="text-2xl font-semibold">Administration des holdings</h1>
      <p className="text-sm text-muted">
        {q.data?.platformAdmin
          ? "Console éditeur : tous les clients."
          : "Vos holdings en tant que propriétaire, y compris les holdings bloquées."}{" "}
        Une suppression reste restaurable ; aucune purge définitive n’est
        déclenchée.
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading && <p>Chargement…</p>}
      {q.data?.holdings.length === 0 && (
        <p>
          Aucune holding administrable. Seuls les propriétaires et
          administrateurs plateforme accèdent à cette console.
        </p>
      )}
      {q.data?.holdings.map((h) => (
        <Card key={h.id} className="space-y-4 p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{h.name}</h2>
              <p className="text-sm text-muted">
                {labels[h.mode]} · {h.slug}
              </p>
              {h.reason && <p className="text-sm">Motif : {h.reason}</p>}
            </div>
            <div className="flex gap-2">
              {h.mode === "ACTIVE" && (
                <Link href={`/t/${h.id}`}>
                  <Button variant="secondary">Ouvrir</Button>
                </Link>
              )}
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => download(h.id)}
              >
                Exporter toutes les données métier
              </Button>
            </div>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void change(h.id, h.version, new FormData(e.currentTarget));
            }}
          >
            <Field label="Nouvel état">
              {(props) => (
                <select
                  {...props}
                  name="mode"
                  defaultValue={h.mode}
                  className="h-10 rounded-lg border border-border bg-surface px-3"
                >
                  {Object.entries(labels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={`Confirmer le nom : ${h.name}`}>
              {(props) => <Input {...props} name="confirmation" required />}
            </Field>
            <Field label="Motif du changement">
              {(props) => (
                <Input
                  {...props}
                  name="reason"
                  minLength={3}
                  maxLength={500}
                  required
                />
              )}
            </Field>
            <div className="flex items-end">
              <Button disabled={busy} type="submit">
                Confirmer l’état du holding
              </Button>
            </div>
          </form>
        </Card>
      ))}
      <p className="text-xs text-muted">
        Les exports incluent les sociétés archivées/supprimées, données métier,
        configurations, membres et historique d’audit. Aucun mot de passe, jeton
        ou session d’authentification n’est exporté. Il s’agit d’un export
        métier, pas d’une sauvegarde PostgreSQL restaurable automatiquement.
      </p>
    </main>
  );
}
