import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { accountBalance, productStock, availableStock } from "@saas/types";
import type { BusinessState, PosSession, PosSnapshot } from "@saas/types";
import type { BusinessAction } from "./business.schema";
const fail = (m: string): never => {
  throw new BadRequestException(m);
};
const safe = (n: number) =>
  Number.isSafeInteger(n) && Math.abs(n) <= 9e12
    ? n
    : fail("Montant hors limite");
function grant(s: BusinessState, c: string, u: string, m?: string) {
  return s.access.find(
    (g) => g.companyId === c && g.userId === u && (!m || g.membershipId === m),
  );
}
export function posStores(
  s: BusinessState,
  u: string,
  owner: boolean,
  m?: string,
) {
  return s.locations.filter(
    (l) =>
      l.kind === "STORE" &&
      s.companies.some(
        (c) => c.id === l.companyId && (!c.status || c.status === "ACTIVE"),
      ) &&
      (owner ||
        grant(s, l.companyId, u, m)?.role === "MANAGER" ||
        (["CASHIER", "STORE_MANAGER"].includes(
          grant(s, l.companyId, u, m)?.role || "",
        ) &&
          grant(s, l.companyId, u, m)?.locationIds?.includes(l.id))),
  );
}
export const posExpected = (s: BusinessState, p: PosSession) =>
  safe(
    p.opening +
      s.payments
        .filter(
          (x) => x.posSessionId === p.id && x.accountId === p.cashAccountId,
        )
        .reduce((n, x) => n + x.amount, 0),
  );
function manages(
  s: BusinessState,
  c: string,
  l: string,
  u: string,
  owner: boolean,
  m?: string,
) {
  const g = grant(s, c, u, m);
  return (
    owner ||
    g?.role === "MANAGER" ||
    (g?.role === "STORE_MANAGER" && !!g.locationIds?.includes(l))
  );
}
export function posSnapshot(
  s: BusinessState,
  version: number,
  u: string,
  owner: boolean,
  m?: string,
): PosSnapshot {
  const stores = posStores(s, u, owner, m),
    ids = new Set(stores.map((x) => x.id)),
    companies = new Set(stores.map((x) => x.companyId));
  return {
    version,
    userId: u,
    stores: stores.map((l) => {
      const c = s.companies.find((c) => c.id === l.companyId)!,
        config = s.posConfigs?.find((x) => x.locationId === l.id);
      return {
        id: l.id,
        companyId: l.companyId,
        name: l.name,
        companyName: c.name,
        currency: c.currency,
        canManage: manages(s, c.id, l.id, u, owner, m),
        canReconcile: owner || grant(s, c.id, u, m)?.role === "MANAGER",
        configured: !!config,
        maxDiscountBps: config?.maxDiscountBps || 0,
      };
    }),
    customers: s.partners
      .filter((p) => p.kind === "CUSTOMER" && companies.has(p.companyId))
      .map((p) => ({
        id: p.id,
        companyId: p.companyId,
        name: p.name,
        email: p.email,
        phone: p.phone || "",
      })),
    products: s.products
      .filter((p) => companies.has(p.companyId))
      .map((p) => ({
        id: p.id,
        companyId: p.companyId,
        sku: p.sku,
        name: p.name,
        size: p.size,
        color: p.color,
        barcode: p.barcode || "",
        price: p.salePrice || 0,
      })),
    availability: s.products
      .filter((p) => companies.has(p.companyId))
      .flatMap((p) =>
        s.locations
          .filter((l) => l.companyId === p.companyId)
          .map((l) => ({
            productId: p.id,
            locationId: l.id,
            locationName: l.name,
            quantity: availableStock(s, p.id, l.id),
          })),
      ),
    sessions: (s.posSessions || [])
      .filter(
        (p) =>
          ids.has(p.locationId) &&
          (p.userId === u ||
            manages(s, p.companyId, p.locationId, u, owner, m)),
      )
      .map((p) => ({
        ...p,
        expected: p.closedAt ? p.expected : posExpected(s, p),
      })),
    tickets: s.sales
      .filter(
        (x) =>
          x.posSessionId &&
          ids.has(x.locationId) &&
          (s.posSessions?.find((p) => p.id === x.posSessionId)?.userId === u ||
            manages(s, x.companyId, x.locationId, u, owner, m)),
      )
      .map((x) => ({
        id: x.id,
        companyId: x.companyId,
        locationId: x.locationId,
        reference: x.reference,
        customerId: x.customerId,
        date: x.date,
        total: x.total,
        returned: x.returned,
        lines: x.lines.map((l) => ({ ...l })),
        tenders: s.payments
          .filter(
            (p) =>
              p.invoiceId === s.invoices.find((i) => i.sourceId === x.id)?.id &&
              p.amount > 0,
          )
          .map((p) => ({
            method:
              s.accounts.find((a) => a.id === p.accountId)?.kind === "CASH"
                ? ("CASH" as const)
                : ("CARD" as const),
            amount: p.amount,
          })),
      })),
  };
}
export function applyPos(
  s: BusinessState,
  a: Extract<BusinessAction, { type: `pos.${string}` }>,
  u: string,
  owner: boolean,
  now: string,
  m?: string,
) {
  s.posConfigs ??= [];
  s.posSessions ??= [];
  s.cashAdjustments ??= [];
  const c = s.companies.find((c) => c.id === a.companyId);
  if (!c || (c.status && c.status !== "ACTIVE")) fail("Société inactive");
  if (!["inventory", "sales", "finance"].every((k) => c!.modules.includes(k)))
    fail("Activez ventes, stocks et finance");
  const locationId =
    "locationId" in a
      ? a.locationId
      : s.posSessions.find(
          (p) => p.id === a.sessionId && p.companyId === a.companyId,
        )?.locationId;
  if (
    !locationId ||
    !posStores(s, u, owner, m).some(
      (l) => l.id === locationId && l.companyId === a.companyId,
    )
  )
    throw new ForbiddenException("Magasin non autorisé");
  const manager = manages(s, a.companyId, locationId, u, owner, m),
    globalManager = owner || grant(s, a.companyId, u, m)?.role === "MANAGER";
  const id = randomUUID(),
    config = s.posConfigs.find(
      (x) => x.locationId === locationId && x.companyId === a.companyId,
    );
  if (a.type === "pos.customer.create") {
    s.partners.push({
      id,
      companyId: a.companyId,
      name: a.name,
      kind: "CUSTOMER",
      email: a.email,
      phone: a.phone,
      address: "",
    });
  } else if (a.type === "pos.configure") {
    if (!globalManager)
      throw new ForbiddenException(
        "Configuration réservée au responsable société",
      );
    if (s.posSessions.some((p) => p.locationId === locationId && !p.closedAt))
      fail("Fermez la session avant configuration");
    if (
      !s.accounts.some(
        (x) =>
          x.companyId === a.companyId &&
          x.id === a.cashAccountId &&
          x.kind === "CASH",
      ) ||
      !s.accounts.some(
        (x) =>
          x.companyId === a.companyId &&
          x.id === a.cardAccountId &&
          x.kind === "BANK",
      ) ||
      !s.partners.some(
        (x) =>
          x.companyId === a.companyId &&
          x.id === a.customerId &&
          x.kind === "CUSTOMER",
      )
    )
      fail("Comptes ou client comptoir invalides");
    s.posConfigs = s.posConfigs.filter((x) => x.locationId !== locationId);
    s.posConfigs.push({ id, ...a, locationId });
  } else {
    if (!config) fail("Caisse non configurée");
    if (a.type === "pos.open") {
      if (
        s.posSessions.some(
          (p) =>
            p.cashAccountId === config!.cashAccountId &&
            (!p.closedAt || !p.reconciledAt),
        )
      )
        fail("Session ouverte ou écart non rapproché pour cette caisse");
      if (a.opening > accountBalance(s, config!.cashAccountId))
        fail("Fond supérieur au solde de caisse");
      s.posSessions.push({
        id,
        companyId: a.companyId,
        locationId,
        userId: u,
        cashAccountId: config!.cashAccountId,
        opening: a.opening,
        openedAt: now,
      });
    } else {
      const session = s.posSessions.find(
        (p) => p.id === a.sessionId && p.companyId === a.companyId,
      )!;
      if (!session) fail("Session introuvable");
      if (session.userId !== u && !manager)
        throw new ForbiddenException("Session d’un autre utilisateur");
      if (a.type === "pos.reconcile") {
        if (!globalManager)
          throw new ForbiddenException(
            "Rapprochement réservé au responsable société",
          );
        if (!session.closedAt || session.reconciledAt)
          fail("Session non clôturée ou déjà rapprochée");
        s.cashAdjustments.push({
          id,
          companyId: a.companyId,
          accountId: session.cashAccountId,
          amount: session.variance || 0,
          reason: a.reason,
          date: now,
        });
        session.reconciledAt = now;
      } else {
        if (session.closedAt) fail("Session fermée");
        if (a.type === "pos.close") {
          session.expected = posExpected(s, session);
          session.counted = a.counted;
          session.variance = a.counted - session.expected;
          session.closedAt = now;
          session.reason = a.reason;
          if (!session.variance) session.reconciledAt = now;
        }
        if (a.type === "pos.checkout") {
          const customerId = a.customerId || config!.customerId;
          if (
            !s.partners.some(
              (p) =>
                p.id === customerId &&
                p.companyId === a.companyId &&
                p.kind === "CUSTOMER",
            )
          )
            fail("Client non autorisé");
          if (!manager && a.discountBps > config!.maxDiscountBps)
            throw new ForbiddenException("Remise non autorisée");
          const lines = a.items.map((l) => {
            const p = s.products.find(
              (p) => p.id === l.productId && p.companyId === a.companyId,
            );
            if (!p?.salePrice) fail("Produit sans tarif");
            if (availableStock(s, l.productId, locationId) < l.quantity)
              fail("Stock insuffisant");
            return {
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: Math.round(
                (p!.salePrice! * (10000 - a.discountBps)) / 10000,
              ),
            };
          });
          const total = safe(
            lines.reduce((n, l) => safe(n + safe(l.unitPrice * l.quantity)), 0),
          );
          if (total <= 0 || safe(a.cash + a.card) !== total)
            fail("Règlements différents du total");
          if (a.cashGiven < a.cash) fail("Espèces reçues insuffisantes");
          const unitCosts: Record<string, number> = {};
          let cost = 0;
          for (const l of lines) {
            const p = s.products.find((p) => p.id === l.productId)!;
            unitCosts[p.id] = p.cost;
            cost = safe(cost + safe(p.cost * l.quantity));
            s.movements.push({
              id: randomUUID(),
              companyId: a.companyId,
              productId: p.id,
              locationId,
              quantity: -l.quantity,
              reason: "SALE",
              sourceId: id,
              date: now,
            });
          }
          const reference = `T-${id.toUpperCase()}`;
          s.sales.push({
            id,
            companyId: a.companyId,
            reference,
            customerId,
            locationId,
            lines,
            unitCosts,
            cost,
            total,
            returned: false,
            date: now,
            posSessionId: session.id,
          });
          const invoiceId = randomUUID();
          s.invoices.push({
            id: invoiceId,
            companyId: a.companyId,
            kind: "RECEIVABLE",
            reference: `SALE:${reference}`,
            partnerId: customerId,
            amount: total,
            dueDate: now.slice(0, 10),
            sourceId: id,
            createdAt: now,
          });
          for (const [accountId, amount] of [
            [config!.cashAccountId, a.cash],
            [config!.cardAccountId, a.card],
          ] as [string, number][])
            if (amount)
              s.payments.push({
                id: randomUUID(),
                companyId: a.companyId,
                invoiceId,
                accountId,
                amount,
                date: now,
                posSessionId: session.id,
              });
        }
        if (a.type === "pos.refund") {
          if (!manager)
            throw new ForbiddenException(
              "Remboursement réservé au responsable",
            );
          const sale = s.sales.find(
            (x) =>
              x.id === a.saleId &&
              x.companyId === a.companyId &&
              x.locationId === locationId &&
              x.posSessionId,
          );
          if (!sale || sale.returned)
            fail("Ticket introuvable ou déjà remboursé");
          const invoice = s.invoices.find((i) => i.sourceId === sale!.id)!;
          for (const p of s.payments.filter(
            (p) => p.invoiceId === invoice.id && p.amount > 0,
          )) {
            const cash =
              s.accounts.find((x) => x.id === p.accountId)?.kind === "CASH";
            if (cash && p.accountId !== session.cashAccountId)
              fail("La caisse du ticket a changé");
            if (
              accountBalance(s, p.accountId) < p.amount ||
              (cash && posExpected(s, session) < p.amount)
            )
              fail("Solde insuffisant pour remboursement");
            s.payments.push({
              id: randomUUID(),
              companyId: a.companyId,
              invoiceId: invoice.id,
              accountId: p.accountId,
              amount: -p.amount,
              date: now,
              posSessionId: session.id,
            });
          }
          for (const l of sale!.lines) {
            const p = s.products.find((p) => p.id === l.productId)!;
            const before = productStock(s, p.id);
            p.cost = safe(
              Math.round(
                (before * p.cost + l.quantity * sale!.unitCosts[p.id]) /
                  (before + l.quantity),
              ),
            );
            s.movements.push({
              id: randomUUID(),
              companyId: a.companyId,
              productId: p.id,
              locationId,
              quantity: l.quantity,
              reason: "RETURN",
              sourceId: sale!.id,
              date: now,
            });
          }
          sale!.returned = true;
          invoice.amount = 0;
        }
      }
    }
  }
  s.events.push({
    id,
    companyId: a.companyId,
    action: a.type,
    actorId: u,
    date: now,
    reference: "reason" in a ? a.reason : locationId,
  });
  return s;
}
