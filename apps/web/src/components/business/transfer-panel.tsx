"use client";
import { useState, type FormEvent } from "react";
import {
  productStock,
  type BusinessState,
  type BusinessCompany,
} from "@saas/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function TransferPanel({
  state: s,
  company: c,
  editable,
  busy,
  run,
}: {
  state: BusinessState;
  company: BusinessCompany;
  editable: boolean;
  busy: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
}) {
  const locations = s.locations.filter((l) => l.companyId === c.id),
    products = s.products.filter((p) => p.companyId === c.id);
  const [from, setFrom] = useState(
    locations.find((l) => l.kind === "WAREHOUSE")?.id || "",
  );
  const [product, setProduct] = useState(products[0]?.id || "");
  const [status, setStatus] = useState("ALL");
  const rows = (s.transfers || []).filter(
    (t) => t.companyId === c.id && (status === "ALL" || t.status === status),
  );
  async function ship(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    if (
      await run({
        type: "stock.ship",
        companyId: c.id,
        reference: d.get("reference"),
        fromId: from,
        toId: d.get("to"),
        lines: [{ productId: product, quantity: Number(d.get("quantity")) }],
      })
    )
      form.reset();
  }
  const name = (id: string) => locations.find((l) => l.id === id)?.name || "—";
  return (
    <section className="space-y-5 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-xl font-semibold">
        Transferts & marchandises en transit
      </h2>
      <p className="text-sm text-muted">
        L’expédition sort les articles du stock disponible. La destination
        reçoit le stock seulement après confirmation. La valeur en transit reste
        incluse dans le stock du groupe.
      </p>
      {editable && (
        <form
          onSubmit={ship}
          className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3"
        >
          <label>
            Référence transfert
            <Input name="reference" required maxLength={160} />
          </label>
          <label>
            Origine
            <select
              aria-label="Origine du transfert suivi"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="block w-full rounded border border-border bg-surface p-2"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destination
            <select
              aria-label="Destination du transfert suivi"
              name="to"
              className="block w-full rounded border border-border bg-surface p-2"
            >
              {locations
                .filter((l) => l.id !== from)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Variante
            <select
              aria-label="Variante du transfert suivi"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="block w-full rounded border border-border bg-surface p-2"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.color} · {p.size}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantité à expédier
            <Input
              name="quantity"
              type="number"
              min="1"
              max={productStock(s, product, from)}
              step="1"
              required
            />
          </label>
          <p className="self-center text-sm">
            Disponible à l’origine : {productStock(s, product, from)}
          </p>
          <Button disabled={busy || !product || locations.length < 2}>
            Confirmer l’expédition
          </Button>
        </form>
      )}
      <label>
        État
        <select
          aria-label="État des transferts"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="ml-3 rounded border border-border bg-surface p-2"
        >
          <option value="ALL">Tous</option>
          <option value="IN_TRANSIT">En transit</option>
          <option value="RECEIVED">Réceptionnés</option>
        </select>
      </label>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["Référence", "Trajet", "Articles", "Statut", "Action"].map(
                (x) => (
                  <th key={x} className="p-2">
                    {x}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .reverse()
              .map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <th className="p-2 text-left">
                    {t.reference}
                    <p className="font-normal text-muted">
                      {t.date.slice(0, 10)}
                    </p>
                  </th>
                  <td className="p-2">
                    {name(t.fromId)} → {name(t.toId)}
                  </td>
                  <td className="p-2">
                    {t.lines.map((l) => (
                      <p key={l.productId}>
                        {products.find((p) => p.id === l.productId)?.sku} ·{" "}
                        {l.quantity}
                      </p>
                    ))}
                  </td>
                  <td className="p-2">
                    {t.status === "IN_TRANSIT"
                      ? "En transit"
                      : `Reçu le ${t.receivedAt?.slice(0, 10)}`}
                  </td>
                  <td className="p-2">
                    {editable && t.status === "IN_TRANSIT" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run({
                            type: "stock.receiveTransfer",
                            companyId: c.id,
                            transferId: t.id,
                          })
                        }
                      >
                        Confirmer la réception
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="py-4 text-sm text-muted">
            Aucun transfert suivi. Les transferts immédiats historiques restent
            dans les mouvements de stock.
          </p>
        )}
      </div>
    </section>
  );
}
