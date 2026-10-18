import {
  financingCashFlow,
  financingOutstanding,
  payrollCashFlow,
  orderReceived,
  availableStock,
  customerDelivered,
} from "@saas/types";
import { applyPos } from "./pos.engine";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type {
  BusinessState,
  BusinessInvoice,
  BusinessProduct,
} from "@saas/types";
import type { BusinessAction } from "./business.schema";

export const emptyBusiness = (): BusinessState => ({
  companies: [],
  locations: [],
  products: [],
  accounts: [],
  partners: [],
  orders: [],
  invoices: [],
  payments: [],
  movements: [],
  sales: [],
  expenses: [],
  cashTransfers: [],
  access: [],
  events: [],
});
const fail = (message: string): never => {
  throw new BadRequestException(message);
};
const safe = (value: number) =>
  Number.isSafeInteger(value) && Math.abs(value) <= 9_000_000_000_000
    ? value
    : fail("Montant ou quantité hors limite");
export const totalLines = (lines: { quantity: number; unitPrice: number }[]) =>
  lines.reduce((sum, l) => safe(sum + safe(l.quantity * l.unitPrice)), 0);
export const stock = (
  s: BusinessState,
  productId: string,
  locationId?: string,
) =>
  s.movements
    .filter(
      (m) =>
        m.productId === productId &&
        (!locationId || m.locationId === locationId),
    )
    .reduce((n, m) => safe(n + m.quantity), 0);
export const paid = (s: BusinessState, invoiceId: string) =>
  s.payments
    .filter((p) => p.invoiceId === invoiceId)
    .reduce((n, p) => safe(n + p.amount), 0);
export const outstanding = (s: BusinessState, i: BusinessInvoice) =>
  i.amount - paid(s, i.id);
export function balance(s: BusinessState, accountId: string) {
  const account = s.accounts.find((a) => a.id === accountId);
  if (!account) throw new NotFoundException("Compte introuvable");
  return safe(
    account.opening +
      financingCashFlow(s, accountId) -
      payrollCashFlow(s, accountId) +
      (s.cashAdjustments || [])
        .filter((x) => x.accountId === accountId)
        .reduce((n, x) => n + x.amount, 0) +
      s.payments
        .filter((p) => p.accountId === accountId)
        .reduce(
          (n, p) =>
            n +
            (s.invoices.find((i) => i.id === p.invoiceId)?.kind === "RECEIVABLE"
              ? p.amount
              : -p.amount),
          0,
        ) -
      s.expenses
        .filter((e) => e.accountId === accountId)
        .reduce((n, e) => n + e.amount, 0) +
      s.cashTransfers.reduce(
        (n, t) =>
          n +
          (t.toId === accountId ? t.amount : 0) -
          (t.fromId === accountId ? t.amount : 0),
        0,
      ),
  );
}
export function companyRole(
  s: BusinessState,
  companyId: string,
  userId: string,
  owner: boolean,
  membershipId?: string,
) {
  return owner
    ? "MANAGER"
    : s.access.find(
        (g) =>
          g.companyId === companyId &&
          g.userId === userId &&
          (!membershipId || g.membershipId === membershipId),
      )?.role;
}
export function visibleBusiness(
  s: BusinessState,
  userId: string,
  owner: boolean,
  membershipId?: string,
  hrAccess = true,
): BusinessState {
  if (owner) return s;
  const ids = new Set(
    s.access
      .filter(
        (g) =>
          g.userId === userId &&
          !["CASHIER", "STORE_MANAGER"].includes(g.role) &&
          (!membershipId || g.membershipId === membershipId),
      )
      .map((g) => g.companyId),
  );
  const hrIds = new Set(
    s.access
      .filter(
        (g) =>
          g.userId === userId &&
          ((hrAccess && ["MANAGER", "FINANCE"].includes(g.role)) ||
            g.role === "HR") &&
          (!membershipId || g.membershipId === membershipId),
      )
      .map((g) => g.companyId),
  );
  const result = Object.fromEntries(
    Object.entries(s).map(([key, values]) => [
      key,
      key === "companies"
        ? (values as any[]).filter((x) => ids.has(x.id))
        : (values as any[]).filter(
            (x) =>
              (ids.has(x.companyId) ||
                (key === "intercompany" && ids.has(x.toCompanyId))) &&
              (!["employees", "payroll"].includes(key) ||
                hrIds.has(x.companyId)) &&
              (key !== "access" || x.userId === userId),
          ),
    ]),
  ) as unknown as BusinessState;
  const sums = new Map<
    string,
    {
      companyId: string;
      period: string;
      total: number;
      paid: number;
      accountId: string;
    }
  >();
  for (const p of s.payroll || []) {
    if (!ids.has(p.companyId)) continue;
    const accountId = p.accountId || "",
      key = p.companyId + ":" + p.period + ":" + accountId;
    const r = sums.get(key) || {
      companyId: p.companyId,
      period: p.period,
      total: 0,
      paid: 0,
      accountId,
    };
    r.total += p.total;
    if (p.paidAt) r.paid += p.total;
    sums.set(key, r);
  }
  const restricted = new Set(
    s.access
      .filter(
        (g) =>
          g.userId === userId &&
          ["BUYER", "WAREHOUSE", "HR"].includes(g.role) &&
          (!membershipId || g.membershipId === membershipId),
      )
      .map((g) => g.companyId),
  );
  const warehouse = new Set(
    s.access
      .filter(
        (g) =>
          g.userId === userId &&
          g.role === "WAREHOUSE" &&
          (!membershipId || g.membershipId === membershipId),
      )
      .map((g) => g.companyId),
  );
  result.accounts = result.accounts.filter((x) => !restricted.has(x.companyId));
  result.invoices = result.invoices.filter((x) => !restricted.has(x.companyId));
  result.payments = result.payments.filter((x) => !restricted.has(x.companyId));
  result.expenses = result.expenses.filter((x) => !restricted.has(x.companyId));
  result.cashTransfers = result.cashTransfers.filter(
    (x) => !restricted.has(x.companyId),
  );
  for (const key of [
    "financings",
    "financingPayments",
    "intercompany",
    "cashAdjustments",
  ] as const)
    (result as any)[key] = (result[key] || []).filter(
      (x: any) => !restricted.has(x.companyId),
    );
  result.intercompany = (s.intercompany || []).filter(
    (x) =>
      (ids.has(x.companyId) && !restricted.has(x.companyId)) ||
      (ids.has(x.toCompanyId) && !restricted.has(x.toCompanyId)),
  );
  result.products = result.products.map((p) =>
    restricted.has(p.companyId) ? { ...p, cost: 0, salePrice: undefined } : p,
  );
  result.sales = result.sales.map((x) =>
    restricted.has(x.companyId)
      ? {
          ...x,
          total: 0,
          cost: 0,
          unitCosts: {},
          lines: x.lines.map((l) => ({ ...l, unitPrice: 0 })),
        }
      : x,
  );
  result.customerOrders = (result.customerOrders || []).map((o) =>
    restricted.has(o.companyId)
      ? { ...o, lines: o.lines.map((l) => ({ ...l, unitPrice: 0 })) }
      : o,
  );
  result.orders = result.orders.map((o) =>
    warehouse.has(o.companyId)
      ? {
          ...o,
          landedCharges: 0,
          lines: o.lines.map((l) => ({ ...l, unitPrice: 0 })),
        }
      : o,
  );
  result.samples = (result.samples || []).filter(
    (x) => !warehouse.has(x.companyId),
  );
  result.receipts = (result.receipts || []).map((x) =>
    warehouse.has(x.companyId) ? { ...x, landedCharges: 0 } : x,
  );
  result.transfers = (result.transfers || []).map((x) =>
    warehouse.has(x.companyId)
      ? { ...x, lines: x.lines.map((l) => ({ ...l, unitCost: 0 })) }
      : x,
  );
  const hrOnly = new Set(
    s.access
      .filter(
        (g) =>
          g.userId === userId &&
          g.role === "HR" &&
          (!membershipId || g.membershipId === membershipId),
      )
      .map((g) => g.companyId),
  );
  for (const key of [
    "products",
    "partners",
    "orders",
    "customerOrders",
    "customerDeliveries",
    "receipts",
    "transfers",
    "sales",
    "movements",
    "samples",
  ] as const)
    (result as any)[key] = (result[key] || []).filter(
      (x: any) => !hrOnly.has(x.companyId),
    );
  result.events = result.events.filter(
    (x) => !hrOnly.has(x.companyId) || x.action.startsWith("hr."),
  );
  result.payrollSummary = [...sums.values()].filter(
    (x) => !restricted.has(x.companyId),
  );
  return result;
}
/** Executes only on a transaction-local copy; persisted atomically with audit. */
export function applyBusiness(
  s: BusinessState,
  a: BusinessAction,
  userId: string,
  owner: boolean,
  now = new Date().toISOString(),
  membershipId?: string,
): BusinessState {
  const date = now.slice(0, 10);
  if (a.type === "company.create") {
    if (!owner)
      throw new ForbiddenException(
        "Seul le propriétaire du holding peut créer une société",
      );
    if (s.companies.length >= 100) fail("Limite de 100 sociétés atteinte");
    if (
      s.companies.some(
        (c) => c.name.toLowerCase() === a.data.name.toLowerCase(),
      )
    )
      fail("Nom de société déjà utilisé");
    const id = randomUUID();
    s.companies.push({ id, ...a.data });
    s.events.push({
      id: randomUUID(),
      companyId: id,
      action: a.type,
      actorId: userId,
      date: now,
      reference: a.data.name,
    });
    return s;
  }
  const companyId = a.companyId;
  const company = s.companies.find((c) => c.id === companyId);
  if (!company) throw new NotFoundException("Société introuvable");
  if (a.type === "company.lifecycle") {
    if (!owner) throw new ForbiddenException("Propriétaire du holding requis");
    if (a.confirmation !== company.name) fail("Nom de confirmation incorrect");
    if (
      a.status !== "ACTIVE" &&
      s.posSessions?.some((p) => p.companyId === companyId && !p.closedAt)
    )
      fail("Fermez les caisses avant cette action");
    company.status = a.status;
    s.events.push({
      id: randomUUID(),
      companyId,
      action: a.type,
      actorId: userId,
      date: now,
      reference: a.status,
    });
    return s;
  }
  if (company.status && company.status !== "ACTIVE")
    fail("Restaurez la société avant modification");
  if (a.type.startsWith("pos."))
    return applyPos(
      s,
      a as Extract<BusinessAction, { type: `pos.${string}` }>,
      userId,
      owner,
      now,
      membershipId,
    );
  const role = companyRole(s, companyId, userId, owner, membershipId);
  if (role === "CASHIER" || role === "STORE_MANAGER")
    throw new ForbiddenException("Utilisez uniquement la Caisse autorisée");
  if (
    (a.type === "product.pricing" ||
      (a.type === "product.create" && a.salePrice !== undefined)) &&
    role !== "MANAGER"
  )
    throw new ForbiddenException("Responsable requis pour les tarifs");
  if (a.type === "stock.adjust" && !owner)
    throw new ForbiddenException(
      "Ajustement réservé au propriétaire ou administrateur plateforme",
    );
  const openCash = new Set(
    (s.posSessions || [])
      .filter((p) => !p.closedAt)
      .map((p) => p.cashAccountId),
  );
  if (
    ((a.type === "payment.create" ||
      a.type === "expense.create" ||
      a.type === "hr.payroll.pay") &&
      openCash.has(a.accountId)) ||
    (a.type === "cash.transfer" &&
      (openCash.has(a.fromId) || openCash.has(a.toId)))
  )
    fail("Fermez la caisse avant une opération financière externe");

  if (!role || role === "VIEWER")
    throw new ForbiddenException(
      "Accès en lecture seule ou société non autorisée",
    );
  const finance = [
    "account.create",
    "invoice.create",
    "payment.create",
    "expense.create",
    "cash.transfer",
    "intercompany.create",
    "intercompany.settle",
    "financing.create",
    "financing.draw",
    "financing.repay",
    "hr.payroll.record",
    "hr.payroll.pay",
  ];
  if (
    role === "HR" &&
    (!a.type.startsWith("hr.") || a.type === "hr.payroll.pay")
  )
    throw new ForbiddenException(
      "Le service RH prépare la paie ; la finance effectue le règlement",
    );
  if (
    role === "BUYER" &&
    a.type === "order.transition" &&
    a.status === "RECEIVED"
  )
    throw new ForbiddenException("Réception réservée à la logistique");
  if (
    role === "BUYER" &&
    ![
      "product.create",
      "partner.create",
      "partner.update",
      "sample.create",
      "order.create",
      "order.transition",
    ].includes(a.type)
  )
    throw new ForbiddenException("Opération non autorisée au service achats");
  if (
    role === "WAREHOUSE" &&
    ![
      "location.create",
      "order.receive",
      "stock.ship",
      "stock.receiveTransfer",
      "stock.transfer",
      "customerOrder.deliver",
    ].includes(a.type) &&
    !(a.type === "order.transition" && a.status === "RECEIVED")
  )
    throw new ForbiddenException(
      "Opération non autorisée au service logistique",
    );
  if (
    role === "FINANCE" &&
    !finance.includes(a.type) &&
    a.type !== "partner.create" &&
    a.type !== "partner.update"
  )
    throw new ForbiddenException("Rôle financier requis pour cette opération");
  if (
    ["OPERATIONS", "BUYER"].includes(role) &&
    (finance.includes(a.type) ||
      [
        "company.configure",
        "access.grant",
        "access.revoke",
        "stock.adjust",
        "sale.return",
      ].includes(a.type) ||
      (a.type === "order.transition" &&
        ["APPROVED", "CANCELLED"].includes(a.status)))
  )
    throw new ForbiddenException("Approbation du responsable requise");
  if (
    (a.type.startsWith("hr.employee.") || a.type === "sample.approve") &&
    !["MANAGER", "HR"].includes(role)
  )
    throw new ForbiddenException("Responsable requis");
  if (a.type.startsWith("hr.") && !company.modules.includes("hr"))
    fail("Module RH désactivé");
  const module =
    a.type.startsWith("order.") || a.type.startsWith("sample.")
      ? "purchasing"
      : a.type.startsWith("stock.")
        ? "inventory"
        : a.type.startsWith("sale.") || a.type.startsWith("customerOrder.")
          ? "sales"
          : finance.includes(a.type)
            ? "finance"
            : null;
  if (module && !company.modules.includes(module))
    fail(`Module ${module} désactivé pour cette société`);
  const own = <T extends { id: string; companyId: string }>(
    items: T[],
    id: string,
  ): T => {
    const item = items.find((x) => x.id === id && x.companyId === companyId);
    if (!item)
      throw new NotFoundException("Référence introuvable dans cette société");
    return item;
  };
  let reservationOrderId: string | undefined;
  const movement = (
    productId: string,
    locationId: string,
    quantity: number,
    reason: string,
    sourceId: string,
  ) => {
    own(s.products, productId);
    own(s.locations, locationId);
    if (
      quantity < 0 &&
      availableStock(s, productId, locationId, reservationOrderId) + quantity <
        0
    )
      fail("Stock insuffisant : disponible après réservations clients");
    s.movements.push({
      id: randomUUID(),
      companyId,
      productId,
      locationId,
      quantity,
      reason,
      sourceId,
      date: now,
    });
  };
  const receiptCost = (
    product: BusinessProduct,
    quantity: number,
    cost: number,
  ) => {
    const before = stock(s, product.id);
    product.cost = safe(
      Math.round(
        (before * product.cost + quantity * cost) / (before + quantity),
      ),
    );
  };
  const referenceUnique = (
    reference: string,
    items: { reference: string; companyId: string }[],
  ) => {
    if (
      items.some(
        (x) =>
          x.companyId === companyId &&
          x.reference.toLowerCase() === reference.toLowerCase(),
      )
    )
      fail("Référence déjà utilisée");
  };
  const requireCash = (accountId: string, amount: number) => {
    own(s.accounts, accountId);
    if (balance(s, accountId) < amount) fail("Solde enregistré insuffisant");
  };
  const recordReceipt = (
    order: BusinessState["orders"][number],
    reference: string,
    lines: { productId: string; quantity: number }[],
  ) => {
    if (!["CUSTOMS", "PARTIALLY_RECEIVED"].includes(order.status))
      fail("La commande doit être en douane ou partiellement réceptionnée");
    if (
      !company.modules.includes("inventory") ||
      !company.modules.includes("finance")
    )
      fail("Activez les modules stock et finance avant réception");
    referenceUnique(reference, s.receipts || []);
    if (
      !lines.length ||
      new Set(lines.map((l) => l.productId)).size !== lines.length
    )
      fail("Lignes de réception invalides");
    for (const l of lines) {
      const ordered = order.lines.find((x) => x.productId === l.productId);
      if (
        !ordered ||
        l.quantity <= 0 ||
        !Number.isSafeInteger(l.quantity) ||
        orderReceived(s, order.id, l.productId) + l.quantity > ordered.quantity
      )
        fail("Réception supérieure au reliquat ou variante étrangère");
    }
    const receiptId = randomUUID(),
      invoiceId = randomUUID();
    let charges = 0,
      base = 0,
      allocated = 0;
    const qty = order.lines.reduce((n, l) => n + l.quantity, 0);
    let allocatedQuantity = 0;
    const allocations = new Map(
      order.lines.map((l) => {
        const before = allocatedQuantity;
        allocatedQuantity += l.quantity;
        return [
          l.productId,
          Math.round((order.landedCharges * allocatedQuantity) / qty) -
            Math.round((order.landedCharges * before) / qty),
        ];
      }),
    );
    for (const l of lines) {
      const ordered = order.lines.find((x) => x.productId === l.productId)!,
        before = orderReceived(s, order.id, l.productId),
        budget = allocations.get(l.productId)!;
      const charge =
        Math.round((budget * (before + l.quantity)) / ordered.quantity) -
        Math.round((budget * before) / ordered.quantity);
      charges = safe(charges + charge);
      base = safe(base + safe(l.quantity * ordered.unitPrice));
      receiptCost(
        own(s.products, l.productId),
        l.quantity,
        (l.quantity * ordered.unitPrice + charge) / l.quantity,
      );
      movement(l.productId, order.locationId, l.quantity, "RECEIPT", order.id);
    }
    const count = (s.receipts || []).filter(
      (r) => r.orderId === order.id,
    ).length;
    if (base > 0)
      s.invoices.push({
        id: invoiceId,
        companyId,
        kind: "PAYABLE",
        reference: `PO:${order.reference}${count ? `:R${count + 1}` : ""}`,
        partnerId: order.supplierId,
        amount: base,
        dueDate: order.dueDate,
        sourceId: order.id,
        createdAt: now,
      });
    s.receipts ??= [];
    s.receipts.push({
      id: receiptId,
      companyId,
      orderId: order.id,
      reference,
      lines,
      landedCharges: charges,
      ...(base > 0 ? { invoiceId } : {}),
      date: now,
    });
    order.status = order.lines.every(
      (l) => orderReceived(s, order.id, l.productId) === l.quantity,
    )
      ? "RECEIVED"
      : "PARTIALLY_RECEIVED";
  };
  const id = randomUUID();
  switch (a.type) {
    case "company.configure": {
      if (a.data.currency !== company.currency)
        fail(
          "La devise est fixe. Créez une autre société pour changer de devise",
        );
      if (
        s.companies.some(
          (c) =>
            c.id !== companyId &&
            c.name.toLowerCase() === a.data.name.toLowerCase(),
        )
      )
        fail("Nom de société déjà utilisé");
      Object.assign(company, a.data);
      break;
    }
    case "product.pricing": {
      const product = own(s.products, a.productId);
      if (
        a.barcode &&
        s.products.some(
          (p) =>
            p.companyId === companyId &&
            p.id !== product.id &&
            p.barcode === a.barcode,
        )
      )
        fail("Code-barres déjà utilisé");
      product.salePrice = a.salePrice;
      product.barcode = a.barcode;
      break;
    }
    case "access.grant":
    case "access.revoke": {
      if (!owner)
        throw new ForbiddenException(
          "Seul le propriétaire du holding gère les accès",
        );
      s.access = s.access.filter(
        (g) => !(g.companyId === companyId && g.userId === a.userId),
      );
      if (a.type === "access.grant") {
        if (
          ["CASHIER", "STORE_MANAGER"].includes(a.role) &&
          !a.locationIds?.length
        )
          fail("Attribuez au moins un magasin");
        for (const id of a.locationIds || [])
          if (own(s.locations, id).kind !== "STORE") fail("Magasin requis");
        s.access.push({
          companyId,
          userId: a.userId,
          role: a.role,
          locationIds: a.locationIds || [],
        });
      }
      break;
    }
    case "location.create":
      s.locations.push({ id, companyId, name: a.name, kind: a.kind });
      break;
    case "product.create": {
      if (
        s.products.some(
          (p) =>
            p.companyId === companyId &&
            p.sku.toLowerCase() === a.sku.toLowerCase(),
        )
      )
        fail("SKU déjà utilisé");
      if (
        a.barcode &&
        s.products.some(
          (p) => p.companyId === companyId && p.barcode === a.barcode,
        )
      )
        fail("Code-barres déjà utilisé");
      s.products.push({
        id,
        companyId,
        sku: a.sku,
        model: a.model || a.name,
        salePrice: a.salePrice,
        barcode: a.barcode || "",
        name: a.name,
        brand: a.brand,
        size: a.size,
        color: a.color,
        cost: 0,
      });
      break;
    }
    case "partner.create":
      s.partners.push({
        id,
        companyId,
        name: a.name,
        kind: a.kind,
        email: a.email,
        phone: a.phone || "",
        address: a.address || "",
      });
      break;
    case "hr.employee.create": {
      if (a.locationId) own(s.locations, a.locationId);
      if (a.hiredAt > date) fail("Date d’entrée future");
      s.employees ??= [];
      s.employees.push({ ...a, id, status: "ACTIVE" });
      break;
    }
    case "hr.employee.update": {
      const e = own(s.employees || [], a.employeeId);
      if (a.locationId) own(s.locations, a.locationId);
      Object.assign(e, {
        fullName: a.fullName,
        jobTitle: a.jobTitle,
        department: a.department,
        locationId: a.locationId,
        grossSalary: a.grossSalary,
        employerChargesBps: a.employerChargesBps,
      });
      break;
    }
    case "hr.employee.status": {
      own(s.employees || [], a.employeeId).status = a.status;
      break;
    }
    case "hr.payroll.record": {
      const e = own(s.employees || [], a.employeeId);
      if (
        e.status !== "ACTIVE" ||
        e.grossSalary <= 0 ||
        a.period < e.hiredAt.slice(0, 7) ||
        a.period > date.slice(0, 7)
      )
        fail("Période de paie ou salarié invalide");
      s.payroll ??= [];
      if (
        s.payroll.some(
          (p) =>
            p.companyId === companyId &&
            p.employeeId === e.id &&
            p.period === a.period,
        )
      )
        fail("Paie déjà comptabilisée pour ce mois");
      const charges = safe(
        Math.round((e.grossSalary * e.employerChargesBps) / 10000),
      );
      s.payroll.push({
        id,
        companyId,
        employeeId: e.id,
        period: a.period,
        gross: e.grossSalary,
        employerCharges: charges,
        total: safe(e.grossSalary + charges),
        createdAt: now,
      });
      break;
    }
    case "hr.payroll.pay": {
      const p = own(s.payroll || [], a.payrollId);
      if (p.paidAt) fail("Paie déjà réglée");
      requireCash(a.accountId, p.total);
      p.paidAt = now;
      p.accountId = a.accountId;
      break;
    }
    case "sample.create": {
      if (own(s.partners, a.supplierId).kind !== "SUPPLIER")
        fail("Fournisseur requis");
      if (
        !s.products.some(
          (p) => p.companyId === companyId && (p.model || p.name) === a.model,
        )
      )
        fail("Modèle introuvable");
      s.samples ??= [];
      if (
        s.samples.some(
          (x) => x.companyId === companyId && x.reference === a.reference,
        )
      )
        fail("Référence d’échantillon existante");
      s.samples.push({ ...a, id, status: "PROPOSED", createdAt: now });
      break;
    }
    case "sample.approve": {
      own(s.samples || [], a.sampleId).status = "APPROVED";
      break;
    }
    case "partner.update": {
      const p = own(s.partners, a.partnerId);
      Object.assign(p, {
        name: a.name,
        email: a.email,
        phone: a.phone,
        address: a.address,
      });
      break;
    }
    case "financing.create": {
      s.financings ??= [];
      referenceUnique(a.reference, s.financings);
      if (own(s.accounts, a.accountId).kind !== "BANK")
        fail("Compte bancaire requis");
      if (a.orderId && own(s.orders, a.orderId).status === "CANCELLED")
        fail("Commande annulée");
      if (a.dueDate < date) fail("Échéance antérieure à la création");
      safe(a.principal + a.interest);
      s.financings.push({ ...a, id, createdAt: now });
      break;
    }
    case "financing.draw": {
      const f = own(s.financings || [], a.financingId);
      if (f.drawnAt) fail("Financement déjà débloqué");
      if (f.orderId && own(s.orders, f.orderId).status === "CANCELLED")
        fail("Commande annulée");
      f.drawnAt = now;
      safe(balance(s, f.accountId));
      break;
    }
    case "financing.repay": {
      const f = own(s.financings || [], a.financingId);
      if (!f.drawnAt) fail("Débloquez le financement avant remboursement");
      if (own(s.accounts, a.accountId).kind !== "BANK")
        fail("Compte bancaire requis");
      const remaining = financingOutstanding(s, f.id),
        total = safe(a.principal + a.interest);
      if (
        !total ||
        a.principal > remaining.principal ||
        a.interest > remaining.interest
      )
        fail("Remboursement supérieur au capital ou aux intérêts dus");
      if (balance(s, a.accountId) < total) fail("Solde bancaire insuffisant");
      s.financingPayments ??= [];
      s.financingPayments.push({
        id,
        companyId,
        financingId: f.id,
        accountId: a.accountId,
        principal: a.principal,
        interest: a.interest,
        date: now,
      });
      break;
    }
    case "account.create": {
      if (a.asOf > date)
        fail("Le solde initial ne peut pas être daté dans le futur");
      s.accounts.push({
        id,
        companyId,
        name: a.name,
        kind: a.kind,
        opening: a.opening,
        source: "MANUAL",
        asOf: a.asOf,
      });
      break;
    }
    case "order.create": {
      referenceUnique(a.reference, s.orders);
      if (own(s.partners, a.supplierId).kind !== "SUPPLIER")
        fail("Fournisseur requis");
      if (own(s.locations, a.locationId).kind !== "WAREHOUSE")
        fail("Réception en entrepôt requise");
      a.lines.forEach((l) => own(s.products, l.productId));
      safe(totalLines(a.lines) + a.landedCharges);
      s.orders.push({ ...a, id, status: "DRAFT", createdAt: now });
      break;
    }
    case "order.transition": {
      const order = own(s.orders, a.orderId);
      const next: Record<string, string[]> = {
        DRAFT: ["APPROVED", "CANCELLED"],
        APPROVED: ["ORDERED", "CANCELLED"],
        ORDERED: ["SHIPPED", "CANCELLED"],
        SHIPPED: ["CUSTOMS"],
        CUSTOMS: ["RECEIVED"],
        PARTIALLY_RECEIVED: ["RECEIVED"],
        RECEIVED: [],
        CANCELLED: [],
      };
      if (!next[order.status].includes(a.status))
        fail("Transition de commande non autorisée");
      if (a.status === "RECEIVED")
        recordReceipt(
          order,
          `BR-${order.reference}-${(s.receipts || []).filter((r) => r.orderId === order.id).length + 1}`,
          order.lines
            .map((l) => ({
              productId: l.productId,
              quantity: l.quantity - orderReceived(s, order.id, l.productId),
            }))
            .filter((l) => l.quantity > 0),
        );
      order.status = a.status;
      break;
    }
    case "order.receive": {
      recordReceipt(own(s.orders, a.orderId), a.reference, a.lines);
      break;
    }
    case "stock.ship": {
      if (a.fromId === a.toId) fail("Deux emplacements différents requis");
      own(s.locations, a.fromId);
      own(s.locations, a.toId);
      referenceUnique(a.reference, s.transfers || []);
      const lines = a.lines.map((l) => ({
        ...l,
        unitCost: own(s.products, l.productId).cost,
      }));
      for (const l of lines) {
        safe(l.quantity * l.unitCost);
        movement(l.productId, a.fromId, -l.quantity, "TRANSFER_OUT", id);
      }
      s.transfers ??= [];
      s.transfers.push({
        id,
        companyId,
        reference: a.reference,
        fromId: a.fromId,
        toId: a.toId,
        lines,
        status: "IN_TRANSIT",
        date: now,
      });
      break;
    }
    case "stock.receiveTransfer": {
      const t = own(s.transfers || [], a.transferId);
      if (t.status !== "IN_TRANSIT") fail("Transfert déjà réceptionné");
      for (const l of t.lines) {
        receiptCost(own(s.products, l.productId), l.quantity, l.unitCost);
        movement(l.productId, t.toId, l.quantity, "TRANSFER_IN", t.id);
      }
      t.status = "RECEIVED";
      t.receivedAt = now;
      break;
    }
    case "intercompany.create": {
      const other = s.companies.find((c) => c.id === a.toCompanyId);
      if (
        !other ||
        other.id === companyId ||
        other.currency !== company.currency ||
        (other.status && other.status !== "ACTIVE") ||
        !other.modules.includes("finance")
      )
        fail("Contrepartie active dans la même devise requise");
      if (
        !["MANAGER", "FINANCE"].includes(
          companyRole(s, a.toCompanyId, userId, owner, membershipId) || "",
        )
      )
        throw new ForbiddenException(
          "Accès financier requis aux deux sociétés",
        );
      referenceUnique(a.reference, s.intercompany || []);
      if (
        s.invoices.some(
          (i) =>
            [companyId, a.toCompanyId].includes(i.companyId) &&
            i.reference.toLowerCase() === `IC:${a.reference}`.toLowerCase(),
        )
      )
        fail("Référence intragroupe déjà utilisée dans le périmètre");
      const counterpart = (
        cid: string,
        name: string,
        kind: "CUSTOMER" | "SUPPLIER",
      ) => {
        const partnerId = randomUUID();
        s.partners.push({
          id: partnerId,
          companyId: cid,
          name: `Groupe · ${name}`,
          kind,
          email: "",
        });
        return partnerId;
      };
      const receivableId = randomUUID(),
        payableId = randomUUID();
      s.invoices.push({
        id: receivableId,
        companyId,
        kind: "RECEIVABLE",
        reference: `IC:${a.reference}`,
        partnerId: counterpart(companyId, other!.name, "CUSTOMER"),
        amount: a.amount,
        dueDate: a.dueDate,
        sourceId: id,
        intercompanyId: id,
        createdAt: now,
      });
      s.invoices.push({
        id: payableId,
        companyId: a.toCompanyId,
        kind: "PAYABLE",
        reference: `IC:${a.reference}`,
        partnerId: counterpart(a.toCompanyId, company.name, "SUPPLIER"),
        amount: a.amount,
        dueDate: a.dueDate,
        sourceId: id,
        intercompanyId: id,
        createdAt: now,
      });
      s.intercompany ??= [];
      s.intercompany.push({
        id,
        companyId,
        toCompanyId: a.toCompanyId,
        reference: a.reference,
        description: a.description,
        amount: a.amount,
        date: now,
        receivableId,
        payableId,
      });
      break;
    }
    case "intercompany.settle": {
      const charge = own(s.intercompany || [], a.chargeId),
        payer = s.accounts.find(
          (x) =>
            x.id === a.payerAccountId &&
            x.companyId === charge.toCompanyId &&
            x.kind === "BANK",
        ),
        receiver = own(s.accounts, a.receiverAccountId);
      if (!payer || receiver.kind !== "BANK")
        fail("Comptes bancaires des deux sociétés requis");
      const other = s.companies.find((c) => c.id === charge.toCompanyId);
      if (
        !other ||
        (other.status && other.status !== "ACTIVE") ||
        !other.modules.includes("finance")
      )
        fail("Société débitrice inactive");
      if (
        !["MANAGER", "FINANCE"].includes(
          companyRole(s, charge.toCompanyId, userId, owner, membershipId) || "",
        )
      )
        throw new ForbiddenException(
          "Accès financier requis aux deux sociétés",
        );
      const rec = own(s.invoices, charge.receivableId),
        pay = s.invoices.find(
          (i) =>
            i.id === charge.payableId && i.companyId === charge.toCompanyId,
        );
      if (
        !pay ||
        a.amount > outstanding(s, rec) ||
        a.amount > outstanding(s, pay) ||
        a.amount > balance(s, payer!.id)
      )
        fail("Montant supérieur au solde ou aux disponibilités");
      if (date < payer!.asOf || date < receiver.asOf)
        fail("Règlement antérieur au solde initial");
      s.payments.push(
        {
          id,
          companyId,
          invoiceId: rec.id,
          accountId: receiver.id,
          amount: a.amount,
          date: now,
        },
        {
          id: randomUUID(),
          companyId: charge.toCompanyId,
          invoiceId: pay!.id,
          accountId: payer!.id,
          amount: a.amount,
          date: now,
        },
      );
      break;
    }
    case "stock.adjust": {
      const product = own(s.products, a.productId);
      if (a.quantity > 0) receiptCost(product, a.quantity, a.unitCost);
      movement(
        a.productId,
        a.locationId,
        a.quantity,
        `ADJUSTMENT: ${a.reason}`,
        id,
      );
      break;
    }
    case "stock.transfer": {
      if (a.fromId === a.toId) fail("Choisissez deux emplacements différents");
      movement(a.productId, a.fromId, -a.quantity, "TRANSFER", id);
      movement(a.productId, a.toId, a.quantity, "TRANSFER", id);
      break;
    }
    case "customerOrder.create": {
      referenceUnique(a.reference, s.customerOrders || []);
      if (own(s.partners, a.customerId).kind !== "CUSTOMER")
        fail("Client requis");
      own(s.locations, a.locationId);
      a.lines.forEach((l) => own(s.products, l.productId));
      if (totalLines(a.lines) <= 0) fail("Commande sans montant positif");
      (s.customerOrders ||= []).push({
        ...a,
        id,
        status: "DRAFT",
        createdAt: now,
      });
      break;
    }
    case "customerOrder.confirm": {
      if (!company.modules.includes("inventory"))
        fail("Activez le stock avant réservation");
      const o = own(s.customerOrders || [], a.orderId);
      if (o.status !== "DRAFT") fail("Commande déjà confirmée ou clôturée");
      for (const l of o.lines)
        if (availableStock(s, l.productId, o.locationId) < l.quantity)
          fail("Stock insuffisant pour réserver toutes les lignes");
      o.status = "CONFIRMED";
      o.confirmedAt = now;
      break;
    }
    case "customerOrder.cancel": {
      const o = own(s.customerOrders || [], a.orderId);
      if (["DELIVERED", "CANCELLED"].includes(o.status))
        fail("Commande déjà clôturée");
      o.status = "CANCELLED";
      o.cancelledAt = now;
      o.cancellationReason = a.reason;
      break;
    }
    case "customerOrder.deliver": {
      if (
        !company.modules.includes("inventory") ||
        !company.modules.includes("finance")
      )
        fail("Activez stock et finance pour livrer");
      const o = own(s.customerOrders || [], a.orderId);
      if (!["CONFIRMED", "PARTIALLY_DELIVERED"].includes(o.status))
        fail("Commande non livrable");
      referenceUnique(a.reference, s.customerDeliveries || []);
      const saleReference = `BL:${a.reference}`;
      referenceUnique(saleReference, s.sales);
      referenceUnique(`SALE:${saleReference}`, s.invoices);
      const lines = a.lines.map((l) => {
        const original = o.lines.find((x) => x.productId === l.productId);
        if (
          !original ||
          l.quantity >
            original.quantity - customerDelivered(s, o.id, l.productId)
        )
          fail("Quantité supérieure au reliquat ou variante étrangère");
        if (availableStock(s, l.productId, o.locationId, o.id) < l.quantity)
          fail("Stock réservé indisponible");
        return { ...l, unitPrice: original!.unitPrice };
      });
      const total = totalLines(lines);
      if (total <= 0) fail("Livraison sans montant positif");
      const unitCosts: Record<string, number> = {};
      let cost = 0;
      reservationOrderId = o.id;
      for (const l of lines) {
        unitCosts[l.productId] = own(s.products, l.productId).cost;
        cost = safe(cost + safe(unitCosts[l.productId] * l.quantity));
        movement(l.productId, o.locationId, -l.quantity, "SALE", id);
      }
      const invoiceId = randomUUID();
      s.sales.push({
        id,
        companyId,
        reference: saleReference,
        customerId: o.customerId,
        locationId: o.locationId,
        lines,
        unitCosts,
        cost,
        total,
        returned: false,
        date: now,
      });
      s.invoices.push({
        id: invoiceId,
        companyId,
        kind: "RECEIVABLE",
        reference: `SALE:${saleReference}`,
        partnerId: o.customerId,
        amount: total,
        dueDate: o.dueDate,
        sourceId: id,
        createdAt: now,
      });
      (s.customerDeliveries ||= []).push({
        id: randomUUID(),
        companyId,
        orderId: o.id,
        reference: a.reference,
        lines: a.lines,
        saleId: id,
        invoiceId,
        date: now,
      });
      o.status = o.lines.every(
        (l) => customerDelivered(s, o.id, l.productId) === l.quantity,
      )
        ? "DELIVERED"
        : "PARTIALLY_DELIVERED";
      break;
    }
    case "sale.create": {
      if (
        !company.modules.includes("inventory") ||
        !company.modules.includes("finance")
      )
        fail("Activez stock et finance pour enregistrer une vente");
      referenceUnique(a.reference, s.sales);
      if (own(s.partners, a.customerId).kind !== "CUSTOMER")
        fail("Client requis");
      own(s.locations, a.locationId);
      const total = totalLines(a.lines);
      if (total === 0) fail("Une vente doit avoir un montant positif");
      let cost = 0;
      const unitCosts: Record<string, number> = {};
      a.lines.forEach((l) => {
        unitCosts[l.productId] = own(s.products, l.productId).cost;
        cost = safe(cost + safe(unitCosts[l.productId] * l.quantity));
        movement(l.productId, a.locationId, -l.quantity, "SALE", id);
      });
      s.sales.push({
        id,
        companyId,
        reference: a.reference,
        customerId: a.customerId,
        locationId: a.locationId,
        lines: a.lines,
        unitCosts,
        cost,
        total,
        returned: false,
        date: now,
      });
      s.invoices.push({
        id: randomUUID(),
        companyId,
        kind: "RECEIVABLE",
        reference: `SALE:${a.reference}`,
        partnerId: a.customerId,
        amount: total,
        dueDate: a.dueDate,
        sourceId: id,
        createdAt: now,
      });
      break;
    }
    case "sale.return": {
      const sale = own(s.sales, a.saleId);
      if (sale.returned) fail("Vente déjà retournée");
      const invoice = s.invoices.find((i) => i.sourceId === sale.id);
      if (!invoice) fail("Facture introuvable");
      if (paid(s, invoice!.id) > 0)
        fail(
          "Retour après encaissement : remboursement/avoir non encore pris en charge",
        );
      sale.lines.forEach((l) => {
        const product = own(s.products, l.productId);
        receiptCost(product, l.quantity, sale.unitCosts[l.productId]);
        movement(l.productId, sale.locationId, l.quantity, "RETURN", sale.id);
      });
      invoice!.amount = 0;
      sale.returned = true;
      break;
    }
    case "invoice.create": {
      if (/^(PO|SALE|IC):/i.test(a.reference))
        fail("Préfixe réservé aux factures automatiques");
      referenceUnique(a.reference, s.invoices);
      if (
        own(s.partners, a.partnerId).kind !==
        (a.kind === "PAYABLE" ? "SUPPLIER" : "CUSTOMER")
      )
        fail("Type de partenaire incompatible");
      s.invoices.push({ ...a, id, sourceId: "MANUAL", createdAt: now });
      break;
    }
    case "payment.create": {
      const invoice = own(s.invoices, a.invoiceId);
      const account = own(s.accounts, a.accountId);
      if (invoice.intercompanyId)
        fail(
          "Utilisez le règlement intragroupe pour synchroniser les deux sociétés",
        );
      if (date < account.asOf) fail("Paiement antérieur au solde initial");
      if (a.amount > outstanding(s, invoice))
        fail("Le paiement dépasse le solde de la facture");
      if (invoice.kind === "PAYABLE") requireCash(a.accountId, a.amount);
      s.payments.push({
        id,
        companyId,
        invoiceId: a.invoiceId,
        accountId: a.accountId,
        amount: a.amount,
        date: now,
      });
      break;
    }
    case "expense.create":
      requireCash(a.accountId, a.amount);
      s.expenses.push({
        id,
        companyId,
        accountId: a.accountId,
        amount: a.amount,
        description: a.description,
        date: now,
      });
      break;
    case "cash.transfer": {
      if (a.fromId === a.toId) fail("Choisissez deux comptes différents");
      own(s.accounts, a.toId);
      requireCash(a.fromId, a.amount);
      s.cashTransfers.push({
        id,
        companyId,
        fromId: a.fromId,
        toId: a.toId,
        amount: a.amount,
        date: now,
      });
      break;
    }
  }
  s.events.push({
    id,
    companyId,
    action: a.type,
    actorId: userId,
    date: now,
    reference:
      "reference" in a ? a.reference : "reason" in a ? a.reason : company.name,
  });
  return s;
}
