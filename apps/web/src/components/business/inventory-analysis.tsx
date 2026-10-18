"use client";
import { useState } from "react";
import { modelInventory } from "@saas/types";
import type { BusinessState } from "@saas/types";
import { Card } from "@/components/ui/card";
const palette = [
  "#2563eb",
  "#14b8a6",
  "#f59e0b",
  "#a855f7",
  "#f43f5e",
  "#64748b",
  "#84cc16",
];
export function InventoryAnalysis({
  state,
  companyId,
  updatedAt,
  refreshing,
  offline,
}: {
  state: BusinessState;
  companyId: string;
  updatedAt: number;
  refreshing: boolean;
  offline: boolean;
}) {
  const [chosen, choose] = useState(""),
    [location, setLocation] = useState("");
  const models = [
    ...new Set(
      state.products
        .filter((p) => p.companyId === companyId)
        .map((p) => p.model || p.name),
    ),
  ].sort();
  const model = models.includes(chosen) ? chosen : models[0] || "";
  const rows = modelInventory(state, companyId, model, location);
  const total = rows.reduce((n, r) => n + r.stock, 0);
  let offset = 0;
  const gradient = rows
    .filter((r) => r.stock > 0)
    .map((r) => {
      const start = offset;
      offset += (r.stock / total) * 100;
      return `${palette[rows.indexOf(r) % palette.length]} ${start}% ${offset}%`;
    })
    .join(",");
  return (
    <Card className="mb-5 space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Stock vivant · Modèles & couleurs</h2>
        <p
          role="status"
          className={offline ? "text-danger text-xs" : "text-xs text-muted"}
        >
          {offline
            ? "Actualisation indisponible — données potentiellement anciennes"
            : refreshing
              ? "Synchronisation…"
              : `Actualisé à ${new Date(updatedAt).toLocaleTimeString("fr-FR")} · toutes les 5 s`}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          Modèle sélectionné
          <select
            aria-label="Modèle de stock"
            className="h-10 w-full rounded-lg border border-border bg-surface px-3"
            value={model}
            onChange={(e) => choose(e.target.value)}
          >
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Périmètre du stock
          <select
            aria-label="Périmètre du stock"
            className="h-10 w-full rounded-lg border border-border bg-surface px-3"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">Tous les emplacements</option>
            {state.locations
              .filter((l) => l.companyId === companyId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {!models.length ? (
        <p className="text-sm text-muted">
          Créez un article avec un code modèle, par exemple T9800, puis ses
          variantes couleur/taille.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-8">
            <figure className="space-y-2">
              <div
                role="img"
                aria-label={`Répartition du stock ${model} : ${rows.map((r) => `${r.color} ${r.stock}`).join(", ")}. Total ${total}.`}
                className="h-48 w-48 rounded-full border border-border"
                style={{
                  background:
                    total > 0 ? `conic-gradient(${gradient})` : "#e2e8f0",
                }}
              />
              <figcaption className="text-center text-sm font-medium">
                {model} · {total} unités
              </figcaption>
            </figure>
            <ul className="space-y-2 text-sm">
              {rows.map((r, i) => (
                <li key={r.color} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-3 w-3 rounded-full"
                    style={{ background: palette[i % palette.length] }}
                  />
                  {r.color} · <strong>{r.stock}</strong> ·{" "}
                  {total ? ((r.stock / total) * 100).toFixed(1) : "0"}%
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left text-xs text-muted">
                Stock = acheté et réceptionné − vendu + retours + autres
                mouvements. Les transferts s’annulent à l’échelle de la société.
              </caption>
              <thead>
                <tr>
                  {[
                    "Couleur",
                    "Réceptionné",
                    "Vendu",
                    "Retourné",
                    "Initial / ajustements / transferts",
                    "Disponible",
                  ].map((h) => (
                    <th key={h} className="border-b border-border p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.color}>
                    {[
                      r.color,
                      r.received,
                      r.sold,
                      r.returned,
                      r.other,
                      r.stock,
                    ].map((v, i) => (
                      <td key={i} className="border-b border-border p-2">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!total && (
            <p className="text-sm text-muted">
              Aucun stock physique pour ce modèle dans ce périmètre.
            </p>
          )}
        </>
      )}
      <p className="text-xs text-muted">
        Ce compteur représente le stock physique, réservations incluses et
        transit exclu. Le disponible à la vente déduit les réservations clients
        confirmées ; consultez « Commandes clients » pour le détail.
      </p>
    </Card>
  );
}
