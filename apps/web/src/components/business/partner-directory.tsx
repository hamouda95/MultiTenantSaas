"use client";
import { useState } from "react";
import type { BusinessPartner } from "@saas/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PartnerDirectory({
  partners,
  kind,
  editable,
  busy,
  run,
}: {
  partners: BusinessPartner[];
  kind: "SUPPLIER" | "CUSTOMER";
  editable: boolean;
  busy: boolean;
  run: (a: Record<string, unknown>) => Promise<boolean>;
}) {
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<BusinessPartner | null>(null);
  const noun = kind === "SUPPLIER" ? "fournisseur" : "client";
  return (
    <Card className="mb-5 space-y-4 p-5">
      <h2 className="font-semibold">
        {kind === "SUPPLIER" ? "Fournisseurs" : "Base clients"}
      </h2>
      <Input
        aria-label={`Rechercher un ${noun}`}
        placeholder="Nom, email ou téléphone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Nom",
                "Email",
                "Téléphone",
                "Adresse",
                ...(editable ? ["Action"] : []),
              ].map((h) => (
                <th key={h} className="border-b border-border p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {partners
              .filter(
                (p) =>
                  p.kind === kind &&
                  `${p.name} ${p.email} ${p.phone || ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((p) => (
                <tr key={p.id}>
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">{p.email || "—"}</td>
                  <td className="p-2">{p.phone || "—"}</td>
                  <td className="p-2">{p.address || "—"}</td>
                  {editable && (
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setEdit(p)}
                      >
                        Modifier
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <form
          key={edit?.id || "new"}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              d = new FormData(form);
            const ok = await run({
              type: edit ? "partner.update" : "partner.create",
              ...(edit ? { partnerId: edit.id } : { kind }),
              name: String(d.get("name")),
              email: String(d.get("email")),
              phone: String(d.get("phone")),
              address: String(d.get("address")),
            });
            if (ok) {
              setEdit(null);
              form.reset();
            }
          }}
        >
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Nom du {noun}
              <Input
                name="name"
                required
                maxLength={160}
                defaultValue={edit?.name}
              />
            </label>
            <label className="text-sm">
              Email du {noun}
              <Input
                name="email"
                type="email"
                maxLength={254}
                defaultValue={edit?.email}
              />
            </label>
            <label className="text-sm">
              Téléphone du {noun}
              <Input name="phone" maxLength={40} defaultValue={edit?.phone} />
            </label>
            <label className="text-sm">
              Adresse du {noun}
              <Input
                name="address"
                maxLength={300}
                defaultValue={edit?.address}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit">
                {edit ? "Enregistrer le contact" : `Créer le ${noun}`}
              </Button>
              {edit && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEdit(null)}
                >
                  Annuler
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      )}
    </Card>
  );
}
