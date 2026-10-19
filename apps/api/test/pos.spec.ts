import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  emptyBusiness,
  applyBusiness,
  visibleBusiness,
  balance,
} from "../src/modules/business/business.engine";
import { posSnapshot, posExpected } from "../src/modules/business/pos.engine";
import {
  BusinessAction,
  BusinessCommandSchema,
} from "../src/modules/business/business.schema";
const owner = randomUUID(),
  cashier = randomUUID(),
  membership = randomUUID(),
  date = "2026-10-18T12:00:00.000Z";
function fixture() {
  let s = emptyBusiness();
  const run = (a: Record<string, unknown>, user = owner, admin = true) => {
    s = applyBusiness(
      structuredClone(s),
      a as BusinessAction,
      user,
      admin,
      date,
      membership,
    );
  };
  run({
    type: "company.create",
    data: {
      name: "Polaris",
      currency: "TND",
      country: "Tunisie",
      brands: [],
      leadDays: 7,
      coverDays: 21,
      minimumStock: 2,
      modules: ["inventory", "sales", "finance", "purchasing"],
    },
  });
  const companyId = s.companies[0].id;
  const cmd = (a: Record<string, unknown>, u = owner, admin = true) =>
    run({ companyId, ...a }, u, admin);
  cmd({ type: "location.create", name: "Tunis", kind: "STORE" });
  cmd({ type: "location.create", name: "Sousse", kind: "STORE" });
  cmd({
    type: "account.create",
    name: "Till",
    kind: "CASH",
    opening: 100000,
    asOf: "2026-10-01",
  });
  cmd({
    type: "account.create",
    name: "Bank",
    kind: "BANK",
    opening: 100000,
    asOf: "2026-10-01",
  });
  cmd({ type: "partner.create", name: "Counter", kind: "CUSTOMER", email: "" });
  cmd({
    type: "product.create",
    sku: "SHOE",
    name: "Shoe",
    brand: "Polaris",
    size: "42",
    color: "Black",
  });
  const storeId = s.locations[0].id,
    otherStoreId = s.locations[1].id,
    cashId = s.accounts[0].id,
    bankId = s.accounts[1].id,
    productId = s.products[0].id;
  cmd({
    type: "stock.adjust",
    productId,
    locationId: storeId,
    quantity: 10,
    unitCost: 500,
    reason: "opening",
  });
  cmd({
    type: "product.pricing",
    productId,
    salePrice: 1000,
    barcode: "12345",
  });
  cmd({
    type: "pos.configure",
    locationId: storeId,
    cashAccountId: cashId,
    cardAccountId: bankId,
    customerId: s.partners[0].id,
    maxDiscountBps: 500,
  });
  cmd({
    type: "access.grant",
    userId: cashier,
    role: "CASHIER",
    locationIds: [storeId],
  });
  s.access[0].membershipId = membership;
  return {
    get s() {
      return s;
    },
    cmd,
    companyId,
    storeId,
    otherStoreId,
    cashId,
    bankId,
    productId,
  };
}
describe("Store POS security and lifecycle", () => {
  it("excludes reserved articles from availability and rejects checkout of promised quantities", () => {
    const f = fixture();
    f.cmd({
      type: "customerOrder.create",
      reference: "CO-POS",
      customerId: f.s.partners[0].id,
      locationId: f.storeId,
      dueDate: "2026-11-01",
      lines: [{ productId: f.productId, quantity: 9, unitPrice: 1000 }],
    });
    f.cmd({
      type: "customerOrder.confirm",
      orderId: f.s.customerOrders![0].id,
    });
    expect(
      posSnapshot(f.s, 1, cashier, false, membership).availability.find(
        (x) => x.productId === f.productId && x.locationId === f.storeId,
      )!.quantity,
    ).toBe(1);
    f.cmd(
      { type: "pos.open", locationId: f.storeId, opening: 0 },
      cashier,
      false,
    );
    const sessionId = f.s.posSessions![0].id;
    expect(() =>
      f.cmd(
        {
          type: "pos.checkout",
          sessionId,
          items: [{ productId: f.productId, quantity: 2 }],
          discountBps: 0,
          cash: 2000,
          card: 0,
          cashGiven: 2000,
        },
        cashier,
        false,
      ),
    ).toThrow();
    f.cmd(
      {
        type: "pos.checkout",
        sessionId,
        items: [{ productId: f.productId, quantity: 1 }],
        discountBps: 0,
        cash: 1000,
        card: 0,
        cashGiven: 1000,
      },
      cashier,
      false,
    );
    expect(f.s.sales).toHaveLength(1);
  });

  it("redacts finances, restricts stores and permits same-company stock lookup", () => {
    const f = fixture(),
      view = posSnapshot(f.s, 1, cashier, false, membership);
    expect(view.stores.map((x) => x.id)).toEqual([f.storeId]);
    expect(view.availability.some((x) => x.locationId === f.otherStoreId)).toBe(
      true,
    );
    expect(view.products[0]).not.toHaveProperty("cost");
    expect(view).not.toHaveProperty("accounts");
    expect(
      visibleBusiness(f.s, cashier, false, membership).companies,
    ).toHaveLength(0);
    expect(
      posSnapshot(f.s, 1, cashier, false, randomUUID()).stores,
    ).toHaveLength(0);
    expect(() =>
      f.cmd(
        {
          type: "stock.adjust",
          productId: f.productId,
          locationId: f.storeId,
          quantity: 1,
          unitCost: 0,
          reason: "denied",
        },
        cashier,
        false,
      ),
    ).toThrow();
    expect(() =>
      f.cmd(
        { type: "pos.open", locationId: f.otherStoreId, opening: 0 },
        cashier,
        false,
      ),
    ).toThrow("Magasin");
  });
  it("atomically records mixed payments, stock and collections", () => {
    const f = fixture();
    f.cmd(
      { type: "pos.open", locationId: f.storeId, opening: 10000 },
      cashier,
      false,
    );
    const sessionId = f.s.posSessions![0].id;
    f.cmd(
      {
        type: "pos.checkout",
        sessionId,
        items: [{ productId: f.productId, quantity: 2 }],
        discountBps: 0,
        cash: 1500,
        card: 500,
        cashGiven: 2000,
      },
      cashier,
      false,
    );
    expect(f.s.sales[0].total).toBe(2000);
    expect(f.s.sales[0].cost).toBe(1000);
    expect(f.s.payments.map((x) => x.amount)).toEqual([1500, 500]);
    expect(balance(f.s, f.cashId)).toBe(101500);
    expect(balance(f.s, f.bankId)).toBe(100500);
    expect(posExpected(f.s, f.s.posSessions![0])).toBe(11500);
    expect(f.s.movements.reduce((n, m) => n + m.quantity, 0)).toBe(8);
  });
  it("rejects excess discounts, underpayments, duplicate sessions and external drawer writes", () => {
    const f = fixture();
    f.cmd(
      { type: "pos.open", locationId: f.storeId, opening: 0 },
      cashier,
      false,
    );
    const sessionId = f.s.posSessions![0].id;
    expect(() =>
      f.cmd(
        { type: "pos.open", locationId: f.storeId, opening: 0 },
        cashier,
        false,
      ),
    ).toThrow();
    expect(() =>
      f.cmd(
        {
          type: "pos.checkout",
          sessionId,
          items: [{ productId: f.productId, quantity: 1 }],
          discountBps: 1000,
          cash: 900,
          card: 0,
          cashGiven: 900,
        },
        cashier,
        false,
      ),
    ).toThrow("Remise");
    expect(() =>
      f.cmd(
        {
          type: "pos.checkout",
          sessionId,
          items: [{ productId: f.productId, quantity: 1 }],
          discountBps: 0,
          cash: 900,
          card: 0,
          cashGiven: 900,
        },
        cashier,
        false,
      ),
    ).toThrow("Règlements");
    expect(() =>
      f.cmd({
        type: "expense.create",
        accountId: f.cashId,
        amount: 1,
        description: "external",
      }),
    ).toThrow("Fermez");
    expect(f.s.sales).toHaveLength(0);
  });
  it("requires a manager for refunds and restores stock and tenders only once", () => {
    const f = fixture();
    f.cmd(
      { type: "pos.open", locationId: f.storeId, opening: 10000 },
      cashier,
      false,
    );
    const sessionId = f.s.posSessions![0].id;
    f.cmd(
      {
        type: "pos.checkout",
        sessionId,
        items: [{ productId: f.productId, quantity: 1 }],
        discountBps: 0,
        cash: 600,
        card: 400,
        cashGiven: 600,
      },
      cashier,
      false,
    );
    const saleId = f.s.sales[0].id;
    expect(() =>
      f.cmd(
        { type: "pos.refund", sessionId, saleId, reason: "return" },
        cashier,
        false,
      ),
    ).toThrow("responsable");
    f.cmd({ type: "pos.refund", sessionId, saleId, reason: "return" });
    expect(f.s.invoices[0].amount).toBe(0);
    expect(balance(f.s, f.cashId)).toBe(100000);
    expect(balance(f.s, f.bankId)).toBe(100000);
    expect(f.s.movements.reduce((n, m) => n + m.quantity, 0)).toBe(10);
    expect(() =>
      f.cmd({ type: "pos.refund", sessionId, saleId, reason: "duplicate" }),
    ).toThrow("déjà");
  });
  it("requires manager review of closing variances before reopening", () => {
    const f = fixture();
    f.cmd(
      { type: "pos.open", locationId: f.storeId, opening: 10000 },
      cashier,
      false,
    );
    const sessionId = f.s.posSessions![0].id;
    f.cmd(
      { type: "pos.close", sessionId, counted: 9000, reason: "shortage" },
      cashier,
      false,
    );
    expect(f.s.posSessions![0].variance).toBe(-1000);
    expect(() =>
      f.cmd(
        { type: "pos.open", locationId: f.storeId, opening: 0 },
        cashier,
        false,
      ),
    ).toThrow("écart");
    expect(() =>
      f.cmd(
        { type: "pos.reconcile", sessionId, reason: "approve" },
        cashier,
        false,
      ),
    ).toThrow("responsable");
    f.cmd({ type: "pos.reconcile", sessionId, reason: "reviewed" });
    expect(balance(f.s, f.cashId)).toBe(99000);
    expect(() =>
      f.cmd({ type: "pos.reconcile", sessionId, reason: "duplicate" }),
    ).toThrow("déjà");
    f.cmd(
      { type: "pos.open", locationId: f.storeId, opening: 1000 },
      cashier,
      false,
    );
    expect(f.s.posSessions).toHaveLength(2);
  });
  it("archives and restores companies without discarding their records", () => {
    const f = fixture();
    expect(() =>
      f.cmd({
        type: "company.lifecycle",
        status: "ARCHIVED",
        confirmation: "wrong",
      }),
    ).toThrow("confirmation");
    f.cmd({
      type: "company.lifecycle",
      status: "DELETED",
      confirmation: "Polaris",
    });
    expect(posSnapshot(f.s, 1, cashier, false, membership).stores).toHaveLength(
      0,
    );
    expect(() =>
      f.cmd({
        type: "product.pricing",
        productId: f.productId,
        salePrice: 2000,
        barcode: "",
      }),
    ).toThrow("Restaurez");
    f.cmd({
      type: "company.lifecycle",
      status: "ACTIVE",
      confirmation: "Polaris",
    });
    expect(f.s.products).toHaveLength(1);
  });
  it("rejects duplicate cart variants and foreign configuration references", () => {
    const f = fixture();
    const items = [
      { productId: f.productId, quantity: 1 },
      { productId: f.productId, quantity: 1 },
    ];
    expect(
      BusinessCommandSchema.safeParse({
        commandId: randomUUID(),
        version: 1,
        action: {
          type: "pos.checkout",
          companyId: f.companyId,
          sessionId: randomUUID(),
          items,
          discountBps: 0,
          cash: 2000,
          card: 0,
          cashGiven: 2000,
        },
      }).success,
    ).toBe(false);
    expect(() =>
      f.cmd({
        type: "pos.configure",
        locationId: f.storeId,
        cashAccountId: randomUUID(),
        cardAccountId: f.bankId,
        customerId: f.s.partners[0].id,
        maxDiscountBps: 0,
      }),
    ).toThrow("invalides");
  });
});
