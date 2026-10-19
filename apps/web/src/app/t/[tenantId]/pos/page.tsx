"use client";
import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { currencyDigits } from "@saas/types";
import { CameraScanner } from "@/components/business/camera-scanner";
import { ScanLine, Users, Receipt, Activity } from "lucide-react";
import { versionedQuery } from "@/lib/versioned-query";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/states";
const select = "h-10 w-full rounded-lg border border-border bg-surface px-3";
export default function Pos() {
  const { tenantId } = useParams<{ tenantId: string }>(),
    client = useQueryClient();
  const busyRef = useRef(false);
  const q = useQuery({
    queryKey: ["pos", tenantId],
    queryFn: () =>
      versionedQuery(
        client,
        ["pos", tenantId],
        () => api.businessVersion(tenantId),
        () => api.pos(tenantId),
        () => busyRef.current,
      ),
    refetchInterval: busyRef.current ? false : 5000,
    retry: false,
  });
  const [storeId, setStoreId] = useState(""),
    [search, setSearch] = useState(""),
    [customerId, setCustomerId] = useState(""),
    [clientSearch, setClientSearch] = useState(""),
    [historySearch, setHistorySearch] = useState(""),
    [historyDate, setHistoryDate] = useState(""),
    [cart, setCart] = useState<Record<string, number>>({}),
    [discount, setDiscount] = useState("0"),
    [card, setCard] = useState(""),
    [cashGiven, setCashGiven] = useState(""),
    [ticketId, setTicketId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ json: string; id: string; version: number } | null>(
    null,
  );
  const data = q.data,
    store = data?.stores.find((s) => s.id === storeId) || data?.stores[0];
  const scale = 10 ** currencyDigits(store?.currency || "TND");
  const money = (n: number) =>
    new Intl.NumberFormat("fr-TN", {
      style: "currency",
      currency: store?.currency || "TND",
    }).format(n / scale);
  function minor(v: string) {
    if (!/^\d+(\.\d+)?$/.test(v.replace(",", ".")))
      throw Error("Montant invalide");
    const n = Number(v.replace(",", ".")) * scale;
    if (
      !Number.isSafeInteger(Math.round(n)) ||
      Math.abs(n - Math.round(n)) > 1e-6
    )
      throw Error("Précision de devise invalide");
    return Math.round(n);
  }
  const products =
    data?.products.filter((p) => p.companyId === store?.companyId) || [];
  const session = data?.sessions.find(
    (s) =>
      s.locationId === store?.id &&
      !s.closedAt &&
      (s.userId === data.userId || store?.canManage),
  );
  const bps = Math.round(Number(discount) * 100);
  const lines = Object.entries(cart)
    .filter(([, n]) => n > 0)
    .map(([id, quantity]) => ({
      product: products.find((p) => p.id === id)!,
      quantity,
    }))
    .filter((l) => l.product);
  const total = lines.reduce(
    (n, l) =>
      n + l.quantity * Math.round((l.product.price * (10000 - bps)) / 10000),
    0,
  );
  const ticket = data?.tickets.find((t) => t.id === ticketId);
  async function run(action: Record<string, unknown>) {
    if (!data || busy) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const json = JSON.stringify(action);
      if (!pending.current || pending.current.json !== json)
        pending.current = {
          json,
          id: crypto.randomUUID(),
          version: data.version,
        };
      const next = await api.posCommand(
        tenantId,
        pending.current.version,
        action,
        pending.current.id,
      );
      client.setQueryData(["pos", tenantId], next);
      pending.current = null;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      if (e instanceof ApiError && e.status > 0 && e.status < 500) {
        pending.current = null;
        if (e.status === 409) await q.refetch();
      }
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const action = (a: Record<string, unknown>) => ({
    ...a,
    companyId: store?.companyId,
  });
  const productName = (id: string) => {
    const p = products.find((p) => p.id === id);
    return p ? `${p.name} · ${p.size} ${p.color}` : id;
  };
  function scan(code: string) {
    if (busy) return;
    const value = code.trim();
    const p = products.find(
      (p) => p.barcode === value || p.sku.toLowerCase() === value.toLowerCase(),
    );
    if (!p) {
      setSearch(value);
      setError("Code non reconnu dans cette société. Vérifiez le catalogue.");
      return;
    }
    if (!session) {
      setSearch(value);
      setError("Ouvrez une session pour ajouter un article.");
      return;
    }
    const stock =
      data?.availability.find(
        (a) => a.productId === p.id && a.locationId === store?.id,
      )?.quantity || 0;
    if (!p.price || stock <= (cart[p.id] || 0)) {
      setError("Article sans tarif ou stock insuffisant.");
      return;
    }
    setCart((cart) => ({ ...cart, [p.id]: (cart[p.id] || 0) + 1 }));
    setSearch("");
    setError("");
  }
  const customers = (data?.customers || []).filter(
    (c) => c.companyId === store?.companyId,
  );
  const storeTickets = (data?.tickets || []).filter(
    (t) => t.locationId === store?.id,
  );
  const today = new Date().toLocaleDateString("en-CA");
  const dayTickets = storeTickets.filter(
    (t) =>
      new Date(t.date).toLocaleDateString("en-CA") === today && !t.returned,
  );
  if (q.isLoading) return <p role="status">Chargement de la Caisse…</p>;
  if (q.error)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="pos-console">
      <PageHeader
        title="Caisse"
        description="Vendre dans votre magasin et consulter le stock physique du réseau autorisé."
        actions={
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() => q.refetch()}
          >
            Actualiser la Caisse
          </Button>
        }
      />
      <section className="mb-5 overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-3">
              <ScanLine className="h-7 w-7 text-cyan-300" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">
                Commerce terminal
              </p>
              <h2 className="text-xl font-semibold">
                {store?.companyName || "Votre réseau"} ·{" "}
                {store?.name || "Caisse"}
              </h2>
            </div>
          </div>
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-cyan-100"
          >
            <Activity className="h-4 w-4" />
            {q.isRefetchError
              ? "Connexion interrompue · actualisez avant de vendre"
              : `Stock synchronisé à ${new Date(q.dataUpdatedAt).toLocaleTimeString("fr-FR")} · 5 s`}
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            [Receipt, "Ventes visibles aujourd’hui", String(dayTickets.length)],
            [
              Activity,
              "Encaissements visibles du jour",
              money(dayTickets.reduce((n, t) => n + t.total, 0)),
            ],
            [Users, "Clients de la société", String(customers.length)],
          ].map(([Icon, label, value]) => {
            const I = Icon as typeof Receipt;
            return (
              <div
                key={String(label)}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <I className="mb-2 h-4 w-4 text-cyan-300" />
                <p className="text-2xl font-semibold">{String(value)}</p>
                <p className="text-xs text-slate-300">{String(label)}</p>
              </div>
            );
          })}
        </div>
      </section>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-danger p-3 text-danger"
        >
          {error}
        </p>
      )}
      {!store ? (
        <Card className="p-5">
          Aucun magasin attribué. Le propriétaire doit configurer la Caisse et
          attribuer un rôle Caissier ou Responsable magasin.
        </Card>
      ) : (
        <>
          <Card className="mb-5 space-y-3 p-5">
            <Field label="Magasin de vente">
              {(props) => (
                <select
                  {...props}
                  className={select}
                  value={store.id}
                  onChange={(e) => {
                    setStoreId(e.target.value);
                    setCart({});
                    setCustomerId("");
                    setClientSearch("");
                    setCard("");
                    setCashGiven("");
                    setDiscount("0");
                    setTicketId("");
                  }}
                >
                  {data?.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.companyName} · {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <p className="text-sm text-muted">
              {store.configured
                ? "Caisse configurée"
                : "Configuration requise dans Gestion du holding : comptes de caisse et carte, client comptoir, tarifs produits."}
            </p>
            {session ? (
              <p className="text-sm">
                Session ouverte · Fond : {money(session.opening)} · Espèces
                attendues : {money(session.expected || 0)}
              </p>
            ) : (
              store.configured && (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      void run(
                        action({
                          type: "pos.open",
                          locationId: store.id,
                          opening: minor(
                            String(
                              new FormData(e.currentTarget).get("opening"),
                            ),
                          ),
                        }),
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Field label="Fond de caisse">
                    {(props) => (
                      <Input
                        {...props}
                        name="opening"
                        type="number"
                        min="0"
                        step="any"
                        defaultValue="0"
                        required
                      />
                    )}
                  </Field>
                  <Button disabled={busy}>Ouvrir la session</Button>
                </form>
              )
            )}
          </Card>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="space-y-4 p-5">
              <h2 className="font-semibold">Catalogue et disponibilités</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  scan(search);
                }}
              >
                <Field label="Scanner un code-barres ou rechercher un article">
                  {(props) => (
                    <Input
                      {...props}
                      value={search}
                      disabled={busy}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Code-barres, SKU, nom, taille…"
                    />
                  )}
                </Field>
              </form>
              <CameraScanner disabled={busy} onCode={scan} />
              <p className="text-xs text-muted">
                Douchette USB/Bluetooth : placez le curseur dans le champ,
                scannez et terminez par Entrée.
              </p>
              <div className="max-h-[32rem] space-y-3 overflow-y-auto">
                {products
                  .filter((p) =>
                    `${p.sku} ${p.name} ${p.size} ${p.color} ${p.barcode}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-border p-4 transition-colors hover:border-accent"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{productName(p.id)}</p>
                          <p className="text-xs text-muted">
                            {p.sku} · {p.barcode || "Sans code-barres"}
                          </p>
                          <p>{p.price ? money(p.price) : "Tarif à définir"}</p>
                        </div>
                        <Button
                          size="sm"
                          disabled={
                            busy ||
                            !session ||
                            !p.price ||
                            (data?.availability.find(
                              (a) =>
                                a.productId === p.id &&
                                a.locationId === store.id,
                            )?.quantity || 0) <
                              (cart[p.id] || 0) + 1
                          }
                          onClick={() =>
                            setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 })
                          }
                        >
                          Ajouter
                        </Button>
                      </div>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-accent">
                          Stock dans les autres emplacements
                        </summary>
                        {data?.availability
                          .filter((a) => a.productId === p.id)
                          .map((a) => (
                            <p key={a.locationId}>
                              {a.locationName} : {a.quantity} unités
                              {a.locationId === store.id ? " (ici)" : ""}
                            </p>
                          ))}
                      </details>
                    </div>
                  ))}
              </div>
              <p className="text-xs text-muted">
                Stock physique uniquement : pas de réservation ni garantie de
                disponibilité. Les autres sociétés ne sont pas accessibles.
              </p>
            </Card>
            <Card className="space-y-4 p-5">
              <h2 className="font-semibold">Panier</h2>
              <Field label="Client de la vente">
                {(props) => (
                  <select
                    {...props}
                    className={select}
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Client comptoir configuré</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              {lines.length === 0 && (
                <p className="text-sm text-muted">Ajoutez un article.</p>
              )}
              {lines.map((l) => (
                <div
                  key={l.product.id}
                  className="flex items-center justify-between gap-2 border-b border-border pb-2"
                >
                  <p className="text-sm">
                    {productName(l.product.id)}
                    <br />
                    {money(
                      Math.round((l.product.price * (10000 - bps)) / 10000),
                    )}{" "}
                    × {l.quantity}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      setCart({
                        ...cart,
                        [l.product.id]: Math.max(0, l.quantity - 1),
                      })
                    }
                  >
                    Retirer une unité
                  </Button>
                </div>
              ))}
              <Field
                label={`Remise (%) — autorisation ${store.canManage ? "responsable" : store.maxDiscountBps / 100 + " %"}`}
              >
                {(props) => (
                  <Input
                    {...props}
                    value={discount}
                    type="number"
                    min="0"
                    max={store.canManage ? 100 : store.maxDiscountBps / 100}
                    step="0.01"
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                )}
              </Field>
              <p className="text-2xl font-semibold">Total : {money(total)}</p>
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const cardAmount = card ? minor(card) : 0,
                      cash = Math.max(0, total - cardAmount);
                    const ok = await run(
                      action({
                        type: "pos.checkout",
                        sessionId: session?.id,
                        ...(customerId ? { customerId } : {}),
                        items: lines.map((l) => ({
                          productId: l.product.id,
                          quantity: l.quantity,
                        })),
                        discountBps: bps,
                        cash,
                        card: cardAmount,
                        cashGiven: cashGiven ? minor(cashGiven) : cash,
                      }),
                    );
                    if (ok) {
                      setCustomerId("");
                      setCart({});
                      setCard("");
                      setCashGiven("");
                      setDiscount("0");
                    }
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Field label="Montant réglé par carte">
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min="0"
                      step="any"
                      value={card}
                      onChange={(e) => setCard(e.target.value)}
                      placeholder="0"
                    />
                  )}
                </Field>
                <Field label="Espèces remises (laisser vide pour montant exact)">
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min="0"
                      step="any"
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                    />
                  )}
                </Field>
                <p className="text-sm">
                  {(() => {
                    try {
                      const c = card ? minor(card) : 0,
                        cash = Math.max(0, total - c),
                        given = cashGiven ? minor(cashGiven) : cash;
                      return `Espèces à encaisser : ${money(cash)} · Monnaie à rendre : ${money(Math.max(0, given - cash))}`;
                    } catch {
                      return "Vérifiez les montants";
                    }
                  })()}
                </p>
                <Button
                  type="submit"
                  loading={busy}
                  disabled={
                    !session ||
                    !lines.length ||
                    !Number.isFinite(total) ||
                    total <= 0
                  }
                >
                  Valider la vente et le règlement
                </Button>
              </form>
              <p className="text-xs text-muted">
                Les règlements carte sont enregistrés après paiement externe.
                Cette interface ne pilote pas encore un terminal bancaire.
              </p>
            </Card>
          </div>
          {session && (
            <Card className="mt-5 space-y-3 p-5">
              <h2 className="font-semibold">Clôturer la session</h2>
              <form
                className="grid gap-3 sm:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  try {
                    void run(
                      action({
                        type: "pos.close",
                        sessionId: session.id,
                        counted: minor(String(d.get("counted"))),
                        reason: String(d.get("reason")),
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Field label="Espèces comptées">
                  {(props) => (
                    <Input
                      {...props}
                      name="counted"
                      type="number"
                      min="0"
                      step="any"
                      required
                    />
                  )}
                </Field>
                <Field label="Commentaire de clôture">
                  {(props) => (
                    <Input {...props} name="reason" required maxLength={160} />
                  )}
                </Field>
                <div className="flex items-end">
                  <Button disabled={busy}>Clôturer la Caisse</Button>
                </div>
              </form>
            </Card>
          )}
          <Card className="mt-5 space-y-4 p-5">
            <h2 className="font-semibold">Base clients</h2>
            <Field label="Rechercher un client Caisse">
              {(props) => (
                <Input
                  {...props}
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Nom, téléphone, email…"
                />
              )}
            </Field>
            <div className="grid max-h-60 gap-2 overflow-auto sm:grid-cols-2">
              {customers
                .filter((c) =>
                  `${c.name} ${c.phone} ${c.email}`
                    .toLowerCase()
                    .includes(clientSearch.toLowerCase()),
                )
                .map((c) => (
                  <button
                    key={c.id}
                    disabled={busy}
                    className="rounded-lg border border-border p-3 text-left text-sm hover:border-accent"
                    onClick={() => {
                      setCustomerId(c.id);
                      setError("");
                    }}
                  >
                    <strong>{c.name}</strong>
                    <span className="block text-xs text-muted">
                      {c.phone || "Sans téléphone"} · {c.email || "Sans email"}
                    </span>
                    <span className="text-xs text-accent">
                      {customerId === c.id
                        ? "Client sélectionné"
                        : "Sélectionner pour la prochaine vente"}
                    </span>
                  </button>
                ))}
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-accent">
                Nouveau client
              </summary>
              <form
                className="mt-3 grid gap-3 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    d = new FormData(form);
                  if (
                    await run(
                      action({
                        type: "pos.customer.create",
                        locationId: store.id,
                        name: String(d.get("name")),
                        email: String(d.get("email")),
                        phone: String(d.get("phone")),
                      }),
                    )
                  )
                    form.reset();
                }}
              >
                <Field label="Nom du nouveau client">
                  {(props) => (
                    <Input
                      {...props}
                      name="name"
                      required
                      maxLength={160}
                      disabled={busy}
                    />
                  )}
                </Field>
                <Field label="Téléphone du nouveau client">
                  {(props) => (
                    <Input
                      {...props}
                      name="phone"
                      maxLength={40}
                      disabled={busy}
                    />
                  )}
                </Field>
                <Field label="Email du nouveau client">
                  {(props) => (
                    <Input
                      {...props}
                      name="email"
                      type="email"
                      maxLength={254}
                      disabled={busy}
                    />
                  )}
                </Field>
                <Button disabled={busy}>Créer le client en Caisse</Button>
              </form>
            </details>
          </Card>
          <Card className="mt-5 space-y-3 p-5">
            <h2 className="font-semibold">Tickets du magasin</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rechercher dans les ventes">
                {(props) => (
                  <Input
                    {...props}
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Ticket, client, article…"
                  />
                )}
              </Field>
              <Field label="Date des ventes">
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <p className="text-xs text-muted">
              Le caissier voit ses tickets ; un responsable voit ceux de ses
              magasins autorisés.
            </p>
            {storeTickets
              .filter(
                (t) =>
                  (!historyDate ||
                    new Date(t.date).toLocaleDateString("en-CA") ===
                      new Date(historyDate + "T12:00:00").toLocaleDateString(
                        "en-CA",
                      )) &&
                  `${t.reference} ${customers.find((c) => c.id === t.customerId)?.name || ""} ${t.lines.map((l) => productName(l.productId)).join(" ")}`
                    .toLowerCase()
                    .includes(historySearch.toLowerCase()),
              )
              .slice()
              .reverse()
              .map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2"
                >
                  <p className="text-sm">
                    {t.reference} · {money(t.total)}
                    <span className="block text-xs text-muted">
                      {new Date(t.date).toLocaleString("fr-FR")} ·{" "}
                      {customers.find((c) => c.id === t.customerId)?.name ||
                        "Client comptoir"}
                    </span>
                    {t.returned ? " · Remboursé" : ""}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setTicketId(t.id)}
                    >
                      Voir le ticket
                    </Button>
                    {store.canManage && session && !t.returned && (
                      <Button
                        variant="danger"
                        disabled={busy}
                        size="sm"
                        onClick={() => {
                          const reason = window.prompt(
                            "Motif du remboursement intégral :",
                          );
                          if (reason)
                            void run(
                              action({
                                type: "pos.refund",
                                sessionId: session.id,
                                saleId: t.id,
                                reason,
                              }),
                            );
                        }}
                      >
                        Rembourser intégralement
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </Card>
          {ticket && (
            <Card className="mt-5 p-5">
              <section id="pos-ticket">
                <h2 className="font-semibold">
                  {store.companyName} · {store.name}
                </h2>
                <p>{ticket.reference}</p>
                <p>{new Date(ticket.date).toLocaleString("fr-FR")}</p>
                <p>
                  Client :{" "}
                  {customers.find((c) => c.id === ticket.customerId)?.name ||
                    "Comptoir"}
                </p>
                {ticket.lines.map((l) => (
                  <p key={l.productId}>
                    {productName(l.productId)} · {l.quantity} ×{" "}
                    {money(l.unitPrice)}
                  </p>
                ))}
                <p className="mt-3 font-semibold">
                  Total : {money(ticket.total)}
                </p>
                {ticket.tenders.map((t, i) => (
                  <p key={i}>
                    {t.method === "CASH" ? "Espèces" : "Carte"} :{" "}
                    {money(t.amount)}
                  </p>
                ))}
                {ticket.returned && <p>REMBOURSÉ</p>}
                <p className="mt-3 text-xs">
                  Ticket de vente interne — document non fiscal, sans
                  certification de caisse.
                </p>
              </section>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => window.print()}
              >
                Imprimer le ticket
              </Button>
            </Card>
          )}
          <Card className="mt-5 space-y-3 p-5">
            <h2 className="font-semibold">Sessions clôturées et écarts</h2>
            {data?.sessions
              .filter((s) => s.locationId === store.id && s.closedAt)
              .slice()
              .reverse()
              .map((s) => (
                <div key={s.id} className="border-b border-border pb-2 text-sm">
                  <p>
                    {new Date(s.closedAt!).toLocaleString("fr-FR")} · Attendu :{" "}
                    {money(s.expected || 0)} · Compté : {money(s.counted || 0)}{" "}
                    · Écart : {money(s.variance || 0)}
                  </p>
                  <p>
                    {s.reconciledAt
                      ? "Rapprochée"
                      : "Validation du responsable société requise"}{" "}
                    · {s.reason}
                  </p>
                  {store.canReconcile && !s.reconciledAt && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt(
                          "Motif de validation de cet écart :",
                        );
                        if (reason)
                          void run(
                            action({
                              type: "pos.reconcile",
                              sessionId: s.id,
                              reason,
                            }),
                          );
                      }}
                    >
                      Valider l’écart et ajuster le solde
                    </Button>
                  )}
                </div>
              ))}
          </Card>
        </>
      )}
    </div>
  );
}
