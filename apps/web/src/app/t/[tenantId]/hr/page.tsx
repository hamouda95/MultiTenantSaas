"use client";
import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useTenantAccess } from "@/lib/auth";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function HrPage() {
  const { tenantId } = useParams<{tenantId:string}>();
  const { canManage } = useTenantAccess(tenantId);
  const cache = useQueryClient();
  const holding = useQuery({queryKey:["business",tenantId],queryFn:()=>api.business(tenantId)});
  const companies = holding.data?.state.companies ?? [];
  const [companyId,setCompanyId] = useState("");
  const selected = companies.some(c=>c.id===companyId) ? companyId : companies[0]?.id ?? "";
  const employees = useQuery({queryKey:["hr-employees",tenantId,selected],queryFn:()=>api.hrEmployees(tenantId,selected),enabled:!!selected,retry:false});
  const contracts = useQuery({queryKey:["hr-contracts",tenantId,selected],queryFn:()=>api.hrContracts(tenantId,selected),enabled:!!selected,retry:false});
  const leaves = useQuery({queryKey:["hr-leaves",tenantId,selected],queryFn:()=>api.hrLeaves(tenantId,selected),enabled:!!selected,retry:false});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  async function execute(action:()=>Promise<unknown>) {
    setBusy(true);setError("");setNotice("");
    try {
      await action();
      await Promise.all([
        cache.invalidateQueries({queryKey:["hr-employees",tenantId,selected]}),
        cache.invalidateQueries({queryKey:["hr-contracts",tenantId,selected]}),
        cache.invalidateQueries({queryKey:["hr-leaves",tenantId,selected]}),
      ]);
      setNotice("Enregistrement effectué.");
      return true;
    } catch(e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Une erreur est survenue.");
      return false;
    } finally {setBusy(false);}
  }
  async function submit(e:FormEvent<HTMLFormElement>,action:(data:FormData)=>Promise<unknown>) {
    e.preventDefault();const form=e.currentTarget;
    if(await execute(()=>action(new FormData(form)))) form.reset();
  }
  const input = "w-full rounded-lg border border-border bg-surface p-2 text-sm";
  return <div className="space-y-6">
    <PageHeader title="Ressources humaines" description="Salariés, contrats et demandes de congés de votre holding." />
    <div className="space-y-2">
      <label htmlFor="hr-company" className="block text-sm font-medium">Société</label>
      <select id="hr-company" className={input} value={selected} onChange={e=>setCompanyId(e.target.value)}>
        {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
    {holding.isLoading && <p role="status">Chargement des sociétés…</p>}
    {holding.isError && <p role="alert">Impossible de charger les sociétés.</p>}
    {!holding.isLoading && !holding.isError && !selected && <p>Aucune société accessible.</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {selected && <>
      <Card><CardHeader><CardTitle>Salariés</CardTitle></CardHeader><CardContent className="space-y-3">
        {employees.isLoading ? <p>Chargement…</p> : employees.isError ? <p role="alert">Accès RH indisponible ou non autorisé.</p> :
          <ul className="divide-y divide-border">{employees.data?.map(e=><li key={e.id} className="py-2 text-sm">{e.displayName} — depuis le {e.startDate}</li>)}</ul>}
        {canManage && <form className="grid gap-2 sm:grid-cols-3" onSubmit={e=>void submit(e,d=>api.hrCreateEmployee(tenantId,selected,{
          displayName:String(d.get("name")),startDate:String(d.get("start")), ...(d.get("userId") ? {userId:String(d.get("userId"))} : {})
        }))}>
          <label className="text-sm">Nom<Input name="name" required maxLength={255}/></label>
          <label className="text-sm">Date d'embauche<Input name="start" type="date" required/></label>
          <label className="text-sm">ID utilisateur (facultatif)<Input name="userId" placeholder="UUID du compte"/></label>
          <Button type="submit" loading={busy}>Ajouter un salarié</Button>
        </form>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Contrats</CardTitle></CardHeader><CardContent className="space-y-3">
        {contracts.isError ? <p role="alert">Contrats non accessibles.</p> :
          <ul className="divide-y divide-border">{contracts.data?.map(c=><li key={c.id} className="py-2 text-sm">{employees.data?.find(e=>e.id===c.employeeId)?.displayName ?? "Salarié"} — {c.startDate} — {c.monthlyGrossMinor} unités mineures {c.currency}/mois</li>)}</ul>}
        {canManage && <form className="grid gap-2 sm:grid-cols-2" onSubmit={e=>void submit(e,d=>api.hrCreateContract(tenantId,selected,{
          employeeId:String(d.get("employee")),startDate:String(d.get("start")),monthlyGrossMinor:Number(d.get("salary")),currency:String(d.get("currency"))
        }))}>
          <label className="text-sm">Salarié<select className={input} name="employee" required>{employees.data?.map(e=><option key={e.id} value={e.id}>{e.displayName}</option>)}</select></label>
          <label className="text-sm">Début<Input type="date" name="start" required/></label>
          <label className="text-sm">Salaire brut mensuel (unités mineures)<Input name="salary" type="number" min={0} step={1} required/></label>
          <label className="text-sm">Devise<Input name="currency" defaultValue="EUR" minLength={3} maxLength={3} required/></label>
          <Button type="submit" loading={busy}>Créer le contrat</Button>
        </form>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Congés</CardTitle></CardHeader><CardContent className="space-y-3">
        {leaves.isError ? <p role="alert">Congés non accessibles.</p> :
          <ul className="divide-y divide-border">{leaves.data?.map(l=><li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>{employees.data?.find(e=>e.id===l.employeeId)?.displayName ?? "Salarié"} : {l.startsOn} → {l.endsOn} — {l.status}</span>
            {canManage && l.status==="PENDING" && <span className="flex gap-2">
              <Button loading={busy} onClick={()=>void execute(()=>api.hrDecideLeave(tenantId,selected,l.id,"APPROVED"))}>Approuver</Button>
              <Button loading={busy} variant="secondary" onClick={()=>void execute(()=>api.hrDecideLeave(tenantId,selected,l.id,"REJECTED"))}>Refuser</Button>
            </span>}
          </li>)}</ul>}
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={e=>void submit(e,d=>api.hrRequestLeave(tenantId,selected,{
          employeeId:String(d.get("employee")),startsOn:String(d.get("startsOn")),endsOn:String(d.get("endsOn"))
        }))}>
          <label className="text-sm">Salarié<select className={input} name="employee" required>{employees.data?.map(e=><option key={e.id} value={e.id}>{e.displayName}</option>)}</select></label>
          <label className="text-sm">Du<Input type="date" name="startsOn" required/></label>
          <label className="text-sm">Au<Input type="date" name="endsOn" required/></label>
          <Button type="submit" loading={busy}>Demander un congé</Button>
        </form>
      </CardContent></Card>
    </>}
  </div>;
}
