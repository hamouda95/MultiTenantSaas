"use client";
import { useState, type FormEvent } from "react";
import {
  purchaseNeeds,
  currencyDigits,
  type BusinessState,
  type BusinessCompany,
} from "@saas/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Props = {
  state: BusinessState;
  company: BusinessCompany;
  manage: boolean;
  operate: boolean;
  busy: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
};
export function SupplierSamples({
  state: s,
  company: c,
  manage,
  operate,
  busy,
  run,
}: Props) {
  const [warehouse, setWarehouse] = useState("");
  const [error, setError] = useState("");
  const warehouses = s.locations.filter(
    (l) => l.companyId === c.id && l.kind === "WAREHOUSE",
  );
  const suppliers = s.partners.filter(
    (p) => p.companyId === c.id && p.kind === "SUPPLIER",
  );
  const models = [
    ...new Set(
      s.products
        .filter((p) => p.companyId === c.id)
        .map((p) => p.model || p.name),
    ),
  ];
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-TN", {
      style: "currency",
      currency: c.currency,
    }).format(n / 10 ** currencyDigits(c.currency));
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    setError("");
    const cost = Math.round(
      Number(d.get("cost")) * 10 ** currencyDigits(c.currency),
    );
    if (!Number.isSafeInteger(cost) || cost <= 0) {
      setError("Coût invalide");
      return;
    }
    if (
      await run({
        type: "sample.create",
        companyId: c.id,
        supplierId: d.get("supplier"),
        model: d.get("model"),
        reference: d.get("reference"),
        photoUrl: d.get("photo"),
        unitCost: cost,
        minimumQuantity: Number(d.get("minimum")),
        leadDays: Number(d.get("lead")),
      })
    )
      f.reset();
  }
  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">
          Échantillons & aide à la commande
        </h2>
        <p className="mt-2 text-sm text-muted">
          Estimation explicable : ventes des 30 derniers jours × (délai
          fournisseur + couverture) / 30, plus stock minimum, moins stock
          disponible après réservations et commandes en cours. Le minimum
          fournisseur peut augmenter la quantité. Aucune commande n’est envoyée
          automatiquement.
        </p>
        <label className="mt-3 block">
          Entrepôt de réception
          <select
            aria-label="Entrepôt échantillons"
            value={warehouse || warehouses[0]?.id || ""}
            onChange={(e) => setWarehouse(e.target.value)}
            className="ml-3 rounded border border-border bg-surface p-2"
          >
            {warehouses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {s.samples
        ?.filter((x) => x.companyId === c.id)
        .map((sample) => {
          const needs = purchaseNeeds(s, c, sample),
            qty = needs.reduce((n, r) => n + r.quantity, 0);
          return (
            <article
              key={sample.id}
              className="grid gap-5 rounded-xl border border-border bg-surface p-5 lg:grid-cols-2"
            >
              <div>
                <img
                  src={sample.photoUrl}
                  alt={`Échantillon fournisseur ${sample.model}`}
                  className="w-full rounded-lg object-contain"
                  loading="lazy"
                />
                <p className="mt-2 text-xs text-muted">
                  {sample.photoUrl.startsWith("/demo/")
                    ? "Illustration générée pour la démonstration, fournisseur et produits fictifs."
                    : "Visuel communiqué par le fournisseur ; disponibilité à confirmer."}
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">
                  {sample.model} · {sample.reference}
                </h3>
                <p>
                  {suppliers.find((p) => p.id === sample.supplierId)?.name} ·{" "}
                  {sample.status === "APPROVED"
                    ? "Échantillon approuvé"
                    : "À approuver"}
                </p>
                <p>
                  {fmt(sample.unitCost)} / article · Minimum{" "}
                  {sample.minimumQuantity} · Délai indicatif {sample.leadDays}{" "}
                  jours
                </p>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr>
                        <th className="text-left">Variante</th>
                        <th>Vendu / 30 j</th>
                        <th>Disponible hors réservations</th>
                        <th>En cours</th>
                        <th>À acheter</th>
                      </tr>
                    </thead>
                    <tbody>
                      {needs.map((r) => {
                        const p = s.products.find((p) => p.id === r.productId);
                        return (
                          <tr
                            key={r.productId}
                            className="border-t border-border"
                          >
                            <td className="p-2 text-left">
                              {p?.color} · {p?.size}
                            </td>
                            <td>{r.sold}</td>
                            <td>{r.stock}</td>
                            <td>{r.incoming}</td>
                            <td className="font-semibold">{r.quantity}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="font-semibold">
                  Suggestion : {qty} articles · {fmt(qty * sample.unitCost)}{" "}
                  hors transport et douane
                </p>
                {manage && sample.status !== "APPROVED" && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run({
                        type: "sample.approve",
                        companyId: c.id,
                        sampleId: sample.id,
                      })
                    }
                  >
                    Approuver l’échantillon
                  </Button>
                )}{" "}
                {operate && (
                  <Button
                    disabled={
                      busy ||
                      sample.status !== "APPROVED" ||
                      !qty ||
                      !warehouses.length
                    }
                    onClick={() => {
                      const eta = new Date(
                        Date.now() + sample.leadDays * 86400000,
                      )
                        .toISOString()
                        .slice(0, 10);
                      run({
                        type: "order.create",
                        companyId: c.id,
                        reference: `ECH-${sample.reference.slice(0, 80)}-${Date.now()}`,
                        supplierId: sample.supplierId,
                        locationId: warehouse || warehouses[0]?.id,
                        lines: needs
                          .filter((r) => r.quantity > 0)
                          .map((r) => ({
                            productId: r.productId,
                            quantity: r.quantity,
                            unitPrice: sample.unitCost,
                          })),
                        origin: "Fournisseur — à confirmer",
                        eta,
                        dueDate: eta,
                        landedCharges: 0,
                      });
                    }}
                  >
                    Préparer un brouillon de commande
                  </Button>
                )}
                <p className="text-xs text-muted">
                  Vérifier le brouillon dans Achats & imports avant approbation.
                  Le prix, les frais et les délais doivent être confirmés.
                </p>
              </div>
            </article>
          );
        })}
      {operate && (
        <form
          onSubmit={create}
          className="grid gap-3 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3"
        >
          <h3 className="font-semibold sm:col-span-3">
            Ajouter une proposition fournisseur
          </h3>
          <label>
            Fournisseur
            <select
              name="supplier"
              required
              className="block w-full rounded border bg-surface p-2"
            >
              {suppliers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modèle
            <select
              name="model"
              required
              className="block w-full rounded border bg-surface p-2"
            >
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Référence
            <Input name="reference" required maxLength={160} />
          </label>
          <label>
            URL HTTPS de la photo
            <Input name="photo" type="url" pattern="https://.*" required />
          </label>
          <label>
            Prix unitaire ({c.currency})
            <Input
              name="cost"
              type="number"
              step={10 ** -currencyDigits(c.currency)}
              min="0.001"
              required
            />
          </label>
          <label>
            Minimum fournisseur
            <Input
              name="minimum"
              type="number"
              min="1"
              max="100000"
              defaultValue="100"
              required
            />
          </label>
          <label>
            Délai en jours
            <Input
              name="lead"
              type="number"
              min="1"
              max="365"
              defaultValue="30"
              required
            />
          </label>
          <Button disabled={busy || !suppliers.length || !models.length}>
            Ajouter la proposition
          </Button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}
