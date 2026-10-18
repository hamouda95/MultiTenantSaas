import { describe, expect, it } from "vitest";
import {
  assertEmployeeAccess, assertHrManager, decideLeave, requestLeave,
  validateContract, validatePeriod, type Employee, type HrScope,
} from "./hr.domain";

const employee: Employee = {
  id: "e1", tenantId: "t1", companyId: "c1", userId: "u1",
  displayName: "Test Employee", startDate: "2025-01-01", endDate: null,
};
const staff: HrScope = {
  tenantId: "t1", companyIds: ["c1"], actorUserId: "u1", role: "EMPLOYEE",
};
const hr: HrScope = {
  tenantId: "t1", companyIds: ["c1"], actorUserId: "hr1", role: "HR_MANAGER",
};
describe("HR tenant/company authorization", () => {
  it("allows a worker to see their own record", () => {
    expect(() => assertEmployeeAccess(staff, employee)).not.toThrow();
  });
  it("blocks other employees and other companies", () => {
    expect(() => assertEmployeeAccess({ ...staff, actorUserId: "u2" }, employee)).toThrow();
    expect(() => assertEmployeeAccess({ ...hr, companyIds: ["c2"] }, employee)).toThrow();
  });
  it("blocks cross-tenant access even for HR", () => {
    expect(() => assertEmployeeAccess({ ...hr, tenantId: "t2" }, employee)).toThrow();
    expect(() => assertHrManager({ ...hr, tenantId: "t2" }, "t1", "c1")).toThrow();
  });
  it("prevents employees from approving leave", () => {
    const leave = requestLeave(staff, employee, "l1", "2025-04-01", "2025-04-03");
    expect(() => decideLeave(staff, employee, leave, "APPROVED")).toThrow();
    expect(decideLeave(hr, employee, leave, "APPROVED").status).toBe("APPROVED");
    expect(() => decideLeave(hr, employee, { ...leave, companyId: "c2" }, "APPROVED")).toThrow();
    expect(() => decideLeave(hr, employee, { ...leave, status: "REJECTED" }, "APPROVED")).toThrow();
  });
  it("rejects invalid dates and employment boundaries", () => {
    expect(() => validatePeriod("2025-02-30", null)).toThrow();
    expect(() => validatePeriod("2025-03-03", "2025-03-01")).toThrow();
    expect(() => requestLeave(staff, employee, "l2", "2024-12-01", "2024-12-02")).toThrow();
  });
  it("rejects foreign-company contracts and fractional salaries", () => {
    const contract = {
      id: "k1", tenantId: "t1", companyId: "c1", employeeId: "e1",
      startDate: "2025-01-01", endDate: null, monthlyGrossMinor: 300000, currency: "EUR",
    };
    expect(() => validateContract(contract, employee)).not.toThrow();
    expect(() => validateContract({ ...contract, companyId: "c2" }, employee)).toThrow();
    expect(() => validateContract({ ...contract, monthlyGrossMinor: 1.5 }, employee)).toThrow();
  });
});
