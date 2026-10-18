import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  applyBusiness,
  emptyBusiness,
  visibleBusiness,
} from "../src/modules/business/business.engine";
import { BusinessCommandSchema } from "../src/modules/business/business.schema";
import {
  availableStock,
  productStock,
  reservedStock,
  groupAnnual,
  replenishment,
} from "@saas/types";
const user = randomUUID(),
  staff = randomUUID(),
  now = "2026-10-18T12:00:00.000Z";
function fixture() {
  let s = emptyBusiness();
  let companyId = "";
  const run = (action: Record<string, unknown>, owner = true, actor = user) => {
    const next = structuredClone(s);
    applyBusiness(
      next,
      BusinessCommandSchema.parse({
        commandId: randomUUID(),
        version: 0,
        action: { companyId, ...action },
      }).action,
      actor,
      owner,
      now,
    );
    s = next;
  };
  // company.create does not accept companyId
  applyBusiness(
    s,
    {
      type: "company.create",
      data: {
        name: "A",
        currency: "TND",
        country: "TN",
        brands: [],
        leadDays: 1,
        coverDays: 1,
        minimumStock: 1,
        modules: ["inventory", "sales", "finance", "purchasing"],
      },
    },
    user,
    true,
    now,
  );
  companyId = s.companies[0].id;
  run({ type: "location.create", name: "Warehouse", kind: "WAREHOUSE" });
  run({ type: "location.create", name: "Store", kind: "STORE" });
  const wh = s.locations[0].id,
    store = s.locations[1].id;
  run({
    type: "product.create",
    sku: "P",
    name: "Shoe",
    brand: "",
    size: "42",
    color: "Black",
    salePrice: 2000,
  });
  const p = s.products[0].id;
  run({ type: "partner.create", kind: "CUSTOMER", name: "Client", email: "" });
  const customer = s.partners[0].id;
  run({
    type: "stock.adjust",
    productId: p,
    locationId: wh,
    quantity: 10,
    unitCost: 1000,
    reason: "Opening",
  });
  const create = (quantity = 6, reference = "CO-1") =>
    run({
      type: "customerOrder.create",
      reference,
      customerId: customer,
      locationId: wh,
      dueDate: "2026-11-01",
      lines: [{ productId: p, quantity, unitPrice: 2000 }],
    });
  return {
    get s() {
      return s;
    },
    run,
    create,
    p,
    wh,
    store,
    customer,
    companyId,
  };
}
describe("Customer orders, reservations and management recognition", () => {
  it("checks all variants before reserving and leaves no partial reservation on failure", () => {
    const f = fixture();
    f.run({
      type: "product.create",
      sku: "P2",
      name: "Other",
      brand: "",
      size: "43",
      color: "White",
    });
    const p2 = f.s.products.at(-1)!.id;
    f.run({
      type: "customerOrder.create",
      reference: "MULTI",
      customerId: f.customer,
      locationId: f.wh,
      dueDate: "2026-11-01",
      lines: [
        { productId: f.p, quantity: 5, unitPrice: 2000 },
        { productId: p2, quantity: 1, unitPrice: 3000 },
      ],
    });
    const id = f.s.customerOrders![0].id;
    expect(() =>
      f.run({ type: "customerOrder.confirm", orderId: id }),
    ).toThrow();
    expect(reservedStock(f.s, f.p, f.wh)).toBe(0);
    f.run({
      type: "stock.adjust",
      productId: p2,
      locationId: f.wh,
      quantity: 1,
      unitCost: 1000,
      reason: "Opening",
    });
    f.run({ type: "customerOrder.confirm", orderId: id });
    f.run({
      type: "customerOrder.deliver",
      orderId: id,
      reference: "MULTI-BL",
      lines: [
        { productId: f.p, quantity: 2 },
        { productId: p2, quantity: 1 },
      ],
    });
    expect(f.s.invoices[0].amount).toBe(7000);
    expect(reservedStock(f.s, f.p, f.wh)).toBe(3);
    expect(reservedStock(f.s, p2, f.wh)).toBe(0);
  });

  it("reserves on confirmation only and prevents physical transfers or direct sales from consuming reserved stock", () => {
    const f = fixture();
    f.create();
    const orderId = f.s.customerOrders![0].id;
    expect(availableStock(f.s, f.p, f.wh)).toBe(10);
    f.run({ type: "customerOrder.confirm", orderId });
    expect(productStock(f.s, f.p, f.wh)).toBe(10);
    expect(reservedStock(f.s, f.p, f.wh)).toBe(6);
    expect(availableStock(f.s, f.p, f.wh)).toBe(4);
    expect(() =>
      f.run({
        type: "stock.transfer",
        productId: f.p,
        fromId: f.wh,
        toId: f.store,
        quantity: 5,
      }),
    ).toThrow();
    expect(() =>
      f.run({
        type: "sale.create",
        reference: "DIRECT",
        customerId: f.customer,
        locationId: f.wh,
        dueDate: "2026-11-01",
        lines: [{ productId: f.p, quantity: 5, unitPrice: 2000 }],
      }),
    ).toThrow();
    expect(() =>
      f.run({
        type: "stock.adjust",
        productId: f.p,
        locationId: f.wh,
        quantity: -5,
        unitCost: 0,
        reason: "Count",
      }),
    ).toThrow();
    f.create(5, "CO-2");
    expect(() =>
      f.run({
        type: "customerOrder.confirm",
        orderId: f.s.customerOrders![1].id,
      }),
    ).toThrow();
    expect(f.s.customerOrders![1].status).toBe("DRAFT");
  });
  it("recognizes only actual partial deliveries and preserves free stock until the remaining reservation is cancelled", () => {
    const f = fixture();
    f.create();
    const orderId = f.s.customerOrders![0].id;
    f.run({ type: "customerOrder.confirm", orderId });
    expect(
      groupAnnual(f.s, [f.companyId], 2026, "TND").consolidated.revenue,
    ).toBe(0);
    f.run({
      type: "customerOrder.deliver",
      orderId,
      reference: "BL-1",
      lines: [{ productId: f.p, quantity: 2 }],
    });
    expect(f.s.customerOrders![0].status).toBe("PARTIALLY_DELIVERED");
    expect(productStock(f.s, f.p, f.wh)).toBe(8);
    expect(reservedStock(f.s, f.p, f.wh)).toBe(4);
    expect(availableStock(f.s, f.p, f.wh)).toBe(4);
    expect(f.s.invoices[0].amount).toBe(4000);
    expect(f.s.customerDeliveries![0].saleId).toBe(f.s.sales[0].id);
    expect(
      groupAnnual(f.s, [f.companyId], 2026, "TND").consolidated.beforeTax,
    ).toBe(2000);
    f.run({
      type: "customerOrder.cancel",
      orderId,
      reason: "Customer cancels remaining",
    });
    expect(availableStock(f.s, f.p, f.wh)).toBe(8);
    expect(f.s.sales).toHaveLength(1);
    expect(f.s.invoices[0].amount).toBe(4000);
    expect(() =>
      f.run({
        type: "customerOrder.deliver",
        orderId,
        reference: "BL-2",
        lines: [{ productId: f.p, quantity: 1 }],
      }),
    ).toThrow();
  });
  it("completes the remainder once, rejects duplicate/foreign/excess deliveries and never trusts submitted pricing", () => {
    const f = fixture();
    f.create();
    const orderId = f.s.customerOrders![0].id;
    expect(() =>
      f.run({
        type: "customerOrder.deliver",
        orderId,
        reference: "BL-1",
        lines: [{ productId: f.p, quantity: 1 }],
      }),
    ).toThrow();
    f.run({ type: "customerOrder.confirm", orderId });
    for (const lines of [
      [{ productId: f.p, quantity: 7 }],
      [{ productId: randomUUID(), quantity: 1 }],
      [{ productId: f.p, quantity: 1, unitPrice: 1 }],
    ])
      expect(() =>
        f.run({
          type: "customerOrder.deliver",
          orderId,
          reference: "BL-1",
          lines,
        }),
      ).toThrow();
    f.run({
      type: "customerOrder.deliver",
      orderId,
      reference: "BL-1",
      lines: [{ productId: f.p, quantity: 2 }],
    });
    expect(() =>
      f.run({
        type: "customerOrder.deliver",
        orderId,
        reference: "BL-1",
        lines: [{ productId: f.p, quantity: 1 }],
      }),
    ).toThrow();
    f.run({
      type: "customerOrder.deliver",
      orderId,
      reference: "BL-2",
      lines: [{ productId: f.p, quantity: 4 }],
    });
    expect(f.s.customerOrders![0].status).toBe("DELIVERED");
    expect(f.s.sales.reduce((n, x) => n + x.total, 0)).toBe(12000);
    expect(availableStock(f.s, f.p, f.wh)).toBe(4);
    expect(() => f.run({ type: "customerOrder.confirm", orderId })).toThrow();
  });
  it("allows scoped warehouse delivery without prices and rejects unauthorized confirmation or foreign-company references", () => {
    const f = fixture();
    f.create();
    const orderId = f.s.customerOrders![0].id;
    f.run({ type: "customerOrder.confirm", orderId });
    f.run({ type: "access.grant", userId: staff, role: "WAREHOUSE" });
    expect(() =>
      f.run({ type: "customerOrder.confirm", orderId }, false, staff),
    ).toThrow();
    f.run(
      {
        type: "customerOrder.deliver",
        orderId,
        reference: "WH-BL",
        lines: [{ productId: f.p, quantity: 1 }],
      },
      false,
      staff,
    );
    const view = visibleBusiness(f.s, staff, false);
    expect(view.customerOrders![0].lines[0].unitPrice).toBe(0);
    expect(view.invoices).toHaveLength(0);
    expect(view.sales[0].cost).toBe(0);
    expect(() =>
      f.run(
        {
          type: "customerOrder.deliver",
          companyId: randomUUID(),
          orderId,
          reference: "BAD",
          lines: [{ productId: f.p, quantity: 1 }],
        },
        false,
        staff,
      ),
    ).toThrow();
    f.run({ type: "access.grant", userId: staff, role: "HR" });
    expect(visibleBusiness(f.s, staff, false).customerOrders).toHaveLength(0);
  });
  it("keeps replenishment within unreserved warehouse stock", () => {
    const f = fixture();
    f.create(10);
    f.run({
      type: "customerOrder.confirm",
      orderId: f.s.customerOrders![0].id,
    });
    expect(
      replenishment(f.s, f.s.companies[0], f.wh, new Date(now)).reduce(
        (n, x) => n + x.quantity,
        0,
      ),
    ).toBe(0);
  });
});
