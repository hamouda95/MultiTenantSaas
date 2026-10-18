import { describe, expect, it } from "vitest";
import { periodOperatingResult } from "@saas/types";
import type { BusinessState, BusinessCompany } from "@saas/types";

const company: BusinessCompany = {
  id: "a", name: "A", currency: "TND", country: "Tunisie",
  brands: [], leadDays: 7, coverDays: 21, minimumStock: 2, modules: [],
};
const state = {
  sales: [
    { companyId: "a", date: "2025-06-01", returned: false, total: 100_000, cost: 60_000 },
    { companyId: "a", date: "2025-07-01", returned: true, total: 25_000, cost: 10_000 },
    { companyId: "a", date: "2026-01-01", returned: false, total: 80_000, cost: 40_000 },
    { companyId: "b", date: "2025-06-01", returned: false, total: 900_000, cost: 1 },
  ],
  expenses: [
    { companyId: "a", date: "2025-06-01", amount: 15_000 },
    { companyId: "a", date: "2026-06-01", amount: 9_000 },
    { companyId: "b", date: "2025-06-01", amount: 500_000 },
  ],
} as BusinessState;

describe("periodOperatingResult", () => {
  it("isolates year, company and returned sales", () => {
    expect(periodOperatingResult(state, company, 2025)).toMatchObject({
      revenue: 100_000, costOfGoodsSold: 60_000, grossProfit: 40_000,
      operatingExpenses: 15_000, operatingContribution: 25_000, salesCount: 1,
    });
  });
  it("reports the requested year only", () => {
    expect(periodOperatingResult(state, company, 2026)).toMatchObject({
      revenue: 80_000, operatingExpenses: 9_000, operatingContribution: 31_000,
    });
  });
  it("rejects invalid years", () => {
    expect(() => periodOperatingResult(state, company, 2025.5)).toThrow(RangeError);
  });
});
