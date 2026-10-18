"use client";
import { useState } from "react";
import {
  groupAnnual,
  companyMetrics,
  currencyDigits,
  invoicePaid,
  transitValue,
  type BusinessState,
} from "@saas/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function GroupDashboard({
  state: s,
  companyIds,
  onCompany,
}: {
  state: BusinessState;
  companyIds: string[];
  onCompany: (id: string, view?: string) => void;
}) {
  const [year, setYear] = useState(
    s.demoNotes?.[0]?.year || new Date().getFullYear(),
  );
  const [from, setFrom] = useState(1),
    [to, setTo] = useState(12);
  const [chosen, setCurrency] = useState("");
  const companies = s.companies.filter((c) => companyIds.includes(c.id));
  const currencies = [...new Set(companies.map((c) => c.currency))];
  const currency = currencies.includes(chosen)
    ? chosen
    : currencies[0] || "TND";
  const report = groupAnnual(s, companyIds, year, currency, from, to),
    ids = new Set(report.companies.map((r) => r.company.id));
  const m = report.companies.map((r) => ({
    company: r.company,
    ...companyMetrics(s, r.company),
  }));
  const internal = new Set(
    (s.intercompany || [])
      .filter((x) => ids.has(x.companyId) && ids.has(x.toCompanyId))
      .map((x) => x.id),
  );
  const outstanding = (kind: string) =>
    s.invoices
      .filter(
        (i) =>
          ids.has(i.companyId) &&
          i.kind === kind &&
          (!i.intercompanyId || !internal.has(i.intercompanyId)),
      )
      .reduce((n, i) => n + Math.max(0, i.amount - invoicePaid(s, i.id)), 0);
  const tasks = [
    ...s.orders
      .filter((o) => ids.has(o.companyId) && o.status === "DRAFT")
      .map((o) => ({
        id: o.id,
        companyId: o.companyId,
        label: `À approuver · ${o.reference}`,
        view: "purchasing",
      })),
    ...s.orders
      .filter(
        (o) =>
          ids.has(o.companyId) &&
          ["CUSTOMS", "PARTIALLY_RECEIVED"].includes(o.status),
      )
      .map((o) => ({
        id: o.id,
        companyId: o.companyId,
        label: `À réceptionner · ${o.reference}`,
        view: "receipts",
      })),
    ...(s.customerOrders || [])
      .filter(
        (o) =>
          ids.has(o.companyId) &&
          ["CONFIRMED", "PARTIALLY_DELIVERED"].includes(o.status),
      )
      .map((o) => ({
        id: o.id,
        companyId: o.companyId,
        label: `À livrer · ${o.reference}`,
        view: "customerOrders",
      })),
    ...(s.transfers || [])
      .filter((t) => ids.has(t.companyId) && t.status === "IN_TRANSIT")
      .map((t) => ({
        id: t.id,
        companyId: t.companyId,
        label: `En transit · ${t.reference}`,
        view: "transfers",
      })),
    ...s.invoices
      .filter(
        (i) =>
          ids.has(i.companyId) &&
          i.dueDate < new Date().toISOString().slice(0, 10) &&
          i.amount > invoicePaid(s, i.id),
      )
      .map((i) => ({
        id: i.id,
        companyId: i.companyId,
        label: `Échéance dépassée · ${i.reference}`,
        view: i.intercompanyId ? "intercompany" : "finance",
      })),
  ];
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-TN", { style: "currency", currency }).format(
      n / 10 ** currencyDigits(currency),
    );
  const cash = m.reduce((n, x) => n + x.bank + x.cash, 0),
    inventory = m.reduce((n, x) => n + x.inventory, 0),
    transit = m.reduce((n, x) => n + transitValue(s, x.company.id), 0);
  function download() {
    const quote = (x: unknown) => `"${String(x).replace(/"/g, '""')}"`;
    const d = currencyDigits(currency);
    const r = report.consolidated;
    const rows = [
      ["Consolidation de gestion", year, `${from}-${to}`, currency],
      ["Poste", "Montant"],
      ["CA avant élimination", report.total.revenue / 10 ** d],
      ["Élimination CA intragroupe", report.elimination / 10 ** d],
      ["CA consolidé", r.revenue / 10 ** d],
      ["Coût vendu", r.cogs / 10 ** d],
      ["Marge brute", r.grossMargin / 10 ** d],
      ["Charges hors intragroupe", r.expenses / 10 ** d],
      ["Coût employeur", r.payroll / 10 ** d],
      ["Intérêts", r.interest / 10 ** d],
      ["Résultat avant impôts et amortissements", r.beforeTax / 10 ** d],
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(quote).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `groupe-${year}-${currency}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-xl font-semibold">
            Pilotage & consolidation du groupe
          </h2>
          <Button onClick={download} variant="secondary">
            Exporter la consolidation
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Périmètre : sociétés autorisées, y compris sociétés archivées pour
          conserver leur historique. Consolidation de gestion par devise, avec
          élimination des prestations intragroupe enregistrées entre sociétés du
          périmètre. Aucune conversion implicite ni consolidation légale.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <label>
            Exercice
            <Input
              aria-label="Exercice groupe"
              className="w-28"
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label>
            Du mois
            <select
              aria-label="Premier mois groupe"
              className="block rounded border border-border bg-surface p-2"
              value={from}
              onChange={(e) => {
                const n = Number(e.target.value);
                setFrom(n);
                if (n > to) setTo(n);
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Au mois
            <select
              aria-label="Dernier mois groupe"
              className="block rounded border border-border bg-surface p-2"
              value={to}
              onChange={(e) => {
                const n = Number(e.target.value);
                setTo(n);
                if (n < from) setFrom(n);
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Devise
            <select
              aria-label="Devise groupe"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="block rounded border border-border bg-surface p-2"
            >
              {currencies.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["CA consolidé · période", report.consolidated.revenue],
          ["Marge brute · période", report.consolidated.grossMargin],
          [
            "Résultat avant impôts et amortissements · période",
            report.consolidated.beforeTax,
          ],
          ["Banques + caisses · situation actuelle", cash],
          ["Stock détenu, transit inclus · actuel", inventory],
          ["Marchandises en transit · actuel", transit],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{fmt(Number(value))}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="mb-3 font-semibold">
          Passage des comptes sociétés à la vue groupe
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <p>
            CA avant éliminations
            <br />
            <strong>{fmt(report.total.revenue)}</strong>
          </p>
          <p>
            Prestations internes éliminées
            <br />
            <strong>{fmt(report.elimination)}</strong>
          </p>
          <p>
            CA après éliminations
            <br />
            <strong>{fmt(report.consolidated.revenue)}</strong>
          </p>
          <p>
            Créances hors périmètre · actuelles
            <br />
            <strong>{fmt(outstanding("RECEIVABLE"))}</strong>
          </p>
          <p>
            Dettes hors périmètre · actuelles
            <br />
            <strong>{fmt(outstanding("PAYABLE"))}</strong>
          </p>
          <p>
            Coût employeur · période
            <br />
            <strong>{fmt(report.consolidated.payroll)}</strong>
          </p>
        </div>
        <p className="mt-3 text-xs text-muted">
          Une prestation interne diminue simultanément le CA et les charges au
          niveau groupe ; elle ne change pas le résultat cumulé. Les positions
          de trésorerie et de stock sont actuelles, indépendantes de la période
          du P&L. Les ventes internes de marchandises, marges latentes,
          amortissements et impôts ne sont pas retraités.
        </p>
      </div>
      <div className="overflow-auto rounded-xl border border-border bg-surface p-5">
        <table className="w-full text-right text-sm">
          <caption className="mb-3 text-left font-semibold">
            Contributions par société, avant éliminations
          </caption>
          <thead>
            <tr>
              <th className="p-2 text-left">Société</th>
              <th className="p-2">CA de la période</th>
              <th className="p-2">Résultat de la période</th>
              <th className="p-2">Trésorerie actuelle</th>
              <th className="p-2">Stock actuel</th>
              <th className="p-2">Ouvrir</th>
            </tr>
          </thead>
          <tbody>
            {report.companies.map((r) => {
              const current = m.find((x) => x.company.id === r.company.id)!;
              return (
                <tr key={r.company.id} className="border-t border-border">
                  <th className="p-2 text-left">
                    {r.company.name}
                    <p className="text-xs font-normal text-muted">
                      {r.company.status || "ACTIVE"}
                    </p>
                  </th>
                  <td className="p-2">{fmt(r.total.revenue)}</td>
                  <td className="p-2">{fmt(r.total.beforeTax)}</td>
                  <td className="p-2">{fmt(current.bank + current.cash)}</td>
                  <td className="p-2">{fmt(current.inventory)}</td>
                  <td className="p-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onCompany(r.company.id)}
                    >
                      Consulter
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="font-semibold">Documents à traiter · {tasks.length}</h3>
        <p className="mb-3 text-sm text-muted">
          Approbations, réceptions, transferts et échéances de toutes les
          sociétés du périmètre. Les actions restent réservées au rôle concerné.
        </p>
        {tasks.slice(0, 30).map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 text-sm"
          >
            <span>
              {t.label}
              <small className="block text-muted">
                {companies.find((c) => c.id === t.companyId)?.name}
              </small>
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onCompany(t.companyId, t.view)}
            >
              Traiter le document
            </Button>
          </div>
        ))}
        {!tasks.length && (
          <p className="text-sm text-muted">
            Aucun document en attente dans ce périmètre.
          </p>
        )}
        {tasks.length > 30 && (
          <p className="text-sm text-muted">
            30 premières tâches affichées. Consultez les listes par société pour
            la suite.
          </p>
        )}
      </div>
    </section>
  );
}
