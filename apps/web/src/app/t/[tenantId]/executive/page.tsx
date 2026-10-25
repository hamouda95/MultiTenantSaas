"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, Package, ShoppingCart, Wallet, ArrowRight } from "lucide-react";
import { companyMetrics, currencyDigits } from "@saas/types";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency }).format(
    value / 10 ** currencyDigits(currency),
  );
}

/** Lecture seule : les sociétés et indicateurs proviennent de l'API autorisée du tenant. */
export default function GroupExecutivePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["business", tenantId],
    queryFn: () => api.business(tenantId),
    retry: false,
  });

  if (isLoading) return <p role="status" className="text-muted">Chargement du pilotage groupe…</p>;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const companies = data?.state.companies ?? [];
  const rows = companies.map((company) => ({
    company,
    metrics: companyMetrics(data!.state, company),
    stores: data!.state.locations.filter((location) =>
      location.companyId === company.id && location.kind === "STORE").length,
  }));
  const totalStores = rows.reduce((sum, row) => sum + row.stores, 0);
  const totalOrders = rows.reduce((sum, row) => sum + row.metrics.openOrders, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pilotage du groupe"
        description="Vue opérationnelle des sociétés autorisées. Montants issus des opérations enregistrées, non certifiés comptablement."
        actions={<Link href={`/t/${tenantId}/business`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">Opérations ERP <ArrowRight className="h-4 w-4" /></Link>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Sociétés accessibles", value: companies.length, icon: Building2 },
          { label: "Magasins", value: totalStores, icon: Package },
          { label: "Commandes ouvertes", value: totalOrders, icon: ShoppingCart },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4" />{label}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{value}</CardContent></Card>
        ))}
      </div>
      <section aria-labelledby="companies-heading" className="space-y-3">
        <h2 id="companies-heading" className="text-xl font-semibold">Performance par société</h2>
        {rows.length === 0 ? <p className="rounded-lg border border-border p-5 text-muted">Aucune société accessible.</p> :
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ company, metrics, stores }) => (
              <Card key={company.id}>
                <CardHeader><CardTitle className="flex items-center justify-between gap-3"><span>{company.name}</span><span className="text-sm font-normal text-muted">{company.currency}</span></CardTitle></CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      ["Chiffre d'affaires", money(metrics.revenue, company.currency)],
                      ["Marge brute", money(metrics.grossMargin, company.currency)],
                      ["Banques et caisses", money(metrics.bank + metrics.cash, company.currency)],
                      ["Valeur du stock", money(metrics.inventory, company.currency)],
                      ["Créances clients", money(metrics.receivables, company.currency)],
                      ["Dettes fournisseurs", money(metrics.payables, company.currency)],
                    ].map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
                  </dl>
                  <p className="mt-4 border-t border-border pt-3 text-xs text-muted">{stores} magasin(s) · {metrics.openOrders} commande(s) ouverte(s)</p>
                </CardContent>
              </Card>
            ))}
          </div>}
      </section>
      <div className="flex items-start gap-2 rounded-lg border border-border p-4 text-sm text-muted">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Les devises ne sont jamais additionnées implicitement. Ce tableau présente des indicateurs de gestion, pas une consolidation comptable ou fiscale.</p>
      </div>
    </div>
  );
}
