"use client";
import { useState, type FormEvent } from "react";
import {
  orderReceived,
  currencyDigits,
  type BusinessState,
  type BusinessCompany,
} from "@saas/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Props = {
  state: BusinessState;
  company: BusinessCompany;
  editable: boolean;
  busy: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
};
export function ReceivingPanel({
  state: s,
  company: c,
  editable,
  busy,
  run,
}: Props) {
  const [filter, setFilter] = useState("");
  const [orderId, setOrder] = useState("");
  const orders = s.orders.filter(
    (o) =>
      o.companyId === c.id &&
      ["CUSTOMS", "PARTIALLY_RECEIVED"].includes(o.status),
  );
  const order = orders.find((o) => o.id === orderId) || orders[0];
  const products = (id: string) => {
    const p = s.products.find((p) => p.id === id);
    return `${p?.sku} · ${p?.color} · ${p?.size}`;
  };
  const receipts = (s.receipts || []).filter(
    (r) =>
      r.companyId === c.id &&
      (!filter ||
        `${r.reference} ${s.orders.find((o) => o.id === r.orderId)?.reference}`
          .toLowerCase()
          .includes(filter.toLowerCase())),
  );
  async function receive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!order) return;
    const f = e.currentTarget,
      d = new FormData(f);
    const lines = order.lines
      .map((l) => ({
        productId: l.productId,
        quantity: Number(d.get(l.productId)),
      }))
      .filter((l) => l.quantity > 0);
    if (
      await run({
        type: "order.receive",
        companyId: c.id,
        orderId: order.id,
        reference: String(d.get("reference")),
        lines,
      })
    )
      f.reset();
  }
  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">Réceptions fournisseurs</h2>
        <p className="mt-2 text-sm text-muted">
          Compter les articles réellement reçus. Chaque bon de réception
          alimente le stock et une dette correspondant aux marchandises reçues.
          Le reliquat reste ouvert. Les frais d’import sont répartis
          progressivement ; les factures de transport restent à enregistrer
          séparément.
        </p>
      </div>
      {editable && (
        <form
          className="space-y-4 rounded-xl border border-border bg-surface p-5"
          onSubmit={receive}
        >
          <label className="block">
            Commande à réceptionner
            <select
              aria-label="Commande à réceptionner"
              className="mt-1 block w-full rounded border border-border bg-surface p-2"
              value={order?.id || ""}
              onChange={(e) => setOrder(e.target.value)}
            >
              {!orders.length && (
                <option value="">
                  Aucune commande en douane ou partiellement reçue
                </option>
              )}
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.reference} ·{" "}
                  {o.status === "CUSTOMS" ? "Douane" : "Réception partielle"}
                </option>
              ))}
            </select>
          </label>
          {order && (
            <div key={order.id} className="space-y-3">
              <label>
                Référence du bon de réception
                <Input
                  name="reference"
                  required
                  maxLength={160}
                  placeholder="BR-2026-001"
                />
              </label>
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Variante",
                        "Commandé",
                        "Déjà reçu",
                        "Reliquat",
                        "Reçu aujourd’hui",
                      ].map((x) => (
                        <th className="p-2" key={x}>
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((l) => {
                      const received = orderReceived(s, order.id, l.productId),
                        remaining = l.quantity - received;
                      return (
                        <tr
                          key={l.productId}
                          className="border-t border-border"
                        >
                          <th className="p-2 text-left">
                            {products(l.productId)}
                          </th>
                          <td>{l.quantity}</td>
                          <td>{received}</td>
                          <td>{remaining}</td>
                          <td>
                            <Input
                              aria-label={`Quantité reçue ${s.products.find((p) => p.id === l.productId)?.sku}`}
                              name={l.productId}
                              type="number"
                              min="0"
                              max={remaining}
                              step="1"
                              defaultValue="0"
                              required
                              disabled={!remaining}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button disabled={busy}>Valider la réception partielle</Button>
            </div>
          )}
        </form>
      )}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 font-semibold">Bons de réception & pièces liées</h3>
        <Input
          aria-label="Rechercher un bon de réception"
          placeholder="Référence de réception ou de commande"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="mt-3 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Bon",
                  "Date",
                  "Commande",
                  "Quantité",
                  "Facture / dette liée",
                ].map((x) => (
                  <th className="p-2" key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receipts
                .slice()
                .reverse()
                .map((r) => {
                  const invoice = s.invoices.find((i) => i.id === r.invoiceId);
                  return (
                    <tr className="border-t border-border" key={r.id}>
                      <th className="p-2 text-left">{r.reference}</th>
                      <td className="p-2">{r.date.slice(0, 10)}</td>
                      <td className="p-2">
                        {s.orders.find((o) => o.id === r.orderId)?.reference}
                      </td>
                      <td className="p-2">
                        {r.lines.reduce((n, l) => n + l.quantity, 0)}
                      </td>
                      <td className="p-2">
                        {invoice
                          ? `${invoice.reference} · ${new Intl.NumberFormat("fr-TN", { style: "currency", currency: c.currency }).format(invoice.amount / 10 ** currencyDigits(c.currency))}`
                          : r.invoiceId
                            ? "Réservée à la finance"
                            : "Sans montant marchandises"}
                        <details>
                          <summary className="cursor-pointer text-brand">
                            Détail des quantités
                          </summary>
                          {r.lines.map((l) => (
                            <p key={l.productId}>
                              {products(l.productId)} : {l.quantity}
                            </p>
                          ))}
                        </details>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!receipts.length && (
            <p className="py-4 text-sm text-muted">
              Aucun bon de réception détaillé. Les anciennes réceptions
              complètes restent visibles dans les commandes et mouvements.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
