"use client";
import { useState, type FormEvent } from "react";
import {
  availableStock,
  reservedStock,
  customerDelivered,
  currencyDigits,
  type BusinessState,
  type BusinessCompany,
} from "@saas/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function CustomerOrders({
  state: s,
  company: c,
  create,
  prices,
  deliver,
  busy,
  run,
}: {
  state: BusinessState;
  company: BusinessCompany;
  create: boolean;
  prices: boolean;
  deliver: boolean;
  busy: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
}) {
  const products = s.products.filter((p) => p.companyId === c.id),
    locations = s.locations.filter((l) => l.companyId === c.id),
    customers = s.partners.filter(
      (p) => p.companyId === c.id && p.kind === "CUSTOMER",
    );
  const [location, setLocation] = useState(locations[0]?.id || ""),
    [lines, setLines] = useState([
      {
        productId: products[0]?.id || "",
        quantity: 1,
        unitPrice: products[0]?.salePrice || 0,
      },
    ]),
    [filter, setFilter] = useState("OPEN");
  const factor = 10 ** currencyDigits(c.currency),
    money = (n: number) =>
      (n / factor).toLocaleString("fr-FR", {
        minimumFractionDigits: currencyDigits(c.currency),
      }) +
      " " +
      c.currency;
  const orders = (s.customerOrders || []).filter(
    (o) =>
      o.companyId === c.id &&
      (filter === "ALL" || !["DELIVERED", "CANCELLED"].includes(o.status)),
  );
  const status = {
    DRAFT: "Brouillon",
    CONFIRMED: "Réservée",
    PARTIALLY_DELIVERED: "Partiellement livrée",
    DELIVERED: "Livrée",
    CANCELLED: "Annulée",
  };
  const action = (a: Record<string, unknown>) => run({ companyId: c.id, ...a });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    if (
      await action({
        type: "customerOrder.create",
        reference: d.get("reference"),
        customerId: d.get("customer"),
        locationId: location,
        lines,
        dueDate: d.get("dueDate"),
      })
    )
      f.reset();
  }
  const selectClass =
    "block w-full rounded border border-border bg-surface p-2";
  return (
    <section className="space-y-5 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-xl font-semibold">Commandes clients & livraisons</h2>
      <p className="text-sm text-muted">
        Confirmez pour réserver. Seules les quantités livrées alimentent les
        ventes, le coût vendu et les créances. Annuler libère uniquement le
        reliquat ; les livraisons existantes sont conservées.
      </p>
      {create && (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Référence commande client
              <Input name="reference" required maxLength={160} />
            </label>
            <label>
              Client
              <select
                aria-label="Client de la commande"
                name="customer"
                required
                className={selectClass}
              >
                {customers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Emplacement de préparation
              <select
                aria-label="Emplacement de préparation"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={selectClass}
              >
                {locations.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Échéance de paiement
              <Input type="date" name="dueDate" required />
            </label>
          </div>
          {lines.map((l, i) => (
            <div
              key={i}
              className="grid gap-2 rounded border border-border p-3 sm:grid-cols-4"
            >
              <label>
                Article
                <select
                  aria-label={`Article commande ${i + 1}`}
                  value={l.productId}
                  onChange={(e) =>
                    setLines((xs) =>
                      xs.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              productId: e.target.value,
                              unitPrice:
                                products.find((p) => p.id === e.target.value)
                                  ?.salePrice || 0,
                            }
                          : x,
                      ),
                    )
                  }
                  className={selectClass}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.color} · {p.size}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted">
                  Disponible : {availableStock(s, l.productId, location)} ·
                  réservé : {reservedStock(s, l.productId, location)}
                </span>
              </label>
              <label>
                Quantité
                <Input
                  aria-label={`Quantité commande ${i + 1}`}
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={l.quantity}
                  onChange={(e) =>
                    setLines((xs) =>
                      xs.map((x, j) =>
                        j === i
                          ? { ...x, quantity: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Prix unitaire ({c.currency})
                <Input
                  aria-label={`Prix commande ${i + 1}`}
                  type="number"
                  min={0}
                  step={1 / factor}
                  required
                  value={l.unitPrice / factor}
                  onChange={(e) =>
                    setLines((xs) =>
                      xs.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              unitPrice: Math.round(
                                Number(e.target.value) * factor,
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={lines.length === 1 || busy}
                onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}
              >
                Retirer la ligne
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || lines.length >= 100 || !products.length}
              onClick={() =>
                setLines((xs) => [
                  ...xs,
                  {
                    productId: products[0]?.id || "",
                    quantity: 1,
                    unitPrice: products[0]?.salePrice || 0,
                  },
                ])
              }
            >
              Ajouter une ligne
            </Button>
            <Button
              disabled={
                busy || !customers.length || !products.length || !location
              }
            >
              Créer le brouillon client
            </Button>
          </div>
        </form>
      )}
      <label>
        Afficher les commandes
        <select
          aria-label="Afficher les commandes"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={selectClass}
        >
          <option value="OPEN">À traiter</option>
          <option value="ALL">Toutes</option>
        </select>
      </label>
      {!orders.length && (
        <p className="text-sm text-muted">
          Aucune commande client dans cette sélection.
        </p>
      )}
      {orders.map((o) => (
        <article
          key={o.id}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <h3 className="font-semibold">
            {o.reference} · {status[o.status]}
          </h3>
          <p className="text-sm text-muted">
            {customers.find((x) => x.id === o.customerId)?.name} ·{" "}
            {locations.find((x) => x.id === o.locationId)?.name} · échéance{" "}
            {o.dueDate}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Commandé</th>
                  <th>Livré</th>
                  <th>Reliquat</th>
                  {prices && <th>Prix</th>}
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l) => (
                  <tr key={l.productId}>
                    <td>{products.find((p) => p.id === l.productId)?.sku}</td>
                    <td>{l.quantity}</td>
                    <td>{customerDelivered(s, o.id, l.productId)}</td>
                    <td>
                      {o.status === "CANCELLED"
                        ? 0
                        : l.quantity - customerDelivered(s, o.id, l.productId)}
                    </td>
                    {prices && <td>{money(l.unitPrice)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {create && o.status === "DRAFT" && (
            <Button
              disabled={busy}
              onClick={() =>
                action({ type: "customerOrder.confirm", orderId: o.id })
              }
            >
              Confirmer et réserver
            </Button>
          )}
          {deliver &&
            ["CONFIRMED", "PARTIALLY_DELIVERED"].includes(o.status) && (
              <form
                className="space-y-3 rounded border border-border p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = e.currentTarget,
                    d = new FormData(f);
                  const chosen = o.lines
                    .map((l) => ({
                      productId: l.productId,
                      quantity: Number(d.get(l.productId) || 0),
                    }))
                    .filter((l) => l.quantity > 0);
                  if (
                    await action({
                      type: "customerOrder.deliver",
                      orderId: o.id,
                      reference: d.get("deliveryReference"),
                      lines: chosen,
                    })
                  )
                    f.reset();
                }}
              >
                <label>
                  Référence bon de livraison
                  <Input name="deliveryReference" required maxLength={160} />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {o.lines
                    .filter(
                      (l) =>
                        l.quantity > customerDelivered(s, o.id, l.productId),
                    )
                    .map((l) => (
                      <label key={l.productId}>
                        À livrer ·{" "}
                        {products.find((p) => p.id === l.productId)?.sku}
                        <Input
                          aria-label={`À livrer ${products.find((p) => p.id === l.productId)?.sku}`}
                          name={l.productId}
                          type="number"
                          min={0}
                          step={1}
                          max={
                            l.quantity - customerDelivered(s, o.id, l.productId)
                          }
                          defaultValue={0}
                        />
                      </label>
                    ))}
                </div>
                <Button disabled={busy}>Valider la livraison</Button>
              </form>
            )}
          {create && !["DELIVERED", "CANCELLED"].includes(o.status) && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                await action({
                  type: "customerOrder.cancel",
                  orderId: o.id,
                  reason: d.get("reason"),
                });
              }}
            >
              <Input
                aria-label={`Motif annulation ${o.reference}`}
                name="reason"
                required
                maxLength={160}
                placeholder="Motif d’annulation du reliquat"
              />
              <Button variant="secondary" disabled={busy}>
                Annuler le reliquat
              </Button>
            </form>
          )}
          {o.cancellationReason && <p>Annulation : {o.cancellationReason}</p>}
          {(s.customerDeliveries || [])
            .filter((d) => d.orderId === o.id)
            .map((d) => (
              <p key={d.id} className="text-sm">
                BL {d.reference} · {d.date.slice(0, 10)} ·{" "}
                {d.lines.reduce((n, l) => n + l.quantity, 0)} articles ·{" "}
                {s.invoices.find((i) => i.id === d.invoiceId)?.reference ||
                  "Créance liée"}
              </p>
            ))}
        </article>
      ))}
    </section>
  );
}
