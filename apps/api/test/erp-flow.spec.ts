import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  emptyBusiness,
  applyBusiness,
  stock,
  balance,
  visibleBusiness,
} from "../src/modules/business/business.engine";
import { BusinessCommandSchema } from "../src/modules/business/business.schema";
import {
  groupAnnual,
  annualPnl,
  companyMetrics,
  purchaseNeeds,
  replenishment,
  orderReceived,
} from "@saas/types";
const actor = randomUUID(),
  other = randomUUID(),
  now = "2026-10-18T12:00:00.000Z";
function fixture() {
  let s = emptyBusiness();
  function cmd(a: Record<string, unknown>, owner = true, user = actor) {
    const action = BusinessCommandSchema.parse({
      commandId: randomUUID(),
      version: 0,
      action: a,
    }).action;
    const next = structuredClone(s);
    applyBusiness(next, action, user, owner, now);
    s = next;
  }
  const create = (name: string, currency = "TND") => {
    cmd({
      type: "company.create",
      data: {
        name,
        currency,
        country: "Tunisie",
        brands: [],
        leadDays: 5,
        coverDays: 25,
        minimumStock: 2,
        modules: ["purchasing", "inventory", "sales", "finance"],
      },
    });
    return s.companies.at(-1)!.id;
  };
  const a = create("A"),
    b = create("B"),
    euro = create("Euro", "EUR");
  const run = (x: Record<string, unknown>, owner = true, user = actor) =>
    cmd({ companyId: a, ...x }, owner, user);
  run({ type: "location.create", name: "Warehouse", kind: "WAREHOUSE" });
  const wh = s.locations.at(-1)!.id;
  run({ type: "location.create", name: "Store", kind: "STORE" });
  const store = s.locations.at(-1)!.id;
  run({
    type: "product.create",
    sku: "SKU-1",
    model: "M",
    name: "Shoe",
    brand: "Demo",
    size: "42",
    color: "Black",
  });
  const p = s.products[0].id;
  run({
    type: "partner.create",
    name: "Supplier",
    kind: "SUPPLIER",
    email: "",
  });
  const supplier = s.partners[0].id;
  for (const cid of [a, b])
    cmd({
      type: "account.create",
      companyId: cid,
      name: "Bank",
      kind: "BANK",
      opening: 10000000,
      asOf: "2026-01-01",
    });
  const bankA = s.accounts[0].id,
    bankB = s.accounts[1].id;
  run({
    type: "order.create",
    reference: "PO-1",
    supplierId: supplier,
    locationId: wh,
    origin: "Istanbul",
    eta: "2026-10-18",
    dueDate: "2026-11-01",
    landedCharges: 1000,
    lines: [{ productId: p, quantity: 10, unitPrice: 10000 }],
  });
  const order = s.orders[0].id;
  for (const status of ["APPROVED", "ORDERED", "SHIPPED", "CUSTOMS"])
    run({ type: "order.transition", orderId: order, status });
  return {
    get s() {
      return s;
    },
    cmd,
    run,
    a,
    b,
    euro,
    p,
    wh,
    store,
    supplier,
    bankA,
    bankB,
    order,
  };
}
describe("ERP documents and group management consolidation", () => {
  it("links partial receipts to proportional stock, charges and supplier payables, then completes the remainder exactly once", () => {
    const f = fixture();
    f.run({
      type: "order.receive",
      orderId: f.order,
      reference: "BR-1",
      lines: [{ productId: f.p, quantity: 4 }],
    });
    expect(stock(f.s, f.p, f.wh)).toBe(4);
    expect(f.s.orders[0].status).toBe("PARTIALLY_RECEIVED");
    expect(f.s.receipts![0].landedCharges).toBe(400);
    expect(f.s.invoices[0].amount).toBe(40000);
    expect(f.s.receipts![0].invoiceId).toBe(f.s.invoices[0].id);
    expect(() =>
      f.run({
        type: "order.receive",
        orderId: f.order,
        reference: "BR-over",
        lines: [{ productId: f.p, quantity: 7 }],
      }),
    ).toThrow();
    expect(() =>
      f.run({
        type: "order.receive",
        orderId: f.order,
        reference: "BR-1",
        lines: [{ productId: f.p, quantity: 1 }],
      }),
    ).toThrow();
    f.run({ type: "order.transition", orderId: f.order, status: "RECEIVED" });
    expect(stock(f.s, f.p, f.wh)).toBe(10);
    expect(f.s.orders[0].status).toBe("RECEIVED");
    expect(f.s.receipts!.reduce((n, r) => n + r.landedCharges, 0)).toBe(1000);
    expect(f.s.invoices.reduce((n, i) => n + i.amount, 0)).toBe(100000);
    expect(f.s.products[0].cost).toBe(10100);
    expect(() =>
      f.run({ type: "order.transition", orderId: f.order, status: "RECEIVED" }),
    ).toThrow();
  });
  it("does not receive foreign variants or draft orders", () => {
    const f = fixture();
    expect(() =>
      f.run({
        type: "order.receive",
        orderId: f.order,
        reference: "BR",
        lines: [{ productId: randomUUID(), quantity: 1 }],
      }),
    ).toThrow();
    f.run({
      type: "order.create",
      reference: "DRAFT",
      supplierId: f.supplier,
      locationId: f.wh,
      origin: "Test",
      eta: "2026-10-18",
      dueDate: "2026-10-18",
      landedCharges: 0,
      lines: [{ productId: f.p, quantity: 1, unitPrice: 1 }],
    });
    expect(() =>
      f.run({
        type: "order.receive",
        orderId: f.s.orders.at(-1)!.id,
        reference: "BR-D",
        lines: [{ productId: f.p, quantity: 1 }],
      }),
    ).toThrow();
  });
  it("keeps transit owned but unavailable, avoids duplicate replenishment, and receives it once", () => {
    const f = fixture();
    f.run({ type: "order.transition", orderId: f.order, status: "RECEIVED" });
    const value = companyMetrics(f.s, f.s.companies[0]).inventory;
    f.run({
      type: "stock.ship",
      reference: "TR-1",
      fromId: f.wh,
      toId: f.store,
      lines: [{ productId: f.p, quantity: 3 }],
    });
    expect(stock(f.s, f.p, f.wh)).toBe(7);
    expect(stock(f.s, f.p, f.store)).toBe(0);
    expect(companyMetrics(f.s, f.s.companies[0]).inventory).toBe(value);
    expect(replenishment(f.s, f.s.companies[0], f.wh)).toHaveLength(0);
    f.run({ type: "stock.receiveTransfer", transferId: f.s.transfers![0].id });
    expect(stock(f.s, f.p, f.store)).toBe(3);
    expect(companyMetrics(f.s, f.s.companies[0]).inventory).toBe(value);
    expect(() =>
      f.run({
        type: "stock.receiveTransfer",
        transferId: f.s.transfers![0].id,
      }),
    ).toThrow();
  });
  it("separates buyer and warehouse writes and redacts their banking and payroll details", () => {
    const f = fixture();
    f.run({ type: "access.grant", userId: other, role: "BUYER" });
    expect(() =>
      f.run(
        {
          type: "order.receive",
          orderId: f.order,
          reference: "BR-B",
          lines: [{ productId: f.p, quantity: 1 }],
        },
        false,
        other,
      ),
    ).toThrow();
    expect(() =>
      f.run(
        {
          type: "expense.create",
          accountId: f.bankA,
          amount: 1,
          description: "No",
        },
        false,
        other,
      ),
    ).toThrow();
    f.run({ type: "access.grant", userId: other, role: "WAREHOUSE" });
    f.run(
      {
        type: "order.receive",
        orderId: f.order,
        reference: "BR-W",
        lines: [{ productId: f.p, quantity: 1 }],
      },
      false,
      other,
    );
    expect(() =>
      f.run(
        {
          type: "order.create",
          reference: "W",
          supplierId: f.supplier,
          locationId: f.wh,
          origin: "Test",
          eta: "2026-10-18",
          dueDate: "2026-10-18",
          landedCharges: 0,
          lines: [{ productId: f.p, quantity: 1, unitPrice: 1 }],
        },
        false,
        other,
      ),
    ).toThrow();
    const view = visibleBusiness(f.s, other, false);
    expect(view.accounts).toHaveLength(0);
    expect(view.invoices).toHaveLength(0);
    expect(view.orders[0].lines[0].unitPrice).toBe(0);
    expect(view.products[0].cost).toBe(0);
  });
  it("consolidates both internal sides, excludes other currencies and settles banks atomically without changing group cash", () => {
    const f = fixture();
    f.run({
      type: "intercompany.create",
      toCompanyId: f.b,
      reference: "IC-1",
      description: "Shared logistics",
      amount: 1000000,
      dueDate: "2026-11-01",
    });
    const charge = f.s.intercompany![0];
    expect(annualPnl(f.s, f.a, 2026).total.revenue).toBe(1000000);
    expect(annualPnl(f.s, f.b, 2026).total.expenses).toBe(1000000);
    const g = groupAnnual(f.s, [f.a, f.b, f.euro], 2026, "TND");
    expect(g.companies).toHaveLength(2);
    expect(g.elimination).toBe(1000000);
    expect(g.consolidated.revenue).toBe(0);
    expect(g.consolidated.expenses).toBe(0);
    expect(g.consolidated.beforeTax).toBe(0);
    expect(groupAnnual(f.s, [f.a], 2026, "TND").elimination).toBe(0);
    expect(groupAnnual(f.s, [f.a, f.b], 2026, "TND", 1, 9).elimination).toBe(0);
    expect(() =>
      f.run({
        type: "payment.create",
        invoiceId: charge.receivableId,
        accountId: f.bankA,
        amount: 1,
      }),
    ).toThrow();
    const cash = balance(f.s, f.bankA) + balance(f.s, f.bankB);
    f.run({
      type: "intercompany.settle",
      chargeId: charge.id,
      payerAccountId: f.bankB,
      receiverAccountId: f.bankA,
      amount: 400000,
    });
    expect(balance(f.s, f.bankA) + balance(f.s, f.bankB)).toBe(cash);
    expect(f.s.payments).toHaveLength(2);
    expect(() =>
      f.run({
        type: "intercompany.settle",
        chargeId: charge.id,
        payerAccountId: f.bankB,
        receiverAccountId: f.bankA,
        amount: 700000,
      }),
    ).toThrow();
  });
  it("requires access to both internal companies, rejects currency mixing and hides internal documents from warehouse users", () => {
    const f = fixture();
    f.run({ type: "access.grant", userId: other, role: "FINANCE" });
    expect(() =>
      f.run(
        {
          type: "intercompany.create",
          toCompanyId: f.b,
          reference: "IC-DENY",
          description: "No",
          amount: 1,
          dueDate: "2026-11-01",
        },
        false,
        other,
      ),
    ).toThrow();
    expect(() =>
      f.run({
        type: "intercompany.create",
        toCompanyId: f.euro,
        reference: "FX",
        description: "No FX",
        amount: 1,
        dueDate: "2026-11-01",
      }),
    ).toThrow();
    f.run({
      type: "intercompany.create",
      toCompanyId: f.b,
      reference: "IC-2",
      description: "Test",
      amount: 100,
      dueDate: "2026-11-01",
    });
    f.cmd({
      type: "access.grant",
      companyId: f.b,
      userId: other,
      role: "WAREHOUSE",
    });
    f.run({ type: "access.revoke", userId: other });
    expect(visibleBusiness(f.s, other, false).intercompany).toHaveLength(0);
  });
  it("counts only unreceived incoming quantities in purchasing suggestions", () => {
    const f = fixture();
    f.run({
      type: "order.receive",
      orderId: f.order,
      reference: "PART",
      lines: [{ productId: f.p, quantity: 4 }],
    });
    expect(orderReceived(f.s, f.order, f.p)).toBe(4);
    const row = purchaseNeeds(f.s, f.s.companies[0], {
      model: "M",
      leadDays: 30,
      minimumQuantity: 1,
    })[0];
    expect(row.incoming).toBe(6);
  });
  it("allocates tiny landed charges without negative variant costs", () => {
    const f = fixture(),
      products = [f.p];
    for (let i = 0; i < 3; i++) {
      f.run({
        type: "product.create",
        sku: `TINY-${i}`,
        name: "Tiny",
        brand: "Demo",
        color: "Black",
        size: String(i),
      });
      products.push(f.s.products.at(-1)!.id);
    }
    f.run({
      type: "order.create",
      reference: "TINY",
      supplierId: f.supplier,
      locationId: f.wh,
      origin: "Test",
      eta: "2026-10-18",
      dueDate: "2026-11-01",
      landedCharges: 2,
      lines: products.map((productId) => ({
        productId,
        quantity: 1,
        unitPrice: 0,
      })),
    });
    const id = f.s.orders.at(-1)!.id;
    for (const status of ["APPROVED", "ORDERED", "SHIPPED", "CUSTOMS"])
      f.run({ type: "order.transition", orderId: id, status });
    for (let i = 0; i < 4; i++)
      f.run({
        type: "order.receive",
        orderId: id,
        reference: `TINY-BR-${i}`,
        lines: [{ productId: products[i], quantity: 1 }],
      });
    expect(
      f.s
        .receipts!.filter((r) => r.orderId === id)
        .reduce((n, r) => n + r.landedCharges, 0),
    ).toBe(2);
    expect(f.s.products.every((p) => p.cost >= 0)).toBe(true);
  });
  it("lets company HR prepare costs without reading banks or issuing bank payments", () => {
    const f = fixture();
    const { id, ...data } = f.s.companies[0];
    f.run({
      type: "company.configure",
      data: { ...data, modules: [...data.modules, "hr"] },
    });
    f.run({ type: "access.grant", userId: other, role: "HR" });
    f.run(
      {
        type: "hr.employee.create",
        fullName: "HR private",
        jobTitle: "Seller",
        department: "Store",
        grossSalary: 100000,
        employerChargesBps: 1800,
        hiredAt: "2025-01-01",
      },
      false,
      other,
    );
    f.run(
      {
        type: "hr.payroll.record",
        employeeId: f.s.employees![0].id,
        period: "2026-10",
      },
      false,
      other,
    );
    const view = visibleBusiness(f.s, other, false, undefined, false);
    expect(view.employees).toHaveLength(1);
    expect(view.payroll).toHaveLength(1);
    expect(view.accounts).toHaveLength(0);
    expect(view.orders).toHaveLength(0);
    expect(() =>
      f.run(
        {
          type: "hr.payroll.pay",
          payrollId: f.s.payroll![0].id,
          accountId: f.bankA,
        },
        false,
        other,
      ),
    ).toThrow();
  });
});
