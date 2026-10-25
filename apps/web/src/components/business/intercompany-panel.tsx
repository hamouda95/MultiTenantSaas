"use client";
import { useState, type FormEvent } from "react";
import {
  currencyDigits,
  intercompanyOutstanding,
  type BusinessState,
} from "@saas/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function IntercompanyPanel({
  state: s,
  companyIds,
  busy,
  run,
}: {
  state: BusinessState;
  companyIds: string[];
  busy: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
}) {
  const companies = s.companies.filter(
    (c) =>
      companyIds.includes(c.id) &&
      (!c.status || c.status === "ACTIVE") &&
      c.modules.includes("finance"),
  );
  const [issuer, setIssuer] = useState(companies[0]?.id || "");
  const c = companies.find((c) => c.id === issuer) || companies[0];
  const [error, setError] = useState("");
  const rows = (s.intercompany || []).filter(
    (x) =>
      companyIds.includes(x.companyId) || companyIds.includes(x.toCompanyId),
  );
  const name = (id: string) =>
    s.companies.find((c) => c.id === id)?.name || "Société hors périmètre";
  const money = (n: number, id: string) => {
    const currency = s.companies.find((c) => c.id === id)?.currency || "TND";
    return new Intl.NumberFormat("fr-TN", {
      style: "currency",
      currency,
    }).format(n / 10 ** currencyDigits(currency));
  };
  const minor = (d: FormData, id: string) => {
    const digits = currencyDigits(
      s.companies.find((c) => c.id === id)?.currency || "TND",
    );
    const raw = String(d.get("amount") || "").replace(",", ".");
    if (!new RegExp(`^\\d+(\\.\\d{1,${Math.max(1, digits)}})?$`).test(raw))
      throw Error("Montant invalide");
    const n = Math.round(Number(raw) * 10 ** digits);
    if (!Number.isSafeInteger(n) || n <= 0) throw Error("Montant invalide");
    return n;
  };
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!c) return;
    const f = e.currentTarget,
      d = new FormData(f);
    setError("");
    try {
      if (
        await run({
          type: "intercompany.create",
          companyId: c.id,
          toCompanyId: d.get("receiver"),
          reference: d.get("reference"),
          description: d.get("description"),
          amount: minor(d, c.id),
          dueDate: d.get("due"),
        })
      )
        f.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Montant invalide");
    }
  }
  async function settle(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f),
      x = rows.find((x) => x.id === id)!;
    setError("");
    try {
      if (
        await run({
          type: "intercompany.settle",
          companyId: x.companyId,
          chargeId: id,
          receiverAccountId: d.get("bankIn"),
          payerAccountId: d.get("bankOut"),
          amount: minor(d, x.companyId),
        })
      )
        f.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Montant invalide");
    }
  }
  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">
          Prestations & règlements intragroupe
        </h2>
        <p className="mt-2 text-sm text-muted">
          Prestations de services dans une même devise : un produit chez
          l’émetteur, une charge chez le bénéficiaire et deux pièces liées. Le
          règlement met à jour les deux banques et les deux soldes ensemble. Les
          prestations internes sont éliminées dans la vue groupe lorsque les
          deux sociétés sont dans le périmètre. Ce document de gestion ne
          remplace pas une facture fiscale.
        </p>
      </div>
      {companies.length >= 2 && c && (
        <form
          onSubmit={create}
          className="grid gap-3 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3"
        >
          <label>
            Société émettrice
            <select
              aria-label="Société émettrice"
              value={c.id}
              onChange={(e) => setIssuer(e.target.value)}
              className="block w-full rounded border border-border bg-surface p-2"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Société bénéficiaire
            <select
              aria-label="Société bénéficiaire"
              name="receiver"
              className="block w-full rounded border border-border bg-surface p-2"
            >
              {companies
                .filter((x) => x.id !== c.id && x.currency === c.currency)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Référence de prestation
            <Input name="reference" required maxLength={160} />
          </label>
          <label>
            Description de la prestation
            <Input name="description" required maxLength={160} />
          </label>
          <label>
            Montant de prestation ({c.currency})
            <Input
              name="amount"
              type="number"
              min={10 ** -currencyDigits(c.currency)}
              step={10 ** -currencyDigits(c.currency)}
              required
            />
          </label>
          <label>
            Échéance de prestation
            <Input
              name="due"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <Button disabled={busy}>Enregistrer la prestation interne</Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {rows
        .slice()
        .reverse()
        .map((x) => {
          const canSettle =
            companies.some((c) => c.id === x.companyId) &&
            companies.some((c) => c.id === x.toCompanyId);
          const due = intercompanyOutstanding(s, x.receivableId);
          return (
            <article
              className="space-y-3 rounded-xl border border-border bg-surface p-5"
              key={x.id}
            >
              <h3 className="font-semibold">
                {x.reference} · {name(x.companyId)} → {name(x.toCompanyId)}
              </h3>
              <p className="text-sm">
                {x.description} · {x.date.slice(0, 10)} ·{" "}
                {money(x.amount, x.companyId)}
              </p>
              <p className="text-sm">
                Pièces : IC:{x.reference} ·{" "}
                {canSettle
                  ? `Reste à régler : ${money(due, x.companyId)}`
                  : "Voir la pièce de votre société dans Trésorerie"}
              </p>
              {canSettle && due > 0 && (
                <form
                  onSubmit={(e) => settle(e, x.id)}
                  className="grid gap-3 sm:grid-cols-3"
                >
                  <label>
                    Banque débitrice
                    <select
                      name="bankOut"
                      className="block w-full rounded border border-border bg-surface p-2"
                      required
                    >
                      {s.accounts
                        .filter(
                          (a) =>
                            a.companyId === x.toCompanyId && a.kind === "BANK",
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Banque créditrice
                    <select
                      name="bankIn"
                      className="block w-full rounded border border-border bg-surface p-2"
                      required
                    >
                      {s.accounts
                        .filter(
                          (a) =>
                            a.companyId === x.companyId && a.kind === "BANK",
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Montant du règlement interne
                    <Input
                      name="amount"
                      type="number"
                      min={
                        10 **
                        -currencyDigits(
                          s.companies.find((c) => c.id === x.companyId)
                            ?.currency || "TND",
                        )
                      }
                      step={
                        10 **
                        -currencyDigits(
                          s.companies.find((c) => c.id === x.companyId)
                            ?.currency || "TND",
                        )
                      }
                      required
                    />
                  </label>
                  <Button disabled={busy}>Régler les deux sociétés</Button>
                </form>
              )}
            </article>
          );
        })}
      {!rows.length && (
        <p className="text-sm text-muted">
          Aucune prestation intragroupe enregistrée.
        </p>
      )}
    </section>
  );
}
