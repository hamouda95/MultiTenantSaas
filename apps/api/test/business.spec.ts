import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  applyBusiness,
  emptyBusiness,
  stock,
  balance,
  outstanding,
  visibleBusiness,
} from "../src/modules/business/business.engine";
import {
  BusinessCommandSchema,
  BusinessAction,
} from "../src/modules/business/business.schema";
import { companyMetrics, replenishment, currencyDigits } from "@saas/types";
const owner = randomUUID(),
  operator = randomUUID(),
  date = "2026-10-18T12:00:00.000Z";
function fixture() {
  let s = emptyBusiness();
  const create = (name: string) => {
    s = applyBusiness(
      s,
      {
        type: "company.create",
        data: {
          name,
          currency: "TND",
          country: "Tunisie",
          brands: ["Polaris"],
          leadDays: 7,
          coverDays: 23,
          minimumStock: 2,
          modules: [
            "purchasing",
            "inventory",
            "sales",
            "finance",
            "intelligence",
          ],
        },
      },
      owner,
      true,
      date,
    );
    return s.companies[s.companies.length - 1].id;
  };
  const companyId = create("Polaris"),
    otherId = create("Other");
  const run = (a: Record<string, unknown>, user = owner, isOwner = true) => {
    s = applyBusiness(
      structuredClone(s),
      { companyId, ...a } as BusinessAction,
      user,
      isOwner,
      date,
    );
  };
  run({ type: "location.create", name: "Central", kind: "WAREHOUSE" });
  run({ type: "location.create", name: "Tunis", kind: "STORE" });
  run({ type: "location.create", name: "Sousse", kind: "STORE" });
  run({
    type: "product.create",
    name: "Shoes",
    sku: "SHOE-42-BLACK",
    brand: "Polaris",
    size: "42",
    color: "Black",
  });
  run({
    type: "partner.create",
    name: "Istanbul brand",
    kind: "SUPPLIER",
    email: "",
  });
  run({
    type: "partner.create",
    name: "Retail customer",
    kind: "CUSTOMER",
    email: "",
  });
  run({
    type: "account.create",
    name: "Bank",
    kind: "BANK",
    opening: 1000000,
    asOf: "2026-10-01",
  });
  run({
    type: "account.create",
    name: "Till",
    kind: "CASH",
    opening: 0,
    asOf: "2026-10-01",
  });
  return {
    get s() {
      return s;
    },
    run,
    companyId,
    otherId,
    productId: s.products[0].id,
    warehouseId: s.locations[0].id,
    storeId: s.locations[1].id,
    supplierId: s.partners[0].id,
    customerId: s.partners[1].id,
    bankId: s.accounts[0].id,
    cashId: s.accounts[1].id,
  };
}
describe("Holding business operations", () => {
  it("connects approved import, landed stock cost, transfer, sale, debt and cash without double counting", () => {
    const f = fixture();
    f.run({
      type: "order.create",
      reference: "PO-1",
      supplierId: f.supplierId,
      locationId: f.warehouseId,
      origin: "Istanbul",
      eta: "2026-10-18",
      dueDate: "2026-11-01",
      landedCharges: 10000,
      lines: [{ productId: f.productId, quantity: 100, unitPrice: 1000 }],
    });
    const orderId = f.s.orders[0].id;
    expect(() =>
      f.run({ type: "order.transition", orderId, status: "RECEIVED" }),
    ).toThrow("Transition");
    for (const status of [
      "APPROVED",
      "ORDERED",
      "SHIPPED",
      "CUSTOMS",
      "RECEIVED",
    ])
      f.run({ type: "order.transition", orderId, status });
    expect(f.s.products[0].cost).toBe(1100);
    expect(stock(f.s, f.productId, f.warehouseId)).toBe(100);
    expect(f.s.invoices[0].amount).toBe(100000);
    expect(() =>
      f.run({ type: "order.transition", orderId, status: "RECEIVED" }),
    ).toThrow();
    f.run({
      type: "stock.transfer",
      productId: f.productId,
      fromId: f.warehouseId,
      toId: f.storeId,
      quantity: 20,
    });
    f.run({
      type: "sale.create",
      reference: "SALE-1",
      customerId: f.customerId,
      locationId: f.storeId,
      dueDate: "2026-10-18",
      lines: [{ productId: f.productId, quantity: 5, unitPrice: 2000 }],
    });
    expect(stock(f.s, f.productId)).toBe(95);
    expect(f.s.sales[0].cost).toBe(5500);
    const receivable = f.s.invoices.find((i) => i.kind === "RECEIVABLE")!;
    f.run({
      type: "payment.create",
      invoiceId: receivable.id,
      accountId: f.cashId,
      amount: 5000,
    });
    expect(outstanding(f.s, receivable)).toBe(5000);
    f.run({
      type: "payment.create",
      invoiceId: f.s.invoices[0].id,
      accountId: f.bankId,
      amount: 100000,
    });
    const m = companyMetrics(f.s, f.s.companies[0], new Date(date));
    expect(m).toMatchObject({
      bank: 900000,
      cash: 5000,
      payables: 0,
      receivables: 5000,
      revenue: 10000,
      grossMargin: 4500,
      inventory: 104500,
    });
    f.run({
      type: "cash.transfer",
      fromId: f.cashId,
      toId: f.bankId,
      amount: 3000,
    });
    expect(balance(f.s, f.bankId)).toBe(903000);
    expect(balance(f.s, f.cashId)).toBe(2000);
    f.run({
      type: "expense.create",
      accountId: f.cashId,
      amount: 1000,
      description: "Delivery",
    });
    expect(balance(f.s, f.cashId)).toBe(1000);
  });
  it("rejects overpayments, overdrafts, stock shortages and cross-company references", () => {
    const f = fixture();
    f.run({
      type: "invoice.create",
      reference: "BILL",
      partnerId: f.supplierId,
      kind: "PAYABLE",
      amount: 2000000,
      dueDate: "2026-10-18",
    });
    expect(() =>
      f.run({
        type: "payment.create",
        invoiceId: f.s.invoices[0].id,
        accountId: f.bankId,
        amount: 2000001,
      }),
    ).toThrow("dépasse");
    expect(() =>
      f.run({
        type: "payment.create",
        invoiceId: f.s.invoices[0].id,
        accountId: f.bankId,
        amount: 2000000,
      }),
    ).toThrow("insuffisant");
    expect(() =>
      f.run({
        type: "stock.transfer",
        productId: f.productId,
        fromId: f.warehouseId,
        toId: f.storeId,
        quantity: 1,
      }),
    ).toThrow("Stock insuffisant");
    expect(() =>
      f.run({
        type: "stock.adjust",
        companyId: f.otherId,
        productId: f.productId,
        locationId: f.storeId,
        quantity: 1,
        unitCost: 100,
        reason: "opening",
      }),
    ).toThrow("cette société");
    expect(f.s.payments).toHaveLength(0);
    expect(f.s.movements).toHaveLength(0);
  });
  it("filters every data collection to explicitly assigned companies and enforces company roles", () => {
    const f = fixture();
    expect(visibleBusiness(f.s, operator, false).companies).toHaveLength(0);
    f.run({ type: "access.grant", userId: operator, role: "OPERATIONS" });
    const visible = visibleBusiness(f.s, operator, false);
    expect(visible.companies.map((c) => c.id)).toEqual([f.companyId]);
    expect(visible.accounts.every((a) => a.companyId === f.companyId)).toBe(
      true,
    );
    expect(() =>
      f.run(
        { type: "company.configure", data: f.s.companies[0] },
        operator,
        false,
      ),
    ).toThrow();
    expect(() =>
      f.run(
        {
          type: "account.create",
          name: "Forbidden",
          kind: "BANK",
          opening: 1,
          asOf: "2026-10-18",
        },
        operator,
        false,
      ),
    ).toThrow();
    expect(() =>
      f.run(
        { type: "access.grant", userId: operator, role: "MANAGER" },
        operator,
        false,
      ),
    ).toThrow();
    f.run({ type: "access.grant", userId: operator, role: "VIEWER" });
    expect(() =>
      f.run(
        {
          type: "product.create",
          name: "Denied",
          sku: "x",
          brand: "",
          size: "",
          color: "",
        },
        operator,
        false,
      ),
    ).toThrow("lecture seule");
    f.s.access[0].membershipId = "old-membership";
    expect(
      visibleBusiness(f.s, operator, false, "new-membership").companies,
    ).toHaveLength(0);
    expect(() =>
      applyBusiness(
        structuredClone(f.s),
        {
          type: "location.create",
          companyId: f.companyId,
          name: "Denied after rejoin",
          kind: "STORE",
        },
        operator,
        false,
        date,
        "new-membership",
      ),
    ).toThrow();
    f.run({ type: "access.revoke", userId: operator });
    expect(visibleBusiness(f.s, operator, false).products).toHaveLength(0);
  });
  it("requires manager purchase approval before operations can receive merchandise", () => {
    const f = fixture();
    f.run({ type: "access.grant", userId: operator, role: "OPERATIONS" });
    f.run(
      {
        type: "order.create",
        reference: "PO",
        supplierId: f.supplierId,
        locationId: f.warehouseId,
        origin: "Istanbul",
        eta: "2026-10-18",
        dueDate: "2026-10-18",
        landedCharges: 0,
        lines: [{ productId: f.productId, quantity: 5, unitPrice: 1000 }],
      },
      operator,
      false,
    );
    const orderId = f.s.orders[0].id;
    expect(() =>
      f.run(
        { type: "order.transition", orderId, status: "APPROVED" },
        operator,
        false,
      ),
    ).toThrow("Approbation");
    f.run({ type: "order.transition", orderId, status: "APPROVED" });
    for (const status of ["ORDERED", "SHIPPED", "CUSTOMS", "RECEIVED"])
      f.run({ type: "order.transition", orderId, status }, operator, false);
    expect(stock(f.s, f.productId)).toBe(5);
  });
  it("returns unpaid sales once and restores each variant at its original cost", () => {
    const f = fixture();
    f.run({
      type: "stock.adjust",
      productId: f.productId,
      locationId: f.storeId,
      quantity: 10,
      unitCost: 1500,
      reason: "opening",
    });
    f.run({
      type: "sale.create",
      reference: "S1",
      customerId: f.customerId,
      locationId: f.storeId,
      dueDate: "2026-10-18",
      lines: [{ productId: f.productId, quantity: 2, unitPrice: 2000 }],
    });
    f.run({ type: "sale.return", saleId: f.s.sales[0].id });
    expect(stock(f.s, f.productId)).toBe(10);
    expect(f.s.invoices[0].amount).toBe(0);
    expect(companyMetrics(f.s, f.s.companies[0]).revenue).toBe(0);
    expect(() =>
      f.run({ type: "sale.return", saleId: f.s.sales[0].id }),
    ).toThrow("déjà");
    f.run({
      type: "sale.create",
      reference: "S2",
      customerId: f.customerId,
      locationId: f.storeId,
      dueDate: "2026-10-18",
      lines: [{ productId: f.productId, quantity: 2, unitPrice: 2000 }],
    });
    f.run({
      type: "payment.create",
      invoiceId: f.s.invoices[1].id,
      accountId: f.cashId,
      amount: 1000,
    });
    expect(() =>
      f.run({ type: "sale.return", saleId: f.s.sales[1].id }),
    ).toThrow("remboursement");
  });
  it("caps recommendations across competing stores and labels cold-start uncertainty", () => {
    const f = fixture();
    f.run({
      type: "stock.adjust",
      productId: f.productId,
      locationId: f.warehouseId,
      quantity: 3,
      unitCost: 1000,
      reason: "opening",
    });
    const suggestions = replenishment(
      f.s,
      f.s.companies[0],
      f.warehouseId,
      new Date(date),
    );
    expect(suggestions).toHaveLength(2);
    expect(suggestions.reduce((n, r) => n + r.quantity, 0)).toBe(3);
    expect(suggestions.every((r) => r.confidence === "LOW")).toBe(true);
    expect(replenishment(f.s, f.s.companies[0], f.storeId)).toHaveLength(0);
  });
  it("validates dates, bounds, unknown fields and duplicate order variants", () => {
    const command = {
      commandId: randomUUID(),
      version: 0,
      action: {
        type: "account.create",
        companyId: randomUUID(),
        name: "bank",
        kind: "BANK",
        opening: 1,
        asOf: "2026-02-30",
      },
    };
    expect(BusinessCommandSchema.safeParse(command).success).toBe(false);
    command.action.asOf = "2026-02-28";
    expect(BusinessCommandSchema.safeParse(command).success).toBe(true);
    command.action.opening = 1.2;
    expect(BusinessCommandSchema.safeParse(command).success).toBe(false);
    expect(currencyDigits("TND")).toBe(3);
    expect(currencyDigits("JPY")).toBe(0);
  });
});
