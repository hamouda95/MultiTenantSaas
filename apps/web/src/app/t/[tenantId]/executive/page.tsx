"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { companyMetrics, currencyDigits, periodOperatingResult } from "@saas/types";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";

const fmt = (value: number, currency: string) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value / 10 ** currencyDigits(currency));

export default function ExecutiveDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [reportYear, setReportYear] = useState(2025);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["business", tenantId],
    queryFn: () => api.business(tenantId),
    retry: false,
  });
  const companies = useMemo(() => data?.state.companies.map((company) => ({
    company, metrics: companyMetrics(data.state, company),
    stores: data.state.locations.filter((l) => l.companyId === company.id && l.kind === "STORE").length,
  })) ?? [], [data]);
  if (isLoading) return <p role="status" className="text-muted">Chargement des indicateurs…</p>;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const currencies = new Set(companies.map((x) => x.company.currency));
  const commonCurrency = currencies.size === 1 ? companies[0]?.company.currency : null;
  const total = (key: keyof ReturnType<typeof companyMetrics>) =>
    companies.reduce((sum, x) => sum + x.metrics[key], 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Pilotage CEO / CFO" description="Vue des sociétés accessibles dans ce holding. Indicateurs calculés à partir des opérations enregistrées, sans données simulées." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardTitle>Sociétés</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{companies.length}</CardContent></Card>
        <Card><CardHeader><CardTitle>Magasins</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{companies.reduce((n, x) => n + x.stores, 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Commandes ouvertes</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{total("openOrders")}</CardContent></Card>
      </div>
      {commonCurrency ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["Chiffre d’affaires enregistré", "revenue"],
            ["Marge brute", "grossMargin"],
            ["Contribution après charges", "operatingContribution"],
            ["Banques et caisses", "bankCash"],
            ["Créances clients", "receivables"],
            ["Dettes fournisseurs", "payables"],
            ["Valeur du stock (coût)", "inventory"],
            ["Trésorerie indicative à 30 jours", "cash30"],
          ] as const).map(([label, key]) => (
            <Card key={key}><CardHeader><CardTitle>{label}</CardTitle></CardHeader>
              <CardContent className="text-xl font-semibold">{fmt(key === "bankCash" ? total("bank") + total("cash") : total(key), commonCurrency)}</CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-border p-4 text-sm text-muted">
          {companies.length === 0 ? "Aucune société accessible. Créez ou rejoignez une société depuis Gestion du holding." :
            "Devises différentes : les montants ne sont pas additionnés. Consultez les résultats par société ci-dessous ; aucune conversion implicite n’est appliquée."}
        </p>
      )}
      <Card>
        <CardHeader><CardTitle>Résultats par société</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr>{["Société", "CA", "Marge brute", "Contribution", "Banque + caisse", "Stock", "Magasins"].map((h) =>
                <th key={h} scope="col" className="border-b border-border p-3 font-medium text-muted">{h}</th>)}</tr></thead>
              <tbody>{companies.map(({ company, metrics, stores }) =>
                <tr key={company.id}>
                  <th scope="row" className="border-b border-border p-3 font-medium">{company.name}</th>
                  {[metrics.revenue, metrics.grossMargin, metrics.operatingContribution, metrics.bank + metrics.cash, metrics.inventory].map((v, i) =>
                    <td key={i} className="whitespace-nowrap border-b border-border p-3">{fmt(v, company.currency)}</td>)}
                  <td className="border-b border-border p-3">{stores}</td>
                </tr>)}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Résultat opérationnel annuel — {reportYear}</CardTitle></CardHeader>
        <CardContent>
          <label htmlFor="report-year" className="mb-3 block text-sm font-medium">Exercice</label>
          <select id="report-year" className="mb-4 rounded-lg border border-border bg-surface px-3 py-2" value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))}>
            {[2024, 2025, 2026].map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr>{["Société", "Ventes nettes des retours", "Coût des ventes", "Marge brute", "Charges enregistrées", "Contribution"].map((label) => <th key={label} scope="col" className="border-b border-border p-3">{label}</th>)}</tr></thead>
            <tbody>{companies.map(({ company }) => {
              const result = periodOperatingResult(data!.state, company, reportYear);
              return <tr key={company.id}><th scope="row" className="border-b border-border p-3">{company.name}</th>
                {[result.revenue, result.costOfGoodsSold, result.grossProfit, result.operatingExpenses, result.operatingContribution].map((amount, index) => <td key={index} className="whitespace-nowrap border-b border-border p-3">{fmt(amount, company.currency)}</td>)}</tr>;
            })}</tbody>
          </table></div>
          <p className="mt-3 text-xs text-muted">Résultat opérationnel indicatif, filtré par date de vente et de charge. Pas de clôture comptable, fiscalité, amortissements ou consolidation intersociétés.</p>
        </CardContent>
      </Card>
      <p className="text-xs text-muted">
        Ces montants sont des indicateurs opérationnels cumulés sur les données visibles, pas des états financiers certifiés ni un compte de résultat annuel. Les prévisions à 30 jours utilisent les échéances connues et n'incluent pas les flux non enregistrés.
      </p>
    </div>
  );
}
