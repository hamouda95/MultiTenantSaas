import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  applyBusiness,
  emptyBusiness,
  balance,
} from "../src/modules/business/business.engine";
import { posSnapshot } from "../src/modules/business/pos.engine";
import {
  BusinessCommandSchema,
  type BusinessAction,
} from "../src/modules/business/business.schema";
import {
  accountBalance,
  companyMetrics,
  financingOutstanding,
  modelInventory,
} from "@saas/types";
function fixture() {
  let state = emptyBusiness();
  const owner = randomUUID(),
    staff = randomUUID(),
    member = randomUUID(),
    now = "2026-10-18T12:00:00.000Z";
  const raw = (a: Record<string, unknown>, user = owner, admin = true) => {
    state = applyBusiness(
      structuredClone(state),
      a as BusinessAction,
      user,
      admin,
      now,
      member,
    );
  };
  const company = (name: string) => {
    raw({
      type: "company.create",
      data: {
        name,
        currency: "TND",
        country: "Tunisie",
        brands: [],
        leadDays: 7,
        coverDays: 21,
        minimumStock: 0,
        modules: ["purchasing", "inventory", "sales", "finance"],
      },
    });
    return state.companies.at(-1)!.id;
  };
  const companyId = company("Polaris"),
    foreignId = company("Other");
  const cmd = (a: Record<string, unknown>, user = owner, admin = true) =>
    raw({ companyId, ...a }, user, admin);
  cmd({ type: "location.create", name: "Tunis", kind: "STORE" });
  cmd({
    type: "account.create",
    name: "Bank",
    kind: "BANK",
    opening: 100000,
    asOf: "2026-10-01",
  });
  cmd({
    type: "account.create",
    name: "Till",
    kind: "CASH",
    opening: 0,
    asOf: "2026-10-01",
  });
  cmd({
    type: "partner.create",
    name: "Comptoir",
    kind: "CUSTOMER",
    email: "",
  });
  const locationId = state.locations[0].id,
    bankId = state.accounts[0].id,
    cashId = state.accounts[1].id,
    customerId = state.partners[0].id;
  cmd({
    type: "pos.configure",
    locationId,
    cashAccountId: cashId,
    cardAccountId: bankId,
    customerId,
    maxDiscountBps: 0,
  });
  cmd({
    type: "access.grant",
    userId: staff,
    role: "CASHIER",
    locationIds: [locationId],
  });
  state.access[0].membershipId = member;
  return {
    get s() {
      return state;
    },
    cmd,
    raw,
    owner,
    staff,
    member,
    companyId,
    foreignId,
    locationId,
    bankId,
    cashId,
    customerId,
  };
}
describe("Purchasing, bank financing and inventory variants", () => {
  it("tracks borrowing separately from revenue and reconciles bank balance and repayments", () => {
    const f = fixture();
    f.cmd({
      type: "financing.create",
      reference: "LOAN-1",
      bank: "Bank A",
      accountId: f.bankId,
      principal: 50000,
      interest: 5000,
      dueDate: "2026-12-01",
    });
    const id = f.s.financings![0].id;
    expect(balance(f.s, f.bankId)).toBe(100000);
    f.cmd({ type: "financing.draw", financingId: id });
    expect(balance(f.s, f.bankId)).toBe(150000);
    expect(accountBalance(f.s, f.bankId)).toBe(150000);
    expect(companyMetrics(f.s, f.s.companies[0]).revenue).toBe(0);
    expect(companyMetrics(f.s, f.s.companies[0]).bankDebt).toBe(55000);
    expect(() => f.cmd({ type: "financing.draw", financingId: id })).toThrow();
    f.cmd({
      type: "financing.repay",
      financingId: id,
      accountId: f.bankId,
      principal: 20000,
      interest: 1000,
    });
    expect(balance(f.s, f.bankId)).toBe(129000);
    expect(accountBalance(f.s, f.bankId)).toBe(129000);
    expect(financingOutstanding(f.s, id)).toEqual({
      principal: 30000,
      interest: 4000,
      total: 34000,
    });
    expect(companyMetrics(f.s, f.s.companies[0]).operatingContribution).toBe(
      -1000,
    );
    expect(() =>
      f.cmd({
        type: "financing.repay",
        financingId: id,
        accountId: f.bankId,
        principal: 30001,
        interest: 0,
      }),
    ).toThrow();
    f.cmd({
      type: "financing.repay",
      financingId: id,
      accountId: f.bankId,
      principal: 30000,
      interest: 4000,
    });
    expect(financingOutstanding(f.s, id).total).toBe(0);
  });
  it("rejects unauthorized funding, cross-company bank references, zero and unfunded repayments", () => {
    const f = fixture(),
      loan = {
        type: "financing.create",
        reference: "X",
        bank: "B",
        accountId: f.bankId,
        principal: 50000,
        interest: 0,
        dueDate: "2026-12-01",
      };
    expect(() => f.cmd(loan, f.staff, false)).toThrow();
    expect(() => f.cmd({ ...loan, companyId: f.foreignId })).toThrow();
    expect(() => f.cmd({ ...loan, accountId: f.cashId })).toThrow();
    f.cmd(loan);
    const financingId = f.s.financings![0].id;
    expect(() =>
      f.cmd({
        type: "financing.repay",
        financingId,
        accountId: f.bankId,
        principal: 1,
        interest: 0,
      }),
    ).toThrow();
    f.cmd({ type: "financing.draw", financingId });
    expect(() =>
      f.cmd({
        type: "financing.repay",
        financingId,
        accountId: f.bankId,
        principal: 0,
        interest: 0,
      }),
    ).toThrow();
    f.cmd({
      type: "expense.create",
      accountId: f.bankId,
      amount: 150000,
      description: "Spent",
    });
    expect(() =>
      f.cmd({
        type: "financing.repay",
        financingId,
        accountId: f.bankId,
        principal: 1,
        interest: 0,
      }),
    ).toThrow();
  });
  it("keeps five model colours distinct and derives stock from receipts, sales, returns and adjustments", () => {
    const f = fixture();
    for (const color of ["Black", "White", "Red", "Blue", "Green"]) {
      f.cmd({
        type: "product.create",
        model: "T9800",
        sku: "T9800-" + color,
        name: "Shoe",
        brand: "P",
        size: "42",
        color,
      });
      const p = f.s.products.at(-1)!;
      f.cmd({
        type: "stock.adjust",
        productId: p.id,
        locationId: f.locationId,
        quantity: 10,
        unitCost: 500,
        reason: "Initial",
      });
    }
    const rows = modelInventory(f.s, f.companyId, "T9800");
    expect(rows.length).toBe(5);
    expect(rows.reduce((n, r) => n + r.stock, 0)).toBe(50);
    const p = f.s.products[0];
    f.cmd({
      type: "sale.create",
      reference: "SALE-1",
      customerId: f.customerId,
      locationId: f.locationId,
      lines: [{ productId: p.id, quantity: 3, unitPrice: 1000 }],
    });
    expect(
      modelInventory(f.s, f.companyId, "T9800").find(
        (r) => r.color === "Black",
      )!.stock,
    ).toBe(7);
    f.cmd({ type: "sale.return", saleId: f.s.sales[0].id });
    const row = modelInventory(f.s, f.companyId, "T9800").find(
      (r) => r.color === "Black",
    )!;
    expect(row).toEqual({
      color: "Black",
      received: 0,
      sold: 3,
      returned: 3,
      other: 10,
      stock: 10,
    });
    expect(modelInventory(f.s, f.foreignId, "T9800")).toEqual([]);
  });
  it("only permits the holding owner/platform administrator to adjust physical stock", () => {
    const f = fixture();
    f.cmd({
      type: "product.create",
      sku: "A",
      name: "Shoe",
      brand: "",
      size: "",
      color: "Black",
    });
    const productId = f.s.products[0].id;
    f.cmd({ type: "access.grant", userId: f.staff, role: "MANAGER" });
    f.s.access[0].membershipId = f.member;
    const a = {
      type: "stock.adjust",
      productId,
      locationId: f.locationId,
      quantity: 2,
      unitCost: 500,
      reason: "Count",
    };
    expect(() => f.cmd(a, f.staff, false)).toThrow();
    f.cmd(a);
    expect(modelInventory(f.s, f.companyId, "Shoe")[0].stock).toBe(2);
  });
  it("scopes POS clients and binds a sale and invoice to the selected customer", () => {
    const f = fixture();
    f.cmd({
      type: "partner.create",
      companyId: f.foreignId,
      name: "Secret",
      kind: "CUSTOMER",
      email: "",
    });
    const foreign = f.s.partners.at(-1)!.id;
    f.cmd(
      {
        type: "pos.customer.create",
        locationId: f.locationId,
        name: "Amira",
        email: "amira@example.test",
        phone: "+21612345678",
      },
      f.staff,
      false,
    );
    const customerId = f.s.partners.at(-1)!.id;
    const snap = posSnapshot(f.s, 0, f.staff, false, f.member);
    expect(snap.customers.map((c) => c.name)).toEqual(["Comptoir", "Amira"]);
    expect(JSON.stringify(snap)).not.toContain("Secret");
    f.cmd({
      type: "product.create",
      sku: "A",
      name: "Shoe",
      model: "T9800",
      brand: "",
      size: "42",
      color: "Black",
      salePrice: 1000,
      barcode: "123456",
    });
    const productId = f.s.products[0].id;
    f.cmd({
      type: "stock.adjust",
      productId,
      locationId: f.locationId,
      quantity: 2,
      unitCost: 500,
      reason: "Initial",
    });
    f.cmd(
      { type: "pos.open", locationId: f.locationId, opening: 0 },
      f.staff,
      false,
    );
    const sessionId = f.s.posSessions![0].id;
    const sale = {
      type: "pos.checkout",
      sessionId,
      customerId,
      items: [{ productId, quantity: 1 }],
      discountBps: 0,
      cash: 1000,
      card: 0,
      cashGiven: 1000,
    };
    expect(() =>
      f.cmd({ ...sale, customerId: foreign }, f.staff, false),
    ).toThrow();
    f.cmd(sale, f.staff, false);
    expect(f.s.sales[0].customerId).toBe(customerId);
    expect(f.s.invoices[0].partnerId).toBe(customerId);
    expect(
      posSnapshot(f.s, 1, f.staff, false, f.member).tickets[0].customerId,
    ).toBe(customerId);
    expect(() =>
      f.cmd(
        {
          type: "pos.customer.create",
          companyId: f.foreignId,
          locationId: f.locationId,
          name: "Leak",
          email: "",
          phone: "",
        },
        f.staff,
        false,
      ),
    ).toThrow();
  });
  it("validates article identifiers and prevents duplicate barcodes within one company", () => {
    const f = fixture(),
      a = {
        type: "product.create",
        model: "T9800",
        sku: "A",
        name: "Shoe",
        brand: "",
        size: "42",
        color: "Black",
        salePrice: 1000,
        barcode: "123",
      };
    f.cmd(a);
    expect(() => f.cmd({ ...a, sku: "B" })).toThrow();
    f.cmd({ ...a, sku: "B", companyId: f.foreignId });
    expect(f.s.products.length).toBe(2);
    expect(
      BusinessCommandSchema.safeParse({
        commandId: randomUUID(),
        version: 0,
        action: { ...a, companyId: f.companyId, salePrice: 1.5 },
      }).success,
    ).toBe(false);
  });
});
