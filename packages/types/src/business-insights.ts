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
    financingCashFlow(s, id) -
    payrollCashFlow(s, id) +
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
  const revenue =
      sales.reduce((n, x) => n + x.total, 0) +
      (s.intercompany || [])
        .filter((x) => x.companyId === c.id)
        .reduce((n, x) => n + x.amount, 0),
    cogs = sales.reduce((n, x) => n + x.cost, 0),
    expenses =
      s.expenses
        .filter((e) => e.companyId === c.id)
        .reduce((n, e) => n + e.amount, 0) +
      (s.intercompany || [])
        .filter((x) => x.toCompanyId === c.id)
        .reduce((n, x) => n + x.amount, 0);
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
      payrollCosts(s, c.id) -
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
      (s.payrollSummary
        ? s.payrollSummary
            .filter((p) => p.companyId === c.id)
            .reduce((n, p) => n + p.total - p.paid, 0)
        : (s.payroll || [])
            .filter((p) => p.companyId === c.id && !p.paidAt)
            .reduce((n, p) => n + p.total, 0)) -
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
    inventory:
      transitValue(s, c.id) +
      s.products
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
    let available = availableStock(s, product.id, warehouseId);
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
          current = availableStock(s, product.id, store.id);
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
          need: Math.max(
            0,
            target -
              current -
              (s.transfers || [])
                .filter(
                  (t) =>
                    t.companyId === c.id &&
                    t.toId === store.id &&
                    t.status === "IN_TRANSIT",
                )
                .reduce(
                  (n, t) =>
                    n +
                    t.lines
                      .filter((l) => l.productId === product.id)
                      .reduce((v, l) => v + l.quantity, 0),
                  0,
                ),
          ),
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
          explanation: `${row.sold} unités vendues sur 30 jours ÷ 30 × (${c.leadDays} jours de délai + ${c.coverDays} jours de couverture), minimum ${c.minimumStock}. Les quantités déjà en transit vers ce magasin sont déduites. Les réservations clients sont déduites des stocks magasin et entrepôt. Allocation plafonnée au stock entrepôt restant. Historique limité : vérifier avant transfert.`,
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

export function payrollCashFlow(s: BusinessState, accountId: string) {
  return s.payrollSummary
    ? s.payrollSummary
        .filter((p) => p.accountId === accountId)
        .reduce((n, p) => n + p.paid, 0)
    : (s.payroll || [])
        .filter((p) => p.accountId === accountId && p.paidAt)
        .reduce((n, p) => n + p.total, 0);
}
export function payrollCosts(
  s: BusinessState,
  companyId: string,
  period?: string,
) {
  return s.payrollSummary
    ? s.payrollSummary
        .filter(
          (p) =>
            p.companyId === companyId &&
            (!period || p.period.startsWith(period)),
        )
        .reduce((n, p) => n + p.total, 0)
    : (s.payroll || [])
        .filter(
          (p) =>
            p.companyId === companyId &&
            (!period || p.period.startsWith(period)),
        )
        .reduce((n, p) => n + p.total, 0);
}
/** Management P&L: cost of shipped sales, returns in their actual month, payroll accrued by period,
 * other costs and interest as entered. No depreciation, tax or intercompany eliminations. */
export function annualPnl(s: BusinessState, companyId: string, year: number) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    period: `${year}-${String(i + 1).padStart(2, "0")}`,
    revenue: 0,
    cogs: 0,
    expenses: 0,
    payroll: 0,
    interest: 0,
    grossMargin: 0,
    operating: 0,
    beforeTax: 0,
  }));
  const row = (date: string) =>
    months.find((m) => m.period === date.slice(0, 7));
  for (const sale of s.sales.filter((x) => x.companyId === companyId)) {
    const m = row(sale.date);
    if (m) {
      m.revenue += sale.total;
      m.cogs += sale.cost;
    }
    if (sale.returned) {
      const returnedAt =
        s.movements.find((x) => x.sourceId === sale.id && x.reason === "RETURN")
          ?.date || sale.date;
      const r = row(returnedAt);
      if (r) {
        r.revenue -= sale.total;
        r.cogs -= sale.cost;
      }
    }
  }
  for (const e of s.expenses.filter((x) => x.companyId === companyId)) {
    const m = row(e.date);
    if (m) m.expenses += e.amount;
  }
  for (const p of (s.financingPayments || []).filter(
    (x) => x.companyId === companyId,
  )) {
    const m = row(p.date);
    if (m) m.interest += p.interest;
  }
  for (const x of s.intercompany || []) {
    const m = row(x.date);
    if (!m) continue;
    if (x.companyId === companyId) m.revenue += x.amount;
    if (x.toCompanyId === companyId) m.expenses += x.amount;
  }
  for (const m of months) {
    m.payroll = payrollCosts(s, companyId, m.period);
    m.grossMargin = m.revenue - m.cogs;
    m.operating = m.grossMargin - m.expenses - m.payroll;
    m.beforeTax = m.operating - m.interest;
  }
  const total = months.reduce(
    (a, m) => {
      for (const k of [
        "revenue",
        "cogs",
        "expenses",
        "payroll",
        "interest",
        "grossMargin",
        "operating",
        "beforeTax",
      ] as const)
        a[k] += m[k];
      return a;
    },
    {
      revenue: 0,
      cogs: 0,
      expenses: 0,
      payroll: 0,
      interest: 0,
      grossMargin: 0,
      operating: 0,
      beforeTax: 0,
    },
  );
  return { months, total };
}
export function purchaseNeeds(
  s: BusinessState,
  c: BusinessCompany,
  sample: { model: string; leadDays: number; minimumQuantity: number },
  now = new Date(),
) {
  const start = new Date(now.getTime() - 30 * 86400000).toISOString();
  const variants = s.products.filter(
    (p) => p.companyId === c.id && (p.model || p.name) === sample.model,
  );
  const rows = variants.map((p) => {
    const sold = s.sales
      .filter(
        (x) =>
          x.companyId === c.id &&
          x.date >= start &&
          x.date <= now.toISOString() &&
          !x.returned,
      )
      .reduce(
        (n, x) =>
          n +
          x.lines
            .filter((l) => l.productId === p.id)
            .reduce((t, l) => t + l.quantity, 0),
        0,
      );
    const incoming = s.orders
      .filter(
        (o) =>
          o.companyId === c.id && !["RECEIVED", "CANCELLED"].includes(o.status),
      )
      .reduce(
        (n, o) =>
          n +
          o.lines
            .filter((l) => l.productId === p.id)
            .reduce(
              (t, l) =>
                t +
                Math.max(0, l.quantity - orderReceived(s, o.id, l.productId)),
              0,
            ),
        0,
      );
    const inTransit = (s.transfers || [])
      .filter((t) => t.companyId === c.id && t.status === "IN_TRANSIT")
      .reduce(
        (n, t) =>
          n +
          t.lines
            .filter((l) => l.productId === p.id)
            .reduce((v, l) => v + l.quantity, 0),
        0,
      );
    const target =
      Math.ceil((sold / 30) * (sample.leadDays + c.coverDays)) + c.minimumStock;
    return {
      productId: p.id,
      sold,
      stock: availableStock(s, p.id),
      incoming: incoming + inTransit,
      quantity: Math.max(
        0,
        target - availableStock(s, p.id) - incoming - inTransit,
      ),
    };
  });
  const needed = rows.reduce((n, r) => n + r.quantity, 0);
  if (needed > 0 && needed < sample.minimumQuantity && rows.length) {
    let extra = sample.minimumQuantity - needed;
    for (let i = 0; extra > 0; i = (i + 1) % rows.length) {
      rows[i].quantity++;
      extra--;
    }
  }
  return rows;
}

/** Received quantities from the immutable stock movement history, including legacy full receipts. */
export function orderReceived(
  s: BusinessState,
  orderId: string,
  productId: string,
) {
  return s.movements
    .filter(
      (m) =>
        m.reason === "RECEIPT" &&
        m.sourceId === orderId &&
        m.productId === productId,
    )
    .reduce((n, m) => n + m.quantity, 0);
}
export function transitValue(s: BusinessState, companyId: string) {
  return (s.transfers || [])
    .filter((t) => t.companyId === companyId && t.status === "IN_TRANSIT")
    .reduce(
      (n, t) => n + t.lines.reduce((v, l) => v + l.quantity * l.unitCost, 0),
      0,
    );
}
export function intercompanyOutstanding(s: BusinessState, invoiceId: string) {
  const i = s.invoices.find((i) => i.id === invoiceId);
  return i ? Math.max(0, i.amount - invoicePaid(s, i.id)) : 0;
}
export function groupAnnual(
  s: BusinessState,
  companyIds: string[],
  year: number,
  currency: string,
  fromMonth = 1,
  toMonth = 12,
) {
  const ids = new Set(
    s.companies
      .filter((c) => companyIds.includes(c.id) && c.currency === currency)
      .map((c) => c.id),
  );
  const keys = [
    "revenue",
    "cogs",
    "expenses",
    "payroll",
    "interest",
    "grossMargin",
    "operating",
    "beforeTax",
  ] as const;
  const total = {
    revenue: 0,
    cogs: 0,
    expenses: 0,
    payroll: 0,
    interest: 0,
    grossMargin: 0,
    operating: 0,
    beforeTax: 0,
  };
  const companies = s.companies
    .filter((c) => ids.has(c.id))
    .map((company) => {
      const p = annualPnl(s, company.id, year);
      const period = { ...total };
      for (const m of p.months.slice(fromMonth - 1, toMonth))
        for (const k of keys) period[k] += m[k];
      return { company, total: period };
    });
  for (const row of companies) for (const k of keys) total[k] += row.total[k];
  const elimination = (s.intercompany || [])
    .filter(
      (x) =>
        ids.has(x.companyId) &&
        ids.has(x.toCompanyId) &&
        x.date.slice(0, 4) === String(year) &&
        Number(x.date.slice(5, 7)) >= fromMonth &&
        Number(x.date.slice(5, 7)) <= toMonth,
    )
    .reduce((n, x) => n + x.amount, 0);
  const consolidated = {
    ...total,
    revenue: total.revenue - elimination,
    expenses: total.expenses - elimination,
    grossMargin: total.grossMargin - elimination,
  };
  return { companies, total, elimination, consolidated };
}

/** Reservations reduce sellable stock, never physical ownership or valuation. */
export function customerDelivered(
  s: BusinessState,
  orderId: string,
  productId: string,
) {
  return (s.customerDeliveries || [])
    .filter((d) => d.orderId === orderId)
    .reduce(
      (n, d) =>
        n +
        d.lines
          .filter((l) => l.productId === productId)
          .reduce((a, l) => a + l.quantity, 0),
      0,
    );
}
export function reservedStock(
  s: BusinessState,
  productId: string,
  locationId?: string,
  exceptOrderId?: string,
) {
  return (s.customerOrders || [])
    .filter(
      (o) =>
        o.id !== exceptOrderId &&
        ["CONFIRMED", "PARTIALLY_DELIVERED"].includes(o.status) &&
        (!locationId || o.locationId === locationId),
    )
    .reduce(
      (n, o) =>
        n +
        o.lines
          .filter((l) => l.productId === productId)
          .reduce(
            (a, l) =>
              a +
              Math.max(0, l.quantity - customerDelivered(s, o.id, productId)),
            0,
          ),
      0,
    );
}
export function availableStock(
  s: BusinessState,
  productId: string,
  locationId?: string,
  exceptOrderId?: string,
) {
  return (
    productStock(s, productId, locationId) -
    reservedStock(s, productId, locationId, exceptOrderId)
  );
}
