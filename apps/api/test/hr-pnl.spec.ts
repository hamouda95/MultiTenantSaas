import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  applyBusiness,
  emptyBusiness,
  balance,
  visibleBusiness,
} from "../src/modules/business/business.engine";
import {
  annualPnl,
  accountBalance,
  companyMetrics,
  type BusinessState,
} from "@saas/types";
import type { BusinessAction } from "../src/modules/business/business.schema";
const owner = randomUUID(),
  operator = randomUUID();
function fixture() {
  const s = emptyBusiness();
  const run = (a: Record<string, unknown>, isOwner = true, user = owner) =>
    applyBusiness(
      s,
      a as BusinessAction,
      user,
      isOwner,
      "2026-10-18T12:00:00.000Z",
    );
  run({
    type: "company.create",
    data: {
      name: "Demo",
      currency: "TND",
      country: "Tunisie",
      brands: [],
      leadDays: 30,
      coverDays: 30,
      minimumStock: 5,
      modules: ["finance", "hr", "purchasing", "inventory", "sales"],
    },
  });
  const companyId = s.companies[0].id;
  const cmd = (a: Record<string, unknown>, isOwner = true, user = owner) =>
    run({ companyId, ...a }, isOwner, user);
  cmd({
    type: "account.create",
    name: "Bank",
    kind: "BANK",
    opening: 10000000,
    asOf: "2026-01-01",
  });
  cmd({
    type: "hr.employee.create",
    fullName: "Employee secret",
    jobTitle: "Manager",
    department: "Sales",
    grossSalary: 1000000,
    employerChargesBps: 1800,
    hiredAt: "2025-01-01",
  });
  return { s, companyId, cmd };
}
describe("HR and annual management P&L", () => {
  it("accrues and pays once, redacts identities, reconciles full and aggregate cash", () => {
    const { s, companyId, cmd } = fixture();
    const employeeId = s.employees![0].id,
      accountId = s.accounts[0].id;
    cmd({ type: "hr.payroll.record", employeeId, period: "2026-10" });
    expect(() =>
      cmd({ type: "hr.payroll.record", employeeId, period: "2026-10" }),
    ).toThrow("déjà");
    expect(companyMetrics(s, s.companies[0]).cash30).toBe(8820000);
    expect(annualPnl(s, companyId, 2026).total.payroll).toBe(1180000);
    cmd({ type: "hr.payroll.pay", payrollId: s.payroll![0].id, accountId });
    expect(balance(s, accountId)).toBe(8820000);
    expect(() =>
      cmd({ type: "hr.payroll.pay", payrollId: s.payroll![0].id, accountId }),
    ).toThrow("déjà");
    s.access.push({ companyId, userId: operator, role: "OPERATIONS" });
    const view = visibleBusiness(s, operator, false);
    expect(view.employees).toHaveLength(0);
    expect(view.payroll).toHaveLength(0);
    expect(JSON.stringify(view)).not.toContain("Employee secret");
    expect(accountBalance(view, accountId)).toBe(balance(s, accountId));
    expect(companyMetrics(view, view.companies[0]).cash30).toBe(8820000);
    expect(annualPnl(view, companyId, 2026).total.payroll).toBe(1180000);
    expect(() =>
      cmd(
        { type: "hr.payroll.record", employeeId, period: "2026-09" },
        false,
        operator,
      ),
    ).toThrow();
    expect(() =>
      cmd(
        { type: "hr.employee.status", employeeId, status: "INACTIVE" },
        false,
        operator,
      ),
    ).toThrow();
  });
  it("rejects future months and inactive employees; booked salaries remain snapshots", () => {
    const { s, cmd } = fixture(),
      employeeId = s.employees![0].id;
    expect(() =>
      cmd({ type: "hr.payroll.record", employeeId, period: "2026-11" }),
    ).toThrow();
    cmd({ type: "hr.payroll.record", employeeId, period: "2026-09" });
    s.employees![0].grossSalary = 2000000;
    expect(s.payroll![0].gross).toBe(1000000);
    cmd({ type: "hr.employee.status", employeeId, status: "INACTIVE" });
    expect(() =>
      cmd({ type: "hr.payroll.record", employeeId, period: "2026-10" }),
    ).toThrow();
  });
  it("rejects foreign employee and establishment references", () => {
    const { s, cmd } = fixture();
    expect(() =>
      cmd({
        type: "hr.payroll.record",
        employeeId: randomUUID(),
        period: "2026-10",
      }),
    ).toThrow();
    expect(() =>
      cmd({
        type: "hr.employee.create",
        fullName: "Other",
        jobTitle: "Seller",
        department: "Sales",
        grossSalary: 1000,
        employerChargesBps: 0,
        hiredAt: "2025-01-01",
        locationId: randomUUID(),
      }),
    ).toThrow();
    expect(s.payroll || []).toHaveLength(0);
  });
  it("books cross-year returns in their actual year and excludes loan principal", () => {
    const { s, companyId, cmd } = fixture();
    s.sales.push({
      id: randomUUID(),
      companyId,
      date: "2025-12-20T12:00:00.000Z",
      total: 100000,
      cost: 60000,
      unitCosts: {},
      returned: true,
      lines: [],
      reference: "DEMO",
      customerId: randomUUID(),
      locationId: randomUUID(),
    } as BusinessState["sales"][number]);
    s.movements.push({
      id: randomUUID(),
      companyId,
      date: "2026-01-05T12:00:00.000Z",
      sourceId: s.sales[0].id,
      reason: "RETURN",
      quantity: 1,
      productId: randomUUID(),
      locationId: randomUUID(),
    });
    expect(annualPnl(s, companyId, 2025).total.beforeTax).toBe(40000);
    expect(annualPnl(s, companyId, 2026).total.beforeTax).toBe(-40000);
    cmd({
      type: "financing.create",
      reference: "F",
      bank: "Demo",
      accountId: s.accounts[0].id,
      principal: 1000000,
      interest: 10000,
      dueDate: "2026-12-31",
    });
    cmd({ type: "financing.draw", financingId: s.financings![0].id });
    cmd({
      type: "financing.repay",
      financingId: s.financings![0].id,
      accountId: s.accounts[0].id,
      principal: 100000,
      interest: 1000,
    });
    expect(annualPnl(s, companyId, 2026).total.beforeTax).toBe(-41000);
  });
  it("requires explicit HR access to include individual salaries even for company managers", () => {
    const { s, companyId } = fixture();
    s.access.push({ companyId, userId: operator, role: "MANAGER" });
    expect(
      visibleBusiness(s, operator, false, undefined, false).employees,
    ).toHaveLength(0);
    expect(
      visibleBusiness(s, operator, false, undefined, true).employees,
    ).toHaveLength(1);
  });
});
