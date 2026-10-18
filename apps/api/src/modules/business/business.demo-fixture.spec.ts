import { describe, expect, it } from "vitest";
import { companyMetrics, productStock } from "@saas/types";
import { createDemoHoldingFixture, demoFixtureVisibleTo } from "./business.demo-fixture";

describe("isolated demo holding fixture", () => {
  it("contains three companies, ten stores and three warehouses", () => {
    const state = createDemoHoldingFixture();
    expect(state.companies).toHaveLength(3);
    expect(state.locations.filter((x) => x.kind === "STORE")).toHaveLength(10);
    expect(state.locations.filter((x) => x.kind === "WAREHOUSE")).toHaveLength(3);
    expect(state.products).toHaveLength(30);
    expect(new Set(state.companies.map((x) => x.currency))).toEqual(new Set(["TND"]));
  });

  it("uses deterministic IDs and valid stock valuation", () => {
    const first = createDemoHoldingFixture();
    expect(createDemoHoldingFixture()).toEqual(first);
    for (const company of first.companies) {
      expect(companyMetrics(first, company).inventory).toBeGreaterThan(0);
      const products = first.products.filter((p) => p.companyId === company.id);
      expect(products).toHaveLength(10);
      for (const product of products) expect(productStock(first, product.id)).toBe(50);
    }
  });

  it("does not leak other companies to a restricted CFO", () => {
    const limited = demoFixtureVisibleTo(["demo-atlas"]);
    expect(limited.companies.map((x) => x.id)).toEqual(["demo-atlas"]);
    expect(limited.products).toHaveLength(10);
    expect(limited.locations).toHaveLength(5);
    expect(limited.movements.every((x) => x.companyId === "demo-atlas")).toBe(true);
    expect(limited.accounts.every((x) => x.companyId === "demo-atlas")).toBe(true);
  });

  it("denies every company without an explicit grant", () => {
    const state = demoFixtureVisibleTo([]);
    expect(state.companies).toHaveLength(0);
    expect(state.accounts).toHaveLength(0);
    expect(state.products).toHaveLength(0);
  });
});
