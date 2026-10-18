"use client";
import { useState } from "react";
import { currencyDigits, financingOutstanding } from "@saas/types";
import type { BusinessState } from "@saas/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function minorUnits(v: string, currency: string) {
  const s = v.replace(",", "."),
    digits = currencyDigits(currency);
  if (
    !new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(1, digits)}})?$`).test(s) ||
    (!digits && s.includes("."))
  )
    throw Error("Montant ou précision de devise invalide");
  const n = Math.round(Number(s) * 10 ** digits);
  if (!Number.isSafeInteger(n)) throw Error("Montant hors limite");
  return n;
}
const select = "h-10 w-full rounded-lg border border-border bg-surface px-3";
export function ArticleCreator({
  currency,
  busy,
  run,
  canPrice,
}: {
  currency: string;
  busy: boolean;
  canPrice: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  return (
    <Card className="mb-5 space-y-4 p-5">
      <h2 className="font-semibold">Création d’article · modèle et variante</h2>
      <p className="text-xs text-muted">
        Utilisez le même modèle (ex. T9800) pour les cinq couleurs et les
        différentes tailles. Chaque variante a un SKU et un code-barres
        distincts.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            d = new FormData(form);
          setError("");
          try {
            const price = String(d.get("salePrice") || "");
            if (
              await run({
                type: "product.create",
                sku: String(d.get("sku")),
                model: String(d.get("model")),
                name: String(d.get("name")),
                brand: String(d.get("brand")),
                size: String(d.get("size")),
                color: String(d.get("color")),
                barcode: String(d.get("barcode")),
                ...(price ? { salePrice: minorUnits(price, currency) } : {}),
              })
            )
              form.reset();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          {[
            ["model", "Code modèle (ex. T9800)", true],
            ["sku", "SKU de la variante", true],
            ["name", "Désignation de l’article", true],
            ["brand", "Marque de l’article", false],
            ["color", "Couleur de l’article", true],
            ["size", "Taille de l’article", false],
            ["barcode", "Code-barres de l’article", false],
            ["salePrice", `Prix de vente de l’article (${currency})`, false],
          ]
            .filter(([name]) => name !== "salePrice" || canPrice)
            .map(([name, label, required]) => (
              <label key={String(name)} className="text-sm">
                {label}
                <Input
                  name={String(name)}
                  required={Boolean(required)}
                  maxLength={name === "barcode" ? 80 : 160}
                  inputMode={name === "salePrice" ? "decimal" : undefined}
                />
              </label>
            ))}
          <Button type="submit">Créer l’article</Button>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
export function FinancingPanel({
  state: s,
  companyId,
  currency,
  editable,
  busy,
  run,
}: {
  state: BusinessState;
  companyId: string;
  currency: string;
  editable: boolean;
  busy: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const banks = s.accounts.filter(
      (a) => a.companyId === companyId && a.kind === "BANK",
    ),
    loans = (s.financings || []).filter((f) => f.companyId === companyId);
  const money = (n: number) =>
    new Intl.NumberFormat("fr-TN", { style: "currency", currency }).format(
      n / 10 ** currencyDigits(currency),
    );
  return (
    <Card className="mb-5 space-y-5 p-5">
      <h2 className="font-semibold">Financement banque · achats</h2>
      <p className="text-xs text-muted">
        Suivi des crédits confirmés hors application : le déblocage crédite le
        compte bancaire et crée une dette, jamais du chiffre d’affaires. Les
        intérêts saisis sont le coût total convenu ; aucune connexion ni demande
        de prêt à la banque n’est déclenchée.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Référence / banque",
                "Achat lié",
                "Échéance",
                "Capital restant",
                "Intérêts restants",
                "Statut",
              ].map((h) => (
                <th key={h} className="border-b border-border p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loans.map((f) => {
              const due = financingOutstanding(s, f.id);
              return (
                <tr key={f.id}>
                  <td className="p-2">
                    {f.reference} · {f.bank}
                  </td>
                  <td className="p-2">
                    {s.orders.find((o) => o.id === f.orderId)?.reference ||
                      "Non affecté"}
                  </td>
                  <td className="p-2">{f.dueDate}</td>
                  <td className="p-2">
                    {money(f.drawnAt ? due.principal : f.principal)}
                  </td>
                  <td className="p-2">
                    {money(f.drawnAt ? due.interest : f.interest)}
                  </td>
                  <td className="p-2">
                    {f.drawnAt ? (
                      due.total ? (
                        "En remboursement"
                      ) : (
                        "Soldé"
                      )
                    ) : (
                      <>
                        <p>À débloquer</p>
                        {editable && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              run({ type: "financing.draw", financingId: f.id })
                            }
                          >
                            Confirmer le déblocage
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loans.length && (
          <p className="py-3 text-sm text-muted">
            Aucun financement enregistré.
          </p>
        )}
      </div>
      {editable && (
        <>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                d = new FormData(form);
              setError("");
              try {
                const orderId = String(d.get("orderId"));
                if (
                  await run({
                    type: "financing.create",
                    reference: String(d.get("reference")),
                    bank: String(d.get("bank")),
                    accountId: String(d.get("accountId")),
                    ...(orderId ? { orderId } : {}),
                    principal: minorUnits(String(d.get("principal")), currency),
                    interest: minorUnits(String(d.get("interest")), currency),
                    dueDate: String(d.get("dueDate")),
                  })
                )
                  form.reset();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <fieldset
              disabled={busy || !banks.length}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="text-sm">
                Référence financement
                <Input name="reference" required maxLength={160} />
              </label>
              <label className="text-sm">
                Banque prêteuse
                <Input name="bank" required maxLength={160} />
              </label>
              <label className="text-sm">
                Compte de déblocage
                <select
                  name="accountId"
                  aria-label="Compte de déblocage"
                  required
                  className={select}
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Commande financée
                <select
                  name="orderId"
                  aria-label="Commande financée"
                  className={select}
                >
                  <option value="">Non affecté</option>
                  {s.orders
                    .filter(
                      (o) =>
                        o.companyId === companyId && o.status !== "CANCELLED",
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.reference}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm">
                Capital financé ({currency})
                <Input name="principal" inputMode="decimal" required />
              </label>
              <label className="text-sm">
                Intérêts et frais convenus ({currency})
                <Input
                  name="interest"
                  inputMode="decimal"
                  defaultValue="0"
                  required
                />
              </label>
              <label className="text-sm">
                Échéance finale du crédit
                <Input
                  name="dueDate"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <Button type="submit">Enregistrer le financement</Button>
            </fieldset>
          </form>
          {!banks.length && (
            <p className="text-sm text-muted">
              Créez d’abord un compte de type Banque dans Banques & trésorerie.
            </p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                d = new FormData(form);
              setError("");
              try {
                if (
                  await run({
                    type: "financing.repay",
                    financingId: String(d.get("financingId")),
                    accountId: String(d.get("accountId")),
                    principal: minorUnits(String(d.get("principal")), currency),
                    interest: minorUnits(String(d.get("interest")), currency),
                  })
                )
                  form.reset();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <fieldset
              disabled={busy || !banks.length}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="text-sm">
                Crédit à rembourser
                <select
                  name="financingId"
                  aria-label="Crédit à rembourser"
                  required
                  className={select}
                >
                  <option value="">Choisir un crédit débloqué</option>
                  {loans
                    .filter(
                      (f) =>
                        f.drawnAt && financingOutstanding(s, f.id).total > 0,
                    )
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.reference}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm">
                Compte de remboursement
                <select
                  name="accountId"
                  aria-label="Compte de remboursement"
                  required
                  className={select}
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Capital remboursé ({currency})
                <Input
                  name="principal"
                  required
                  inputMode="decimal"
                  defaultValue="0"
                />
              </label>
              <label className="text-sm">
                Intérêts payés ({currency})
                <Input
                  name="interest"
                  required
                  inputMode="decimal"
                  defaultValue="0"
                />
              </label>
              <Button type="submit">Enregistrer le remboursement</Button>
            </fieldset>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <h3 className="text-sm font-semibold">Historique des remboursements</h3>
      <ul className="max-h-48 space-y-2 overflow-auto text-sm">
        {(s.financingPayments || [])
          .filter((p) => p.companyId === companyId)
          .slice()
          .reverse()
          .map((p) => (
            <li key={p.id}>
              {new Date(p.date).toLocaleString("fr-FR")} ·{" "}
              {loans.find((f) => f.id === p.financingId)?.reference} · Capital{" "}
              {money(p.principal)} + intérêts {money(p.interest)}
            </li>
          ))}
      </ul>
    </Card>
  );
}
