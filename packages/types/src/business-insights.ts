import type {
  BusinessState,
  BusinessCompany,
  ReplenishmentSuggestion,
} from "./business";
export function currencyDigits(currency: string) {
  return currency === "TND" ? 3 : currency === "JPY" ? 0 : 2;
}
export function invoicePaid(s: BusinessState, id: string) {
  return s.payments
    .filter((p) => p.invoiceId === id)
    .reduce((n, p) => n + p.amount, 0);
}
export function productStock(
  s: BusinessState,
  id: string,
  locationId?: string,
) {
  return s.movements
    .filter(
      (m) => m.productId === id && (!locationId || m.locationId === locationId),
    )
    .reduce((n, m) => n + m.quantity, 0);
}
export function accountBalance(s: BusinessState, id: string) {
  return (
    (s.accounts.find((a) => a.id === id)?.opening || 0) +
    financingCashFlow(s, id) +
    (s.cashAdjustments || [])
      .filter((x) => x.accountId === id)
      .reduce((n, x) => n + x.amount, 0) +
    s.payments
      .filter((p) => p.accountId === id)
      .reduce(
        (n, p) =>
          n +
          (s.invoices.find((i) => i.id === p.invoiceId)?.kind === "RECEIVABLE"
            ? p.amount
            : -p.amount),
        0,
      ) -
    s.expenses
      .filter((e) => e.accountId === id)
      .reduce((n, e) => n + e.amount, 0) +
    s.cashTransfers.reduce(
      (n, t) =>
        n + (t.toId === id ? t.amount : 0) - (t.fromId === id ? t.amount : 0),
      0,
    )
  );
}
export function companyMetrics(
  s: BusinessState,
  c: BusinessCompany,
  now = new Date(),
) {
  const sales = s.sales.filter((x) => x.companyId === c.id && !x.returned);
  const invoices = s.invoices.filter((x) => x.companyId === c.id);
  const due = (kind: string, days?: number) =>
    invoices
      .filter(
        (i) =>
          i.kind === kind &&
          (days === undefined ||
            i.dueDate <=
              new Date(now.getTime() + days * 86400000)
                .toISOString()
                .slice(0, 10)),
      )
      .reduce((n, i) => n + i.amount - invoicePaid(s, i.id), 0);
  const bank = s.accounts
    .filter((a) => a.companyId === c.id && a.kind === "BANK")
    .reduce((n, a) => n + accountBalance(s, a.id), 0);
  const cash = s.accounts
    .filter((a) => a.companyId === c.id && a.kind === "CASH")
    .reduce((n, a) => n + accountBalance(s, a.id), 0);
  const revenue = sales.reduce((n, x) => n + x.total, 0),
    cogs = sales.reduce((n, x) => n + x.cost, 0),
    expenses = s.expenses
      .filter((e) => e.companyId === c.id)
      .reduce((n, e) => n + e.amount, 0);
  return {
    bank,
    cash,
    revenue,
    cogs,
    expenses,
    bankDebt: (s.financings || [])
      .filter((f) => f.companyId === c.id)
      .reduce((n, f) => n + financingOutstanding(s, f.id).total, 0),
    grossMargin: revenue - cogs,
    operatingContribution:
      revenue -
      cogs -
      expenses -
      (s.financingPayments || [])
        .filter((p) => p.companyId === c.id)
        .reduce((n, p) => n + p.interest, 0),
    payables: due("PAYABLE"),
    receivables: due("RECEIVABLE"),
    payables30: due("PAYABLE", 30),
    receivables30: due("RECEIVABLE", 30),
    cash30:
      bank +
      cash +
      due("RECEIVABLE", 30) -
      due("PAYABLE", 30) -
      (s.financings || [])
        .filter(
          (f) =>
            f.companyId === c.id &&
            f.dueDate <=
              new Date(now.getTime() + 30 * 86400000)
                .toISOString()
                .slice(0, 10),
        )
        .reduce((n, f) => n + financingOutstanding(s, f.id).total, 0),
    inventory: s.products
      .filter((p) => p.companyId === c.id)
      .reduce((n, p) => n + productStock(s, p.id) * p.cost, 0),
    units: s.products
      .filter((p) => p.companyId === c.id)
      .reduce((n, p) => n + productStock(s, p.id), 0),
    openOrders: s.orders.filter(
      (o) =>
        o.companyId === c.id && !["RECEIVED", "CANCELLED"].includes(o.status),
    ).length,
  };
}
/** Transparent 30-day demand rule; never calls an AI model or moves stock automatically. */
export function replenishment(
  s: BusinessState,
  c: BusinessCompany,
  warehouseId: string,
  now = new Date(),
): ReplenishmentSuggestion[] {
  if (
    !s.locations.some(
      (l) =>
        l.companyId === c.id && l.kind === "WAREHOUSE" && l.id === warehouseId,
    )
  )
    return [];
  const stores = s.locations.filter(
    (l) => l.companyId === c.id && l.kind === "STORE",
  );
  const from = now.getTime() - 30 * 86400000;
  const sales = s.sales.filter(
    (x) =>
      x.companyId === c.id &&
      !x.returned &&
      Date.parse(x.date) >= from &&
      Date.parse(x.date) <= now.getTime(),
  );
  const result: ReplenishmentSuggestion[] = [];
  for (const product of s.products.filter((p) => p.companyId === c.id)) {
    let available = productStock(s, product.id, warehouseId);
    const rows = stores
      .map((store) => {
        const history = sales.filter(
          (x) =>
            x.locationId === store.id &&
            x.lines.some((l) => l.productId === product.id),
        );
        const sold = history.reduce(
          (n, x) =>
            n +
            x.lines
              .filter((l) => l.productId === product.id)
              .reduce((a, l) => a + l.quantity, 0),
          0,
        );
        const dailyDemand = sold / 30,
          current = productStock(s, product.id, store.id);
        const target = Math.max(
          c.minimumStock,
          Math.ceil(dailyDemand * (c.leadDays + c.coverDays)),
        );
        return {
          storeId: store.id,
          sold,
          dailyDemand,
          stock: current,
          target,
          need: Math.max(0, target - current),
          confidence:
            history.length >= 10 ? ("MEDIUM" as const) : ("LOW" as const),
        };
      })
      .sort(
        (a, b) =>
          b.need / Math.max(1, b.target) - a.need / Math.max(1, a.target) ||
          a.storeId.localeCompare(b.storeId),
      );
    for (const row of rows) {
      const quantity = Math.min(available, row.need),
        starting = available;
      available -= quantity;
      if (row.need > 0)
        result.push({
          productId: product.id,
          storeId: row.storeId,
          warehouseId,
          sold: row.sold,
          dailyDemand: row.dailyDemand,
          stock: row.stock,
          target: row.target,
          quantity,
          available: starting,
          confidence: row.confidence,
          explanation: `${row.sold} unités vendues sur 30 jours ÷ 30 × (${c.leadDays} jours de délai + ${c.coverDays} jours de couverture), minimum ${c.minimumStock}. Allocation plafonnée au stock entrepôt restant. Historique limité : vérifier avant transfert.`,
        });
    }
  }
  return result;
}

/** Drawdowns are debt, never sales. Repayments reduce cash by principal + interest. */
export function financingCashFlow(s: BusinessState, accountId: string) {
  return (
    (s.financings || [])
      .filter((f) => f.accountId === accountId && f.drawnAt)
      .reduce((n, f) => n + f.principal, 0) -
    (s.financingPayments || [])
      .filter((p) => p.accountId === accountId)
      .reduce((n, p) => n + p.principal + p.interest, 0)
  );
}
export function financingOutstanding(s: BusinessState, financingId: string) {
  const f = s.financings?.find((f) => f.id === financingId);
  if (!f?.drawnAt) return { principal: 0, interest: 0, total: 0 };
  const paid = (s.financingPayments || []).filter(
    (p) => p.financingId === financingId,
  );
  const principal = f.principal - paid.reduce((n, p) => n + p.principal, 0);
  const interest = f.interest - paid.reduce((n, p) => n + p.interest, 0);
  return { principal, interest, total: principal + interest };
}
export function modelInventory(
  s: BusinessState,
  companyId: string,
  model: string,
  locationId?: string,
) {
  const variants = s.products.filter(
    (p) => p.companyId === companyId && (p.model || p.name) === model,
  );
  const colors = new Map<
    string,
    {
      color: string;
      received: number;
      sold: number;
      returned: number;
      other: number;
      stock: number;
    }
  >();
  for (const p of variants) {
    const color = p.color || "Sans couleur";
    const row = colors.get(color) || {
      color,
      received: 0,
      sold: 0,
      returned: 0,
      other: 0,
      stock: 0,
    };
    for (const m of s.movements.filter(
      (m) =>
        m.companyId === companyId &&
        m.productId === p.id &&
        (!locationId || m.locationId === locationId),
    )) {
      if (m.reason === "RECEIPT") row.received += m.quantity;
      else if (m.reason === "SALE") row.sold -= m.quantity;
      else if (m.reason === "RETURN") row.returned += m.quantity;
      else row.other += m.quantity;
      row.stock += m.quantity;
    }
    colors.set(color, row);
  }
  return [...colors.values()].sort((a, b) => a.color.localeCompare(b.color));
}
