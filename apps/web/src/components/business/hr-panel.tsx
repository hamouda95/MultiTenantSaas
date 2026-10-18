"use client";
import { useState, type FormEvent } from "react";
import {
  currencyDigits,
  type BusinessState,
  type BusinessCompany,
} from "@saas/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Props = {
  state: BusinessState;
  company: BusinessCompany;
  manage: boolean;
  finance: boolean;
  busy: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
};
export function HrPanel({
  state: s,
  company: c,
  manage,
  finance,
  busy,
  run,
}: Props) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const employees = (s.employees || []).filter((e) => e.companyId === c.id);
  const payroll = (s.payroll || []).filter(
    (p) => p.companyId === c.id && p.period === period,
  );
  const accounts = s.accounts.filter(
    (a) => a.companyId === c.id && a.kind === "BANK",
  );
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-TN", {
      style: "currency",
      currency: c.currency,
    }).format(n / 10 ** currencyDigits(c.currency));
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setError("");
    const gross = Math.round(
      Number(d.get("gross")) * 10 ** currencyDigits(c.currency),
    );
    if (!Number.isSafeInteger(gross) || gross <= 0) {
      setError("Salaire invalide");
      return;
    }
    if (
      await run({
        type: "hr.employee.create",
        companyId: c.id,
        fullName: d.get("name"),
        jobTitle: d.get("job"),
        department: d.get("department"),
        grossSalary: gross,
        employerChargesBps: Math.round(Number(d.get("charges")) * 100),
        hiredAt: d.get("hired"),
        ...(d.get("location") ? { locationId: d.get("location") } : {}),
      })
    )
      form.reset();
  }
  if (!manage && !finance)
    return (
      <p>
        Les fiches et paies sont réservées à la direction et au rôle Finance.
      </p>
    );
  return (
    <section className="space-y-5 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-xl font-semibold">Ressources humaines</h2>
      <p className="text-sm text-muted">
        Fiches salariés et suivi du coût employeur. Les charges sont un taux de
        simulation paramétrable ; ce module ne produit pas de bulletin légal ni
        de déclaration sociale. Le règlement représente le coût employeur global
        et ne ventile pas les retenues et cotisations.
      </p>
      {manage && (
        <form
          onSubmit={create}
          className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3"
        >
          <label>
            Nom complet
            <Input name="name" required maxLength={160} />
          </label>
          <label>
            Poste
            <Input name="job" required maxLength={160} />
          </label>
          <label>
            Département
            <Input name="department" required maxLength={160} />
          </label>
          <label>
            Salaire brut ({c.currency})
            <Input
              name="gross"
              type="number"
              min="0.001"
              step={10 ** -currencyDigits(c.currency)}
              required
            />
          </label>
          <label>
            Charges employeur simulées (%)
            <Input
              name="charges"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue="18"
              required
            />
          </label>
          <label>
            Date d’entrée
            <Input
              name="hired"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            Établissement
            <select
              name="location"
              className="w-full rounded border border-border bg-surface p-2"
            >
              <option value="">Siège</option>
              {s.locations
                .filter((l) => l.companyId === c.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
          <Button disabled={busy}>Ajouter un salarié</Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <label>
          Mois de paie
          <Input
            aria-label="Mois de paie"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <label>
          Banque de règlement
          <select
            aria-label="Banque de règlement RH"
            className="block rounded border border-border bg-surface p-2"
            value={account || accounts[0]?.id || ""}
            onChange={(e) => setAccount(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm">
        {employees.filter((e) => e.status === "ACTIVE").length} salariés actifs
        · Coût du mois :{" "}
        <strong>{fmt(payroll.reduce((n, p) => n + p.total, 0))}</strong> ·
        Restant à régler :{" "}
        <strong>
          {fmt(
            payroll.filter((p) => !p.paidAt).reduce((n, p) => n + p.total, 0),
          )}
        </strong>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Salarié / poste",
                "Établissement",
                "Brut actuel",
                "Mois comptabilisé",
                "Actions",
              ].map((h) => (
                <th className="p-2" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const p = payroll.find((p) => p.employeeId === e.id);
              return (
                <tr className="border-t border-border" key={e.id}>
                  <td className="p-2">
                    {e.fullName}
                    <br />
                    <span className="text-muted">
                      {e.jobTitle} ·{" "}
                      {e.status === "ACTIVE" ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="p-2">
                    {s.locations.find((l) => l.id === e.locationId)?.name ||
                      "Siège"}
                  </td>
                  <td className="p-2">
                    {fmt(e.grossSalary)} + {e.employerChargesBps / 100}%
                  </td>
                  <td className="p-2">
                    {p
                      ? `${fmt(p.total)} · ${p.paidAt ? "Réglé" : "À régler"}`
                      : "Non comptabilisé"}
                  </td>
                  <td className="flex flex-wrap gap-2 p-2">
                    {finance && !p && e.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        disabled={busy || !period}
                        onClick={() =>
                          run({
                            type: "hr.payroll.record",
                            companyId: c.id,
                            employeeId: e.id,
                            period,
                          })
                        }
                      >
                        Comptabiliser
                      </Button>
                    )}
                    {finance && p && !p.paidAt && (
                      <Button
                        size="sm"
                        disabled={busy || !accounts.length}
                        onClick={() =>
                          run({
                            type: "hr.payroll.pay",
                            companyId: c.id,
                            payrollId: p.id,
                            accountId: account || accounts[0]?.id,
                          })
                        }
                      >
                        Régler
                      </Button>
                    )}
                    {manage && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run({
                            type: "hr.employee.status",
                            companyId: c.id,
                            employeeId: e.id,
                            status:
                              e.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          })
                        }
                      >
                        {e.status === "ACTIVE" ? "Désactiver" : "Réactiver"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
