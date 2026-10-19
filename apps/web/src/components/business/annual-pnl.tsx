"use client";
import { useState } from "react";
import {
  annualPnl,
  groupAnnual,
  currencyDigits,
  type BusinessState,
} from "@saas/types";
import { Button } from "@/components/ui/button";

export function AnnualPnl({
  state,
  companyId,
}: {
  state: BusinessState;
  companyId?: string;
}) {
  const [year, setYear] = useState(
    state.demoNotes?.[0]?.year || new Date().getFullYear(),
  );
  const companies = state.companies.filter(
    (c) => !companyId || c.id === companyId,
  );
  const currencies = [...new Set(companies.map((c) => c.currency))];
  const [chosen, setChosen] = useState("");
  const currency = currencies.includes(chosen)
    ? chosen
    : currencies[0] || "TND";
  const rows = companies
    .filter((c) => c.currency === currency)
    .map((c) => ({ company: c, ...annualPnl(state, c.id, year) }));
  const keys = [
    "revenue",
    "cogs",
    "grossMargin",
    "expenses",
    "payroll",
    "operating",
    "interest",
    "beforeTax",
  ] as const;
  const labels = [
    "Chiffre d’affaires net",
    "Coût des articles vendus",
    "Marge brute",
    "Charges d’exploitation",
    "Salaires + charges simulées",
    "Résultat d’exploitation",
    "Intérêts payés",
    "Résultat avant impôts et amortissements",
  ];
  const total = (key: (typeof keys)[number], month?: number) =>
    groupAnnual(
      state,
      rows.map((r) => r.company.id),
      year,
      currency,
      month === undefined ? 1 : month + 1,
      month === undefined ? 12 : month + 1,
    ).consolidated[key];
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-TN", { style: "currency", currency }).format(
      n / 10 ** currencyDigits(currency),
    );
  function download() {
    const quote = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const data = [
      [`P&L de gestion ${year}`, currency],
      [
        "Poste",
        ...Array.from(
          { length: 12 },
          (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
        ),
        "Total",
      ],
      ...keys.map((k, i) => [
        labels[i],
        ...Array.from({ length: 12 }, (_, m) =>
          (total(k, m) / 10 ** currencyDigits(currency)).toFixed(
            currencyDigits(currency),
          ),
        ),
        (total(k) / 10 ** currencyDigits(currency)).toFixed(
          currencyDigits(currency),
        ),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + data.map((r) => r.map(quote).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnl-${year}-${currency}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      data-pnl-report
      className="space-y-5 rounded-xl border border-border bg-surface p-5"
    >
      <style jsx global>{`
        @media print {
          @page {
            size: A3 landscape;
            margin: 10mm;
          }
          body * {
            visibility: hidden;
          }
          [data-pnl-report],
          [data-pnl-report] * {
            visibility: visible;
          }
          [data-pnl-report] {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            padding: 0;
            border: 0;
            background: white;
            color: black;
          }
          [data-pnl-report] .overflow-x-auto {
            overflow: visible;
          }
          [data-pnl-report] table {
            font-size: 8pt;
            break-inside: avoid;
          }
          [data-pnl-report] th,
          [data-pnl-report] td {
            padding: 4px;
          }
          [data-pnl-report] input,
          [data-pnl-report] select {
            border: 0;
          }
          [data-pnl-report] button {
            display: none;
          }
        }
      `}</style>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl font-semibold">P&L annuel du holding</h2>
        <label>
          Exercice{" "}
          <input
            aria-label="Exercice P&L"
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 rounded border border-border bg-surface p-2"
          />
        </label>
        <label>
          Devise{" "}
          <select
            aria-label="Devise P&L"
            value={currency}
            onChange={(e) => setChosen(e.target.value)}
            className="rounded border border-border bg-surface p-2"
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={download}>
          Exporter CSV
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimer / PDF
        </Button>
      </div>
      <p className="text-sm text-muted">
        Rapport de gestion, hors TVA, impôts, amortissements et éliminations
        intragroupe. Ventes et retours à leur date, salaires au mois
        comptabilisé ; autres charges et intérêts selon les écritures saisies.
        Les achats de stock et remboursements de capital ne sont pas des
        charges. Aucune conversion de devise.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["revenue", "grossMargin", "beforeTax"] as const).map((k) => (
          <div key={k} className="rounded-lg bg-background p-4">
            <p className="text-sm text-muted">{labels[keys.indexOf(k)]}</p>
            <p className="text-2xl font-semibold">{fmt(total(k))}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <caption className="mb-3 text-left font-semibold">
            Exercice {year} · {rows.length} sociétés · {currency}
          </caption>
          <thead>
            <tr>
              <th className="p-2 text-left">Poste</th>
              {Array.from({ length: 12 }, (_, i) => (
                <th className="p-2" key={i}>
                  {new Intl.DateTimeFormat("fr", {
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(Date.UTC(year, i, 1)))}
                </th>
              ))}
              <th className="p-2">Annuel</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k, i) => (
              <tr key={k} className="border-t border-border">
                <th className="whitespace-nowrap p-2 text-left">{labels[i]}</th>
                {Array.from({ length: 12 }, (_, m) => (
                  <td className="whitespace-nowrap p-2" key={m}>
                    {fmt(total(k, m))}
                  </td>
                ))}
                <td className="whitespace-nowrap p-2 font-semibold">
                  {fmt(total(k))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <caption className="mb-3 text-left font-semibold">
            Contribution de chaque société
          </caption>
          <thead>
            <tr>
              <th className="p-2 text-left">Société</th>
              <th>CA net</th>
              <th>Marge brute</th>
              <th>Salaires + charges</th>
              <th>Résultat avant impôts et amortissements</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.company.id} className="border-t border-border">
                <th className="p-2 text-left">{r.company.name}</th>
                {(
                  ["revenue", "grossMargin", "payroll", "beforeTax"] as const
                ).map((k) => (
                  <td className="p-2" key={k}>
                    {fmt(r.total[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
