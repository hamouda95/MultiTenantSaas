import { describe, expect, it } from "vitest";
import { monthlyOperatingResults } from "@saas/types";
import type { BusinessCompany, BusinessState } from "@saas/types";

const company = { id: "a", currency: "TND" } as BusinessCompany;
const state = {
  sales: [
    { companyId: "a", date: "2025-01-02", returned: false, total: 1200, cost: 700 },
    { companyId: "a", date: "2025-01-15", returned: true, total: 500, cost: 100 },
    { companyId: "a", date: "2025-02-10", returned: false, total: 2000, cost: 1000 },
    { companyId: "b", date: "2025-01-02", returned: false, total: 9000, cost: 0 },
    { companyId: "a", date: "2024-01-02", returned: false, total: 9000, cost: 0 },
  ],
  expenses: [
    { companyId: "a", date: "2025-01-05", amount: 200 },
    { companyId: "a", date: "2025-02-05", amount: 300 },
    { companyId: "b", date: "2025-01-05", amount: 999 },
  ],
} as BusinessState;

describe("monthlyOperatingResults", () => {
  it("returns 12 months without leaking another company or year", () => {
    const months = monthlyOperatingResults(state, company, 2025);
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({
      month: 1, revenue: 1200, costOfGoodsSold: 700,
      grossProfit: 500, operatingExpenses: 200, operatingContribution: 300, salesCount: 1,
    });
    expect(months[1]).toMatchObject({ revenue: 2000, operatingContribution: 700 });
    expect(months.slice(2).every((month) => month.revenue === 0)).toBe(true);
  });
  it("rejects invalid reporting years", () => {
    expect(() => monthlyOperatingResults(state, company, NaN)).toThrow(RangeError);
  });
});
