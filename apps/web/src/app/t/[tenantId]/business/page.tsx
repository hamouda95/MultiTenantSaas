"use client";
import {
  useRef,
  useState,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Wallet,
  Package,
  ShoppingCart,
  TrendingUp,
  Sparkles,
  RefreshCw,
  Download,
} from "lucide-react";
import {
  accountBalance,
  companyMetrics,
  currencyDigits,
  invoicePaid,
  productStock,
  replenishment,
} from "@saas/types";
import type { BusinessState, BusinessCompany, BusinessLine } from "@saas/types";
import { GroupDashboard } from "@/components/business/group-dashboard";
import { IntercompanyPanel } from "@/components/business/intercompany-panel";
import { ReceivingPanel } from "@/components/business/receiving-panel";
import { TransferPanel } from "@/components/business/transfer-panel";
import { AnnualPnl } from "@/components/business/annual-pnl";
import { HrPanel } from "@/components/business/hr-panel";
import { SupplierSamples } from "@/components/business/supplier-samples";
import { InventoryAnalysis } from "@/components/business/inventory-analysis";
import { PartnerDirectory } from "@/components/business/partner-directory";
import {
  ArticleCreator,
  FinancingPanel,
} from "@/components/business/purchasing-tools";
import Link from "next/link";
import { versionedQuery } from "@/lib/versioned-query";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/states";

const today = () => new Date().toISOString().slice(0, 10);
const modules = [
  "purchasing",
  "inventory",
  "sales",
  "finance",
  "intelligence",
  "hr",
];
const moduleLabels: Record<string, string> = {
  purchasing: "Achats & import",
  inventory: "Stocks & distribution",
  sales: "Ventes",
  finance: "Trésorerie",
  intelligence: "Recommandations",
  hr: "Ressources humaines",
};
const statusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  APPROVED: "Approuvée",
  ORDERED: "Commandée",
  SHIPPED: "Expédiée",
  CUSTOMS: "Douane",
  RECEIVED: "Réceptionnée",
  PARTIALLY_RECEIVED: "Réception partielle",
  CANCELLED: "Annulée",
};
const tabs = [
  ["group", "Pilotage groupe"],
  ["receipts", "Réceptions fournisseurs"],
  ["transfers", "Transferts suivis"],
  ["intercompany", "Intragroupe"],
  ["overview", "Vue holding"],
  ["companies", "Sociétés & configuration"],
  ["catalog", "Catalogue & réseau"],
  ["samples", "Échantillons & commandes"],
  ["purchasing", "Achats & imports"],
  ["inventory", "Stocks & transferts"],
  ["sales", "Ventes"],
  ["finance", "Banques & trésorerie"],
  ["intelligence", "Intelligence"],
  ["hr", "Ressources humaines"],
  ["pnl", "P&L annuel"],
  ["access", "Accès sociétés"],
] as const;
const selectClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm";
function money(n: number, currency: string) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency }).format(
    n / 10 ** currencyDigits(currency),
  );
}
function amount(v: FormDataEntryValue | null, currency: string) {
  const s = String(v || "0").replace(",", ".");
  const digits = currencyDigits(currency);
  if (
    !new RegExp(`^\\d+(\\.\\d{1,${Math.max(1, digits)}})?$`).test(s) ||
    (digits === 0 && s.includes("."))
  )
    throw new Error("Montant invalide pour cette devise");
  const value = Math.round(Number(s) * 10 ** digits);
  if (!Number.isSafeInteger(value)) throw new Error("Montant hors limite");
  return value;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
function Text({
  name,
  label,
  type = "text",
  value,
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <Input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={160}
        step={type === "number" ? "any" : undefined}
      />
    </Field>
  );
}
function Select({
  name,
  label,
  options,
  value,
  required = true,
}: {
  name: string;
  label: string;
  options: { id: string; name: string }[];
  value?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        name={name}
        className={selectClass}
        defaultValue={value || ""}
        required={required}
      >
        <option value="">Choisir…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-border px-3 py-3 font-medium text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td
                  key={j}
                  className="border-b border-border px-3 py-3 align-top"
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          Aucune donnée enregistrée.
        </p>
      )}
    </div>
  );
}
function Form({
  title,
  children,
  onSubmit,
  busy,
  button = "Enregistrer",
}: {
  title: string;
  children: ReactNode;
  onSubmit: (d: FormData) => Promise<boolean>;
  busy: boolean;
  button?: string;
}) {
  return (
    <Panel title={title}>
      <form
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const form = e.currentTarget;
          if (await onSubmit(new FormData(form))) form.reset();
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          {children}
          <div className="flex items-end">
            <Button type="submit" loading={busy}>
              {button}
            </Button>
          </div>
        </fieldset>
      </form>
    </Panel>
  );
}
function Lines({
  products,
  currency,
}: {
  products: BusinessState["products"];
  currency: string;
}) {
  const [count, setCount] = useState(1);
  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-sm font-medium">
        Lignes produits — prix en {currency}
      </p>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-3">
          <Select
            name={`product${i}`}
            label={`Produit ${i + 1}`}
            options={products.map((p) => ({
              id: p.id,
              name: `${p.sku} · ${p.name} ${p.size} ${p.color}`,
            }))}
          />
          <Text
            name={`quantity${i}`}
            label="Quantité entière"
            type="number"
            value="1"
          />
          <Text
            name={`price${i}`}
            label="Prix unitaire"
            type="number"
            value="0"
          />
        </div>
      ))}
      <input type="hidden" name="lineCount" value={count} />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={count >= 20}
        onClick={() => setCount(count + 1)}
      >
        Ajouter une ligne
      </Button>
      {count > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCount(count - 1)}
        >
          Retirer la dernière
        </Button>
      )}
    </div>
  );
}
function readLines(d: FormData, currency: string): BusinessLine[] {
  return Array.from({ length: Number(d.get("lineCount")) }, (_, i) => ({
    productId: String(d.get(`product${i}`)),
    quantity: Number(d.get(`quantity${i}`)),
    unitPrice: amount(d.get(`price${i}`), currency),
  }));
}
type Run = (action: Record<string, unknown>) => Promise<boolean>;
function CompanyWizard({
  company,
  run,
  busy,
}: {
  company?: BusinessCompany;
  run: Run;
  busy: boolean;
}) {
  const [review, setReview] = useState<Omit<BusinessCompany, "id"> | null>(
    null,
  );
  const [error, setError] = useState("");
  return (
    <Panel
      title={
        company
          ? "Configurer la société"
          : "Créer une société — formulaire du responsable"
      }
    >
      {review ? (
        <div className="space-y-4">
          <p className="font-semibold">
            Vérifier avant activation : {review.name}
          </p>
          <p>
            {review.country} · {review.currency} · Marques :{" "}
            {review.brands.join(", ") || "À définir"}
          </p>
          <p>
            Délai {review.leadDays} jours · Couverture {review.coverDays} jours
            · Minimum {review.minimumStock} unités par magasin et variante.
          </p>
          <p>{review.modules.map((m) => moduleLabels[m]).join(" → ")}</p>
          <p className="text-sm text-muted">
            Achats : brouillon → approbation → commande → expédition → douane →
            réception. La réception crée le stock et la dette fournisseur. Les
            ventes créent les créances. Les virements bancaires réels restent
            externes.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Modifier
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (
                  await run(
                    company
                      ? {
                          type: "company.configure",
                          companyId: company.id,
                          data: review,
                        }
                      : { type: "company.create", data: review },
                  )
                )
                  setReview(null);
              }}
            >
              Confirmer la configuration
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            const d = new FormData(e.currentTarget);
            const enabled = d.getAll("modules").map(String);
            if (
              (enabled.includes("purchasing") || enabled.includes("sales")) &&
              (!enabled.includes("inventory") || !enabled.includes("finance"))
            ) {
              setError(
                "Les achats et ventes nécessitent les modules stock et finance.",
              );
              return;
            }
            setReview({
              name: String(d.get("name")).trim(),
              country: String(d.get("country")).trim(),
              currency: company?.currency || String(d.get("currency")),
              brands: String(d.get("brands"))
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
              leadDays: Number(d.get("leadDays")),
              coverDays: Number(d.get("coverDays")),
              minimumStock: Number(d.get("minimumStock")),
              modules: enabled,
            });
          }}
        >
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <Text name="name" label="Nom de la société" value={company?.name} />
            <Text
              name="country"
              label="Pays"
              value={company?.country || "Tunisie"}
            />
            {company ? (
              <p className="text-sm">Devise fixe : {company.currency}</p>
            ) : (
              <Select
                name="currency"
                label="Devise comptable"
                value="TND"
                options={[
                  "TND",
                  "EUR",
                  "USD",
                  "TRY",
                  "GBP",
                  "JPY",
                  "AED",
                  "SAR",
                ].map((id) => ({ id, name: id }))}
              />
            )}
            <Text
              name="brands"
              label="Marques (séparées par des virgules)"
              value={company?.brands.join(", ")}
              required={false}
            />
            <Text
              name="leadDays"
              label="Délai de réapprovisionnement (jours)"
              type="number"
              value={String(company?.leadDays ?? 7)}
            />
            <Text
              name="coverDays"
              label="Couverture cible (jours)"
              type="number"
              value={String(company?.coverDays ?? 21)}
            />
            <Text
              name="minimumStock"
              label="Stock minimum par variante / magasin"
              type="number"
              value={String(company?.minimumStock ?? 2)}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">Fonctions activées</p>
              {modules.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="modules"
                    value={m}
                    defaultChecked={
                      company ? company.modules.includes(m) : true
                    }
                  />
                  {moduleLabels[m]}
                </label>
              ))}
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger sm:col-span-2">
                {error}
              </p>
            )}
            <Button type="submit">Vérifier le parcours</Button>
          </fieldset>
        </form>
      )}
    </Panel>
  );
}

export default function BusinessPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const client = useQueryClient();
  const busyRef = useRef(false);
  const query = useQuery({
    queryKey: ["business", tenantId],
    queryFn: () =>
      versionedQuery(
        client,
        ["business", tenantId],
        () => api.businessVersion(tenantId),
        () => api.business(tenantId),
        () => busyRef.current,
      ),
    refetchInterval: busyRef.current ? false : 5000,
    retry: false,
  });
  const [tab, setTab] = useState("group");
  const [profile, setProfile] = useState("direction");
  const [selected, setSelected] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<{ json: string; id: string; version: number } | null>(
    null,
  );
  const members = useQuery({
    queryKey: ["members", tenantId],
    queryFn: () => api.members(tenantId),
    enabled: !!query.data?.holdingOwner,
    retry: false,
  });
  async function run(action: Record<string, unknown>): Promise<boolean> {
    if (!query.data || busy) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const json = JSON.stringify(action);
      if (!pending.current || pending.current.json !== json)
        pending.current = {
          json,
          id: crypto.randomUUID(),
          version: query.data.version,
        };
      const res = await api.businessCommand(
        tenantId,
        pending.current.version,
        action,
        pending.current.id,
      );
      client.setQueryData(["business", tenantId], res);
      pending.current = null;
      setNotice("Opération enregistrée.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      if (e instanceof ApiError && e.status > 0 && e.status < 500) {
        pending.current = null;
        if (e.status === 409) await query.refetch();
      }
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function formRun(build: () => Record<string, unknown>) {
    try {
      return await run(build());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Valeur invalide");
      return false;
    }
  }
  if (query.isLoading) return <p role="status">Chargement du holding…</p>;
  if (query.error)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data) return null;
  const snapshot = query.data,
    s = snapshot.state;
  const company = s.companies.find((c) => c.id === selected);
  const companies = company ? [company] : s.companies;
  const rows = <T extends { companyId: string }>(list: T[]) =>
    list.filter((x) => !company || x.companyId === company.id);
  const role = snapshot.holdingOwner
    ? "MANAGER"
    : s.access.find(
        (a) => a.companyId === company?.id && a.userId === snapshot.userId,
      )?.role;
  const active = !company?.status || company.status === "ACTIVE";
  const manage = !!company && active && role === "MANAGER";
  const finance =
    !!company && active && ["MANAGER", "FINANCE"].includes(role || "");
  const operate =
    !!company && active && ["MANAGER", "OPERATIONS"].includes(role || "");
  const buying =
    !!company &&
    active &&
    ["MANAGER", "OPERATIONS", "BUYER"].includes(role || "");
  const warehousing =
    !!company &&
    active &&
    ["MANAGER", "OPERATIONS", "WAREHOUSE"].includes(role || "");
  const financialIds = s.companies
    .filter(
      (c) =>
        snapshot.holdingOwner ||
        s.access.some(
          (g) =>
            g.companyId === c.id &&
            g.userId === snapshot.userId &&
            ["MANAGER", "FINANCE", "VIEWER"].includes(g.role),
        ),
    )
    .map((c) => c.id);
  const settlementIds = s.companies
    .filter(
      (c) =>
        snapshot.holdingOwner ||
        s.access.some(
          (g) =>
            g.companyId === c.id &&
            g.userId === snapshot.userId &&
            ["MANAGER", "FINANCE"].includes(g.role),
        ),
    )
    .map((c) => c.id);
  const roles = snapshot.holdingOwner
    ? ["MANAGER"]
    : s.access
        .filter(
          (g) =>
            g.userId === snapshot.userId &&
            (!company || g.companyId === company.id),
        )
        .map((g) => g.role);
  const has = (allowed: string[]) => roles.some((r) => allowed.includes(r));
  const spaces = [
    {
      id: "direction",
      name: "Direction du groupe",
      views: [
        "group",
        "overview",
        "pnl",
        ...(has(["MANAGER"]) ? ["companies"] : []),
        ...(snapshot.holdingOwner ? ["access"] : []),
      ],
      allowed: has(["MANAGER", "FINANCE", "VIEWER"]),
    },
    {
      id: "achats",
      name: "Service achats",
      views: ["samples", "purchasing", "catalog"],
      allowed: has(["MANAGER", "OPERATIONS", "BUYER"]),
    },
    {
      id: "logistique",
      name: "Entrepôts & logistique",
      views: ["receipts", "transfers", "inventory", "intelligence", "catalog"],
      allowed: has(["MANAGER", "OPERATIONS", "WAREHOUSE"]),
    },
    {
      id: "ventes",
      name: "Ventes & magasins",
      views: ["sales", "inventory", "catalog"],
      allowed: has(["MANAGER", "OPERATIONS"]),
    },
    {
      id: "finance",
      name: "Finance & trésorerie",
      views: ["finance", "intercompany", "group", "pnl", "purchasing"],
      allowed: has(["MANAGER", "FINANCE"]),
    },
    {
      id: "rh",
      name: "Ressources humaines",
      views: ["hr"],
      allowed: !!snapshot.hrAccess && has(["MANAGER", "FINANCE", "HR"]),
    },
  ].filter((x) => x.allowed);
  const activeProfile =
    profile === "tous"
      ? "tous"
      : spaces.some((x) => x.id === profile)
        ? profile
        : spaces[0]?.id || "tous";
  const availableTabs = new Set(
    (activeProfile === "tous"
      ? spaces
      : spaces.filter((x) => x.id === activeProfile)
    ).flatMap((x) => x.views),
  );
  const activeTab = availableTabs.has(tab)
    ? tab
    : spaces.find((x) => x.id === activeProfile)?.views[0] ||
      spaces[0]?.views[0] ||
      "overview";
  function openView(id: string) {
    setProfile("tous");
    setTab(id);
  }
  const products = rows(s.products),
    locations = rows(s.locations),
    partners = rows(s.partners),
    accounts = rows(s.accounts);
  const currency = company?.currency || "TND";
  const productName = (id: string) => {
    const p = s.products.find((x) => x.id === id);
    return p ? `${p.sku} · ${p.name} ${p.size} ${p.color}` : "—";
  };
  const locationName = (id: string) =>
    s.locations.find((x) => x.id === id)?.name || "—";
  const partnerName = (id: string) =>
    s.partners.find((x) => x.id === id)?.name || "—";
  const companyName = (id: string) =>
    s.companies.find((x) => x.id === id)?.name || "—";
  const accountName = (id: string) =>
    s.accounts.find((x) => x.id === id)?.name || "—";
  const withCompany = (a: Record<string, unknown>) => ({
    ...a,
    companyId: company?.id,
  });
  const text = (d: FormData, key: string) => String(d.get(key) || "").trim();
  const enabled = (key: string) => !!company?.modules.includes(key);
  function exportOverview() {
    const escape = (v: unknown) =>
      `"${String(v)
        .replace(/^[=+@-]/, "'$&")
        .replace(/"/g, '""')}"`;
    const content = [
      [
        "Société",
        "Devise",
        "Banques",
        "Caisses",
        "Dettes",
        "Créances",
        "Stock",
        "Ventes",
        "Marge brute",
      ],
      ...companies.map((c) => {
        const m = companyMetrics(s, c);
        return [
          c.name,
          c.currency,
          m.bank,
          m.cash,
          m.payables,
          m.receivables,
          m.inventory,
          m.revenue,
          m.grossMargin,
        ].map((v, i) =>
          i < 2 ? v : Number(v) / 10 ** currencyDigits(c.currency),
        );
      }),
    ]
      .map((r) => r.map(escape).join(";"))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "holding-synthese.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeader
        title="Gestion du holding"
        description="Sociétés, marchandises et trésorerie — opérations enregistrées, traçables et cloisonnées."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => query.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </Button>
            <Button variant="secondary" size="sm" onClick={exportOverview}>
              <Download className="h-4 w-4" />
              Exporter
            </Button>
          </div>
        }
      />
      <div className="mb-5 rounded-xl bg-brand p-5 text-brand-fg">
        <p className="mb-3 text-sm opacity-80">Périmètre de consultation</p>
        <select
          aria-label="Société"
          className="w-full rounded-lg border border-white/30 bg-brand p-2 sm:max-w-md"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setWarehouse("");
            setError("");
          }}
        >
          <option value="">Toutes les sociétés autorisées</option>
          {s.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.currency}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs opacity-80">
          {snapshot.holdingOwner
            ? "Propriétaire du holding — vue consolidée autorisée"
            : `Accès aux sociétés attribuées uniquement${role ? ` · ${role}` : ""}`}
        </p>
      </div>
      {!!s.demoNotes?.length && (
        <div className="mb-5 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <h2 className="font-semibold">
            DÉMONSTRATION — Groupe Horizon · Données fictives
          </h2>
          <p className="mt-1 text-sm text-muted">
            3 sociétés, 10 magasins : sélectionnez Polaris pour suivre un modèle
            de l’échantillon à la caisse. Les ventes historiques sont des
            synthèses mensuelles fictives ; les tickets récents illustrent le
            parcours caisse. Le P&L 2025 est calculé à partir des écritures.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ["samples", "1 · Échantillons"],
              ["purchasing", "2 · Importation"],
              ["inventory", "3 · Distribution"],
              ["sales", "4 · Ventes"],
              ["hr", "5 · RH"],
              ["pnl", "6 · P&L CEO"],
            ].map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant="secondary"
                onClick={() => {
                  openView(id);
                  if (id !== "pnl" && !selected)
                    setSelected(s.companies[0]?.id || "");
                  if (id === "pnl") setSelected("");
                }}
              >
                {label}
              </Button>
            ))}
            <Link
              className="rounded-lg border border-border p-2 text-sm"
              href={`/t/${tenantId}/pos`}
            >
              Ouvrir la caisse
            </Link>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface p-4">
        <label className="min-w-64 text-sm font-medium">
          Espace métier
          <select
            aria-label="Espace métier"
            className={selectClass}
            value={activeProfile}
            onChange={(e) => {
              const value = e.target.value;
              setProfile(value);
              setTab(
                value === "tous"
                  ? spaces[0]?.views[0] || "overview"
                  : spaces.find((x) => x.id === value)!.views[0],
              );
            }}
          >
            {spaces.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
            <option value="tous">Tous les espaces autorisés</option>
          </select>
        </label>
        <p className="text-xs text-muted">
          Choisissez votre métier, puis le document ou la tâche à traiter. Les
          droits sont contrôlés par société côté serveur.
        </p>
      </div>
      <nav aria-label="Modules métier" className="mb-6 flex flex-wrap gap-2">
        {tabs
          .filter(([id]) => availableTabs.has(id))
          .map(([id, label]) => (
            <Button
              key={id}
              variant={activeTab === id ? "primary" : "secondary"}
              size="sm"
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
      </nav>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger p-3 text-sm text-danger"
        >
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm text-accent">
          {notice}
        </p>
      )}
      {!s.companies.length && (
        <Panel
          title={
            snapshot.holdingOwner
              ? "Bienvenue dans votre holding"
              : "Aucune société attribuée"
          }
        >
          <p className="mb-3 text-sm text-muted">
            {snapshot.holdingOwner
              ? "Commencez par créer Polaris, puis ses entrepôts, magasins, produits, fournisseurs et comptes. Aucune donnée de démonstration ne sera ajoutée à vos comptes réels."
              : "Demandez au propriétaire du holding de vous attribuer une société dans « Accès sociétés »."}
          </p>
          {snapshot.holdingOwner && (
            <Button onClick={() => setTab("companies")}>
              Configurer ma première société
            </Button>
          )}
        </Panel>
      )}
      {activeTab === "group" &&
        (financialIds.length ? (
          <GroupDashboard
            state={s}
            companyIds={financialIds.filter(
              (id) => !company || id === company.id,
            )}
            onCompany={(id, view = "overview") => {
              setSelected(id);
              openView(view);
            }}
          />
        ) : (
          <p>
            Le pilotage financier est réservé aux sociétés pour lesquelles vous
            avez un accès de direction, finance ou lecture financière.
          </p>
        ))}
      {activeTab === "intercompany" && (
        <IntercompanyPanel
          state={s}
          companyIds={settlementIds}
          busy={busy}
          run={run}
        />
      )}
      {company && activeTab === "receipts" && (
        <ReceivingPanel
          state={s}
          company={company}
          editable={
            warehousing &&
            enabled("purchasing") &&
            enabled("inventory") &&
            enabled("finance")
          }
          busy={busy}
          run={run}
        />
      )}
      {company && activeTab === "transfers" && (
        <TransferPanel
          key={company.id}
          state={s}
          company={company}
          editable={warehousing && enabled("inventory")}
          busy={busy}
          run={run}
        />
      )}
      {!company && ["receipts", "transfers"].includes(activeTab) && (
        <p>Sélectionnez une société pour ouvrir les documents logistiques.</p>
      )}
      {activeTab === "pnl" && <AnnualPnl state={s} companyId={company?.id} />}
      {company &&
        activeTab === "samples" &&
        (enabled("purchasing") ? (
          <SupplierSamples
            state={s}
            company={company}
            manage={manage}
            operate={buying}
            busy={busy}
            run={run}
          />
        ) : (
          <p>Module achats désactivé.</p>
        ))}
      {company &&
        activeTab === "hr" &&
        (enabled("hr") ? (
          <HrPanel
            key={company.id}
            state={s}
            company={company}
            manage={
              (manage || role === "HR") &&
              (snapshot.hrCompanyIds?.includes(company.id) ??
                snapshot.hrAccess !== false)
            }
            accrue={role === "HR"}
            finance={
              finance &&
              (snapshot.hrCompanyIds?.includes(company.id) ??
                snapshot.hrAccess !== false)
            }
            busy={busy}
            run={run}
          />
        ) : (
          <p>Activez le module RH dans Sociétés & configuration.</p>
        ))}
      {!company && ["samples", "hr"].includes(activeTab) && (
        <p>Sélectionnez une société pour ouvrir ce module.</p>
      )}
      {activeTab === "overview" && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <Building2 className="mb-2 h-5 w-5 text-accent" />
              <p className="text-2xl font-semibold">{companies.length}</p>
              <p className="text-sm text-muted">Sociétés dans le périmètre</p>
            </Card>
            <Card className="p-5">
              <ShoppingCart className="mb-2 h-5 w-5 text-accent" />
              <p className="text-2xl font-semibold">
                {
                  rows(s.orders).filter(
                    (o) => !["RECEIVED", "CANCELLED"].includes(o.status),
                  ).length
                }
              </p>
              <p className="text-sm text-muted">Commandes en cours</p>
            </Card>
            <Card className="p-5">
              <Package className="mb-2 h-5 w-5 text-accent" />
              <p className="text-2xl font-semibold">
                {rows(s.locations).length}
              </p>
              <p className="text-sm text-muted">Entrepôts & magasins</p>
            </Card>
          </div>
          <Panel title="Situation financière par société">
            <p className="mb-4 text-xs text-muted">
              Montants cumulés depuis la saisie. Devises affichées séparément,
              sans conversion ni élimination intersociétés. Soldes manuels non
              rapprochés avec la banque.
            </p>
            <Table
              headers={[
                "Société",
                "Banques",
                "Caisses",
                "Dette bancaire",
                "À payer",
                "À encaisser",
                "Stock valorisé",
                "Ventes",
                "Marge brute",
              ]}
              rows={companies.map((c) => {
                const m = companyMetrics(s, c);
                return [
                  <button
                    className="font-semibold text-accent"
                    onClick={() => setSelected(c.id)}
                  >
                    {c.name}
                  </button>,
                  money(m.bank, c.currency),
                  money(m.cash, c.currency),
                  money(m.bankDebt, c.currency),
                  money(m.payables, c.currency),
                  money(m.receivables, c.currency),
                  money(m.inventory, c.currency),
                  money(m.revenue, c.currency),
                  money(m.grossMargin, c.currency),
                ];
              })}
            />
          </Panel>
          <Panel title="Prévision de trésorerie à 30 jours">
            <Table
              headers={[
                "Société",
                "Disponible enregistré",
                "Encaissements attendus",
                "Échéances à payer",
                "Solde indicatif",
              ]}
              rows={companies.map((c) => {
                const m = companyMetrics(s, c);
                return [
                  c.name,
                  money(m.bank + m.cash, c.currency),
                  money(m.receivables30, c.currency),
                  money(m.payables30, c.currency),
                  <span
                    className={m.cash30 < 0 ? "font-semibold text-danger" : ""}
                  >
                    {money(m.cash30, c.currency)}
                  </span>,
                ];
              })}
            />
            <p className="mt-3 text-xs text-muted">
              Hypothèse : règlement de toutes les factures échues ou à échéance
              sous 30 jours. Ne couvre pas salaires, taxes ni engagements non
              saisis.
            </p>
          </Panel>
          <Panel title="Flux récents">
            <Table
              headers={["Date", "Société", "Opération", "Référence"]}
              rows={rows(s.events)
                .slice(-15)
                .reverse()
                .map((e) => [
                  new Date(e.date).toLocaleString("fr-FR"),
                  companyName(e.companyId),
                  e.action,
                  e.reference,
                ])}
            />
          </Panel>
        </>
      )}
      {company && company.status && company.status !== "ACTIVE" && (
        <p role="status" className="mb-4 text-sm text-danger">
          Société{" "}
          {company.status === "DELETED" ? "dans la corbeille" : "archivée"} :
          lecture seule jusqu’à restauration.
        </p>
      )}
      {activeTab === "companies" && (
        <>
          {snapshot.holdingOwner && (
            <CompanyWizard key="new-company" run={run} busy={busy} />
          )}
          {manage && company && (
            <CompanyWizard
              key={company.id}
              company={company}
              run={run}
              busy={busy}
            />
          )}
          {company && snapshot.holdingOwner && (
            <Form
              title="Archiver, supprimer ou restaurer la société"
              busy={busy}
              button="Confirmer le changement d’état"
              onSubmit={(d) =>
                run(
                  withCompany({
                    type: "company.lifecycle",
                    status: text(d, "status"),
                    confirmation: text(d, "confirmation"),
                  }),
                )
              }
            >
              <Select
                name="status"
                label="Nouvel état"
                options={[
                  { id: "ACTIVE", name: "Active / restaurer" },
                  { id: "ARCHIVED", name: "Archiver" },
                  { id: "DELETED", name: "Supprimer (corbeille restaurable)" },
                ]}
              />
              <Text
                name="confirmation"
                label={`Saisir exactement : ${company.name}`}
              />
              <p className="text-xs text-muted">
                La suppression place la société dans une corbeille restaurable.
                Ses données restent présentes dans les exports.
              </p>
            </Form>
          )}
          <Panel title="Sociétés du holding">
            <Table
              headers={[
                "Société",
                "Pays / devise",
                "Marques",
                "Modules",
                "Ouvrir",
              ]}
              rows={s.companies.map((c) => [
                c.name,
                `${c.country} · ${c.currency}`,
                c.brands.join(", "),
                c.modules.map((m) => moduleLabels[m]).join(", "),
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelected(c.id);
                  }}
                >
                  Sélectionner
                </Button>,
              ])}
            />
          </Panel>
        </>
      )}
      {!["overview", "companies", "group", "pnl", "intercompany"].includes(
        activeTab,
      ) &&
        !company && (
          <Panel title="Choisir une société">
            <p className="text-sm text-muted">
              Sélectionnez une société en haut pour consulter ses opérations et
              saisir de nouvelles données.
            </p>
          </Panel>
        )}
      {company && activeTab === "catalog" && (
        <>
          {warehousing && (
            <Form
              title="Ajouter un entrepôt ou magasin"
              busy={busy}
              onSubmit={(d) =>
                run(
                  withCompany({
                    type: "location.create",
                    name: text(d, "name"),
                    kind: text(d, "kind"),
                  }),
                )
              }
            >
              <Text name="name" label="Nom" />
              <Select
                name="kind"
                label="Type"
                options={[
                  { id: "WAREHOUSE", name: "Entrepôt" },
                  { id: "STORE", name: "Magasin" },
                ]}
              />
            </Form>
          )}
          <Panel title="Réseau de distribution">
            <Table
              headers={["Nom", "Type"]}
              rows={locations.map((l) => [
                l.name,
                l.kind === "STORE" ? "Magasin" : "Entrepôt",
              ])}
            />
          </Panel>
          {buying && (
            <Form
              title="Ajouter une variante produit"
              busy={busy}
              onSubmit={(d) =>
                run(
                  withCompany({
                    type: "product.create",
                    sku: text(d, "sku"),
                    model: text(d, "model"),
                    name: text(d, "name"),
                    brand: text(d, "brand"),
                    size: text(d, "size"),
                    color: text(d, "color"),
                  }),
                )
              }
            >
              <Text name="sku" label="SKU unique" />
              <Text name="model" label="Code modèle" required={false} />
              <Text name="name" label="Nom du produit" />
              <Text name="brand" label="Marque" required={false} />
              <Text name="size" label="Taille" required={false} />
              <Text name="color" label="Couleur" required={false} />
            </Form>
          )}
          {manage && (
            <Form
              title="Tarif et code-barres pour la Caisse"
              busy={busy}
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "product.pricing",
                    productId: text(d, "productId"),
                    salePrice: amount(d.get("salePrice"), currency),
                    barcode: text(d, "barcode"),
                  }),
                )
              }
            >
              <Select
                name="productId"
                label="Variante à tarifer"
                options={products.map((p) => ({
                  id: p.id,
                  name: productName(p.id),
                }))}
              />
              <Text
                name="salePrice"
                label={`Prix de vente (${currency})`}
                type="number"
              />
              <Text name="barcode" label="Code-barres" required={false} />
            </Form>
          )}
          <Panel title="Catalogue">
            <Table
              headers={[
                "SKU",
                "Produit",
                "Marque",
                "Taille / couleur",
                "Coût moyen",
              ]}
              rows={products.map((p) => [
                p.sku,
                p.name,
                p.brand,
                `${p.size} / ${p.color}`,
                money(p.cost, currency),
              ])}
            />
          </Panel>
          {(buying || finance) && (
            <Form
              title="Ajouter un fournisseur ou client"
              busy={busy}
              onSubmit={(d) =>
                run(
                  withCompany({
                    type: "partner.create",
                    name: text(d, "name"),
                    kind: text(d, "kind"),
                    email: text(d, "email"),
                  }),
                )
              }
            >
              <Text name="name" label="Nom" />
              <Select
                name="kind"
                label="Type"
                options={[
                  { id: "SUPPLIER", name: "Fournisseur" },
                  { id: "CUSTOMER", name: "Client" },
                ]}
              />
              <Text name="email" label="Email" type="email" required={false} />
            </Form>
          )}
          <Panel title="Partenaires">
            <Table
              headers={["Nom", "Type", "Email"]}
              rows={partners.map((p) => [
                p.name,
                p.kind === "SUPPLIER" ? "Fournisseur" : "Client",
                p.email,
              ])}
            />
          </Panel>
        </>
      )}
      {company && activeTab === "purchasing" && (
        <>
          <PartnerDirectory
            key={company.id + "suppliers"}
            partners={partners}
            kind="SUPPLIER"
            editable={(buying || finance) && enabled("purchasing")}
            busy={busy}
            run={(a) => run(withCompany(a))}
          />
          {buying && enabled("purchasing") && (
            <ArticleCreator
              canPrice={manage}
              currency={currency}
              busy={busy}
              run={(a) => run(withCompany(a))}
            />
          )}
          {financialIds.includes(company.id) && (
            <FinancingPanel
              key={company.id}
              state={s}
              companyId={company.id}
              currency={currency}
              editable={finance && enabled("finance") && enabled("purchasing")}
              busy={busy}
              run={(a) => run(withCompany(a))}
            />
          )}
          {!enabled("purchasing") && (
            <p className="mb-4 text-sm text-muted">
              Module achats désactivé. Le responsable peut l’activer dans la
              configuration.
            </p>
          )}
          {buying && enabled("purchasing") && (
            <Form
              title="Nouvelle commande fournisseur / import"
              busy={busy}
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "order.create",
                    reference: text(d, "reference"),
                    supplierId: text(d, "supplierId"),
                    locationId: text(d, "locationId"),
                    origin: text(d, "origin"),
                    eta: text(d, "eta"),
                    dueDate: text(d, "dueDate"),
                    landedCharges: amount(d.get("landedCharges"), currency),
                    lines: readLines(d, currency),
                  }),
                )
              }
            >
              <Text name="reference" label="Référence commande" />
              <Select
                name="supplierId"
                label="Fournisseur"
                options={partners.filter((p) => p.kind === "SUPPLIER")}
              />
              <Select
                name="locationId"
                label="Entrepôt destinataire"
                options={locations.filter((l) => l.kind === "WAREHOUSE")}
              />
              <Text name="origin" label="Origine (ex. Istanbul)" />
              <Text
                name="eta"
                label="Arrivée prévue"
                type="date"
                value={today()}
              />
              <Text
                name="dueDate"
                label="Échéance fournisseur"
                type="date"
                value={today()}
              />
              <Text
                name="landedCharges"
                label={`Frais d'import à répartir (${currency})`}
                type="number"
                value="0"
              />
              <Lines products={products} currency={currency} />
              <p className="text-xs text-muted sm:col-span-2">
                Les frais augmentent la valorisation du stock. Saisissez
                séparément les factures du transporteur et de la douane dans
                Trésorerie ; ils ne sont pas ajoutés à la dette du fournisseur
                de marchandises.
              </p>
            </Form>
          )}
          <Panel title="Suivi des achats & importations">
            <Table
              headers={[
                "Référence",
                "Fournisseur",
                "Origine / ETA",
                "Statut",
                "Montant marchandises",
                "Actions",
              ]}
              rows={rows(s.orders).map((o) => {
                const next: Record<string, string> = {
                  DRAFT: "APPROVED",
                  APPROVED: "ORDERED",
                  ORDERED: "SHIPPED",
                  SHIPPED: "CUSTOMS",
                  CUSTOMS: "RECEIVED",
                  PARTIALLY_RECEIVED: "RECEIVED",
                };
                const n = next[o.status];
                return [
                  o.reference,
                  partnerName(o.supplierId),
                  `${o.origin} · ${o.eta}`,
                  statusLabels[o.status],
                  money(
                    o.lines.reduce((v, l) => v + l.quantity * l.unitPrice, 0),
                    currency,
                  ),
                  <div className="space-y-2">
                    {buying &&
                      enabled("purchasing") &&
                      n &&
                      (n !== "APPROVED" || manage) &&
                      (n !== "RECEIVED" || warehousing) && (
                        <Button
                          size="sm"
                          loading={busy}
                          onClick={() =>
                            run(
                              withCompany({
                                type: "order.transition",
                                orderId: o.id,
                                status: n,
                              }),
                            )
                          }
                        >
                          {n === "RECEIVED"
                            ? "Réceptionner tout le stock"
                            : statusLabels[n]}
                        </Button>
                      )}
                    {manage &&
                      ["DRAFT", "APPROVED", "ORDERED"].includes(o.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            run(
                              withCompany({
                                type: "order.transition",
                                orderId: o.id,
                                status: "CANCELLED",
                              }),
                            )
                          }
                        >
                          Annuler
                        </Button>
                      )}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-accent">
                        Lignes & frais
                      </summary>
                      {o.lines.map((l) => (
                        <p key={l.productId}>
                          {productName(l.productId)} · {l.quantity} ×{" "}
                          {money(l.unitPrice, currency)}
                        </p>
                      ))}
                      <p>Frais répartis : {money(o.landedCharges, currency)}</p>
                    </details>
                  </div>,
                ];
              })}
            />
          </Panel>
        </>
      )}
      {company && activeTab === "inventory" && (
        <>
          <InventoryAnalysis
            key={company.id}
            state={s}
            companyId={company.id}
            updatedAt={query.dataUpdatedAt}
            refreshing={query.isFetching}
            offline={query.isRefetchError}
          />
          {snapshot.holdingOwner && manage && enabled("inventory") && (
            <Form
              title="Stock initial ou ajustement justifié"
              busy={busy}
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "stock.adjust",
                    productId: text(d, "productId"),
                    locationId: text(d, "locationId"),
                    quantity: Number(d.get("quantity")),
                    unitCost: amount(d.get("unitCost"), currency),
                    reason: text(d, "reason"),
                  }),
                )
              }
            >
              <Select
                name="productId"
                label="Variante"
                options={products.map((p) => ({
                  id: p.id,
                  name: productName(p.id),
                }))}
              />
              <Select
                name="locationId"
                label="Emplacement"
                options={locations}
              />
              <Text
                name="quantity"
                label="Quantité (+ entrée / − sortie)"
                type="number"
              />
              <Text
                name="unitCost"
                label={`Coût unitaire d'entrée (${currency})`}
                type="number"
                value="0"
              />
              <Text name="reason" label="Motif obligatoire" />
            </Form>
          )}
          {warehousing && enabled("inventory") && (
            <Form
              title="Transfert de stock"
              busy={busy}
              button="Confirmer le transfert"
              onSubmit={(d) =>
                run(
                  withCompany({
                    type: "stock.transfer",
                    productId: text(d, "productId"),
                    fromId: text(d, "fromId"),
                    toId: text(d, "toId"),
                    quantity: Number(d.get("quantity")),
                  }),
                )
              }
            >
              <Select
                name="productId"
                label="Variante"
                options={products.map((p) => ({
                  id: p.id,
                  name: productName(p.id),
                }))}
              />
              <Select name="fromId" label="Depuis" options={locations} />
              <Select name="toId" label="Vers" options={locations} />
              <Text name="quantity" label="Quantité" type="number" />
            </Form>
          )}
          <Panel title="Stock par emplacement">
            <Table
              headers={[
                "Produit / variante",
                ...locations.map((l) => l.name),
                "Total",
                "Valeur",
              ]}
              rows={products.map((p) => [
                productName(p.id),
                ...locations.map((l) => productStock(s, p.id, l.id)),
                productStock(s, p.id),
                money(productStock(s, p.id) * p.cost, currency),
              ])}
            />
          </Panel>
          <Panel title="Journal des mouvements">
            <Table
              headers={["Date", "Produit", "Emplacement", "Quantité", "Motif"]}
              rows={rows(s.movements)
                .slice(-100)
                .reverse()
                .map((m) => [
                  new Date(m.date).toLocaleString("fr-FR"),
                  productName(m.productId),
                  locationName(m.locationId),
                  m.quantity,
                  m.reason,
                ])}
            />
          </Panel>
        </>
      )}
      {company && activeTab === "sales" && (
        <>
          <div className="mb-5 rounded-xl border border-accent bg-accent-tint p-5">
            <h2 className="font-semibold">Vente en magasin</h2>
            <p className="mb-3 text-sm text-muted">
              Caisse tactile, douchette, caméra téléphone, clients et
              historique.
            </p>
            <Link
              className="inline-block rounded-lg bg-accent px-4 py-2 text-white"
              href={`/t/${tenantId}/pos`}
            >
              Ouvrir la Caisse
            </Link>
          </div>
          <PartnerDirectory
            key={company.id + "customers"}
            partners={partners}
            kind="CUSTOMER"
            editable={(operate || finance) && enabled("sales")}
            busy={busy}
            run={(a) => run(withCompany(a))}
          />
          {operate && enabled("sales") && (
            <Form
              title="Enregistrer une vente"
              busy={busy}
              button="Confirmer la vente et sortir le stock"
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "sale.create",
                    reference: text(d, "reference"),
                    customerId: text(d, "customerId"),
                    locationId: text(d, "locationId"),
                    dueDate: text(d, "dueDate"),
                    lines: readLines(d, currency),
                  }),
                )
              }
            >
              <Text name="reference" label="Référence ticket / facture" />
              <Select
                name="customerId"
                label="Client (un client comptoir peut être créé)"
                options={partners.filter((p) => p.kind === "CUSTOMER")}
              />
              <Select
                name="locationId"
                label="Magasin / emplacement"
                options={locations}
              />
              <Text
                name="dueDate"
                label="Échéance d'encaissement"
                type="date"
                value={today()}
              />
              <Lines products={products} currency={currency} />
            </Form>
          )}
          <Panel title="Ventes & marge">
            <Table
              headers={[
                "Date",
                "Référence",
                "Magasin",
                "Client",
                "Ventes",
                "Marge brute",
                "Statut / retour",
              ]}
              rows={rows(s.sales)
                .slice()
                .reverse()
                .map((sale) => [
                  new Date(sale.date).toLocaleDateString("fr-FR"),
                  sale.reference,
                  locationName(sale.locationId),
                  partnerName(sale.customerId),
                  money(sale.total, currency),
                  money(sale.total - sale.cost, currency),
                  sale.returned ? (
                    "Retournée"
                  ) : (
                    <>
                      {manage && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              withCompany({
                                type: "sale.return",
                                saleId: sale.id,
                              }),
                            )
                          }
                        >
                          Retour intégral non encaissé
                        </Button>
                      )}
                      <details className="mt-2 text-xs">
                        <summary>Lignes</summary>
                        {sale.lines.map((l) => (
                          <p key={l.productId}>
                            {productName(l.productId)} · {l.quantity} ×{" "}
                            {money(l.unitPrice, currency)}
                          </p>
                        ))}
                      </details>
                    </>
                  ),
                ])}
            />
          </Panel>
          <p className="mb-5 text-xs text-muted">
            Enregistrez les encaissements dans Banques & trésorerie. Les retours
            partiels, remboursements après encaissement et intégrations POS ne
            sont pas encore disponibles.
          </p>
        </>
      )}
      {company && activeTab === "finance" && (
        <>
          {finance && enabled("finance") && (
            <Form
              title="Ajouter un compte bancaire ou une caisse"
              busy={busy}
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "account.create",
                    name: text(d, "name"),
                    kind: text(d, "kind"),
                    opening: amount(d.get("opening"), currency),
                    asOf: text(d, "asOf"),
                  }),
                )
              }
            >
              <Text name="name" label="Nom du compte" />
              <Select
                name="kind"
                label="Type"
                options={[
                  { id: "BANK", name: "Banque" },
                  { id: "CASH", name: "Caisse / petite caisse" },
                ]}
              />
              <Text
                name="opening"
                label={`Solde initial (${currency})`}
                type="number"
                value="0"
              />
              <Text
                name="asOf"
                label="Date du solde initial"
                type="date"
                value={today()}
              />
            </Form>
          )}
          <Panel title="Soldes bancaires et caisses">
            <p className="mb-3 text-xs text-muted">
              Soldes calculés à partir d’un solde initial et des opérations
              saisies. Aucune connexion bancaire ni rapprochement automatique.
            </p>
            <Table
              headers={[
                "Compte",
                "Type",
                "Solde initial au",
                "Solde enregistré",
                "Source",
              ]}
              rows={accounts.map((a) => [
                a.name,
                a.kind === "BANK" ? "Banque" : "Caisse",
                a.asOf,
                money(accountBalance(s, a.id), currency),
                "Saisie manuelle",
              ])}
            />
          </Panel>
          {finance && enabled("finance") && (
            <Form
              title="Saisir une facture ou un solde fournisseur / client"
              busy={busy}
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "invoice.create",
                    reference: text(d, "reference"),
                    partnerId: text(d, "partnerId"),
                    kind: text(d, "kind"),
                    amount: amount(d.get("amount"), currency),
                    dueDate: text(d, "dueDate"),
                  }),
                )
              }
            >
              <Text name="reference" label="Référence unique" />
              <Select
                name="partnerId"
                label="Partenaire"
                options={partners.map((p) => ({
                  id: p.id,
                  name: `${p.name} · ${p.kind === "SUPPLIER" ? "Fournisseur" : "Client"}`,
                }))}
              />
              <Select
                name="kind"
                label="Sens"
                options={[
                  { id: "PAYABLE", name: "À payer (fournisseur)" },
                  { id: "RECEIVABLE", name: "À encaisser (client)" },
                ]}
              />
              <Text
                name="amount"
                label={`Montant (${currency})`}
                type="number"
              />
              <Text
                name="dueDate"
                label="Échéance"
                type="date"
                value={today()}
              />
            </Form>
          )}
          <Panel title="Dettes et créances">
            <Table
              headers={[
                "Référence",
                "Partenaire",
                "Sens",
                "Échéance",
                "Montant",
                "Réglé",
                "Restant",
              ]}
              rows={rows(s.invoices).map((i) => [
                i.reference,
                partnerName(i.partnerId),
                i.kind === "PAYABLE" ? "À payer" : "À encaisser",
                <span
                  className={
                    i.dueDate < today() && i.amount > invoicePaid(s, i.id)
                      ? "text-danger"
                      : ""
                  }
                >
                  {i.dueDate}
                </span>,
                money(i.amount, currency),
                money(invoicePaid(s, i.id), currency),
                money(i.amount - invoicePaid(s, i.id), currency),
              ])}
            />
          </Panel>
          {finance && enabled("finance") && (
            <Form
              title="Enregistrer un paiement / encaissement effectué"
              busy={busy}
              button="Enregistrer le règlement"
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "payment.create",
                    invoiceId: text(d, "invoiceId"),
                    accountId: text(d, "accountId"),
                    amount: amount(d.get("amount"), currency),
                  }),
                )
              }
            >
              <Select
                name="invoiceId"
                label="Facture à régler"
                options={rows(s.invoices)
                  .filter(
                    (i) => !i.intercompanyId && i.amount > invoicePaid(s, i.id),
                  )
                  .map((i) => ({
                    id: i.id,
                    name: `${i.reference} · ${i.kind === "PAYABLE" ? "Payer" : "Encaisser"} ${money(i.amount - invoicePaid(s, i.id), currency)}`,
                  }))}
              />
              <Select
                name="accountId"
                label="Compte / caisse"
                options={accounts}
              />
              <Text
                name="amount"
                label={`Montant (${currency})`}
                type="number"
              />
              <p className="text-xs text-muted">
                Cette action enregistre un règlement déjà effectué. Elle ne
                déclenche aucun virement bancaire.
              </p>
            </Form>
          )}
          {finance && enabled("finance") && (
            <Form
              title="Enregistrer une dépense payée"
              busy={busy}
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "expense.create",
                    accountId: text(d, "accountId"),
                    amount: amount(d.get("amount"), currency),
                    description: text(d, "description"),
                  }),
                )
              }
            >
              <Select
                name="accountId"
                label="Compte débité"
                options={accounts}
              />
              <Text
                name="amount"
                label={`Montant (${currency})`}
                type="number"
              />
              <Text
                name="description"
                label="Description / justificatif de référence"
              />
            </Form>
          )}
          {finance && enabled("finance") && (
            <Form
              title="Transfert entre comptes de la même société"
              busy={busy}
              onSubmit={(d) =>
                formRun(() =>
                  withCompany({
                    type: "cash.transfer",
                    fromId: text(d, "fromId"),
                    toId: text(d, "toId"),
                    amount: amount(d.get("amount"), currency),
                  }),
                )
              }
            >
              <Select name="fromId" label="Compte débité" options={accounts} />
              <Select name="toId" label="Compte crédité" options={accounts} />
              <Text
                name="amount"
                label={`Montant (${currency})`}
                type="number"
              />
            </Form>
          )}
          <Panel title="Journal de trésorerie">
            <Table
              headers={["Date", "Type", "Compte", "Montant / détail"]}
              rows={[
                ...rows(s.payments).map((p) => ({
                  date: p.date,
                  cells: [
                    new Date(p.date).toLocaleString("fr-FR"),
                    s.invoices.find((i) => i.id === p.invoiceId)?.kind ===
                    "PAYABLE"
                      ? "Paiement"
                      : "Encaissement",
                    accountName(p.accountId),
                    `${money(p.amount, currency)} · ${s.invoices.find((i) => i.id === p.invoiceId)?.reference}`,
                  ],
                })),
                ...rows(s.expenses).map((e) => ({
                  date: e.date,
                  cells: [
                    new Date(e.date).toLocaleString("fr-FR"),
                    "Dépense",
                    accountName(e.accountId),
                    `${money(e.amount, currency)} · ${e.description}`,
                  ],
                })),
                ...rows(s.cashTransfers).map((t) => ({
                  date: t.date,
                  cells: [
                    new Date(t.date).toLocaleString("fr-FR"),
                    "Transfert",
                    `${accountName(t.fromId)} → ${accountName(t.toId)}`,
                    money(t.amount, currency),
                  ],
                })),
              ]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 100)
                .map((x) => x.cells)}
            />
          </Panel>
        </>
      )}
      {company && activeTab === "intelligence" && (
        <>
          <Panel title="Alertes de gestion">
            <div className="space-y-3 text-sm">
              {(() => {
                const m = companyMetrics(s, company);
                return (
                  <>
                    <p className={m.cash30 < 0 ? "text-danger" : ""}>
                      <Wallet className="mr-2 inline h-4 w-4" />
                      Trésorerie indicative dans 30 jours :{" "}
                      {money(m.cash30, currency)}
                      {m.cash30 < 0
                        ? " — risque de financement à examiner."
                        : ""}
                    </p>
                    <p>
                      <TrendingUp className="mr-2 inline h-4 w-4" />
                      Marge brute cumulée : {money(m.grossMargin, currency)}.
                      Contribution après dépenses saisies :{" "}
                      {money(m.operatingContribution, currency)} (hors taxes et
                      charges non saisies).
                    </p>
                  </>
                );
              })()}
              {rows(s.orders)
                .filter(
                  (o) =>
                    o.eta < today() &&
                    !["RECEIVED", "CANCELLED"].includes(o.status),
                )
                .map((o) => (
                  <p key={o.id} className="text-danger">
                    Commande {o.reference} en retard : arrivée prévue le {o.eta}
                    , statut {statusLabels[o.status]}.
                  </p>
                ))}
              {rows(s.invoices)
                .filter(
                  (i) => i.dueDate < today() && i.amount > invoicePaid(s, i.id),
                )
                .map((i) => (
                  <p key={i.id} className="text-danger">
                    {i.kind === "PAYABLE" ? "Dette" : "Créance"} échue :{" "}
                    {i.reference}, restant{" "}
                    {money(i.amount - invoicePaid(s, i.id), currency)}.
                  </p>
                ))}
            </div>
          </Panel>
          <Panel title="Suggestions de distribution">
            <p className="mb-4 text-sm text-muted">
              <Sparkles className="mr-1 inline h-4 w-4" />
              Règles explicables sur 30 jours, sans modèle IA externe. Le stock
              disponible est partagé entre les magasins, en priorité aux plus
              fortes ruptures relatives. Chaque transfert nécessite votre
              confirmation.
            </p>
            <p className="mb-2 text-sm font-medium">Entrepôt source</p>
            <select
              aria-label="Choisir l’entrepôt pour les suggestions"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className={selectClass}
            >
              <option value="">Choisir un entrepôt…</option>
              {locations
                .filter((l) => l.kind === "WAREHOUSE")
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
            {enabled("intelligence") ? (
              <Table
                headers={[
                  "Variante",
                  "Magasin",
                  "Vendus / 30 j",
                  "Stock / cible",
                  "Suggestion",
                  "Explication",
                  "Action",
                ]}
                rows={replenishment(s, company, warehouse).map((r) => [
                  productName(r.productId),
                  locationName(r.storeId),
                  r.sold,
                  `${r.stock} / ${r.target}`,
                  `${r.quantity} unités`,
                  <span className="block min-w-48 text-xs">
                    {r.explanation}
                    <br />
                    Confiance {r.confidence === "LOW" ? "faible" : "modérée"}
                  </span>,
                  operate && enabled("inventory") ? (
                    <Button
                      size="sm"
                      disabled={busy || r.quantity === 0}
                      onClick={() =>
                        run(
                          withCompany({
                            type: "stock.transfer",
                            productId: r.productId,
                            fromId: r.warehouseId,
                            toId: r.storeId,
                            quantity: r.quantity,
                          }),
                        )
                      }
                    >
                      Confirmer {r.quantity}
                    </Button>
                  ) : (
                    "Lecture seule"
                  ),
                ])}
              />
            ) : (
              <p className="mt-4 text-sm">
                Activez le module Intelligence dans la configuration.
              </p>
            )}
          </Panel>
        </>
      )}
      {company && activeTab === "access" && (
        <Panel title="Accès à cette société">
          <p className="mb-4 text-sm text-muted">
            Les propriétaires du holding voient toutes les sociétés. Les autres
            membres doivent recevoir un accès explicite. Responsable :
            configuration et opérations ; Finance : trésorerie ; Opérations :
            achats, ventes et transferts sans approbation de commande ; Lecteur
            : consultation de la société entière.
          </p>
          {snapshot.holdingOwner && (
            <Form
              title="Attribuer un membre actif"
              busy={busy}
              onSubmit={(d) =>
                run(
                  withCompany({
                    type: "access.grant",
                    userId: text(d, "userId"),
                    role: text(d, "role"),
                    locationIds: d.getAll("locationIds").map(String),
                  }),
                )
              }
            >
              <Select
                name="userId"
                label="Membre (à inviter dans Membres)"
                options={(members.data || [])
                  .filter((m) => m.status === "ACTIVE")
                  .map((m) => ({
                    id: m.userId,
                    name: `${m.fullName || m.email} · ${m.email}`,
                  }))}
              />
              <Select
                name="role"
                label="Rôle société"
                options={[
                  { id: "MANAGER", name: "Responsable" },
                  { id: "FINANCE", name: "Finance" },
                  { id: "OPERATIONS", name: "Opérations" },
                  { id: "BUYER", name: "Service achats" },
                  { id: "WAREHOUSE", name: "Entrepôts & logistique" },
                  {
                    id: "HR",
                    name: "Ressources humaines (sans règlement bancaire)",
                  },
                  { id: "VIEWER", name: "Lecteur" },
                  { id: "CASHIER", name: "Caissier (magasins limités)" },
                  { id: "STORE_MANAGER", name: "Responsable magasin" },
                ]}
              />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Magasins autorisés (Caisse)
                </p>
                {locations
                  .filter((l) => l.kind === "STORE")
                  .map((l) => (
                    <label key={l.id} className="flex gap-2 text-sm">
                      <input type="checkbox" name="locationIds" value={l.id} />
                      {l.name}
                    </label>
                  ))}
              </div>
            </Form>
          )}
          <Table
            headers={["Membre", "Rôle", "Action"]}
            rows={rows(s.access).map((a) => [
              members.data?.find((m) => m.userId === a.userId)?.email ||
                a.userId,
              a.role,
              snapshot.holdingOwner ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(
                      withCompany({ type: "access.revoke", userId: a.userId }),
                    )
                  }
                >
                  Révoquer
                </Button>
              ) : (
                "—"
              ),
            ])}
          />
        </Panel>
      )}
      {company && manage && activeTab === "sales" && (
        <Form
          title="Configurer la Caisse du magasin"
          busy={busy}
          onSubmit={(d) =>
            run(
              withCompany({
                type: "pos.configure",
                locationId: text(d, "locationId"),
                cashAccountId: text(d, "cashAccountId"),
                cardAccountId: text(d, "cardAccountId"),
                customerId: text(d, "customerId"),
                maxDiscountBps: Math.round(Number(d.get("discount")) * 100),
              }),
            )
          }
        >
          <Select
            name="locationId"
            label="Magasin à configurer"
            options={locations.filter((l) => l.kind === "STORE")}
          />
          <Select
            name="cashAccountId"
            label="Compte de caisse"
            options={accounts.filter((a) => a.kind === "CASH")}
          />
          <Select
            name="cardAccountId"
            label="Compte des règlements carte"
            options={accounts.filter((a) => a.kind === "BANK")}
          />
          <Select
            name="customerId"
            label="Client comptoir"
            options={partners.filter((p) => p.kind === "CUSTOMER")}
          />
          <Text
            name="discount"
            label="Remise maximale caissier (%)"
            type="number"
            value="0"
          />
        </Form>
      )}
      <p className="mt-6 text-xs text-muted">
        Gestion opérationnelle : documents liés, réceptions partielles,
        transferts suivis et consolidation de gestion. La comptabilité légale,
        la TVA, la paie légale, les connexions bancaires et la consolidation
        comptable réglementaire restent hors périmètre. Les chiffres affichés ne
        sont pas des comptes certifiés.
      </p>
    </>
  );
}
